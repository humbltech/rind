// Scenario runner — orchestrates a full scenario run against the Rind proxy.
//
// Two execution modes:
//   In-process: creates the proxy with no port binding, uses app.request() directly.
//               Fast, deterministic, no network — used for CI and cassette replay.
//   HTTP:       sends real fetch() requests to a running proxy instance.
//               Slower, requires the proxy to be running — used for live demos
//               where dashboard visibility matters.

import { createProxyServer, clearSchemaStore } from '@rind/proxy';
import type {
  Scenario,
  ScenarioResult,
  ScenarioStep,
  StepResult,
  SimMode,
  UnprotectedResult,
  UnprotectedStepResult,
} from './scenarios/types.js';
import { createForwardFn } from './cassette.js';
import { createFixtureMcpServer } from '../../apps/proxy/src/fixture/index.js';

// A transport abstracts in-process vs HTTP dispatch so runStep stays unchanged.
type Transport = (endpoint: string, init: RequestInit) => Promise<Response>;

async function runStep(
  transport: Transport,
  step: ScenarioStep,
  resolvedSessionId?: string,
  isInProcess = false,
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

  // In-process only: schedule a background approval decision so REQUIRE_APPROVAL
  // steps complete without human interaction. Ignored in HTTP/live-demo mode.
  if (isInProcess && step.autoDecision) {
    const decision = step.autoDecision;
    const toolNameHint = (body as Record<string, unknown> | undefined)?.['toolName'] as string | undefined;
    // Use setTimeout(0) so the polling task is deferred to the next event-loop tick,
    // after the main tool-call request has been submitted and is blocking on approval.
    setTimeout(async () => {
      for (let attempt = 0; attempt < 40; attempt++) {
        await new Promise<void>((r) => setTimeout(r, 50));
        try {
          const approvalsRes = await transport('/approvals', { method: 'GET', headers: {} });
          const approvals = await approvalsRes.json() as Array<{ id: string; toolName: string }>;
          const target = approvals.find((a) => !toolNameHint || a.toolName === toolNameHint);
          if (target) {
            await transport(`/approvals/${target.id}/${decision}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: '',
            });
            return;
          }
        } catch { /* ignore — main request times out naturally if polling fails */ }
      }
    }, 0);
  }

  const response = await transport(endpoint, {
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

export async function runScenario(
  scenario: Scenario,
  mode: SimMode,
  // When set, sends real HTTP requests to the running proxy instead of running in-process.
  // The proxy must be started separately with appropriate policies loaded.
  proxyUrl?: string,
  fixturePort = 3100,
): Promise<ScenarioResult> {
  // Create a fresh proxy server for in-process mode: each call gets a new sessionStore.
  // HTTP mode talks to an external process, so no reset needed.
  // clearSchemaStore() removes cached MCP schemas between runs.
  if (!proxyUrl) {
    clearSchemaStore();
  }

  const start = Date.now();

  let transport: Transport;

  if (proxyUrl) {
    // HTTP transport — forward requests to the running proxy over the network.
    const base = proxyUrl.replace(/\/$/, '');
    transport = (endpoint, init) => fetch(`${base}${endpoint}`, init);

    // Merge scenario rules into the live proxy without wiping existing rules
    // (pack rules, custom rules). PUT /policies would nuke them — use rule-level
    // POST instead, skipping any rule whose name already exists in the proxy.
    const existingRes = await fetch(`${base}/policies`);
    const existingData = existingRes.ok ? (await existingRes.json() as { policies?: { name: string }[] }) : { policies: [] };
    const existingNames = new Set((existingData.policies ?? []).map((r: { name: string }) => r.name));
    for (const rule of scenario.policy.policies) {
      if (!existingNames.has(rule.name)) {
        await fetch(`${base}/policies/rules`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(rule),
        });
      }
    }

    // Spawn the fixture MCP server so the proxy has a real upstream to forward to.
    // Cassette logic lives in createForwardFn — the fixture server is just an HTTP adapter.
    const cassetteForwardFn = createForwardFn(scenario.slug, mode, scenario.toolHandlers);
    // NOTE: In record mode, newly recorded cassette entries accumulated by cassetteForwardFn
    // are not persisted — cassette.ts exposes no flush API. This is a known gap.
    // To fix: expose a flush() method from createForwardFn and call it after the step loop.
    const fixtureHandlers = Object.fromEntries(
      Object.keys(scenario.toolHandlers).map((toolName) => [
        toolName,
        async (input: unknown) => {
          const { output } = await cassetteForwardFn(toolName, input);
          return output;
        },
      ]),
    );

    const fixture = createFixtureMcpServer({ port: fixturePort, handlers: fixtureHandlers });
    const { stop: stopFixture } = await fixture.start();

    try {
      const stepResults: StepResult[] = [];
      let resolvedSessionId: string | undefined;

      for (const step of scenario.steps) {
        const result = await runStep(transport, step, resolvedSessionId);
        stepResults.push(result);

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
    } finally {
      await stopFixture();
    }
  } else {
    // In-process transport — call the Hono app directly, no network round-trip.
    const forwardFn = createForwardFn(scenario.slug, mode, scenario.toolHandlers);
    const { app } = createProxyServer({
      port: 0, // unused — we call the app directly
      agentId: scenario.agentId,
      upstreamMcpUrl: 'http://mock-mcp-unused', // unused when forwardFn is injected
      policy: scenario.policy,
      forwardFn,
      logLevel: 'error', // suppress logs during scenario runs
    });
    transport = (endpoint, init) => app.request(endpoint, init);
  }

  const stepResults: StepResult[] = [];
  let resolvedSessionId: string | undefined;

  for (const step of scenario.steps) {
    const result = await runStep(transport, step, resolvedSessionId, /* isInProcess */ !proxyUrl);
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

// ─── Unprotected run (--no-proxy) ───────────��────────────────────────────────
// Runs tool-call steps directly through mock handlers, bypassing the proxy.
// Shows the raw damage that would occur without Rind protection.

export async function runScenarioWithoutProxy(
  scenario: Scenario,
): Promise<UnprotectedResult> {
  const start = Date.now();
  const stepResults: UnprotectedStepResult[] = [];

  for (const step of scenario.steps) {
    // Only run tool-call steps — skip scan, session, audit log endpoints
    if (step.endpoint !== '/proxy/tool-call' || step.method !== 'POST') continue;

    const body = step.body as Record<string, unknown> | undefined;
    if (!body) continue;

    const toolName = body['toolName'] as string;
    const input = body['input'] as unknown;
    const handler = scenario.toolHandlers[toolName];

    if (!handler) continue;

    const stepStart = Date.now();
    const result = await handler(input);

    stepResults.push({
      label: step.label,
      toolName,
      input,
      output: result.output,
      durationMs: Date.now() - stepStart,
    });
  }

  return {
    scenario: {
      name: scenario.name,
      slug: scenario.slug,
      company: scenario.company,
      feature: scenario.feature,
      withoutRind: scenario.withoutRind,
    },
    steps: stepResults,
    durationMs: Date.now() - start,
  };
}
