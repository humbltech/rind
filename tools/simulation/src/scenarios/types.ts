// Simulation scenario types.
// A scenario is the unit of human-testable value — it tells a story and verifies it technically.

import type { PolicyConfig, ToolDefinition } from '@aegis/proxy';

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

  // Human-readable story — printed in terminal output
  situation: string; // What triggered this scenario
  withoutAegis: string; // What happens without protection (2-3 sentences)
  theMoment: string; // The insight — what Aegis caught or blocked

  // Technical test definition
  tools: ToolDefinition[]; // MCP tool definitions for the mock server (and scan)
  toolHandlers: Record<string, MockToolHandler>; // tool name → response generator
  policy: PolicyConfig; // Aegis policy to enforce during this scenario
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
