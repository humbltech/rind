// Demo renderer — presents a scenario as a realistic agent chat conversation.
//
// Single-scenario runs use this instead of the test reporter.
// The output looks like a user chatting with an AI agent:
//   1. Scenario title bar
//   2. User types a prompt (streamed, optional enter-to-send)
//   3. Agent thinks and announces tool call (streamed)
//   4. Tool call spinner → result (blocked or allowed)
//   5. Agent reacts to the result (streamed)
//
// Only tool-call steps are shown — scan, session, audit log steps run silently
// (those are Rind internals visible in the dashboard, not in the agent UX).

import type { Scenario, StepResult, ScenarioResult, AgentTurnDetail, UnprotectedStepResult, ScenarioStep } from './scenarios/types.js';
import { streamLine, showSpinner, pauseBetweenSteps, pauseBeforeResult } from './stream.js';
import * as readline from 'node:readline';

// ─── ANSI helpers ──────────────────────────────────────────���─────────────────
const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  italic: '\x1b[3m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
  bgCyan: '\x1b[46m',
};

function hr(width = 60): string {
  return '─'.repeat(width);
}

// ─── Interactive prompt ──────────────────────────────────────────────────────

function waitForEnter(prompt: string): Promise<void> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(prompt, () => {
      rl.close();
      resolve();
    });
  });
}

// ─── Demo header ───────────��─────────────────────────���───────────────────────

function printDemoHeader(scenario: Scenario, isProtected: boolean): void {
  const mode = isProtected ? `${c.green}Protected by Rind${c.reset}` : `${c.red}UNPROTECTED${c.reset}`;
  console.log('');
  console.log(`  ${c.dim}${hr()}${c.reset}`);
  console.log(`  ${c.bold}${scenario.name}${c.reset}`);
  console.log(`  ${c.dim}${scenario.company.toUpperCase()} | ${scenario.incidentRef ?? scenario.feature}${c.reset}`);
  console.log(`  ${mode}`);
  console.log(`  ${c.dim}${hr()}${c.reset}`);
  console.log('');
}

// ─── User prompt ─────────────────────────────────────────────────────────────

async function showUserPrompt(prompt: string, interactive: boolean): Promise<void> {
  process.stdout.write(`  ${c.bold}${c.blue}You:${c.reset} `);
  await streamLine(prompt, 10);
  // streamLine already wrote \n — cursor is now on the line below the message

  if (interactive) {
    // Message is visible. Show send cue, wait for Enter, then erase the cue line.
    await waitForEnter(`  ${c.dim}[press Enter to send ↵]${c.reset}`);
    // After Enter: readline wrote \n, cursor is one line below the cue.
    // Go up 1, clear the cue line so only the message remains.
    process.stdout.write('\x1b[1A\x1b[2K');
  }

  console.log('');
}

// ─── Agent text ─────────────���────────────────────────────��───────────────────

async function showAgentText(text: string): Promise<void> {
  process.stdout.write(`  ${c.bold}${c.cyan}Agent:${c.reset} `);
  await streamLine(text, 10);
  console.log('');
}

// ─── Tool call (protected — with Rind) ───────���───────────────────────────────

async function showToolCallProtected(step: StepResult, scenario: Scenario): Promise<void> {
  const body = step.actual.body as Record<string, unknown> | null;

  // Extract tool info from the step
  const isBlocked = body?.['blocked'] === true;
  const action = body?.['action'] as string | undefined;
  const reason = body?.['reason'] as string | undefined;
  const rule = body?.['rule'] as string | undefined;

  // Extract tool name and input from the scenario step body for a clean spinner label
  const matchedStep = scenario.steps.find((s) => s.label === step.label);
  const stepBody = (matchedStep && 'body' in matchedStep ? matchedStep.body : undefined) as Record<string, unknown> | undefined;
  const toolName = stepBody?.['toolName'] as string | undefined;
  const input = stepBody?.['input'];
  const inputStr = input ? JSON.stringify(input) : '';
  const truncatedInput = inputStr.length > 60 ? inputStr.slice(0, 57) + '...' : inputStr;
  const spinnerLabel = toolName
    ? `${toolName}(${truncatedInput})`
    : step.label;

  await showSpinner(spinnerLabel, 1800);

  if (isBlocked) {
    console.log(`  ${c.red}${c.bold}⛔ BLOCKED${c.reset}`);
    if (rule) {
      console.log(`  ${c.dim}Rule:${c.reset} ${c.yellow}${rule}${c.reset}`);
    }
    if (action) {
      console.log(`  ${c.dim}Action:${c.reset} ${action}`);
    }
    if (reason) {
      console.log(`  ${c.dim}Reason:${c.reset} ${reason}`);
    }
  } else {
    console.log(`  ${c.green}✓${c.reset} ${step.label}`);
    if (body?.['output'] !== undefined) {
      const output = JSON.stringify(body['output'], null, 2);
      const lines = output.split('\n');
      const preview = lines.length > 4 ? lines.slice(0, 4).join('\n') + '\n  ...' : output;
      for (const line of preview.split('\n')) {
        console.log(`  ${c.dim}${line}${c.reset}`);
      }
    }
  }
  console.log('');
}

// ─── Tool call (unprotected — no Rind) ───────────────────────────────────────

async function showToolCallUnprotected(step: UnprotectedStepResult): Promise<void> {
  await showSpinner(`Calling ${step.toolName}(${JSON.stringify(step.input)})`, 1800);

  console.log(`  ${c.yellow}⚡ ${step.toolName}${c.reset} — executed without checks`);
  const output = JSON.stringify(step.output, null, 2);
  const lines = output.split('\n');
  const preview = lines.length > 6 ? lines.slice(0, 6).join('\n') + '\n  ...' : output;
  for (const line of preview.split('\n')) {
    console.log(`  ${c.yellow}${line}${c.reset}`);
  }
  console.log('');
}

// ─── Agent-turn step rendering ───────────────────────────────────────────────

async function showAgentTurnStep(step: StepResult): Promise<void> {
  const detail = step.agentTurnDetail as AgentTurnDetail | undefined;
  if (!detail) return;

  // Show each tool call that happened during the agent turn
  for (const toolCall of detail.toolCalls) {
    const spinnerLabel = toolCall.toolName;
    await showSpinner(spinnerLabel, 1200);

    if (toolCall.blocked) {
      console.log(`  ${c.red}${c.bold}⛔ BLOCKED${c.reset}`);
      if (toolCall.action) {
        console.log(`  ${c.dim}Action:${c.reset} ${toolCall.action}`);
      }
    } else {
      console.log(`  ${c.green}✓${c.reset} ${toolCall.toolName} — allowed`);
    }
    console.log('');
  }

  // If no tool calls happened, note that the agent responded directly
  if (detail.toolCalls.length === 0) {
    console.log(`  ${c.dim}Agent responded without making tool calls.${c.reset}`);
    console.log('');
  }
}

// ─── LLM call step (protected — with Rind) ───────────────────────────────────

async function showLlmCallProtected(step: StepResult, scenarioStep: ScenarioStep): Promise<void> {
  const body = step.actual.body as Record<string, unknown> | null;
  const reqBody = scenarioStep.body as Record<string, unknown> | undefined;
  const model = reqBody?.['model'] as string | undefined ?? 'LLM';
  // Shorten model name for display: "claude-haiku-4-5-20251001" → "haiku-4-5"
  const shortModel = model.replace(/^claude-/, '').replace(/-\d{8}$/, '');

  await showSpinner(`POST /llm  ${shortModel}`, 1400);

  const isBlocked = step.actual.status >= 400;

  if (isBlocked) {
    const error = body?.['error'] as Record<string, unknown> | undefined;
    const errorType = error?.['type'] as string | undefined ?? 'blocked';
    const rule = error?.['rule'] as string | undefined;
    const message = error?.['message'] as string | undefined;
    console.log(`  ${c.red}${c.bold}⛔ BLOCKED${c.reset}`);
    console.log(`  ${c.dim}Type:${c.reset} ${c.yellow}${errorType}${c.reset}`);
    if (rule)    console.log(`  ${c.dim}Rule:${c.reset} ${c.yellow}${rule}${c.reset}`);
    if (message) console.log(`  ${c.dim}Reason:${c.reset} ${message.slice(0, 120)}`);
  } else {
    const content = body?.['content'] as Array<{ type: string; text?: string }> | undefined;
    const responseText = content?.find((b) => b.type === 'text')?.text ?? '';
    const usage = body?.['usage'] as Record<string, number> | undefined;
    const inTok  = usage?.['input_tokens']  ?? 0;
    const outTok = usage?.['output_tokens'] ?? 0;
    // Rough Haiku pricing for display; exact model not critical for the demo
    const cost = (inTok * 0.00000025 + outTok * 0.00000125).toFixed(5);
    console.log(`  ${c.green}✓${c.reset} LLM call forwarded — ${shortModel}`);
    if (inTok || outTok) {
      console.log(`  ${c.dim}Tokens: ${inTok}↑ ${outTok}↓ · ~$${cost}${c.reset}`);
    }
    if (responseText) {
      const preview = responseText.slice(0, 90) + (responseText.length > 90 ? '…' : '');
      console.log(`  ${c.dim}"${preview}"${c.reset}`);
    }
  }
  console.log('');
}

// ─── Runaway note ────────────────────────────────────────────────────────────

async function showRunawayNote(note: string): Promise<void> {
  console.log('');
  console.log(`  ${c.dim}${hr()}${c.reset}`);
  console.log(`  ${c.yellow}${c.bold}${note}${c.reset}`);
  console.log(`  ${c.dim}${hr()}${c.reset}`);
  console.log('');
}

// ─── Main demo runners ─────────────���────────────────────────────────────────

/** Run a scenario in demo mode (protected — with Rind). */
export async function runDemoProtected(
  scenario: Scenario,
  result: ScenarioResult,
  interactive: boolean,
): Promise<void> {
  printDemoHeader(scenario, true);
  await showUserPrompt(scenario.demo.userPrompt, interactive);
  await pauseBetweenSteps();
  await showAgentText(scenario.demo.agentPreamble);
  await pauseBetweenSteps();

  // Show tool-call, agent-turn, and LLM proxy steps — skip scan, session, audit (Rind internals)
  const visibleStepPairs = result.steps.map((stepResult, i) => ({
    stepResult,
    scenarioStep: scenario.steps[i],
  })).filter(({ scenarioStep }) => {
    if (!scenarioStep) return false;
    if (scenarioStep.type === 'agent-turn') return true;
    if (!('endpoint' in scenarioStep)) return false;
    return (
      scenarioStep.endpoint === '/proxy/tool-call' ||
      scenarioStep.endpoint.startsWith('/llm/')
    );
  });

  for (const { stepResult, scenarioStep } of visibleStepPairs) {
    if (scenarioStep?.type === 'agent-turn') {
      await showAgentTurnStep(stepResult);
    } else if (scenarioStep != null && 'endpoint' in scenarioStep && scenarioStep.endpoint.startsWith('/llm/')) {
      await showLlmCallProtected(stepResult, scenarioStep as ScenarioStep);
    } else {
      await showToolCallProtected(stepResult, scenario);
    }
    await pauseBetweenSteps();
  }

  // Agent reacts to the block/result
  const wasBlocked = visibleStepPairs.some(({ stepResult, scenarioStep }) => {
    if (scenarioStep?.type === 'agent-turn') {
      return stepResult.agentTurnDetail?.anyBlocked === true;
    }
    // LLM steps: blocked = HTTP 4xx
    if (scenarioStep != null && 'endpoint' in scenarioStep && scenarioStep.endpoint.startsWith('/llm/')) {
      return stepResult.actual.status >= 400;
    }
    const body = stepResult.actual.body as Record<string, unknown> | null;
    return body?.['blocked'] === true;
  });

  // For scanner-only scenarios (no tool-call or agent-turn steps), show scan findings
  if (visibleStepPairs.length === 0) {
    for (const step of result.steps) {
      const body = step.actual.body as Record<string, unknown> | null;
      const findings = body?.['findings'] as Array<{ category: string; severity: string; detail: string }> | undefined;
      const criticalFindings = findings?.filter((f) => f.severity === 'critical' || f.severity === 'high');
      if (criticalFindings && criticalFindings.length > 0) {
        await showSpinner('Scanning tool definitions', 1800);
        console.log(`  ${c.red}${c.bold}⛔ SCAN BLOCKED${c.reset}`);
        for (const f of criticalFindings) {
          console.log(`  ${c.dim}Finding:${c.reset} ${c.yellow}${f.category}${c.reset} (${f.severity})`);
          console.log(`  ${c.dim}Detail:${c.reset} ${f.detail}`);
        }
        console.log('');
        await pauseBetweenSteps();
      }
    }
  }

  const scanFoundIssues = visibleStepPairs.length === 0 && result.steps.some((s) => {
    const body = s.actual.body as Record<string, unknown> | null;
    const findings = body?.['findings'] as Array<{ severity: string }> | undefined;
    return findings?.some((f) => f.severity === 'critical' || f.severity === 'high');
  });

  if ((wasBlocked || scanFoundIssues) && scenario.demo.agentBlockedResponse) {
    await showAgentText(scenario.demo.agentBlockedResponse);
  }

  console.log(`  ${c.dim}${hr()}${c.reset}`);
  console.log('');
}

/** Run a scenario in demo mode (unprotected �� no Rind). */
export async function runDemoUnprotected(
  scenario: Scenario,
  unprotectedSteps: UnprotectedStepResult[],
  interactive: boolean,
): Promise<void> {
  printDemoHeader(scenario, false);
  await showUserPrompt(scenario.demo.userPrompt, interactive);
  await pauseBetweenSteps();
  await showAgentText(scenario.demo.agentPreamble);
  await pauseBetweenSteps();

  // For LLM-only or scan-only scenarios with no explicit unprotectedSteps:
  // show a narrative placeholder so the demo doesn't silently skip from preamble to response.
  if (unprotectedSteps.length === 0) {
    await showSpinner('Request forwarded — no interception', 1400);
    console.log(`  ${c.yellow}⚡ No proxy${c.reset} — request goes straight to provider`);
    const snippet = scenario.withoutRind.slice(0, 130);
    console.log(`  ${c.yellow}${snippet}${snippet.length < scenario.withoutRind.length ? '…' : ''}${c.reset}`);
    console.log('');
    await pauseBetweenSteps();
  }

  for (const step of unprotectedSteps) {
    await showToolCallUnprotected(step);
    await pauseBetweenSteps();
  }

  // Runaway note: dramatic separator showing elapsed time + cost for loop scenarios
  if (scenario.demo.runawayNote) {
    await showRunawayNote(scenario.demo.runawayNote);
    await pauseBetweenSteps();
  }

  // Agent blissfully unaware of the damage
  await showAgentText(scenario.demo.agentUnprotectedResponse);

  console.log(`  ${c.dim}${hr()}${c.reset}`);
  console.log('');
}
