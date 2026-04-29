// Simulation scenario types.
// A scenario is the unit of human-testable value — it tells a story and verifies it technically.

import type { PolicyConfig, ToolDefinition, LlmForwardFn } from '@rind/proxy';
import type { LlmProxyConfig } from '@rind/core';

export type CompanyId = 'meridian' | 'stackline' | 'fortress';
export type DeploymentId = 'direct-mcp' | 'llm-gateway' | 'framework-sdk' | 'enterprise';
export type SimMode = 'replay' | 'record' | 'live';

// ─── Mock tool handler ────────────────────────────────────────────────────────

// A mock tool handler receives a tool call and returns the response.
// In REPLAY mode: the cassette intercepts this before it runs.
// In RECORD/LIVE mode: this is called and the output is used (and in RECORD, saved).
export type MockToolHandler = (input: unknown) => Promise<{ output: unknown }> | { output: unknown };

// ─── Scenario step ────────────────────────────────────────────────────────────

export interface StepExpectation {
  status: 200 | 403 | 201 | 404 | 429; // HTTP status from proxy — 429 for rate-limit
  blocked?: boolean; // response.blocked === true (MCP tool-call path)
  action?: string; // response.action (DENY, BLOCKED_INJECTION, etc.)
  findingCategory?: string; // present in /scan response findings
  threatType?: string; // present in response events (PROMPT_INJECTION, etc.)
  passed?: boolean; // for /scan — result.passed
  /**
   * LLM gateway path: checks response.error?.type matches this string.
   * Examples: 'policy_denied', 'rate_limit_exceeded', 'upstream_timeout'
   */
  errorType?: string;
}

export interface ScenarioStep {
  label: string; // Human-readable: "Agent attempts DROP TABLE"
  endpoint: string; // "/proxy/tool-call" | "/scan" | "/sessions" | "/sessions/:id"
  method: 'POST' | 'GET' | 'DELETE';
  body?: unknown;
  pathParam?: string; // For DELETE /sessions/:id — the session ID placeholder
  expect: StepExpectation;
  // For REQUIRE_APPROVAL steps: in-process CI mode only.
  // Auto-resolves the pending approval so the step can complete without human interaction.
  // In HTTP/live-demo mode this is ignored — the human approves via the dashboard.
  autoDecision?: 'approve' | 'deny';
}

// ─── Scenario definition ──────────────────────────────────────────────────────

export interface Scenario {
  name: string; // "The Replit Database Deletion"
  slug: string; // "replit-db-deletion" — used as cassette directory name
  company: CompanyId;
  deployment: DeploymentId;
  feature: string; // "Policy-Based Blocking"
  incidentRef?: string; // "AI Incident Database #1152"

  // Policy packs that protect against this scenario.
  // Maps to pack IDs in apps/proxy/src/policy/packs.ts.
  // Empty = scenario uses scanner/inspector features, not policy packs.
  packIds: string[];

  // Human-readable story — used in batch test output
  situation: string; // What triggered this scenario
  withoutRind: string; // What happens without protection (2-3 sentences)
  theMoment: string; // The insight — what Rind caught or blocked

  // Demo chat fields — used in single-scenario demo mode
  // These drive the chat-like presentation where the sim looks like a real agent conversation.
  demo: {
    userPrompt: string; // What the "user" types: "Clean up the test data"
    agentPreamble: string; // Agent's thinking before tool call: "I'll help you clean up..."
    agentBlockedResponse: string; // Agent reacts to Rind block: "I can't complete that action..."
    agentUnprotectedResponse: string; // Agent when no Rind (damage): "Done! Table dropped."
  };

  // Technical test definition
  tools: ToolDefinition[]; // MCP tool definitions for the mock server (and scan)
  toolHandlers: Record<string, MockToolHandler>; // tool name → response generator
  policy: PolicyConfig; // Rind policy to enforce during this scenario
  agentId: string; // The agent identity used in tool calls

  /**
   * Injectable LLM forward function for LLM proxy scenarios.
   * When present: the scenario runner enables llmProxy in the server config
   * and passes this fn as llmForwardFn. Each scenario controls exactly what
   * canned response its LLM steps receive.
   * Absent for all 11 existing MCP scenarios — zero breakage.
   */
  llmForwardFn?: LlmForwardFn;
  /** Additional LLM proxy configuration for this scenario (merged with defaults). */
  llmProxyConfig?: Partial<LlmProxyConfig>;

  // Ordered steps — run in sequence against the proxy
  steps: ScenarioStep[];
}

// ─── Scenario result ─────────────────────────────────────────────────────────

export type StepStatus = 'PASS' | 'FAIL' | 'SKIP';

export interface StepResult {
  label: string;
  status: StepStatus;
  expected: StepExpectation;
  actual: {
    status: number;
    body: unknown;
  };
  error?: string;
}

export interface ScenarioResult {
  scenario: Pick<Scenario, 'name' | 'slug' | 'company' | 'feature'>;
  mode: SimMode;
  passed: boolean;
  steps: StepResult[];
  durationMs: number;
}

// ─── Unprotected run (--no-proxy) ────────────────────────────────────────────

export interface UnprotectedStepResult {
  label: string;
  toolName: string;
  input: unknown;
  output: unknown; // The raw handler response — shows the damage
  durationMs: number;
}

export interface UnprotectedResult {
  scenario: Pick<Scenario, 'name' | 'slug' | 'company' | 'feature' | 'withoutRind'>;
  steps: UnprotectedStepResult[];
  durationMs: number;
}
