// Simulation scenario types.
// A scenario is the unit of human-testable value — it tells a story and verifies it technically.

import type { PolicyConfig, ToolDefinition, LlmForwardFn, LlmProxyConfig } from '@rind/proxy';
import type { ForwardLlmResult } from '@rind/proxy';

export type CompanyId = 'meridian' | 'stackline' | 'fortress' | 'pocketos' | 'arimlabs';
export type DeploymentId = 'direct-mcp' | 'llm-gateway' | 'framework-sdk' | 'enterprise';
export type SimMode = 'replay' | 'record' | 'live';

// ─── Mock tool handler ────────────────────────────────────────────────────────

// A mock tool handler receives a tool call and returns the response.
// In REPLAY mode: the cassette intercepts this before it runs.
// In RECORD/LIVE mode: this is called and the output is used (and in RECORD, saved).
export type MockToolHandler = (input: unknown) => Promise<{ output: unknown }> | { output: unknown };

// ─── Scenario step ────────────────────────────────────────────────────────────

export interface StepExpectation {
  /** HTTP status from proxy — 429 for rate-limit. Optional for agent-turn steps (no single status). */
  status?: 200 | 403 | 201 | 404 | 429;
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
  // ── Agent-turn step expectations ─────────────────────────────────────────
  /** True if at least one tool call was blocked during the agent turn. */
  anyBlocked?: boolean;
  /** True if all tool calls were allowed (none blocked). */
  allAllowed?: boolean;
  /** A specific tool that must have been called at some point. */
  calledTool?: string;
  /** A specific tool that must have been blocked by the proxy. */
  blockedTool?: string;
}

export interface ScenarioStep {
  type?: 'step'; // Optional discriminator — defaults to regular step if absent
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

// ─── Agent-turn step ──────────────────────────────────────────────────────────
// Drives a full LLM → tool_use → proxy intercept → tool_result → LLM loop.
// The runner calls the proxy's /llm/anthropic/v1/messages endpoint, parses tool_use
// blocks, forwards each tool call to /proxy/tool-call, feeds results back to the LLM,
// and repeats until stop_reason=end_turn or maxRounds is reached.
// Requires: scenario.llmTurns to be populated (mock LLM responses, one per round).

export interface AgentTurnStep {
  type: 'agent-turn';
  label: string;
  /** The initial user message that drives the agent conversation. */
  userMessage: string;
  /** MCP server ID used for all tool calls in this turn. */
  serverId: string;
  /** Max LLM→tool rounds before aborting (default: 5). */
  maxRounds?: number;
  /**
   * In-process CI mode only: auto-resolves any REQUIRE_APPROVAL tool calls
   * so the step completes without human interaction.
   * Ignored in HTTP/live-demo mode — human approves via the dashboard.
   */
  autoDecision?: 'approve' | 'deny';
  expect: StepExpectation;
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
    agentBlockedResponse?: string; // Agent reacts to Rind block: "I can't complete that action..." (omit for non-blocking scenarios)
    agentUnprotectedResponse: string; // Agent when no Rind (damage): "Done! Table dropped."
    /**
     * Shown as a dramatic separator after all unprotected tool calls, before the agent's
     * final response. Use for runaway cost/time scenarios to show elapsed time and damage.
     * Example: "11 days later  ·  $47,000 in charges  ·  28,400 calls  ·  GitHub API banned"
     */
    runawayNote?: string;
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
  /**
   * Mock LLM turn sequence for agent-turn steps.
   * The runner builds an indexed llmForwardFn from these responses — one per LLM call.
   * Index advances automatically on each call (first call → turns[0], second → turns[1], ...).
   * If the index exceeds the array length, the last turn is repeated (handles extra end_turn calls).
   * When present: takes precedence over llmForwardFn for proxy setup.
   */
  llmTurns?: ForwardLlmResult[];

  /**
   * Explicit tool call steps for the --no-proxy demo (runScenarioWithoutProxy).
   * Required for scenarios where `steps` contains only agent-turn or scan steps
   * (since runScenarioWithoutProxy can only extract from /proxy/tool-call steps).
   * Each entry runs directly through toolHandlers, bypassing the proxy entirely.
   */
  unprotectedSteps?: Array<{
    label: string;
    toolName: string;
    input: unknown;
    /** First-person agent reasoning shown before the tool call spinner in the unprotected demo. */
    thinkingText?: string;
  }>;

  // Ordered steps — run in sequence against the proxy
  steps: (ScenarioStep | AgentTurnStep)[];
}

// ─── Scenario result ─────────────────────────────────────────────────────────

export type StepStatus = 'PASS' | 'FAIL' | 'SKIP';

export interface AgentTurnDetail {
  rounds: number;
  toolCalls: Array<{
    toolName: string;
    blocked: boolean;
    action?: string;
    rule?: string;
    reason?: string;
    /** Assistant text from the same LLM response that triggered this tool call (first tool in a round only). */
    thinkingText?: string;
  }>;
  anyBlocked: boolean;
  finalStopReason: string;
}

export interface StepResult {
  label: string;
  status: StepStatus;
  expected: StepExpectation;
  actual: {
    status: number;
    body: unknown;
  };
  /** Populated for agent-turn steps — describes what happened across all rounds. */
  agentTurnDetail?: AgentTurnDetail;
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
  thinkingText?: string;
}

export interface UnprotectedResult {
  scenario: Pick<Scenario, 'name' | 'slug' | 'company' | 'feature' | 'withoutRind'>;
  steps: UnprotectedStepResult[];
  durationMs: number;
}
