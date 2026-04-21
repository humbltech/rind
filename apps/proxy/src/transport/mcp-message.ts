// MCP JSON-RPC message parsing and building (D-040 Phase A3).
//
// Pure functions — no I/O, no side effects, no external state.
// Every function is independently testable: input in, output out.
//
// This module owns the boundary between raw HTTP bodies and typed MCP messages.
// The gateway calls into these functions; the upstream clients never touch raw JSON.

import type { McpRequestMessage, McpResponseMessage, McpId, McpError } from './types.js';
import { JSON_RPC } from './types.js';

// ─── Tool metadata (shared between list and call) ─────────────────────────────

export interface ToolInfo {
  name:        string;
  description?: string;
  inputSchema?: unknown;
}

// ─── Parsing ──────────────────────────────────────────────────────────────────

/**
 * Parses a raw request body as an MCP JSON-RPC request.
 * Returns null if the body is not a valid JSON-RPC 2.0 request object.
 */
export function parseMcpRequest(body: unknown): McpRequestMessage | null {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return null;

  const b = body as Record<string, unknown>;

  if (b['jsonrpc'] !== '2.0')      return null;
  if (typeof b['method'] !== 'string') return null;

  return {
    jsonrpc: '2.0',
    id:      (b['id'] as McpId) ?? null,
    method:  b['method'] as string,
    params:  b['params'],
  };
}

/**
 * Returns true when a request is a tools/call (interceptable).
 */
export function isToolsCall(msg: McpRequestMessage): boolean {
  return msg.method === 'tools/call';
}

/**
 * Returns true when a request is an initialize handshake.
 */
export function isInitialize(msg: McpRequestMessage): boolean {
  return msg.method === 'initialize';
}

/**
 * Extracts the tool name and input arguments from a tools/call request.
 * Returns null if the params shape is wrong.
 */
export function extractToolCall(
  msg: McpRequestMessage,
): { name: string; input: unknown } | null {
  if (!isToolsCall(msg)) return null;

  const params = msg.params;
  if (typeof params !== 'object' || params === null) return null;

  const p = params as Record<string, unknown>;
  if (typeof p['name'] !== 'string') return null;

  return {
    name:  p['name'],
    input: p['arguments'] ?? {},
  };
}

// ─── Response builders ────────────────────────────────────────────────────────

/**
 * Builds a successful JSON-RPC response.
 */
export function buildSuccess(id: McpId, result: unknown): McpResponseMessage {
  return { jsonrpc: '2.0', id, result };
}

/**
 * Builds a JSON-RPC error response.
 */
export function buildError(
  id:      McpId,
  code:    number,
  message: string,
  data?:   unknown,
): McpResponseMessage {
  const error: McpError = { code, message, ...(data !== undefined ? { data } : {}) };
  return { jsonrpc: '2.0', id, error };
}

/**
 * Builds the tools/list result from an array of tool definitions.
 */
export function buildToolsList(id: McpId, tools: ToolInfo[]): McpResponseMessage {
  return buildSuccess(id, { tools });
}

/**
 * Builds the initialize handshake response.
 * Advertises Rind as an MCP proxy gateway with minimal capabilities.
 */
export function buildInitializeResponse(id: McpId): McpResponseMessage {
  return buildSuccess(id, {
    protocolVersion: '2024-11-05',
    capabilities: {
      tools: {},
    },
    serverInfo: {
      name:    'rind-gateway',
      version: '1.0.0',
    },
  });
}

/**
 * Builds an "method not found" error for unrecognized methods.
 */
export function buildMethodNotFound(id: McpId, method: string): McpResponseMessage {
  return buildError(id, JSON_RPC.METHOD_NOT_FOUND, `Method not found: ${method}`);
}

/**
 * Builds an "internal error" from an unknown Error or string.
 */
export function buildInternalError(id: McpId, err: unknown): McpResponseMessage {
  const message = err instanceof Error ? err.message : String(err);
  return buildError(id, JSON_RPC.INTERNAL_ERROR, `Internal error: ${message}`);
}

/**
 * Builds an "invalid request" error (e.g. malformed body or missing params).
 */
export function buildInvalidRequest(id: McpId, detail: string): McpResponseMessage {
  return buildError(id, JSON_RPC.INVALID_REQUEST, detail);
}
