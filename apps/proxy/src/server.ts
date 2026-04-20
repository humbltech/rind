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
import type { ProxyConfig, ToolCallEvent } from './types.js';
import { runFullScan } from './scanner/index.js';
import { intercept } from './interceptor.js';
import { PolicyEngine } from './policy/engine.js';
import { loadPolicyFile, emptyPolicyConfig } from './policy/loader.js';
import { createSession, killSession, listSessions } from './session.js';

export function createProxyServer(config: ProxyConfig) {
  const logger = pino({
    level: config.logLevel ?? 'info',
    transport:
      process.env['NODE_ENV'] !== 'production'
        ? { target: 'pino-pretty', options: { colorize: true } }
        : undefined,
  });

  const policyConfig = config.policyFile
    ? loadPolicyFile(config.policyFile)
    : emptyPolicyConfig();

  const policyEngine = new PolicyEngine(policyConfig);

  const toolCallLog: ToolCallEvent[] = [];

  const app = new Hono();

  // ─── Health ────────────────────────────────────────────────────────────────

  app.get('/health', (c) => c.json({ status: 'ok', version: '0.1.0' }));

  // ─── Session management ────────────────────────────────────────────────────

  app.post('/sessions', async (c) => {
    const body = await c.req.json<{ agentId?: string }>();
    const session = createSession(body.agentId ?? config.agentId);
    logger.info({ sessionId: session.sessionId, agentId: session.agentId }, 'Session created');
    return c.json(session, 201);
  });

  app.get('/sessions', (c) => c.json(listSessions()));

  app.delete('/sessions/:sessionId', (c) => {
    const { sessionId } = c.req.param();
    const killed = killSession(sessionId);
    if (!killed) return c.json({ error: 'Session not found' }, 404);
    logger.warn({ sessionId }, 'Session killed via kill-switch');
    return c.json({ killed: true, sessionId });
  });

  // ─── Scan-on-connect ───────────────────────────────────────────────────────

  app.post('/scan', async (c) => {
    const body = await c.req.json<{ serverId: string; tools: unknown[] }>();
    logger.info({ serverId: body.serverId }, 'Scan-on-connect triggered');

    // Validate tools array shape minimally before scanning
    if (!Array.isArray(body.tools)) {
      return c.json({ error: 'tools must be an array' }, 400);
    }

    const result = runFullScan(
      body.serverId,
      body.tools as Parameters<typeof runFullScan>[1],
    );

    const level = result.passed ? 'info' : 'warn';
    logger[level](
      {
        serverId: body.serverId,
        findingCount: result.findings.length,
        passed: result.passed,
      },
      'Scan complete',
    );

    return c.json(result);
  });

  // ─── Tool call proxy ───────────────────────────────────────────────────────

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

    const { output, interceptorResult } = await intercept(
      event,
      async (e) => {
        // Forward to upstream MCP server
        const start = Date.now();
        const response = await fetch(`${config.upstreamMcpUrl}/tool-call`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ toolName: e.toolName, input: e.input }),
        });
        const upstreamOutput = await response.json();
        return { output: upstreamOutput, durationMs: Date.now() - start };
      },
      {
        policyEngine,
        onToolCallEvent: (e) => {
          toolCallLog.push(e);
          logger.info(
            { sessionId: e.sessionId, agentId: e.agentId, toolName: e.toolName },
            'Tool call',
          );
        },
        onToolResponseEvent: (e) => {
          if (e.threats.length > 0) {
            logger.warn(
              { sessionId: e.sessionId, toolName: e.toolName, threats: e.threats },
              'Response threats detected',
            );
          } else {
            logger.debug(
              { sessionId: e.sessionId, toolName: e.toolName, durationMs: e.durationMs },
              'Tool response clean',
            );
          }
        },
        blockOnCriticalResponseThreats: true,
      },
    );

    const blocked = interceptorResult.action !== 'ALLOW';
    if (blocked) {
      logger.warn(
        { action: interceptorResult.action, reason: interceptorResult.reason },
        'Tool call blocked',
      );
      return c.json(
        { blocked: true, action: interceptorResult.action, reason: interceptorResult.reason },
        403,
      );
    }

    return c.json({ blocked: false, output });
  });

  // ─── Log access ───────────────────────────────────────────────────────────

  app.get('/logs/tool-calls', (c) => c.json(toolCallLog));

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
  };
}
