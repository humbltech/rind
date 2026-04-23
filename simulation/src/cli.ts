// CLI entry point for `pnpm sim`
//
// Usage:
//   pnpm sim list                                 # list all scenarios
//   pnpm sim replit-db-deletion                   # demo mode — chat-like output (streamed)
//   pnpm sim replit-db-deletion --no-proxy        # demo without Rind — shows damage
//   pnpm sim replit-db-deletion --interactive     # pause for Enter before sending
//   pnpm sim replit-db-deletion --instant         # skip streaming delays
//   pnpm sim                                      # batch test — all scenarios (instant, PASS/FAIL)
//   pnpm sim --mode record                        # record cassettes
//   pnpm sim --http http://localhost:7777 <slug>  # run against live proxy

import { scenarios, scenariosBySlug } from './scenarios/index.js';
import { runScenario, runScenarioWithoutProxy } from './scenario-runner.js';
import {
  printScenarioHeader,
  printScenarioList,
  printWithoutRind,
  printWithRindHeader,
  printStep,
  printTheMoment,
  printScenarioResult,
  printSummary,
} from './reporter.js';
import { runDemoProtected, runDemoUnprotected } from './demo.js';
import type { SimMode } from './scenarios/types.js';

interface ParsedArgs {
  command: 'list' | 'run';
  mode: SimMode;
  slugs: string[];
  proxyUrl?: string;
  noProxy: boolean;
  interactive: boolean;
  instant: boolean;
}

function parseArgs(args: string[]): ParsedArgs {
  let mode: SimMode = 'replay';
  const slugs: string[] = [];
  let proxyUrl: string | undefined;
  let noProxy = false;
  let interactive = false;
  let instant = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg === 'list') {
      return { command: 'list', mode, slugs: [], noProxy: false, interactive: false, instant: false };
    }
    if (arg === '--mode' && args[i + 1]) {
      const m = args[++i]!;
      if (m !== 'replay' && m !== 'record' && m !== 'live') {
        console.error(`Unknown mode: ${m}. Use replay | record | live`);
        process.exit(1);
      }
      mode = m as SimMode;
    } else if (arg === '--http' && args[i + 1]) {
      proxyUrl = args[++i]!;
    } else if (arg === '--no-proxy') {
      noProxy = true;
    } else if (arg === '--interactive') {
      interactive = true;
    } else if (arg === '--instant') {
      instant = true;
    } else if (!arg.startsWith('--')) {
      slugs.push(arg);
    }
  }

  return { command: 'run', mode, slugs, proxyUrl, noProxy, interactive, instant };
}

function resolveScenarios(slugs: string[]) {
  return slugs.length > 0
    ? slugs.map((slug) => {
        const s = scenariosBySlug.get(slug);
        if (!s) {
          console.error(`Unknown scenario: ${slug}`);
          console.error(`Available: ${[...scenariosBySlug.keys()].join(', ')}`);
          console.error(`\nRun "pnpm sim list" to see all scenarios.`);
          process.exit(1);
        }
        return s;
      })
    : scenarios;
}

// ─── Demo mode (single scenario — chat format) ─────────────────────────────

async function runDemo(slugs: string[], mode: SimMode, noProxy: boolean, interactive: boolean, proxyUrl?: string) {
  const toRun = resolveScenarios(slugs);

  for (const scenario of toRun) {
    if (noProxy) {
      const result = await runScenarioWithoutProxy(scenario);
      await runDemoUnprotected(scenario, result.steps, interactive);
    } else {
      const result = await runScenario(scenario, mode, proxyUrl);
      await runDemoProtected(scenario, result, interactive);
    }
  }
}

// ─── Batch mode (all scenarios — test format with PASS/FAIL) ─────────────────

async function runBatch(mode: SimMode, proxyUrl?: string) {
  const toRun = scenarios;
  const modeLabel = proxyUrl ? `HTTP demo → ${proxyUrl}` : `mode: ${mode.toUpperCase()}`;
  console.log(`\nRind Simulation — ${modeLabel}`);
  console.log(`Running ${toRun.length} scenario${toRun.length !== 1 ? 's' : ''}\n`);

  const simStart = Date.now();
  const results = [];

  for (const scenario of toRun) {
    printScenarioHeader(scenario, mode);
    printWithoutRind(scenario);
    printWithRindHeader();

    const result = await runScenario(scenario, mode, proxyUrl);

    for (const step of result.steps) {
      printStep(step.label, step.status, step.error);
    }

    printTheMoment(scenario);
    printScenarioResult(result);
    results.push(result);
  }

  printSummary(results, Date.now() - simStart, mode);

  const allPassed = results.every((r) => r.passed);
  process.exit(allPassed ? 0 : 1);
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const parsed = parseArgs(process.argv.slice(2));

  if (parsed.command === 'list') {
    printScenarioList(scenarios);
    return;
  }

  // Single scenario(s) specified → demo mode (chat format)
  if (parsed.slugs.length > 0) {
    await runDemo(parsed.slugs, parsed.mode, parsed.noProxy, parsed.interactive, parsed.proxyUrl);
    return;
  }

  // No slug → batch mode (test all scenarios)
  await runBatch(parsed.mode, parsed.proxyUrl);
}

main().catch((err: unknown) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
