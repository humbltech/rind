// Aegis MCP proxy server.
// Listens on a local port, accepts MCP connections from AI agents, and
// proxies every tool call through the interceptor before forwarding to
// the upstream MCP server.
//
// Phase 1: JSON-RPC passthrough over HTTP/SSE (matches @modelcontextprotocol/sdk transport)
// Phase 2: stdio transport support, connection multiplexing, cloud-hosted mode

import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import pino from 'pino';
import { randomUUID } from 'node:crypto';
import type { ProxyConfig, ToolCallEvent, AuditEntry } from './types.js';
import { runFullScan } from './scanner/index.js';
import { intercept } from './interceptor.js';
import { PolicyEngine } from './policy/engine.js';
import { InMemoryPolicyStore } from './policy/store.js';
import { loadPolicyFile, emptyPolicyConfig } from './policy/loader.js';
import { createSession, killSession, listSessions } from './session.js';
import { AegisEventBus } from './event-bus.js';
import { RingBuffer } from './ring-buffer.js';
import { AuditWriter } from './audit-writer.js';
import { LoopDetector } from './loop-detector.js';
import { RateLimiter } from './rate-limiter.js';

export function createProxyServer(config: ProxyConfig) {
  const logger = pino({
    level: config.logLevel ?? 'info',
    transport:
      process.env['NODE_ENV'] !== 'production'
        ? { target: 'pino-pretty', options: { colorize: true } }
        : undefined,
  });

  // ── Policy store + engine (D-021) ────────────────────────────────────────────
  const policyConfig = config.policy
    ? config.policy
    : config.policyFile
      ? loadPolicyFile(config.policyFile)
      : emptyPolicyConfig();

  const policyStore = new InMemoryPolicyStore(policyConfig);
  const policyEngine = new PolicyEngine(policyStore);

  // ── Event bus (D-019) ────────────────────────────────────────────────────────
  const bus = new AegisEventBus((event, err) => {
    logger.error({ event, err }, 'Event bus subscriber error');
  });

  // ── Observability pipeline (D-018) ───────────────────────────────────────────
  const ringBuffer = new RingBuffer<ToolCallEvent>(config.ringBufferSize ?? 10_000);
  const auditWriter = config.auditLogPath
    ? new AuditWriter(config.auditLogPath, (err) => {
        logger.error({ err }, 'Audit write failed');
      })
    : null;

  // Ring buffer subscriber
  bus.on('tool:call', (event) => ringBuffer.push(event));

  // Audit subscriber — writes every policy decision
  if (auditWriter) {
    bus.on('audit', (entry) => auditWriter.append(entry));
  }

  // ── Runtime safety (D-015, D-017) ────────────────────────────────────────────
  const loopDetector = new LoopDetector();
  const rateLimiter = new RateLimiter();

  // ── Hono app ──────────────────────────────────────────────────────────────────
  const app = new Hono();

  // ─── Health ───────────────────────────────────────────────────────────────────
  app.get('/health', (c) => c.json({ status: 'ok', version: '0.1.0' }));

  // ─── Status summary (D-026) ───────────────────────────────────────────────────
  app.get('/status', (c) => {
    const sessions = listSessions();
    const events = ringBuffer.toArray();
    const threatCount = events.reduce((n, _e) => n, 0); // will be enriched post D-019 wiring
    return c.json({
      status: 'ok',
      sessions: { total: sessions.length, active: sessions.filter((s) => s.active).length },
      toolCalls: { total: events.length },
      threats: { total: threatCount },
    });
  });

  // ─── Policy management (D-021) ────────────────────────────────────────────────
  app.get('/policies', (c) => c.json({ policies: policyEngine.getRules() }));

  // ─── Session management ────────────────────────────────────────────────────────
  app.post('/sessions', async (c) => {
    const body = await c.req.json<{ agentId?: string }>();
    const session = createSession(body.agentId ?? config.agentId);
    logger.info({ sessionId: session.sessionId, agentId: session.agentId }, 'Session created');
    bus.emit('session:created', session);
    emitAudit(bus, {
      eventType: 'session:created',
      sessionId: session.sessionId,
      agentId: session.agentId,
      serverId: '',
      action: 'ALLOW',
    }, config);
    return c.json(session, 201);
  });

  app.get('/sessions', (c) => c.json(listSessions()));

  app.delete('/sessions/:sessionId', (c) => {
    const { sessionId } = c.req.param();
    const sessions = listSessions();
    const session = sessions.find((s) => s.sessionId === sessionId);
    const killed = killSession(sessionId);
    if (!killed) return c.json({ error: 'Session not found' }, 404);
    logger.warn({ sessionId }, 'Session killed via kill-switch');
    bus.emit('session:killed', { sessionId, agentId: session?.agentId ?? 'unknown' });
    emitAudit(bus, {
      eventType: 'session:killed',
      sessionId,
      agentId: session?.agentId ?? 'unknown',
      serverId: '',
      action: 'ALLOW',
    }, config);
    return c.json({ killed: true, sessionId });
  });

  // ─── Scan-on-connect ──────────────────────────────────────────────────────────
  app.post('/scan', async (c) => {
    const body = await c.req.json<{ serverId: string; tools: unknown[] }>();
    logger.info({ serverId: body.serverId }, 'Scan-on-connect triggered');

    if (!Array.isArray(body.tools)) {
      return c.json({ error: 'tools must be an array' }, 400);
    }

    const result = runFullScan(
      body.serverId,
      body.tools as Parameters<typeof runFullScan>[1],
    );

    const level = result.passed ? 'info' : 'warn';
    logger[level](
      { serverId: body.serverId, findingCount: result.findings.length, passed: result.passed },
      'Scan complete',
    );

    bus.emit('scan:complete', result);
    emitAudit(bus, {
      eventType: 'scan:complete',
      sessionId: '',
      agentId: '',
      serverId: body.serverId,
      action: result.passed ? 'ALLOW' : 'DENY',
    }, config);

    return c.json(result);
  });

  // ─── Continuous re-scan (D-030) ───────────────────────────────────────────────
  // Trigger a re-scan of an already-registered server — detects schema mutations
  // mid-session (rug pull detection). Schema drift logic is in runFullScan():
  // if serverId is already in the schema store, it compares against the baseline.
  app.post('/scan/refresh', async (c) => {
    const body = await c.req.json<{ serverId: string; tools: unknown[] }>();
    logger.info({ serverId: body.serverId }, 'Re-scan triggered (rug pull detection)');

    if (!Array.isArray(body.tools)) {
      return c.json({ error: 'tools must be an array' }, 400);
    }

    const result = runFullScan(
      body.serverId,
      body.tools as Parameters<typeof runFullScan>[1],
    );

    const level = result.passed ? 'info' : 'warn';
    logger[level](
      { serverId: body.serverId, findingCount: result.findings.length, passed: result.passed },
      'Re-scan complete',
    );

    bus.emit('scan:complete', result);
    emitAudit(bus, {
      eventType: 'scan:complete',
      sessionId: '',
      agentId: '',
      serverId: body.serverId,
      action: result.passed ? 'ALLOW' : 'DENY',
    }, config);

    return c.json(result);
  });

  // ─── Tool call proxy ──────────────────────────────────────────────────────────
  app.post('/proxy/tool-call', async (c) => {
    const body = await c.req.json<Omit<ToolCallEvent, 'timestamp'> & { sessionId?: string }>();

    const event: ToolCallEvent = {
      sessionId: body.sessionId ?? randomUUID(),
      agentId: body.agentId ?? config.agentId,
      serverId: body.serverId,
      toolName: body.toolName,
      input: body.input,
      timestamp: Date.now(),
    };

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
      });
    } catch (err) {
      // Upstream unreachable or timed out (D-022)
      const isTimeout = err instanceof Error && err.name === 'AbortError';
      logger.error({ err, toolName: event.toolName }, isTimeout ? 'Upstream timeout' : 'Upstream error');
      return c.json(
        { error: isTimeout ? 'Upstream MCP server timed out' : 'Upstream MCP server unreachable' },
        isTimeout ? 504 : 502,
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

    return c.json({ blocked: false, output });
  });

  // ─── Log access ───────────────────────────────────────────────────────────────
  app.get('/logs/tool-calls', (c) => {
    const { agentId, toolName, since, until } = c.req.query();
    let events = ringBuffer.toArray();

    if (agentId) events = events.filter((e) => e.agentId === agentId);
    if (toolName) events = events.filter((e) => e.toolName === toolName);
    if (since) {
      const ts = parseInt(since, 10);
      if (!isNaN(ts)) events = events.filter((e) => e.timestamp >= ts);
    }
    if (until) {
      const ts = parseInt(until, 10);
      if (!isNaN(ts)) events = events.filter((e) => e.timestamp <= ts);
    }

    return c.json(events);
  });

  return {
    start: () => {
      const server = serve({ fetch: app.fetch, port: config.port });
      logger.info(
        { port: config.port, upstreamMcpUrl: config.upstreamMcpUrl },
        'Aegis proxy started',
      );
      return server;
    },
    app,
    logger,
    policyStore, // exposed for Phase 2 API mutations
  };
}

// ─── Audit helper ─────────────────────────────────────────────────────────────

function emitAudit(
  bus: AegisEventBus,
  fields: Omit<AuditEntry, 'timestamp'>,
  config: ProxyConfig,
): void {
  bus.emit('audit', {
    timestamp: new Date().toISOString(),
    ...fields,
  } as AuditEntry);
}
