// Shared types for the Rind MCP proxy
// All events are structurally compatible with OpenTelemetry spans for future export

export type PolicyAction = 'ALLOW' | 'DENY' | 'REQUIRE_APPROVAL' | 'RATE_LIMIT';

// ─── Tool call events ────────────────────────────────────────────────────────

export interface ToolCallEvent {
  sessionId: string;
  sessionName?: string; // Human-readable name from Claude Code /rename
  agentId: string; // identity-aware from day 1
  serverId: string;
  toolName: string;
  input: unknown;
  timestamp: number;
  // Enriched after policy evaluation — not present on the initial event
  outcome?: 'allowed' | 'blocked' | 'require-approval' | 'approved' | 'disapproved' | 'approval-timeout' | 'upstream-error' | 'upstream-timeout';
  reason?: string;
  // Name of the policy rule that matched (if any)
  matchedRule?: string;
  // Source classification: 'builtin' for Claude Code tools, 'mcp' for MCP server tools
  source?: 'builtin' | 'mcp' | 'proxy';
  // Human-readable label: "Bash: git status", "Read: server.ts", "Edit: types.ts"
  toolLabel?: string;
  // Working directory where the agent is operating
  cwd?: string;
  // Deterministic correlation ID linking PreToolUse → PostToolUse for the same call
  correlationId?: string;
  // PostToolUse response data — enriched server-side when PostToolUse arrives
  response?: {
    outputPreview?: string;
    outputTruncated?: boolean;
    outputSizeBytes?: number;
    outputHash?: string;
    threats?: ResponseThreat[];
    timestamp: number;
  };
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

export interface ToolErrorEvent {
  sessionId: string;
  serverId: string;
  agentId: string;
  toolName: string;
  /** 'upstream-unreachable' = ECONNREFUSED / fetch failed; 'upstream-timeout' = AbortError */
  errorKind: 'upstream-unreachable' | 'upstream-timeout';
  durationMs: number;
}

// ─── Response-side threat detection ─────────────────────────────────────────

export interface ResponseThreat {
  type: 'PROMPT_INJECTION' | 'CREDENTIAL_LEAK' | 'SUSPICIOUS_REDIRECT' | 'INDIRECT_PROMPT_INJECTION';
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
  | 'SCHEMA_DRIFT_TOOL_REMOVED'
  | 'CROSS_SERVER_SHADOWING';

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

// ─── Policy — parameter matching (D-016) ─────────────────────────────────────

/** Conditions to match against a tool input parameter value (recursive key lookup, depth ≤ 5). */
export interface ParameterMatcher {
  contains?: string[]; // all substrings must be present (case-insensitive)
  regex?: string; // full-match regex (pre-compiled at policy load time)
  startsWith?: string;
  gt?: number;
  lt?: number;
  gte?: number;
  lte?: number;
  eq?: unknown;
  in?: unknown[];
}

// ─── Loop detection (policy-driven) ──────────────────────────────────────────

/** Loop detection condition on a policy rule. The rule's action fires only when
 *  the loop condition is met AND the rule's match criteria apply. */
export interface LoopCondition {
  /** Detection type:
   *  - exact: same tool + same input hash repeated
   *  - consecutive: same tool name called in a row (any input)
   *  - subcommand: same extracted sub-command repeated (Bash only) */
  type: 'exact' | 'consecutive' | 'subcommand';
  /** Number of occurrences that trigger the loop (e.g. 5 = block on 5th repeat) */
  threshold: number;
  /** Sliding window size — how many recent calls to consider (default 30) */
  window?: number;
}

// ─── Policy ──────────────────────────────────────────────────────────────────

export interface PolicyRule {
  name: string;
  agent: string; // '*' = all agents
  enabled?: boolean; // default true — set to false to disable without deleting
  match: {
    tool?: string[];
    toolPattern?: string; // glob pattern e.g. "billing.*"
    timeWindow?: {
      daysOfWeek?: number[]; // 0=Sun, 1=Mon...6=Sat
      hours?: string; // "09:00-18:00" UTC
    };
    // D-016: input parameter matching — recursive key lookup in tool input
    parameters?: Record<string, ParameterMatcher>;
    // Sub-command matching (Bash only) — extracts sub-commands (e.g. "git push")
    // and matches if ANY extracted sub-command is in this list (case-insensitive).
    // "git status && npm publish" with subcommand: ['npm publish'] → matches.
    subcommand?: string[];
  };
  action: PolicyAction;
  // D-013: REQUIRE_APPROVAL metadata (parsed but async flow is Phase 2)
  approval?: {
    timeout?: string; // e.g. "30m" — informational in Phase 1
    onTimeout?: 'DENY' | 'ALLOW'; // informational in Phase 1
  };
  // D-014: cost tracking
  costEstimate?: number; // USD per call charged to session when this rule matches
  limits?: {
    maxCallsPerSession?: number;
    maxCallsPerHour?: number;
    maxCostPerSession?: number;
    maxCostPerHour?: number;
  };
  // D-017: rate limiting (used when action === 'RATE_LIMIT')
  rateLimit?: {
    limit: number;
    window: string; // "1m" | "1h" | "1d" | etc.
    scope: 'per_agent' | 'per_tool' | 'global';
  };
  // D-022: error handling fail mode
  failMode?: 'closed' | 'open'; // default 'closed': if evaluation throws, DENY
  // D-036: evaluation priority — lower number = evaluated first (default 50 for custom, 100 for packs)
  priority?: number;
  // Policy-driven loop detection — rule's action fires only when the loop condition is met
  loop?: LoopCondition;
}

export interface PolicyConfig {
  policies: PolicyRule[];
}

// ─── Policy packs (D-036) ─────────────────────────────────────────────────────

/** Tracks which authoring path created or last modified a rule. */
export type PolicyRuleSource = 'manual' | 'yaml' | `pack:${string}` | 'ai-assisted';

export interface PolicyRuleMeta {
  source: PolicyRuleSource;
  createdAt: string; // ISO 8601
  modifiedFromPack?: boolean; // true if user customized a rule that originated from a pack
}

/** A PolicyRule augmented with authoring metadata (used by the API layer, stripped before engine eval). */
export interface PolicyRuleWithMeta extends PolicyRule {
  _meta?: PolicyRuleMeta;
}

/** Describes a field in a pack that the user can customize without editing raw YAML. */
export interface PackCustomization {
  ruleIndex: number; // index into PolicyPack.rules
  field: string; // dot-path to the field, e.g. "rateLimit.limit"
  label: string; // human-readable: "Max calls per minute"
  type: 'number' | 'string' | 'enum' | 'boolean';
  options?: string[]; // for enum type
  default: unknown;
}

export type PackCategory = 'data-protection' | 'infrastructure' | 'compliance' | 'communication';
export type PackSeverity = 'strict' | 'moderate' | 'permissive';

export interface PolicyPack {
  id: string; // e.g. "sql-protection"
  version: string; // semver, e.g. "1.0.0"
  name: string; // "SQL Protection"
  description: string; // one-sentence summary
  category: PackCategory;
  tags: string[];
  severity: PackSeverity;
  rules: PolicyRule[];
  customizable: PackCustomization[];
  // Tool name prefixes that suggest this pack is relevant (for smart defaults)
  requiredTools?: string[];
}

/** Tracks which packs are enabled and their per-instance customizations. */
export interface PackState {
  packId: string;
  enabled: boolean;
  enabledAt?: string; // ISO 8601
  customizations?: Record<string, unknown>; // field path → value overrides
}

/** Extended PolicyConfig that tracks pack state alongside rules. */
export interface PolicyConfigV2 {
  policies: PolicyRuleWithMeta[];
  enabledPacks: PackState[];
}

// ─── Audit trail (D-020) ─────────────────────────────────────────────────────

/** Every policy decision produces an AuditEntry written to the JSONL audit log. */
export interface AuditEntry {
  timestamp: string; // ISO 8601
  eventType:
    | 'tool:call'
    | 'tool:blocked'
    | 'tool:response'
    | 'tool:threat'
    | 'tool:error'
    | 'scan:complete'
    | 'session:created'
    | 'session:killed'
    | 'policy:mutation';
  sessionId: string;
  agentId: string;
  serverId: string;
  action: string; // ALLOW, DENY, BLOCKED_*, etc.
  policyRule?: string; // name of matching rule, or undefined for default-allow
  toolName?: string;
  reason?: string;
  threats?: ResponseThreat[];
  input?: unknown; // always included (needed for security investigation)
  output?: unknown; // only included when auditIncludeOutput is true
}

// ─── Proxy config ─────────────────────────────────────────────────────────────

// Injectable forward function — used by the simulation to replace real network calls
// with cassette playback or an in-process mock MCP server.
// If omitted, the proxy falls back to fetch(upstreamMcpUrl + '/tool-call').
export type ForwardFn = (
  toolName: string,
  input: unknown,
) => Promise<{ output: unknown; durationMs: number }>;

export interface ProxyConfig {
  port: number;
  agentId: string;
  upstreamMcpUrl: string; // legacy single-server URL (Phase 1 passthrough)
  // D-040 Phase A3: multi-server MCP routing map.
  // Keys are logical server IDs; values are upstream connection configs.
  // When set, /mcp/:serverId routes are mounted and this takes precedence
  // over upstreamMcpUrl for MCP protocol traffic.
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
}
