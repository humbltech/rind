// Proxy-specific types.
// All shared types (events, policy, scan, audit, LLM) live in @rind/core.
// This barrel re-exports them so proxy internals keep their existing import paths.
export * from '@rind/core';

import type { PolicyConfig } from '@rind/core';

// ─── Proxy-only types ─────────────────────────────────────────────────────────
// These reference proxy-internal transport types and cannot move to @rind/core.

// Injectable forward function — used by the simulation to replace real network calls.
export type ForwardFn = (
  toolName: string,
  input: unknown,
) => Promise<{ output: unknown; durationMs: number }>;

export interface ProxyConfig {
  port: number;
  agentId: string;
  upstreamMcpUrl: string; // legacy single-server URL (Phase 1 passthrough)
  // D-040 Phase A3: multi-server MCP routing map.
  servers?: import('./transport/types.js').McpServerMap;
  policyFile?: string; // path to rind.policy.yaml
  policy?: PolicyConfig; // in-memory policy — takes precedence over policyFile; used in tests and simulation
  logLevel?: 'debug' | 'info' | 'warn' | 'error';
  // Optional DI override for the forward function — used in tests and simulation
  forwardFn?: ForwardFn;
  // D-018: observability pipeline
  auditLogPath?: string; // path to JSONL audit log (default: .rind/audit.jsonl)
  ringBufferSize?: number; // max events in in-memory ring buffer (default: 10_000)
  // D-020: audit configuration
  auditIncludeOutput?: boolean; // include tool output in audit entries (default: false — privacy)
  // D-022: upstream timeout
  upstreamTimeoutMs?: number; // fetch timeout for upstream MCP server (default: 30_000)
  // Hook: include actionable guidance in deny responses (default: true)
  hookSendGuidance?: boolean;
  // LLM API proxy configuration (D-041 scope clarification)
  llmProxy?: Partial<import('./transport/llm/types.js').LlmProxyConfig>;
  // Module enable flags — all on by default, disabled with --no-* CLI flags
  mcpProxyEnabled?: boolean;   // default true — disable with --no-mcp-proxy
  hooksEnabled?: boolean;      // default true — disable with --no-hooks
}
