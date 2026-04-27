// LLM API proxy types
// Separate from ToolCallEvent — LLM calls have different semantics (model, tokens, cost)
// and go through a different pipeline (pre-forward policy + streaming passthrough + post-stream scan).

// ─── Log verbosity ───────────────────────────────────────────────────────────

/**
 * Controls how much of the prompt/response is persisted.
 *
 * - metadata: only model, tokens, cost, latency, threats (default in production)
 * - full:     complete prompts + responses (default in development)
 * - preview:  first 200 chars of system prompt + last user msg + first 200 chars of response
 */
export type LlmLogLevel = 'metadata' | 'full' | 'preview';

// ─── Threat detection ────────────────────────────────────────────────────────

export type LlmThreatType =
  | 'PII_LEAK'               // SSN, credit card, phone, email in outbound prompt
  | 'CREDENTIAL_IN_PROMPT'   // API key, private key, password in outbound prompt
  | 'INJECTION_IN_RESPONSE'  // prompt injection patterns in inbound response
  | 'CREDENTIAL_IN_RESPONSE' // credentials in inbound response
  | 'COST_ANOMALY';          // single call exceeds cost threshold

export interface LlmThreat {
  type: LlmThreatType;
  severity: 'critical' | 'high' | 'medium';
  detail: string;
}

// ─── LLM call event ──────────────────────────────────────────────────────────

/**
 * Emitted once per LLM API call. Initially emitted at request time with outcome
 * 'pending', then enriched and re-emitted as 'llm:response' after the response
 * (or stream) completes.
 *
 * Structurally compatible with OpenTelemetry spans for future export.
 */
export interface LlmCallEvent {
  /** Stable unique ID for this call (randomUUID) */
  id: string;
  /** Session this call belongs to — correlated via API key hash or x-rind-session header */
  sessionId: string;
  /** Agent identity */
  agentId: string;
  /** LLM provider */
  provider: 'anthropic' | 'openai' | 'google';
  /** Model name as sent by the client — e.g. "claude-sonnet-4-20250514" */
  model: string;
  /** Unix ms timestamp of request arrival */
  timestamp: number;

  // ── Request metadata ───────────────────────────────────────────────────────
  /** Number of messages in the conversation */
  messageCount: number;
  /** Character count of the system prompt */
  systemPromptLength: number;
  /** Whether the request uses streaming */
  streaming: boolean;

  // ── Content (conditional on logLevel) ─────────────────────────────────────
  // These fields are undefined when logLevel is 'metadata'.
  // When logLevel is 'preview', they contain truncated versions.
  // Never capture API keys — they are stripped before any content is stored.
  /** Full messages array (logLevel: full) or truncated (logLevel: preview) */
  messages?: unknown;
  /** Full response text (logLevel: full) or truncated (logLevel: preview) */
  responseText?: string;

  // ── Usage (backfilled from response) ──────────────────────────────────────
  inputTokens?: number;
  outputTokens?: number;
  estimatedCostUsd?: number;

  // ── Latency ───────────────────────────────────────────────────────────────
  /** Time from request send to first SSE chunk (streaming only) */
  ttfbMs?: number;
  /** Time from request send to stream end / response received */
  totalDurationMs?: number;

  // ── Scanning ──────────────────────────────────────────────────────────────
  requestThreats?: LlmThreat[];
  responseThreats?: LlmThreat[];

  // ── Outcome ───────────────────────────────────────────────────────────────
  outcome: 'forwarded' | 'blocked' | 'error';
  statusCode?: number;
  errorMessage?: string;

  // ── Policy ────────────────────────────────────────────────────────────────
  matchedRule?: string;
}

// ─── Proxy config ─────────────────────────────────────────────────────────────

/**
 * LLM proxy configuration — part of ProxyConfig.llmProxy.
 *
 * Defaults: enabled=false, logLevel derived from NODE_ENV,
 * upstream URLs are the real provider endpoints.
 */
export interface LlmProxyConfig {
  /** Feature flag — if false, /llm/* routes are never mounted */
  enabled: boolean;
  /** How much content to persist in logs */
  logLevel: LlmLogLevel;
  /** Upstream Anthropic API base URL (default: https://api.anthropic.com) */
  anthropicUpstream: string;
  /** Upstream OpenAI API base URL (default: https://api.openai.com) */
  openaiUpstream: string;
  /** Upstream Google AI base URL (default: https://generativelanguage.googleapis.com) */
  googleUpstream: string;
  /**
   * Emit 'llm:cost-anomaly' when a single call exceeds this USD threshold.
   * undefined = disabled (default).
   */
  costAnomalyThresholdUsd?: number;
  /**
   * Max LLM calls per agent per minute. undefined = no rate limiting (default).
   */
  rateLimitPerAgentPerMinute?: number;
}

/**
 * Returns the default LlmProxyConfig.
 * logLevel defaults to 'full' in development, 'metadata' in production.
 */
export function defaultLlmProxyConfig(env?: string): LlmProxyConfig {
  return {
    enabled: false,
    logLevel: (env ?? process.env.NODE_ENV) !== 'production' ? 'full' : 'metadata',
    anthropicUpstream: 'https://api.anthropic.com',
    openaiUpstream: 'https://api.openai.com',
    googleUpstream: 'https://generativelanguage.googleapis.com',
  };
}
