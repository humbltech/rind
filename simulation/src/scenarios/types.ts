// Simulation scenario types.
// A scenario is the unit of human-testable value — it tells a story and verifies it technically.

import type { PolicyConfig, ToolDefinition } from '@rind/proxy';

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
  status: 200 | 403 | 201 | 404; // HTTP status from proxy
  blocked?: boolean; // response.blocked === true
  action?: string; // response.action (DENY, BLOCKED_INJECTION, etc.)
  findingCategory?: string; // present in /scan response findings
  threatType?: string; // present in response events (PROMPT_INJECTION, etc.)
  passed?: boolean; // for /scan — result.passed
}

export interface ScenarioStep {
  label: string; // Human-readable: "Agent attempts DROP TABLE"
  endpoint: string; // "/proxy/tool-call" | "/scan" | "/sessions" | "/sessions/:id"
  method: 'POST' | 'GET' | 'DELETE';
  body?: unknown;
  pathParam?: string; // For DELETE /sessions/:id — the session ID placeholder
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
    agentBlockedResponse: string; // Agent reacts to Rind block: "I can't complete that action..."
    agentUnprotectedResponse: string; // Agent when no Rind (damage): "Done! Table dropped."
  };

  // Technical test definition
  tools: ToolDefinition[]; // MCP tool definitions for the mock server (and scan)
  toolHandlers: Record<string, MockToolHandler>; // tool name → response generator
  policy: PolicyConfig; // Rind policy to enforce during this scenario
  agentId: string; // The agent identity used in tool calls

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
