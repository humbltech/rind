// Tests for transport/gateway.ts — dispatchRequest() and dispatchToolCall().
//
// We test the exported pure async functions, not the Hono routes.
// This means no HTTP server, no request objects — just typed inputs and
// McpResponseMessage outputs. Fully isolated from the transport layer.
//
// Coverage:
//   - initialize → handshake response
//   - tools/list → delegates to upstream, returns tool list
//   - tools/list upstream failure → JSON-RPC internal error
//   - tools/call → ALLOW: returns upstream output
//   - tools/call → DENY: returns JSON-RPC error with Rind reason
//   - tools/call → REQUIRE_APPROVAL: returns JSON-RPC error
//   - tools/call → missing params: returns invalid-request error
//   - unknown method → method-not-found error

import { describe, it, expect, vi } from 'vitest';
import { dispatchRequest, dispatchToolCall } from '../transport/gateway.js';
import type { InterceptorOptions } from '../interceptor.js';
import { PolicyEngine } from '../policy/engine.js';
import { InMemoryPolicyStore } from '../policy/store.js';
import { expandPackRules, getPack } from '../policy/packs.js';
import type { UpstreamClient, ToolInfo } from '../transport/upstream/interface.js';
import { JSON_RPC } from '../transport/types.js';
import type { McpRequestMessage } from '../transport/types.js';

// ─── Test doubles ─────────────────────────────────────────────────────────────

const TOOLS: ToolInfo[] = [
  { name: 'sql_query', description: 'Run SQL', inputSchema: { type: 'object' } },
];

function makeUpstream(overrides: Partial<UpstreamClient> = {}): UpstreamClient {
  return {
    listTools: vi.fn().mockResolvedValue(TOOLS),
    callTool:  vi.fn().mockResolvedValue({ content: [{ type: 'text', text: 'ok' }] }),
    close:     vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

/** InterceptorOptions that allows every tool call (no rules). */
function makeAllowOpts(): InterceptorOptions {
  return {
    policyEngine: new PolicyEngine(new InMemoryPolicyStore({ policies: [] })),
    onToolCallEvent: () => {},
    onToolResponseEvent: () => {},
    blockOnCriticalResponseThreats: false,
  };
}

/** InterceptorOptions loaded with the cli-protection pack (DENY/REQUIRE_APPROVAL rules). */
function makeCliProtectionOpts(): InterceptorOptions {
  const pack = getPack('cli-protection')!;
  return {
    policyEngine: new PolicyEngine(new InMemoryPolicyStore({ policies: expandPackRules(pack) })),
    onToolCallEvent: () => {},
    onToolResponseEvent: () => {},
    blockOnCriticalResponseThreats: false,
  };
}

function req(method: string, params?: unknown): McpRequestMessage {
  return { jsonrpc: '2.0', id: 1, method, params };
}

// ─── dispatchRequest — method routing ────────────────────────────────────────

describe('dispatchRequest — initialize', () => {
  it('returns a valid MCP initialize response', async () => {
    const res = await dispatchRequest(req('initialize'), makeUpstream(), 'srv', undefined, undefined, makeAllowOpts(), '0.0.0-test');
    expect(res.error).toBeUndefined();
    const result = res.result as Record<string, unknown>;
    expect((result.serverInfo as { name: string }).name).toBe('rind-gateway');
    expect(result.protocolVersion).toBe('2024-11-05');
    // Version is injected by the caller — verify it's passed through correctly
    const version = (result.serverInfo as { version: string }).version;
    expect(version).toBe('0.0.0-test');
  });
});

describe('dispatchRequest — tools/list', () => {
  it('returns tools from upstream', async () => {
    const upstream = makeUpstream();
    const res = await dispatchRequest(req('tools/list'), upstream, 'srv', undefined, undefined, makeAllowOpts(), '0.0.0-test');
    expect(res.error).toBeUndefined();
    const result = res.result as { tools: ToolInfo[] };
    expect(result.tools).toEqual(TOOLS);
    expect(upstream.listTools).toHaveBeenCalledOnce();
  });

  it('returns internal error when upstream throws', async () => {
    const upstream = makeUpstream({
      listTools: vi.fn().mockRejectedValue(new Error('connection refused')),
    });
    const res = await dispatchRequest(req('tools/list'), upstream, 'srv', undefined, undefined, makeAllowOpts(), '0.0.0-test');
    expect(res.error?.code).toBe(JSON_RPC.INTERNAL_ERROR);
    // Generic message — underlying error must not leak to callers
    expect(res.error?.message).toBe('Internal proxy error — check Rind logs');
  });
});

describe('dispatchRequest — unknown method', () => {
  it('returns method-not-found', async () => {
    const res = await dispatchRequest(req('prompts/list'), makeUpstream(), 'srv', undefined, undefined, makeAllowOpts(), '0.0.0-test');
    expect(res.error?.code).toBe(JSON_RPC.METHOD_NOT_FOUND);
  });
});

// ─── dispatchRequest — MCP notifications ─────────────────────────────────────
// MCP notifications must never receive a JSON-RPC response body (protocol rule).
// The gateway returns a sentinel result so the HTTP handler can emit 204 instead.

describe('dispatchRequest — notifications', () => {
  it('returns the __notification__ sentinel for notifications/initialized', async () => {
    const res = await dispatchRequest(
      req('notifications/initialized'),
      makeUpstream(),
      'srv',
      undefined,
      undefined,
      makeAllowOpts(),
      '0.0.0-test',
    );
    expect(res.result).toBe('__notification__');
    expect(res.error).toBeUndefined();
  });

  it('returns the sentinel for any notifications/* method', async () => {
    for (const method of ['notifications/progress', 'notifications/cancelled', 'notifications/roots/list_changed']) {
      const res = await dispatchRequest(req(method), makeUpstream(), 'srv', undefined, undefined, makeAllowOpts(), '0.0.0-test');
      expect(res.result).toBe('__notification__');
    }
  });

  it('does NOT return the sentinel for non-notification methods', async () => {
    const res = await dispatchRequest(req('tools/list'), makeUpstream(), 'srv', undefined, undefined, makeAllowOpts(), '0.0.0-test');
    expect(res.result).not.toBe('__notification__');
  });
});

// ─── dispatchToolCall — ALLOW paths ──────────────────────────────────────────

describe('dispatchToolCall — ALLOW', () => {
  it('returns upstream output when policy allows the call', async () => {
    const upstream = makeUpstream();
    const toolCallReq = req('tools/call', { name: 'sql_query', arguments: { sql: 'SELECT 1' } });

    const res = await dispatchToolCall(toolCallReq, upstream, 'srv', undefined, undefined, makeAllowOpts());
    expect(res.error).toBeUndefined();
    expect(upstream.callTool).toHaveBeenCalledWith('sql_query', { sql: 'SELECT 1' });
  });

  it('forwards arguments as the input to upstream.callTool', async () => {
    const upstream = makeUpstream();
    const toolCallReq = req('tools/call', { name: 'do_thing', arguments: { x: 42 } });

    await dispatchToolCall(toolCallReq, upstream, 'srv', undefined, undefined, makeAllowOpts());
    expect(upstream.callTool).toHaveBeenCalledWith('do_thing', { x: 42 });
  });

  it('calls upstream with empty input when arguments is absent', async () => {
    const upstream = makeUpstream();
    const toolCallReq = req('tools/call', { name: 'no_args' });

    await dispatchToolCall(toolCallReq, upstream, 'srv', undefined, undefined, makeAllowOpts());
    expect(upstream.callTool).toHaveBeenCalledWith('no_args', {});
  });
});

// ─── dispatchToolCall — DENY paths ───────────────────────────────────────────

describe('dispatchToolCall — DENY / block', () => {
  it('returns a JSON-RPC error when cli-protection denies a Bash command', async () => {
    // Simulate Claude Code calling the Bash tool through the MCP gateway
    // (tool named "Bash" with a command parameter)
    const upstream = makeUpstream();
    const toolCallReq = req('tools/call', {
      name:      'Bash',
      arguments: { command: 'npm publish' },
    });

    const res = await dispatchToolCall(
      toolCallReq,
      upstream,
      'builtin',
      undefined,
      undefined,
      makeCliProtectionOpts(),
    );

    expect(res.error).toBeDefined();
    expect(res.error?.code).toBe(JSON_RPC.INTERNAL_ERROR);
    // upstream should NOT have been called
    expect(upstream.callTool).not.toHaveBeenCalled();
  });

  it('includes the policy reason in the error message', async () => {
    const toolCallReq = req('tools/call', {
      name:      'Bash',
      arguments: { command: 'rm -rf /' },
    });

    const res = await dispatchToolCall(
      toolCallReq,
      makeUpstream(),
      'builtin',
      undefined,
      undefined,
      makeCliProtectionOpts(),
    );

    expect(res.error?.message).toMatch(/Rind|denied|Blocked/i);
  });

  it('returns error when REQUIRE_APPROVAL fires (no approval workflow in Phase A)', async () => {
    const toolCallReq = req('tools/call', {
      name:      'Bash',
      arguments: { command: 'aws ec2 terminate-instances --instance-ids i-abc' },
    });

    const res = await dispatchToolCall(
      toolCallReq,
      makeUpstream(),
      'builtin',
      undefined,
      undefined,
      makeCliProtectionOpts(),
    );

    // REQUIRE_APPROVAL → client sees an error (can't pause-and-resume in Phase A)
    expect(res.error).toBeDefined();
    expect(makeUpstream().callTool).not.toHaveBeenCalled();
  });

  it('returns internal error when upstream.callTool throws', async () => {
    const upstream = makeUpstream({
      callTool: vi.fn().mockRejectedValue(new Error('upstream timeout')),
    });
    const toolCallReq = req('tools/call', { name: 'slow_tool', arguments: {} });

    const res = await dispatchToolCall(
      toolCallReq,
      upstream,
      'srv',
      undefined,
      undefined,
      makeAllowOpts(),
    );

    expect(res.error?.code).toBe(JSON_RPC.INTERNAL_ERROR);
    // Generic message — underlying error must not leak to callers
    expect(res.error?.message).toBe('Internal proxy error — check Rind logs');
  });
});

// ─── dispatchToolCall — invalid params ───────────────────────────────────────

describe('dispatchToolCall — invalid params', () => {
  it('returns invalid-request when params are missing', async () => {
    const toolCallReq = req('tools/call'); // no params
    const res = await dispatchToolCall(toolCallReq, makeUpstream(), 'srv', undefined, undefined, makeAllowOpts());
    expect(res.error?.code).toBe(JSON_RPC.INVALID_REQUEST);
  });

  it('returns invalid-request when name is absent from params', async () => {
    const toolCallReq = req('tools/call', { arguments: {} }); // missing name
    const res = await dispatchToolCall(toolCallReq, makeUpstream(), 'srv', undefined, undefined, makeAllowOpts());
    expect(res.error?.code).toBe(JSON_RPC.INVALID_REQUEST);
  });
});
