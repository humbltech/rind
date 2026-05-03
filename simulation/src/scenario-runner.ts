// Scenario runner — orchestrates a full scenario run against the Rind proxy.
//
// Two execution modes:
//   In-process: creates the proxy with no port binding, uses app.request() directly.
//               Fast, deterministic, no network — used for CI and cassette replay.
//   HTTP:       sends real fetch() requests to a running proxy instance.
//               Slower, requires the proxy to be running — used for live demos
//               where dashboard visibility matters.

import { createProxyServer, clearSchemaStore } from '@rind/proxy';
import type { LlmForwardFn } from '@rind/proxy';
import type { ForwardLlmResult } from '@rind/proxy';
import type {
  Scenario,
  ScenarioResult,
  ScenarioStep,
  AgentTurnStep,
  AgentTurnDetail,
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

  if (exp.errorType !== undefined) {
    const actual = (responseBody as Record<string, unknown>)?.['error'];
    const actualType = (actual as Record<string, unknown> | undefined)?.['type'];
    if (actualType !== exp.errorType) {
      errors.push(`Expected error.type="${exp.errorType}", got error.type="${String(actualType)}"`);
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

// ─── LLM turn helpers ─────────────────────────────────────────────────────────

/**
 * Builds an indexed LlmForwardFn from a fixed array of mock turn responses.
 * First LLM call → turns[0], second → turns[1], etc.
 * If the index exceeds the array, the last turn is repeated (graceful end_turn handling).
 */
function buildLlmForwardFnFromTurns(turns: ForwardLlmResult[]): LlmForwardFn {
  let index = 0;
  return async (_path, _headers, _body, _opts) => {
    const turn = turns[Math.min(index, turns.length - 1)]!;
    index++;
    return turn;
  };
}

// ─── Agent-turn step runner ───────────────────────────────────────────────────

type AnthropicContentBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: unknown }
  | { type: 'tool_result'; tool_use_id: string; content: string };

type AnthropicMessage =
  | { role: 'user'; content: string | AnthropicContentBlock[] }
  | { role: 'assistant'; content: AnthropicContentBlock[] };

/**
 * Runs the full LLM → tool_use → proxy intercept → tool_result → LLM loop.
 *
 * Each round:
 *   1. POST /llm/anthropic/v1/messages through the real proxy (full dashboard visibility)
 *   2. Parse tool_use blocks from the response
 *   3. POST /proxy/tool-call for each tool_use
 *   4. Build tool_result messages (blocked → error string, allowed → output JSON)
 *   5. Repeat until stop_reason = end_turn or maxRounds reached
 *
 * In HTTP demo mode, the proxy should be started with RIND_ANTHROPIC_UPSTREAM pointing
 * to the sim LLM server (e.g. http://localhost:4099). The scenario runner loads the
 * scenario's llmTurns into the sim server before running the step, so all LLM calls
 * route through the real proxy and appear in the dashboard.
 */
async function runAgentTurnStep(
  transport: Transport,
  step: AgentTurnStep,
  scenario: Scenario,
  resolvedSessionId?: string,
  simLlmUrl?: string,
): Promise<StepResult> {
  const maxRounds = step.maxRounds ?? 5;
  const messages: AnthropicMessage[] = [
    { role: 'user', content: step.userMessage },
  ];

  const toolCalls: AgentTurnDetail['toolCalls'] = [];
  let anyBlocked = false;
  let lastToolStatus = 200;
  let finalStopReason = 'end_turn';
  let rounds = 0;

  // When a sim LLM server is running, load this scenario's turns into it so the
  // real proxy forwards LLM calls to the mock server instead of real Anthropic.
  if (simLlmUrl && scenario.llmTurns && scenario.llmTurns.length > 0) {
    await fetch(`${simLlmUrl}/admin/scenario`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ turns: scenario.llmTurns }),
    }).catch(() => { /* non-fatal — proxy will fall through to real Anthropic if server is down */ });
  }

  // Convert ToolDefinition[] to Anthropic tool format for the LLM request
  const anthropicTools = scenario.tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.inputSchema,
  }));

  for (let round = 0; round < maxRounds; round++) {
    rounds = round + 1;

    // ── Call the LLM via the real Rind proxy ──────────────────────────────
    // In HTTP mode: proxy forwards to RIND_ANTHROPIC_UPSTREAM (mock server or real API).
    // In in-process mode: llmForwardFn injected at proxy creation handles the call.
    const llmRes = await transport('/llm/anthropic/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Propagate the session ID so LLM calls appear under the same session in the dashboard
        ...(resolvedSessionId ? { 'x-rind-session-id': resolvedSessionId } : {}),
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        tools: anthropicTools.length > 0 ? anthropicTools : undefined,
        messages,
      }),
    });

    let llmBody: Record<string, unknown>;
    try {
      llmBody = await llmRes.json() as Record<string, unknown>;
    } catch {
      llmBody = {};
    }

    // Detect upstream LLM errors early so demo failures are visible rather than
    // silently producing "Agent responded without making tool calls."
    if (llmRes.status >= 400 || llmBody['error'] != null) {
      const errMsg = llmBody['error']
        ? JSON.stringify(llmBody['error'])
        : `HTTP ${llmRes.status}`;
      process.stderr.write(`  [agent-turn] LLM call failed: ${errMsg}\n`);
      process.stderr.write(`  → Is the proxy running with RIND_ANTHROPIC_UPSTREAM pointing to the sim server?\n`);
      break;
    }

    const stopReason = (llmBody['stop_reason'] as string | undefined) ?? 'end_turn';
    finalStopReason = stopReason;
    const contentBlocks = (llmBody['content'] as AnthropicContentBlock[] | undefined) ?? [];
    const toolUseBlocks = contentBlocks.filter((b): b is Extract<AnthropicContentBlock, { type: 'tool_use' }> => b.type === 'tool_use');

    // ── No tool calls — conversation is done ──────────────────────────────
    if (stopReason !== 'tool_use' || toolUseBlocks.length === 0) break;

    // ── Extract assistant reasoning text from this round ──────────────────
    // Text blocks appear before tool_use blocks in the same response.
    // Attach to the first tool call of the round so the demo can show the
    // agent's thinking before revealing which tool it called.
    const roundThinkingText = contentBlocks
      .filter((b): b is Extract<AnthropicContentBlock, { type: 'text' }> => b.type === 'text')
      .map((b) => b.text)
      .join(' ')
      .trim();

    // ── Add assistant message with tool_use blocks ─────────────────────────
    messages.push({ role: 'assistant', content: contentBlocks });

    // ── Execute each tool call through Rind proxy ──────────────────────────
    const toolResultBlocks: AnthropicContentBlock[] = [];
    let firstToolInRound = true;

    for (const block of toolUseBlocks) {
      // Inject session ID into the tool call body so kill-switch tracking works
      const toolCallBody: Record<string, unknown> = {
        agentId: scenario.agentId,
        serverId: step.serverId,
        toolName: block.name,
        input: block.input,
      };
      if (resolvedSessionId) {
        toolCallBody['sessionId'] = resolvedSessionId;
      }

      const toolRes = await transport('/proxy/tool-call', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(toolCallBody),
      });

      const toolBody = await toolRes.json() as Record<string, unknown>;
      lastToolStatus = toolRes.status;
      const blocked = toolBody['blocked'] === true;
      const action = toolBody['action'] as string | undefined;
      const rule = toolBody['rule'] as string | undefined;
      const reason = toolBody['reason'] as string | undefined;

      toolCalls.push({
        toolName: block.name,
        blocked,
        action,
        rule,
        reason,
        thinkingText: firstToolInRound && roundThinkingText ? roundThinkingText : undefined,
      });
      firstToolInRound = false;
      if (blocked) anyBlocked = true;

      // Feed the result (or error) back to the LLM as a tool_result message
      const resultContent = blocked
        ? `Error: ${toolBody['reason'] as string | undefined ?? action ?? 'blocked by policy'}`
        : JSON.stringify(toolBody['output'] ?? '');

      toolResultBlocks.push({
        type: 'tool_result',
        tool_use_id: block.id,
        content: resultContent,
      });
    }

    // ── Feed tool results back into message history ────────────────────────
    messages.push({ role: 'user', content: toolResultBlocks });
  }

  // ── Evaluate expectations ──────────────────────────────────────────────────
  const { expect: exp } = step;
  const errors: string[] = [];

  if (exp.anyBlocked !== undefined && anyBlocked !== exp.anyBlocked) {
    errors.push(`Expected anyBlocked=${String(exp.anyBlocked)}, got ${String(anyBlocked)}`);
  }
  if (exp.allAllowed !== undefined && (!anyBlocked) !== exp.allAllowed) {
    errors.push(`Expected allAllowed=${String(exp.allAllowed)}, got ${String(!anyBlocked)}`);
  }
  if (exp.calledTool !== undefined && !toolCalls.some((t) => t.toolName === exp.calledTool)) {
    errors.push(
      `Expected tool "${exp.calledTool}" to be called; called: ${toolCalls.map((t) => t.toolName).join(', ') || 'none'}`,
    );
  }
  if (exp.blockedTool !== undefined && !toolCalls.some((t) => t.toolName === exp.blockedTool && t.blocked)) {
    errors.push(
      `Expected tool "${exp.blockedTool}" to be blocked; blocked: ${toolCalls.filter((t) => t.blocked).map((t) => t.toolName).join(', ') || 'none'}`,
    );
  }

  const detail: AgentTurnDetail = { rounds, toolCalls, anyBlocked, finalStopReason };

  return {
    label: step.label,
    status: errors.length === 0 ? 'PASS' : 'FAIL',
    expected: exp,
    actual: { status: lastToolStatus, body: detail },
    agentTurnDetail: detail,
    error: errors.length > 0 ? errors.join('; ') : undefined,
  };
}

// ─── Scenario runner ──────────────────────────────────────────────────────────

export async function runScenario(
  scenario: Scenario,
  mode: SimMode,
  // When set, sends real HTTP requests to the running proxy instead of running in-process.
  // The proxy must be started separately with appropriate policies loaded.
  proxyUrl?: string,
  fixturePort = 3100,
  // When set, agent-turn steps register scenario.llmTurns with the sim LLM server before
  // executing. The proxy must be started with RIND_ANTHROPIC_UPSTREAM pointing here so
  // LLM calls route through the proxy → mock server (full dashboard visibility, no API key).
  simLlmUrl?: string,
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
        let result: StepResult;

        if (step.type === 'agent-turn') {
          result = await runAgentTurnStep(transport, step, scenario, resolvedSessionId, simLlmUrl);
        } else {
          result = await runStep(transport, step as ScenarioStep, resolvedSessionId);
        }
        stepResults.push(result);

        if ('endpoint' in step && step.endpoint === '/sessions' && step.method === 'POST' && result.status === 'PASS') {
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
    // llmTurns (indexed mock LLM sequence) takes precedence over llmForwardFn (single function).
    const resolvedLlmForwardFn: LlmForwardFn | undefined = scenario.llmTurns
      ? buildLlmForwardFnFromTurns(scenario.llmTurns)
      : scenario.llmForwardFn;
    const { app } = createProxyServer({
      port: 0, // unused — we call the app directly
      agentId: scenario.agentId,
      upstreamMcpUrl: 'http://mock-mcp-unused', // unused when forwardFn is injected
      policy: scenario.policy,
      forwardFn,
      ...(resolvedLlmForwardFn
        ? {
            llmProxy: {
              enabled: true,
              anthropicUpstream: 'http://mock-llm-unused',
              openaiUpstream: 'http://mock-llm-unused',
              ...scenario.llmProxyConfig,
            },
            llmForwardFn: resolvedLlmForwardFn,
          }
        : {}),
      logLevel: 'error', // suppress logs during scenario runs
    });
    transport = (endpoint, init) => Promise.resolve(app.request(endpoint, init));
  }

  const stepResults: StepResult[] = [];
  let resolvedSessionId: string | undefined;

  for (const step of scenario.steps) {
    let result: StepResult;

    if (step.type === 'agent-turn') {
      // simLlmUrl is only relevant in HTTP mode (in-process mode uses injected llmForwardFn)
      result = await runAgentTurnStep(transport, step, scenario, resolvedSessionId, proxyUrl ? simLlmUrl : undefined);
    } else {
      result = await runStep(transport, step as ScenarioStep, resolvedSessionId, /* isInProcess */ !proxyUrl);
    }
    stepResults.push(result);

    // If this step created a session, capture the session ID for subsequent steps
    if ('endpoint' in step && step.endpoint === '/sessions' && step.method === 'POST' && result.status === 'PASS') {
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

  // Prefer explicit unprotectedSteps (required for agent-turn and scan-only scenarios).
  // Fall back to extracting /proxy/tool-call steps for legacy scenarios.
  const callsToRun: Array<{ label: string; toolName: string; input: unknown }> =
    scenario.unprotectedSteps ??
    scenario.steps
      .filter((s): s is ScenarioStep => s.type !== 'agent-turn' && 'endpoint' in s && s.endpoint === '/proxy/tool-call' && s.method === 'POST' && s.body != null)
      .map((s) => {
        const body = s.body as Record<string, unknown>;
        return { label: s.label, toolName: body['toolName'] as string, input: body['input'] as unknown };
      });

  for (const call of callsToRun) {
    const { label, toolName, input } = call;
    const handler = scenario.toolHandlers[toolName];

    if (!handler) continue;

    const stepStart = Date.now();
    const result = await handler(input);

    stepResults.push({
      label,
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
