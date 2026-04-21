// Terminal reporter — prints scenario results as a human story.
// Uses raw ANSI escape codes (no extra deps).
// Output format: situation → without Rind → with Rind → the moment → test results.

import type { Scenario, ScenarioResult, SimMode } from './scenarios/types.js';

// ─── ANSI colors (no deps) ────────────────────────────────────────────────────
const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
};

function divider(char = '─', width = 60): string {
  return char.repeat(width);
}

function pad(text: string, width = 60): string {
  return text.slice(0, width).padEnd(width);
}

function box(lines: string[], borderChar = '═', width = 62): string {
  const top = borderChar.repeat(width);
  const bottom = borderChar.repeat(width);
  const content = lines.map((l) => `  ${l}`).join('\n');
  return `${top}\n${content}\n${bottom}`;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function printScenarioHeader(scenario: Scenario, mode: SimMode): void {
  const modeLabel =
    mode === 'replay' ? `${c.cyan}REPLAY${c.reset}` :
    mode === 'record' ? `${c.yellow}RECORD${c.reset}` :
    `${c.green}LIVE${c.reset}`;

  console.log('');
  console.log(c.bold + box([
    `SCENARIO: ${scenario.name}`,
    `Company:  ${scenario.company.toUpperCase()} | Feature: ${scenario.feature}`,
    scenario.incidentRef ? `Incident: ${scenario.incidentRef}` : '',
    `Mode:     ${mode.toUpperCase()}`,
  ].filter(Boolean)) + c.reset);
  console.log('');
  console.log(`${c.dim}SITUATION${c.reset}`);
  console.log(`  ${scenario.situation}`);
  console.log('');
}

export function printWithoutRind(scenario: Scenario): void {
  console.log(c.red + divider('─') + c.reset);
  console.log(`  ${c.bold}${c.red}WITHOUT RIND${c.reset}`);
  console.log('');
  console.log(`  ${scenario.withoutRind}`);
  console.log('');
}

export function printWithRindHeader(): void {
  console.log(c.green + divider('─') + c.reset);
  console.log(`  ${c.bold}${c.green}WITH RIND${c.reset}`);
  console.log('');
}

export function printStep(
  label: string,
  status: 'PASS' | 'FAIL' | 'SKIP' | 'running',
  detail?: string,
): void {
  const icon =
    status === 'PASS' ? `${c.green}✓${c.reset}` :
    status === 'FAIL' ? `${c.red}✗${c.reset}` :
    status === 'SKIP' ? `${c.dim}−${c.reset}` :
    `${c.dim}→${c.reset}`;
  console.log(`  ${icon}  ${label}`);
  if (detail) {
    console.log(`     ${c.dim}${detail}${c.reset}`);
  }
}

export function printTheMoment(scenario: Scenario): void {
  console.log('');
  console.log(`${c.bold}${c.cyan}  THE MOMENT${c.reset}`);
  console.log(`  ${scenario.theMoment}`);
  console.log('');
}

export function printScenarioResult(result: ScenarioResult): void {
  const passed = result.passed;
  const icon = passed ? `${c.bgGreen}${c.white}  PASSED  ${c.reset}` : `${c.bgRed}${c.white}  FAILED  ${c.reset}`;
  const failCount = result.steps.filter((s) => s.status === 'FAIL').length;
  const passCount = result.steps.filter((s) => s.status === 'PASS').length;

  console.log(divider('═'));
  console.log(`  ${icon}  ${passCount}/${result.steps.length} steps  |  ${result.durationMs}ms`);

  if (!passed) {
    console.log('');
    for (const step of result.steps.filter((s) => s.status === 'FAIL')) {
      console.log(`  ${c.red}FAIL${c.reset} ${step.label}`);
      console.log(`       ${c.dim}${step.error ?? 'unknown error'}${c.reset}`);
      console.log(`       Expected: ${JSON.stringify(step.expected)}`);
      console.log(`       Got:      status=${step.actual.status} body=${JSON.stringify(step.actual.body)}`);
    }
  }

  console.log(divider('═'));
  console.log('');
}

export function printSummary(
  results: ScenarioResult[],
  totalMs: number,
  mode: SimMode,
): void {
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;

  console.log('');
  console.log(c.bold + `═══ SIMULATION SUMMARY (${mode.toUpperCase()}) ═══` + c.reset);
  console.log('');
  console.log(`  Scenarios: ${results.length}`);
  console.log(`  ${c.green}Passed: ${passed}${c.reset}`);
  if (failed > 0) console.log(`  ${c.red}Failed: ${failed}${c.reset}`);
  console.log(`  Total time: ${totalMs}ms`);

  if (mode === 'replay') {
    console.log(`  ${c.dim}Run with --mode live to verify against real APIs${c.reset}`);
  } else if (mode === 'record') {
    console.log(`  ${c.yellow}Cassettes saved. Future runs use --mode replay (no API key needed)${c.reset}`);
  }

  console.log('');
}
