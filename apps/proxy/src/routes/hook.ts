// Hook endpoints (Claude Code PreToolUse/PostToolUse) and approval management.

import { Hono } from 'hono';
import type { Logger } from 'pino';
import type { IEventStore } from '@rind/storage';
import type { PolicyEngine } from '../policy/engine.js';
import type { InMemoryPolicyStore } from '../policy/store.js';
import type { ApprovalQueue } from '../approval-queue.js';
import type { CorrelationTracker } from '../hooks/correlator.js';
import type { RindEventBus } from '../event-bus.js';
import type { ProxyConfig, ToolCallEvent } from '../types.js';
import type { ProcessedHookEvent } from '../hooks/claude-code.js';
import { HookRequestSchema, HookEventSchema, evaluateHook, processHookEvent, deriveToolLabel } from '../hooks/claude-code.js';
import type { HookEvalOptions, HookEvalResult } from '../hooks/claude-code.js';
import { discoverClaudeCodeContext, resolveSessionName } from '../hooks/claude-code-context.js';
import type { ISessionStore } from '../session.js';
import { emitAudit, parseApprovalTimeout } from './helpers.js';

export interface HookRouteDeps {
  policyEngine: PolicyEngine;
  policyStore: InMemoryPolicyStore;
  approvalQueue: ApprovalQueue;
  correlator: CorrelationTracker;
  ringBuffer: IEventStore<ToolCallEvent>;
  hookEventBuffer: IEventStore<ProcessedHookEvent>;
  bus: RindEventBus;
  config: ProxyConfig;
  logger: Logger;
  sessionStore: ISessionStore;
}

export function hookRoutes({
  policyEngine,
  policyStore,
  approvalQueue,
  correlator,
  ringBuffer,
  hookEventBuffer,
  bus,
  config,
  logger,
  sessionStore,
}: HookRouteDeps): Hono {
  const app = new Hono();

  if (config.hooksEnabled === false) return app;

  // ─── Claude Code hook endpoints (D-040) ─────────────────────────────────────
  // Disable with --no-hooks flag. When disabled, Claude Code hooks will be ignored.
  // Claude Code fires this before every tool call — built-in (Bash, Write, Edit, …)
  // and MCP tools. The hook blocks execution if Rind returns { continue: false }.
  // This endpoint runs the interceptor in evaluate-only mode (steps 1-5, no forward).
  app.post('/hook/evaluate', async (c) => {
    let raw: unknown;
    try {
      raw = await c.req.json();
    } catch {
      // Malformed JSON from Claude Code's hook runner — deny to fail closed.
      return c.json({ continue: false, stopReason: 'Rind: hook payload is not valid JSON' }, 400);
    }
    const parsed = HookRequestSchema.safeParse(raw);
    if (!parsed.success) {
      return c.json({ continue: false, stopReason: `Rind: invalid hook payload — ${parsed.error.message}` }, 400);
    }

    // Auto-register session on first hook call from a session ID
    const sid = parsed.data.session_id;
    const agentId = parsed.data.agent_id ?? `hook:${sid}`;
    if (!sessionStore.get(sid)) {
      sessionStore.create(agentId, sid);
    }

    // Hook evaluate is advisory — don't pass loop detector or rate limiter.
    // These are enforcement mechanisms for the MCP proxy path where Rind controls
    // the forward. In hook mode, Claude Code executes the tool — if Rind incorrectly
    // blocks, it breaks the user's workflow. Policy rules still apply (they're explicit
    // user intent); loop/rate detection is Rind's own safety net for proxy-mode only.
    const hookEvalOpts: HookEvalOptions = { sendGuidance: config.hookSendGuidance ?? true };
    let matchedRuleName: string | undefined;
    const evalResult: HookEvalResult = await evaluateHook(parsed.data, {
      policyEngine,
      sessionStore,
      onToolCallEvent: (event, rule) => {
        matchedRuleName = rule?.name;
        emitAudit(bus, {
          eventType: 'tool:call',
          sessionId: event.sessionId,
          agentId: event.agentId,
          serverId: event.serverId,
          toolName: event.toolName,
          action: 'evaluated',
          policyRule: rule?.name,
        });
      },
      onToolResponseEvent: () => {
        // Hook is evaluate-only — no upstream response to emit
      },
      blockOnCriticalResponseThreats: false,
    }, hookEvalOpts);

    const toolLabel = deriveToolLabel(parsed.data.tool_name, parsed.data.tool_input);

    // ── REQUIRE_APPROVAL: hold the HTTP response until human decides ────────
    if (evalResult.interceptorAction === 'REQUIRE_APPROVAL') {
      // Parse timeout from the matched policy rule's approval config
      const matchedRule = policyStore.get().policies.find((r) => r.name === matchedRuleName);
      const timeoutMs = parseApprovalTimeout(matchedRule?.approval?.timeout) ?? 120_000;
      const onTimeout = matchedRule?.approval?.onTimeout ?? 'DENY';

      const { approval, wait } = approvalQueue.enqueue({
        sessionId: sid,
        agentId,
        toolName: parsed.data.tool_name,
        toolLabel,
        input: parsed.data.tool_input,
        reason: `Tool call "${parsed.data.tool_name}" requires human approval.`,
        ruleName: matchedRuleName,
        timeoutMs,
        onTimeout,
      });

      logger.info(
        { approvalId: approval.id, toolName: parsed.data.tool_name, timeoutMs },
        'Approval requested — holding hook response',
      );

      // Store event as pending while we wait
      const correlationId = correlator.recordPreToolUse(sid, parsed.data.tool_name, parsed.data.tool_input);
      const sessionName = resolveSessionName(sid);
      const enrichedEvent: ToolCallEvent = {
        sessionId: sid,
        sessionName,
        agentId,
        serverId: parsed.data.tool_name.startsWith('mcp__') ? parsed.data.tool_name.split('__')[1] || 'mcp-unknown' : 'builtin',
        toolName: parsed.data.tool_name,
        toolLabel,
        input: parsed.data.tool_input,
        timestamp: Date.now(),
        outcome: 'require-approval',
        reason: `Pending approval (${approval.id})`,
        matchedRule: matchedRuleName,
        source: (parsed.data.tool_name.startsWith('mcp__') ? 'mcp' : 'builtin') as 'builtin' | 'mcp',
        cwd: parsed.data.cwd,
        correlationId,
      };
      ringBuffer.push(enrichedEvent);

      // Block here until approved, denied, or timed out
      const result = await wait;

      // Update the event in the ring buffer with the final decision
      const finalOutcome = result.decision === 'approve'
        ? 'approved'
        : result.decision === 'timeout'
          ? 'approval-timeout'
          : 'disapproved';
      ringBuffer.update(
        (e) => e.correlationId === correlationId,
        (e) => ({
          ...e,
          outcome: finalOutcome as 'approved' | 'disapproved' | 'approval-timeout',
          reason: result.decision === 'approve'
            ? `Approved by ${result.decidedBy ?? 'dashboard'}`
            : result.decision === 'timeout'
              ? `Approval timed out — ${onTimeout === 'ALLOW' ? 'allowed through' : 'blocked'}`
              : `Denied by ${result.decidedBy ?? 'dashboard'}`,
        }),
      );

      logger.info(
        { approvalId: approval.id, decision: result.decision, toolName: parsed.data.tool_name },
        'Approval resolved',
      );

      // Translate decision to hook response
      const shouldAllow = result.decision === 'approve'
        || (result.decision === 'timeout' && onTimeout === 'ALLOW');

      if (shouldAllow) {
        return c.json({
          hookSpecificOutput: {
            hookEventName: 'PreToolUse',
            permissionDecision: 'allow',
            additionalContext: `Approved by ${result.decidedBy ?? 'dashboard'}.`,
          },
        });
      }

      const denyReason = result.decision === 'timeout'
        ? `Approval timed out after ${Math.round(timeoutMs / 1000)}s — action denied.`
        : `Action denied by ${result.decidedBy ?? 'dashboard'}.`;
      return c.json({
        continue: false,
        stopReason: denyReason,
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'deny',
          permissionDecisionReason: denyReason,
        },
      });
    }

    // ── Normal allow/deny flow ────────────────────────────────────────────────
    const hookResponse = evalResult.response;
    const isDenied = 'continue' in hookResponse;
    const decision = isDenied ? 'deny' : 'allow';
    const correlationId = correlator.recordPreToolUse(sid, parsed.data.tool_name, parsed.data.tool_input);
    const sessionName = resolveSessionName(sid);
    const enrichedEvent: ToolCallEvent = {
      sessionId: sid,
      sessionName,
      agentId,
      serverId: parsed.data.tool_name.startsWith('mcp__') ? parsed.data.tool_name.split('__')[1] || 'mcp-unknown' : 'builtin',
      toolName: parsed.data.tool_name,
      toolLabel,
      input: parsed.data.tool_input,
      timestamp: Date.now(),
      outcome: (isDenied ? 'blocked' : 'allowed') as 'allowed' | 'blocked',
      reason: isDenied ? (hookResponse as { stopReason: string }).stopReason : undefined,
      matchedRule: matchedRuleName,
      source: (parsed.data.tool_name.startsWith('mcp__') ? 'mcp' : 'builtin') as 'builtin' | 'mcp',
      cwd: parsed.data.cwd,
      correlationId,
    };
    ringBuffer.push(enrichedEvent);

    logger.info(
      { toolName: parsed.data.tool_name, decision },
      'Hook evaluation complete',
    );

    return c.json(hookResponse);
  });

  // ─── Hook event ingestion (Phase 1: PostToolUse, SubagentStart/Stop) ────────
  // Non-blocking observability endpoint. Accepts any hook event, stores it,
  // returns 200 immediately. No policy decision — purely for audit/display.
  app.post('/hook/event', async (c) => {
    let raw: unknown;
    try {
      raw = await c.req.json();
    } catch {
      return c.json({ error: 'Invalid JSON' }, 400);
    }
    const parsed = HookEventSchema.safeParse(raw);
    if (!parsed.success) {
      return c.json({ error: `Invalid hook event: ${parsed.error.message}` }, 400);
    }

    const event = processHookEvent(parsed.data);

    // Match PostToolUse to its PreToolUse via correlation tracker and enrich the
    // original ToolCallEvent in the ring buffer with response data (server-side join).
    if (event.eventType === 'PostToolUse' && parsed.data.tool_name) {
      const correlationId = correlator.matchPostToolUse(
        parsed.data.session_id,
        parsed.data.tool_name,
        parsed.data.tool_input,
      );
      event.correlationId = correlationId;

      // Enrich the matching PreToolUse event in the ring buffer
      if (correlationId) {
        ringBuffer.update(
          (e) => e.correlationId === correlationId,
          (e) => ({
            ...e,
            response: {
              outputPreview: event.outputPreview,
              outputTruncated: event.outputTruncated,
              outputSizeBytes: event.outputSizeBytes,
              outputHash: event.outputHash,
              threats: event.threats,
              timestamp: event.timestamp,
            },
          }),
        );
      }
    }

    hookEventBuffer.push(event);

    // Auto-register session
    const sid = parsed.data.session_id;
    const agentId = parsed.data.agent_id ?? `hook:${sid}`;
    if (!sessionStore.get(sid)) {
      sessionStore.create(agentId, sid);
    }

    logger.info(
      { eventType: event.eventType, agentId: event.agentId, toolName: event.toolName },
      'Hook event received',
    );

    return c.json({ ok: true });
  });

  // ─── Approval management (D-013) ──────────────────────────────────────────
  // Dashboard polls this to show pending approvals and resolve them.

  app.get('/approvals', (c) => {
    return c.json(approvalQueue.list());
  });

  app.post('/approvals/:id/approve', (c) => {
    const { id } = c.req.param();
    const found = approvalQueue.approve(id, 'dashboard');
    if (!found) return c.json({ error: `Approval "${id}" not found or already resolved` }, 404);
    logger.info({ approvalId: id }, 'Approval granted via dashboard');
    return c.json({ approved: true, id });
  });

  app.post('/approvals/:id/deny', (c) => {
    const { id } = c.req.param();
    const found = approvalQueue.deny(id, 'dashboard');
    if (!found) return c.json({ error: `Approval "${id}" not found or already resolved` }, 404);
    logger.info({ approvalId: id }, 'Approval denied via dashboard');
    return c.json({ denied: true, id });
  });

  // ─── Claude Code context discovery ──────────────────────────────────────────
  // Returns MCP servers registered in Claude Code and active session metadata.
  // Dashboard polls this to show server protection states and session names.
  app.get('/hook/context', (c) => {
    const context = discoverClaudeCodeContext();

    // Enrich with protection state: which MCP servers are also going through the proxy?
    const proxiedServerIds = new Set(Object.keys(config.servers ?? {}));
    // Which MCP servers have been seen via hooks (mcp__server__tool pattern)?
    const observedServerIds = new Set<string>();
    for (const event of ringBuffer.toArray()) {
      if (event.source === 'mcp' && event.serverId !== 'builtin') {
        observedServerIds.add(event.serverId);
      }
    }

    const enrichedServers = context.mcpServers.map((server) => {
      // Protection state: proxied > observed > registered
      const protectionState = proxiedServerIds.has(server.id)
        ? 'proxied' as const
        : observedServerIds.has(server.id)
          ? 'observed' as const
          : 'registered' as const;

      // Connection status upgrade: if we've seen tool calls, it's connected
      const connectionStatus = observedServerIds.has(server.id)
        ? 'connected' as const
        : server.connectionStatus;

      return { ...server, protectionState, connectionStatus };
    });

    return c.json({
      mcpServers: enrichedServers,
      activeSessions: context.activeSessions,
    });
  });

  // Session name lookup — returns the human-readable name for a session ID
  app.get('/hook/session-name/:sessionId', (c) => {
    const name = resolveSessionName(c.req.param('sessionId'));
    return c.json({ name: name ?? null });
  });

  return app;
}
