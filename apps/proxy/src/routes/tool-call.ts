// Tool call proxy route — intercepts, evaluates policy, forwards to upstream.

import { Hono } from 'hono';
import type { Logger } from 'pino';
import { randomUUID } from 'node:crypto';
import type { IEventStore } from '@rind/storage';
import type { PolicyEngine } from '../policy/engine.js';
import type { InMemoryPolicyStore } from '../policy/store.js';
import type { LoopDetector } from '../loop-detector.js';
import type { RateLimiter } from '../rate-limiter.js';
import type { ApprovalQueue } from '../approval-queue.js';
import type { RindEventBus } from '../event-bus.js';
import type { ProxyConfig, ToolCallEvent } from '../types.js';
import { intercept } from '../interceptor.js';
import { isServerQuarantined, getLastScanResult } from '../scanner/index.js';
import { deriveToolLabel } from '../hooks/claude-code.js';
import { emitAudit, parseApprovalTimeout, recordProxyOutcome } from './helpers.js';

export interface ToolCallRouteDeps {
  policyEngine: PolicyEngine;
  policyStore: InMemoryPolicyStore;
  loopDetector: LoopDetector;
  rateLimiter: RateLimiter;
  approvalQueue: ApprovalQueue;
  ringBuffer: IEventStore<ToolCallEvent>;
  bus: RindEventBus;
  config: ProxyConfig;
  logger: Logger;
}

export function toolCallRoutes({
  policyEngine,
  policyStore,
  loopDetector,
  rateLimiter,
  approvalQueue,
  ringBuffer,
  bus,
  config,
  logger,
}: ToolCallRouteDeps): Hono {
  const app = new Hono();

  // ─── Tool call proxy ──────────────────────────────────────────────────────────
  app.post('/proxy/tool-call', async (c) => {
    const body = await c.req.json<Omit<ToolCallEvent, 'timestamp'> & { sessionId?: string }>();

    const callId = randomUUID();
    const event: ToolCallEvent = {
      sessionId: body.sessionId ?? randomUUID(),
      agentId: body.agentId ?? config.agentId,
      serverId: body.serverId,
      toolName: body.toolName,
      input: body.input,
      timestamp: Date.now(),
      correlationId: callId,
    };

    // Quarantine check — block all calls from servers whose last scan failed.
    // Scan-on-Connect catches poisoned tool definitions before any call is forwarded.
    if (isServerQuarantined(event.serverId)) {
      const scanResult = getLastScanResult(event.serverId);
      const criticalFindings = scanResult?.findings.filter((f) => f.severity === 'critical' || f.severity === 'high') ?? [];
      // Use the primary finding category as the rule name so the dashboard shows
      // "TOOL_POISONING" or "SCHEMA_DRIFT_TOOL_ADDED" instead of the generic "scan-quarantine".
      const primaryCategory = criticalFindings[0]?.category ?? 'SCAN_QUARANTINE';
      const reason = `Server "${event.serverId}" is quarantined: scan detected ${criticalFindings.length} critical/high finding(s). ` +
        (criticalFindings[0] ? `First: ${criticalFindings[0].category} — ${criticalFindings[0].detail.slice(0, 80)}` : '');

      // Map scan findings to the ResponseThreat shape so the dashboard's response
      // panel can show exactly which findings blocked this call.
      const scanThreats = criticalFindings.map((f) => ({
        type: f.category as 'PROMPT_INJECTION' | 'CREDENTIAL_LEAK' | 'SUSPICIOUS_REDIRECT' | 'INDIRECT_PROMPT_INJECTION',
        severity: f.severity as 'critical' | 'high' | 'medium',
        pattern: f.toolName ? `${f.toolName}: ${f.detail}` : f.detail,
        sanitized: false,
      }));
      const scanSummary = criticalFindings.map((f) =>
        `[${f.severity.toUpperCase()}] ${f.category}${f.toolName ? ` (${f.toolName})` : ''}: ${f.detail}`
      ).join('\n');

      bus.emit('tool:call', event);
      bus.emit('tool:blocked', { event, action: 'BLOCKED_THREAT' as const, reason });
      ringBuffer.update(
        (e) => e.correlationId === callId,
        (e) => ({
          ...e,
          outcome: 'blocked' as const,
          reason,
          source: 'proxy' as const,
          matchedRule: primaryCategory,
          matchedRuleType: 'scan' as const,
          response: {
            outputPreview: scanSummary,
            outputSizeBytes: scanSummary.length,
            threats: scanThreats,
            timestamp: Date.now(),
          },
        }),
      );
      logger.warn({ serverId: event.serverId, toolName: event.toolName, findingCount: criticalFindings.length }, 'Tool call blocked — server quarantined by scan');

      return c.json({
        blocked: true,
        action: 'BLOCKED_THREAT',
        reason,
        outcome: 'blocked',
        rule: primaryCategory,
        ruleType: 'scan',
      }, 403);
    }

    // D-022: upstream timeout support
    const timeoutMs = config.upstreamTimeoutMs ?? 30_000;

    // Use injected forwardFn if provided (simulation/test), otherwise fetch upstream
    const forwardFn = config.forwardFn
      ? async (e: typeof event) => config.forwardFn!(e.toolName, e.input)
      : async (e: typeof event) => {
          const start = Date.now();
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), timeoutMs);
          try {
            const response = await fetch(`${config.upstreamMcpUrl}/tool-call`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ toolName: e.toolName, input: e.input }),
              signal: controller.signal,
            });
            const upstreamOutput = (await response.json()) as unknown;
            return { output: upstreamOutput, durationMs: Date.now() - start };
          } finally {
            clearTimeout(timeout);
          }
        };

    const callStart = Date.now();
    let interceptResult: Awaited<ReturnType<typeof intercept>>;
    try {
      interceptResult = await intercept(event, forwardFn, {
        policyEngine,
        loopDetector,
        rateLimiter,
        onToolCallEvent: (e, matchedRule) => {
          bus.emit('tool:call', e);
          logger.info(
            { sessionId: e.sessionId, agentId: e.agentId, toolName: e.toolName },
            'Tool call',
          );
          emitAudit(bus, {
            eventType: 'tool:call',
            sessionId: e.sessionId,
            agentId: e.agentId,
            serverId: e.serverId,
            action: 'ALLOW',
            toolName: e.toolName,
            policyRule: matchedRule?.name,
            input: e.input,
          }, config);
        },
        onToolResponseEvent: (e) => {
          bus.emit('tool:response', e);
          ringBuffer.update(
            (entry) => entry.correlationId === callId,
            (entry) => ({ ...entry, source: entry.source ?? ('mcp' as const) }),
          );
          if (e.threats.length > 0) {
            bus.emit('tool:threat', e);
            logger.warn(
              { sessionId: e.sessionId, toolName: e.toolName, threatCount: e.threats.length },
              'Response threats detected',
            );
            emitAudit(bus, {
              eventType: 'tool:threat',
              sessionId: e.sessionId,
              agentId: e.agentId,
              serverId: e.serverId,
              action: 'ALLOW',
              toolName: e.toolName,
              threats: e.threats,
              ...(config.auditIncludeOutput ? { output: e.output } : {}),
            }, config);
          } else {
            logger.debug(
              { sessionId: e.sessionId, toolName: e.toolName, durationMs: e.durationMs },
              'Tool response clean',
            );
          }
        },
        blockOnCriticalResponseThreats: true,
        onRequireApproval: async (evt, ruleName) => {
          const matchedPolicyRule = policyStore.get().policies.find((r) => r.name === ruleName);
          const approvalTimeoutMs = parseApprovalTimeout(matchedPolicyRule?.approval?.timeout) ?? 120_000;
          const approvalOnTimeout = matchedPolicyRule?.approval?.onTimeout ?? 'DENY';
          const toolLabel = deriveToolLabel(evt.toolName, evt.input);

          const { approval, wait } = approvalQueue.enqueue({
            sessionId: evt.sessionId,
            agentId: evt.agentId,
            toolName: evt.toolName,
            toolLabel,
            input: evt.input,
            reason: `Tool call "${evt.toolName}" requires human approval.`,
            ruleName,
            timeoutMs: approvalTimeoutMs,
            onTimeout: approvalOnTimeout,
          });

          logger.info(
            { approvalId: approval.id, toolName: evt.toolName, timeoutMs: approvalTimeoutMs },
            'Approval requested — holding MCP proxy response',
          );

          ringBuffer.update(
            (e) => e.correlationId === callId,
            (e) => ({
              ...e,
              outcome: 'require-approval' as const,
              reason: `Pending approval (${approval.id})`,
              matchedRule: ruleName,
              toolLabel,
              source: e.source ?? ('mcp' as const),
            }),
          );

          const result = await wait;

          const decision = result.decision === 'approve'
            ? 'approved' as const
            : result.decision === 'timeout'
              ? 'approval-timeout' as const
              : 'disapproved' as const;

          const reason = result.decision === 'approve'
            ? `Approved by ${result.decidedBy ?? 'dashboard'}`
            : result.decision === 'timeout'
              ? 'Approval timed out'
              : `Denied by ${result.decidedBy ?? 'dashboard'}`;

          return { decision, reason };
        },
      });
    } catch (err) {
      // Upstream unreachable or timed out (D-022)
      const isTimeout = err instanceof Error && err.name === 'AbortError';
      const errorKind = isTimeout ? 'upstream-timeout' as const : 'upstream-unreachable' as const;
      const outcome = isTimeout ? 'upstream-timeout' as const : 'upstream-error' as const;
      const durationMs = Date.now() - callStart;

      bus.emit('tool:error', {
        sessionId: event.sessionId,
        agentId: event.agentId,
        serverId: event.serverId,
        toolName: event.toolName,
        errorKind,
        durationMs,
      });

      ringBuffer.update(
        (e) => e.correlationId === callId,
        (e) => ({ ...e, outcome, source: 'proxy' as const }),
      );

      logger.error({ err, toolName: event.toolName, durationMs }, isTimeout ? 'Upstream timeout' : 'Upstream error');
      return c.json(
        {
          content: [{ type: 'text', text: isTimeout
            ? `MCP server timed out: ${event.toolName}`
            : `MCP server unavailable: ${event.toolName}` }],
          isError: true,
        },
        200,
      );
    }

    const { output, interceptorResult } = interceptResult;
    const blocked = interceptorResult.action !== 'ALLOW' && interceptorResult.action !== 'RATE_LIMIT';

    if (blocked || interceptorResult.action === 'RATE_LIMIT') {
      logger.warn(
        { action: interceptorResult.action, reason: interceptorResult.reason, toolName: event.toolName },
        'Tool call blocked',
      );
      bus.emit('tool:blocked', {
        event,
        action: interceptorResult.action,
        reason: interceptorResult.reason,
      });
      // Backfill outcome/rule/reason so the dashboard shows the block.
      recordProxyOutcome(callId, interceptorResult, ringBuffer);
      logger.debug({ bufferLen: ringBuffer.length }, 'Ring buffer enrichment for blocked call');
      emitAudit(bus, {
        eventType: 'tool:blocked',
        sessionId: event.sessionId,
        agentId: event.agentId,
        serverId: event.serverId,
        action: interceptorResult.action,
        toolName: event.toolName,
        reason: interceptorResult.reason,
        input: event.input,
      }, config);

      const responseBody: Record<string, unknown> = {
        blocked: true,
        action: interceptorResult.action,
        reason: interceptorResult.reason,
        outcome: 'blocked',
        rule: interceptorResult.matchedRule,
      };
      // D-013: enriched REQUIRE_APPROVAL response
      if (interceptorResult.approvalRequired) {
        responseBody['approvalRequired'] = true;
        responseBody['callbackUrl'] = null;
        responseBody['inputSummary'] = interceptorResult.inputSummary;
      }
      // D-017: rate limit metadata
      if (interceptorResult.rateLimitResetMs !== undefined) {
        responseBody['rateLimitResetMs'] = interceptorResult.rateLimitResetMs;
        responseBody['rateLimitRemaining'] = interceptorResult.rateLimitRemaining;
      }
      // D-014: cost limit metadata
      if (interceptorResult.limitType) {
        responseBody['limitType'] = interceptorResult.limitType;
      }

      return c.json(responseBody, 403);
    }

    // Backfill outcome/rule so dashboard shows allowed status
    recordProxyOutcome(callId, interceptorResult, ringBuffer);

    return c.json({ blocked: false, output, outcome: interceptorResult.approvalDecision === 'approved' ? 'approved' : 'allowed' });
  });

  return app;
}
