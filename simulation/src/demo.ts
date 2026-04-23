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

import type { Scenario, StepResult, ScenarioResult, UnprotectedStepResult } from './scenarios/types.js';
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
  if (interactive) {
    process.stdout.write(`  ${c.bold}${c.blue}You:${c.reset} ${c.dim}${prompt}${c.reset}`);
    await waitForEnter(`\n  ${c.dim}[press Enter to send]${c.reset} `);
    // Rewrite with the actual prompt (non-dim)
    process.stdout.write(`\x1b[2A\x1b[2K`); // move up 2, clear line
    process.stdout.write(`\x1b[2K`); // clear the [press Enter] line
    process.stdout.write(`\r  ${c.bold}${c.blue}You:${c.reset} `);
    await streamLine(prompt, 10);
  } else {
    process.stdout.write(`  ${c.bold}${c.blue}You:${c.reset} `);
    await streamLine(prompt, 10);
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
  const stepBody = scenario.steps.find((s) => s.label === step.label)?.body as Record<string, unknown> | undefined;
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

  // Only show tool-call steps — scan, session, audit are Rind internals
  const toolCallSteps = result.steps.filter((_step, i) =>
    scenario.steps[i]?.endpoint === '/proxy/tool-call',
  );

  for (const step of toolCallSteps) {
    await showToolCallProtected(step, scenario);
    await pauseBetweenSteps();
  }

  // Agent reacts to the block/result
  const wasBlocked = toolCallSteps.some((s) => {
    const body = s.actual.body as Record<string, unknown> | null;
    return body?.['blocked'] === true;
  });

  // For scanner-only scenarios (no tool-call steps), show scan findings
  if (toolCallSteps.length === 0) {
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

  const scanFoundIssues = toolCallSteps.length === 0 && result.steps.some((s) => {
    const body = s.actual.body as Record<string, unknown> | null;
    const findings = body?.['findings'] as Array<{ severity: string }> | undefined;
    return findings?.some((f) => f.severity === 'critical' || f.severity === 'high');
  });

  if (wasBlocked || scanFoundIssues) {
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

  for (const step of unprotectedSteps) {
    await showToolCallUnprotected(step);
    await pauseBetweenSteps();
  }

  // Agent blissfully unaware of the damage
  await showAgentText(scenario.demo.agentUnprotectedResponse);

  console.log(`  ${c.dim}${hr()}${c.reset}`);
  console.log('');
}
