// Tests for transport/mcp-message.ts — all pure functions, zero I/O.
//
// Coverage:
//   - parseMcpRequest: valid, invalid, edge cases
//   - isToolsCall, isInitialize: method discrimination
//   - extractToolCall: happy path, missing params, wrong types
//   - Response builders: buildSuccess, buildError, buildToolsList,
//     buildInitializeResponse, buildMethodNotFound, buildInternalError

import { describe, it, expect } from 'vitest';
import {
  parseMcpRequest,
  isToolsCall,
  isInitialize,
  extractToolCall,
  buildSuccess,
  buildError,
  buildToolsList,
  buildInitializeResponse,
  buildMethodNotFound,
  buildInternalError,
  buildInvalidRequest,
} from '../transport/mcp-message.js';
import { JSON_RPC } from '../transport/types.js';

// ─── parseMcpRequest ──────────────────────────────────────────────────────────

describe('parseMcpRequest', () => {
  it('parses a valid tools/call request', () => {
    const msg = parseMcpRequest({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name: 'run_query', arguments: { sql: 'SELECT 1' } },
    });
    expect(msg).not.toBeNull();
    expect(msg?.method).toBe('tools/call');
    expect(msg?.id).toBe(1);
  });

  it('parses a request with null id (notification-style)', () => {
    const msg = parseMcpRequest({ jsonrpc: '2.0', id: null, method: 'ping' });
    expect(msg?.id).toBeNull();
  });

  it('parses a request with string id', () => {
    const msg = parseMcpRequest({ jsonrpc: '2.0', id: 'req-abc', method: 'tools/list' });
    expect(msg?.id).toBe('req-abc');
  });

  it('returns null for non-object body', () => {
    expect(parseMcpRequest('hello')).toBeNull();
    expect(parseMcpRequest(42)).toBeNull();
    expect(parseMcpRequest(null)).toBeNull();
    expect(parseMcpRequest([])).toBeNull();
  });

  it('returns null when jsonrpc is not "2.0"', () => {
    expect(parseMcpRequest({ jsonrpc: '1.0', id: 1, method: 'ping' })).toBeNull();
    expect(parseMcpRequest({ id: 1, method: 'ping' })).toBeNull();
  });

  it('returns null when method is missing or not a string', () => {
    expect(parseMcpRequest({ jsonrpc: '2.0', id: 1 })).toBeNull();
    expect(parseMcpRequest({ jsonrpc: '2.0', id: 1, method: 42 })).toBeNull();
  });

  it('includes params when present', () => {
    const params = { name: 'tool', arguments: {} };
    const msg = parseMcpRequest({ jsonrpc: '2.0', id: 1, method: 'tools/call', params });
    expect(msg?.params).toEqual(params);
  });

  it('params is undefined when absent', () => {
    const msg = parseMcpRequest({ jsonrpc: '2.0', id: 1, method: 'initialize' });
    expect(msg?.params).toBeUndefined();
  });
});

// ─── isToolsCall / isInitialize ───────────────────────────────────────────────

describe('isToolsCall', () => {
  it('returns true for tools/call method', () => {
    expect(isToolsCall({ jsonrpc: '2.0', id: 1, method: 'tools/call' })).toBe(true);
  });

  it('returns false for other methods', () => {
    expect(isToolsCall({ jsonrpc: '2.0', id: 1, method: 'tools/list' })).toBe(false);
    expect(isToolsCall({ jsonrpc: '2.0', id: 1, method: 'initialize' })).toBe(false);
  });
});

describe('isInitialize', () => {
  it('returns true for initialize method', () => {
    expect(isInitialize({ jsonrpc: '2.0', id: 1, method: 'initialize' })).toBe(true);
  });

  it('returns false for other methods', () => {
    expect(isInitialize({ jsonrpc: '2.0', id: 1, method: 'tools/call' })).toBe(false);
  });
});

// ─── extractToolCall ──────────────────────────────────────────────────────────

describe('extractToolCall', () => {
  it('extracts name and arguments from a valid tools/call', () => {
    const msg = {
      jsonrpc: '2.0' as const,
      id: 1,
      method: 'tools/call',
      params: { name: 'run_query', arguments: { sql: 'SELECT 1' } },
    };
    const result = extractToolCall(msg);
    expect(result).not.toBeNull();
    expect(result?.name).toBe('run_query');
    expect(result?.input).toEqual({ sql: 'SELECT 1' });
  });

  it('returns empty object as input when arguments is absent', () => {
    const msg = {
      jsonrpc: '2.0' as const,
      id: 1,
      method: 'tools/call',
      params: { name: 'no_args_tool' },
    };
    const result = extractToolCall(msg);
    expect(result?.input).toEqual({});
  });

  it('returns null when method is not tools/call', () => {
    expect(
      extractToolCall({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    ).toBeNull();
  });

  it('returns null when params is null', () => {
    expect(
      extractToolCall({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: null }),
    ).toBeNull();
  });

  it('returns null when params is missing the name field', () => {
    expect(
      extractToolCall({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { arguments: {} } }),
    ).toBeNull();
  });

  it('returns null when name is not a string', () => {
    expect(
      extractToolCall({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 42 } }),
    ).toBeNull();
  });
});

// ─── Response builders ────────────────────────────────────────────────────────

describe('buildSuccess', () => {
  it('builds a success response with the correct shape', () => {
    const res = buildSuccess(1, { rows: [] });
    expect(res.jsonrpc).toBe('2.0');
    expect(res.id).toBe(1);
    expect(res.result).toEqual({ rows: [] });
    expect(res.error).toBeUndefined();
  });

  it('preserves null id', () => {
    expect(buildSuccess(null, 'ok').id).toBeNull();
  });
});

describe('buildError', () => {
  it('builds an error response', () => {
    const res = buildError(1, JSON_RPC.INTERNAL_ERROR, 'Something broke');
    expect(res.error?.code).toBe(JSON_RPC.INTERNAL_ERROR);
    expect(res.error?.message).toBe('Something broke');
    expect(res.result).toBeUndefined();
  });

  it('includes data when provided', () => {
    const res = buildError(1, -32000, 'Blocked', { rule: 'no-delete' });
    expect(res.error?.data).toEqual({ rule: 'no-delete' });
  });

  it('omits data when not provided', () => {
    const res = buildError(1, -32000, 'Blocked');
    expect(res.error?.data).toBeUndefined();
  });
});

describe('buildToolsList', () => {
  it('wraps tools in result.tools', () => {
    const tools = [
      { name: 'sql_query', description: 'Run SQL', inputSchema: { type: 'object' } },
    ];
    const res = buildToolsList(1, tools);
    expect((res.result as { tools: unknown[] }).tools).toEqual(tools);
  });

  it('accepts an empty tools array', () => {
    const res = buildToolsList(1, []);
    expect((res.result as { tools: unknown[] }).tools).toHaveLength(0);
  });
});

describe('buildInitializeResponse', () => {
  it('advertises Rind as the server', () => {
    const res = buildInitializeResponse(1);
    const result = res.result as Record<string, unknown>;
    expect((result.serverInfo as { name: string }).name).toBe('rind-gateway');
    expect(result.protocolVersion).toBeDefined();
    expect((result.capabilities as { tools: unknown }).tools).toBeDefined();
  });
});

describe('buildMethodNotFound', () => {
  it('uses the METHOD_NOT_FOUND error code', () => {
    const res = buildMethodNotFound(1, 'unknown/method');
    expect(res.error?.code).toBe(JSON_RPC.METHOD_NOT_FOUND);
    expect(res.error?.message).toContain('unknown/method');
  });
});

describe('buildInternalError', () => {
  // buildInternalError returns a generic message regardless of the underlying error
  // to prevent internal implementation details from leaking to callers via JSON-RPC.
  it('returns generic message for an Error (no information disclosure)', () => {
    const res = buildInternalError(1, new Error('network timeout'));
    expect(res.error?.message).toBe('Internal proxy error — check Rind logs');
    expect(res.error?.code).toBe(JSON_RPC.INTERNAL_ERROR);
  });

  it('returns generic message for a string error (no information disclosure)', () => {
    const res = buildInternalError(1, 'something went wrong');
    expect(res.error?.message).toBe('Internal proxy error — check Rind logs');
  });
});

describe('buildInvalidRequest', () => {
  it('uses the INVALID_REQUEST error code', () => {
    const res = buildInvalidRequest(1, 'missing name');
    expect(res.error?.code).toBe(JSON_RPC.INVALID_REQUEST);
    expect(res.error?.message).toContain('missing name');
  });
});
