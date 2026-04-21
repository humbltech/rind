// Transport layer configuration types (D-040 Phase A3).
//
// These types describe how Rind connects to upstream MCP servers.
// They are pure data — no logic, no imports from other Rind modules.
// Imported by pool.ts, gateway.ts, and the upstream client implementations.

import { z } from 'zod';

// ─── Upstream server config ───────────────────────────────────────────────────

export const StdioServerConfigSchema = z.object({
  transport: z.literal('stdio'),
  command: z.string().min(1, 'Command must not be empty'),
  args: z.array(z.string()).optional(),
  // Env vars to set for the child process (merged with safe inherited defaults)
  env: z.record(z.string()).optional(),
  cwd: z.string().optional(),
});

// Valid HTTP header name: token chars only (RFC 7230 §3.2.6), no separators
const validHeaderName = /^[a-zA-Z0-9!#$%&'*+\-.^_`|~]+$/;

export const HttpServerConfigSchema = z.object({
  transport: z.literal('http'),
  url: z.string().url().refine(
    (u) => u.startsWith('http://') || u.startsWith('https://'),
    { message: 'URL must use http:// or https:// protocol' },
  ),
  // Extra headers sent with every request (e.g. authorization tokens).
  // Names must be valid RFC 7230 token chars; values must not contain CR/LF
  // (prevents HTTP response splitting regardless of whether fetch sanitizes them).
  headers: z.record(
    z.string().regex(validHeaderName, 'Header name must be a valid HTTP token'),
    z.string().max(8192).refine(
      (v) => !v.includes('\r') && !v.includes('\n'),
      { message: 'Header value must not contain CR or LF' },
    ),
  ).optional(),
});

export const UpstreamServerConfigSchema = z.discriminatedUnion('transport', [
  StdioServerConfigSchema,
  HttpServerConfigSchema,
]);

export type StdioServerConfig = z.infer<typeof StdioServerConfigSchema>;
export type HttpServerConfig  = z.infer<typeof HttpServerConfigSchema>;
export type UpstreamServerConfig = z.infer<typeof UpstreamServerConfigSchema>;

// ─── Server map ───────────────────────────────────────────────────────────────

// Maps a logical server ID (e.g. "github", "stripe") to its upstream config.
// Added to ProxyConfig.servers so Rind knows how to connect to each server.
export const McpServerMapSchema = z.record(UpstreamServerConfigSchema);
export type McpServerMap = z.infer<typeof McpServerMapSchema>;

// ─── MCP JSON-RPC message types ───────────────────────────────────────────────

// MCP uses JSON-RPC 2.0. These are the types for messages flowing through the gateway.

export type McpId = string | number | null;

export interface McpRequestMessage {
  jsonrpc: '2.0';
  id:      McpId;
  method:  string;
  params?: unknown;
}

export interface McpResponseMessage {
  jsonrpc: '2.0';
  id:      McpId;
  result?: unknown;
  error?:  McpError;
}

export interface McpError {
  code:    number;
  message: string;
  data?:   unknown;
}

// JSON-RPC error codes
export const JSON_RPC = {
  PARSE_ERROR:      -32700,
  INVALID_REQUEST:  -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS:   -32602,
  INTERNAL_ERROR:   -32603,
} as const;
