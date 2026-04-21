// MCP gateway — Hono route factory (D-040 Phase A3).
//
// Mounts MCP JSON-RPC endpoints on a Hono app:
//   GET  /mcp              — list all registered server IDs
//   GET  /mcp/:serverId    — 405 (SSE streaming is Phase A3-v2)
//   POST /mcp/:serverId    — receive MCP JSON-RPC, intercept tools/call, proxy the rest
//
// HTTP concerns (parsing, headers, status codes) stay in the route handlers.
// Business logic (interceptor + upstream dispatch) lives in dispatchToolCall()
// so it can be tested independently of Hono.

import { Hono } from 'hono';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import type { UpstreamPool } from './pool.js';
import type { UpstreamClient } from './upstream/interface.js';
import type { InterceptorOptions } from '../interceptor.js';
import { intercept } from '../interceptor.js';
import type { ToolCallEvent } from '../types.js';
import type { McpRequestMessage, McpResponseMessage } from './types.js';
import { JSON_RPC } from './types.js';
import {
  parseMcpRequest,
  isToolsCall,
  isInitialize,
  extractToolCall,
  buildSuccess,
  buildToolsList,
  buildInitializeResponse,
  buildMethodNotFound,
  buildInternalError,
  buildInvalidRequest,
  buildError,
} from './mcp-message.js';

const _require = createRequire(import.meta.url);
const PROXY_VERSION: string = (_require('../../package.json') as { version: string }).version;

// ─── Gateway factory ─────────────────────────────────────────────────────────

/**
 * Creates a Hono sub-app that handles MCP JSON-RPC routing.
 * Mount it on the parent app: `app.route('/', mcpGateway(pool, opts))`
 */
export function mcpGateway(pool: UpstreamPool, interceptorOpts: InterceptorOptions): Hono {
  const app = new Hono();

  // List all registered server IDs — useful for discovery and config validation
  app.get('/mcp', (c) => c.json({ servers: pool.serverIds() }));

  // SSE streaming transport: Phase A3-v2. Return 405 so clients fall back to POST.
  app.get('/mcp/:serverId', (c) =>
    c.json(
      { error: 'SSE streaming not yet supported — use POST for request/response mode' },
      405,
    ),
  );

  // Main MCP JSON-RPC dispatch
  app.post('/mcp/:serverId', async (c) => {
    const { serverId } = c.req.param();

    const upstream = pool.get(serverId);
    if (!upstream) {
      return c.json(
        buildError(null, JSON_RPC.INVALID_REQUEST, `Unknown MCP server: "${serverId}"`),
        404,
      );
    }

    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json(buildError(null, JSON_RPC.PARSE_ERROR, 'Request body is not valid JSON'), 400);
    }

    const request = parseMcpRequest(body);
    if (!request) {
      return c.json(buildError(null, JSON_RPC.INVALID_REQUEST, 'Not a valid JSON-RPC 2.0 request'), 400);
    }

    const response = await dispatchRequest(
      request,
      upstream,
      serverId,
      c.req.header('mcp-session-id'),
      c.req.header('x-agent-id'),
      interceptorOpts,
    );

    // MCP notifications must not receive a JSON-RPC response body (protocol requirement)
    if (response.result === '__notification__') return c.body(null, 204);

    return c.json(response);
  });

  return app;
}

// ─── Request dispatch ─────────────────────────────────────────────────────────
// Pure async function — no Hono types, no HTTP concepts.
// Testable with any mock upstream and any interceptor config.

export async function dispatchRequest(
  request:        McpRequestMessage,
  upstream:       UpstreamClient,
  serverId:       string,
  mcpSessionId:   string | undefined,
  agentIdHeader:  string | undefined,
  interceptorOpts: InterceptorOptions,
): Promise<McpResponseMessage> {
  const { id } = request;

  if (isInitialize(request)) {
    return buildInitializeResponse(id, PROXY_VERSION);
  }

  // MCP notifications are fire-and-forget — the protocol forbids sending a response.
  // Return a sentinel so the HTTP handler can respond with 204 instead of JSON.
  if (request.method.startsWith('notifications/')) {
    return { jsonrpc: '2.0', id: null, result: '__notification__' };
  }

  if (request.method === 'tools/list') {
    try {
      const tools = await upstream.listTools();
      return buildToolsList(id, tools);
    } catch {
      return buildInternalError(id);
    }
  }

  if (isToolsCall(request)) {
    return dispatchToolCall(request, upstream, serverId, mcpSessionId, agentIdHeader, interceptorOpts);
  }

  // Unrecognised method — not supported in Phase A3
  return buildMethodNotFound(id, request.method);
}

// ─── Tool call interception ───────────────────────────────────────────────────
// Separate function so it can be tested without constructing a full gateway.

export async function dispatchToolCall(
  request:         McpRequestMessage,
  upstream:        UpstreamClient,
  serverId:        string,
  mcpSessionId:    string | undefined,
  agentIdHeader:   string | undefined,
  interceptorOpts: InterceptorOptions,
): Promise<McpResponseMessage> {
  const { id } = request;

  const call = extractToolCall(request);
  if (!call) {
    return buildInvalidRequest(id, 'tools/call params must include a "name" string');
  }

  // Use the MCP-Session-ID header when present (set by compliant MCP clients).
  // Fall back to a per-request UUID so that loop detection and rate limiting
  // scope to individual callers rather than colliding across them.
  //
  // Important limitation: per-request fallback UUIDs break SESSION-LEVEL limits
  // (maxCallsPerSession, maxCostPerSession) because each call appears as a new session.
  // Clients MUST send MCP-Session-ID for those limits to apply. The Streamable HTTP
  // transport spec requires session IDs — this fallback is a courtesy for non-compliant clients.
  const sessionId = mcpSessionId ?? `mcp:${randomUUID()}`;
  const agentId   = agentIdHeader ?? `agent:${serverId}`;

  const event: ToolCallEvent = {
    sessionId,
    agentId,
    serverId,
    toolName:  call.name,
    input:     call.input,
    timestamp: Date.now(),
  };

  const forward = async () => {
    const start  = Date.now();
    const output = await upstream.callTool(call.name, call.input);
    return { output, durationMs: Date.now() - start };
  };

  let result: Awaited<ReturnType<typeof intercept>>;
  try {
    result = await intercept(event, forward, interceptorOpts);
  } catch (err) {
    return buildInternalError(id, err);
  }

  const { interceptorResult, output } = result;
  const { action, reason } = interceptorResult;

  if (action === 'ALLOW' || action === 'RATE_LIMIT') {
    return buildSuccess(id, output);
  }

  // DENY / BLOCKED_* / REQUIRE_APPROVAL → JSON-RPC error response
  return buildError(
    id,
    JSON_RPC.INTERNAL_ERROR,
    reason ?? `Blocked by Rind: ${action}`,
  );
}
