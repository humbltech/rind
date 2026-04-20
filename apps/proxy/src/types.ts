// Shared types for the Aegis MCP proxy
// All events are structurally compatible with OpenTelemetry spans for future export

export type PolicyAction = 'ALLOW' | 'DENY' | 'REQUIRE_APPROVAL' | 'RATE_LIMIT';

// ─── Tool call events ────────────────────────────────────────────────────────

export interface ToolCallEvent {
  sessionId: string;
  agentId: string; // identity-aware from day 1
  serverId: string;
  toolName: string;
  input: unknown;
  timestamp: number;
}

export interface ToolResponseEvent {
  sessionId: string;
  agentId: string;
  serverId: string;
  toolName: string;
  output: unknown;
  durationMs: number;
  threats: ResponseThreat[]; // prompt injection, credential patterns
}

// ─── Response-side threat detection ─────────────────────────────────────────

export interface ResponseThreat {
  type: 'PROMPT_INJECTION' | 'CREDENTIAL_LEAK' | 'SUSPICIOUS_REDIRECT';
  severity: 'critical' | 'high' | 'medium';
  pattern: string;
  sanitized: boolean;
}

// ─── Schema + scan ───────────────────────────────────────────────────────────

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface ServerSchema {
  serverId: string;
  hash: string; // SHA-256 of sorted tool definitions
  tools: ToolDefinition[];
  scannedAt: number;
  findings: ScanFinding[];
}

export type ScanFindingSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';
export type ScanFindingCategory =
  | 'AUTH_MISSING'
  | 'TOOL_POISONING'
  | 'OVER_PERMISSIONED'
  | 'SCHEMA_DRIFT'
  | 'SCHEMA_DRIFT_TOOL_ADDED'
  | 'SCHEMA_DRIFT_TOOL_MODIFIED'
  | 'SCHEMA_DRIFT_TOOL_REMOVED';

export interface ScanFinding {
  category: ScanFindingCategory;
  severity: ScanFindingSeverity;
  toolName?: string;
  detail: string;
}

export interface ScanResult {
  serverId: string;
  scannedAt: number;
  findings: ScanFinding[];
  passed: boolean; // true = no critical/high findings
}

// ─── Session ─────────────────────────────────────────────────────────────────

export interface Session {
  sessionId: string;
  agentId: string;
  startedAt: number;
  active: boolean; // false = killed via kill-switch
  toolCallCount: number;
  estimatedCostUsd: number;
}

// ─── Policy ──────────────────────────────────────────────────────────────────

export interface PolicyRule {
  name: string;
  agent: string; // '*' = all agents
  match: {
    tool?: string[];
    toolPattern?: string; // glob pattern e.g. "billing.*"
    timeWindow?: {
      daysOfWeek?: number[]; // 0=Sun, 1=Mon...6=Sat
      hours?: string; // "09:00-18:00" UTC
    };
  };
  action: PolicyAction;
}

export interface PolicyConfig {
  policies: PolicyRule[];
}

// ─── Proxy config ─────────────────────────────────────────────────────────────

export interface ProxyConfig {
  port: number;
  agentId: string;
  upstreamMcpUrl: string; // the MCP server to proxy to
  policyFile?: string; // path to aegis.policy.yaml
  logLevel?: 'debug' | 'info' | 'warn' | 'error';
}
