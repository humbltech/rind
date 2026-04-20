// Scenario runner — orchestrates a full scenario run against the Aegis proxy.
//
// Creates the proxy in-process (no port binding), injects a cassette-backed
// ForwardFn, runs each step as an HTTP call to the proxy, and asserts
// expected outcomes.

import { createProxyServer, resetSessions, clearSchemaStore } from '@aegis/proxy';
import type { Scenario, ScenarioResult, ScenarioStep, StepResult, SimMode } from './scenarios/types.js';
import { createForwardFn } from './cassette.js';

async function runStep(
  app: ReturnType<typeof createProxyServer>['app'],
  step: ScenarioStep,
  resolvedSessionId?: string,
): Promise<StepResult> {
  // Resolve dynamic path params (e.g., session ID placeholder → real session ID)
  let endpoint = step.endpoint;
  if (step.pathParam && resolvedSessionId) {
    endpoint = endpoint.replace(':sessionId', resolvedSessionId);
  }

  // Inject session ID into tool call bodies so the kill-switch can track them
  let body = step.body;
  if (
    step.endpoint === '/proxy/tool-call' &&
    step.method === 'POST' &&
    body != null &&
    resolvedSessionId
  ) {
    body = { sessionId: resolvedSessionId, ...(body as Record<string, unknown>) };
  }

  const response = await app.request(endpoint, {
    method: step.method,
    headers: { 'Content-Type': 'application/json' },
    body: body != null ? JSON.stringify(body) : undefined,
  });

  const status = response.status;
  let responseBody: unknown;
  try {
    responseBody = await response.json();
  } catch {
    responseBody = null;
  }

  // Evaluate expectations
  const { expect: exp } = step;
  const errors: string[] = [];

  if (status !== exp.status) {
    errors.push(`Expected status ${exp.status}, got ${status}`);
  }

  if (exp.blocked !== undefined) {
    const actual = (responseBody as Record<string, unknown>)?.['blocked'];
    if (actual !== exp.blocked) {
      errors.push(`Expected blocked=${String(exp.blocked)}, got blocked=${String(actual)}`);
    }
  }

  if (exp.action !== undefined) {
    const actual = (responseBody as Record<string, unknown>)?.['action'];
    if (actual !== exp.action) {
      errors.push(`Expected action="${exp.action}", got action="${String(actual)}"`);
    }
  }

  if (exp.passed !== undefined) {
    const actual = (responseBody as Record<string, unknown>)?.['passed'];
    if (actual !== exp.passed) {
      errors.push(`Expected passed=${String(exp.passed)}, got passed=${String(actual)}`);
    }
  }

  if (exp.findingCategory !== undefined) {
    const findings = (responseBody as Record<string, unknown>)?.['findings'] as
      | Array<{ category: string }>
      | undefined;
    const found = findings?.some((f) => f.category === exp.findingCategory);
    if (!found) {
      errors.push(
        `Expected finding category "${exp.findingCategory}" not found in: ` +
          JSON.stringify(findings ?? []),
      );
    }
  }

  if (exp.threatType !== undefined) {
    const threats = (responseBody as Record<string, unknown>)?.['threats'] as
      | Array<{ type: string }>
      | undefined;
    const found = threats?.some((t) => t.type === exp.threatType);
    if (!found) {
      errors.push(
        `Expected threat type "${exp.threatType}" not found in: ` +
          JSON.stringify(threats ?? []),
      );
    }
  }

  return {
    label: step.label,
    status: errors.length === 0 ? 'PASS' : 'FAIL',
    expected: exp,
    actual: { status, body: responseBody },
    error: errors.length > 0 ? errors.join('; ') : undefined,
  };
}

export async function runScenario(scenario: Scenario, mode: SimMode): Promise<ScenarioResult> {
  // Reset shared singleton state to prevent bleed between scenarios in the same process
  resetSessions();
  clearSchemaStore();

  const start = Date.now();

  // Create cassette-backed forward function
  const forwardFn = createForwardFn(scenario.slug, mode, scenario.toolHandlers);

  // Create proxy in-process — no port binding, no network
  const { app } = createProxyServer({
    port: 0, // unused — we call app.request() directly
    agentId: scenario.agentId,
    upstreamMcpUrl: 'http://mock-mcp-unused', // unused when forwardFn is set
    policy: scenario.policy,
    forwardFn,
    logLevel: 'error', // suppress logs during scenario runs
  });

  const stepResults: StepResult[] = [];
  let resolvedSessionId: string | undefined;

  for (const step of scenario.steps) {
    const result = await runStep(app, step, resolvedSessionId);
    stepResults.push(result);

    // If this step created a session, capture the session ID for subsequent steps
    if (step.endpoint === '/sessions' && step.method === 'POST' && result.status === 'PASS') {
      const body = result.actual.body as Record<string, unknown>;
      if (typeof body?.['sessionId'] === 'string') {
        resolvedSessionId = body['sessionId'];
      }
    }
  }

  const passed = stepResults.every((s) => s.status === 'PASS');

  return {
    scenario: {
      name: scenario.name,
      slug: scenario.slug,
      company: scenario.company,
      feature: scenario.feature,
    },
    mode,
    passed,
    steps: stepResults,
    durationMs: Date.now() - start,
  };
}
