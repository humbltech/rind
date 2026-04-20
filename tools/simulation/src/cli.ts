// CLI entry point for `pnpm sim`
//
// Usage:
//   pnpm sim                              # replay all scenarios
//   pnpm sim replit-db-deletion           # replay one scenario
//   pnpm sim --mode record                # record all scenarios (requires real tool handlers)
//   pnpm sim --mode live                  # live mode (no cassette save, verifies drift)
//   pnpm sim --mode record tool-poisoning # record one scenario

import { scenarios, scenariosBySlug } from './scenarios/index.js';
import { runScenario } from './scenario-runner.js';
import {
  printScenarioHeader,
  printWithoutAegis,
  printWithAegisHeader,
  printStep,
  printTheMoment,
  printScenarioResult,
  printSummary,
} from './reporter.js';
import type { SimMode } from './scenarios/types.js';

function parseArgs(args: string[]): { mode: SimMode; slugs: string[] } {
  let mode: SimMode = 'replay';
  const slugs: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg === '--mode' && args[i + 1]) {
      const m = args[++i]!;
      if (m !== 'replay' && m !== 'record' && m !== 'live') {
        console.error(`Unknown mode: ${m}. Use replay | record | live`);
        process.exit(1);
      }
      mode = m as SimMode;
    } else if (!arg.startsWith('--')) {
      slugs.push(arg);
    }
  }

  return { mode, slugs };
}

async function main() {
  const { mode, slugs } = parseArgs(process.argv.slice(2));

  const toRun =
    slugs.length > 0
      ? slugs.map((slug) => {
          const s = scenariosBySlug.get(slug);
          if (!s) {
            console.error(`Unknown scenario: ${slug}`);
            console.error(`Available: ${[...scenariosBySlug.keys()].join(', ')}`);
            process.exit(1);
          }
          return s;
        })
      : scenarios;

  console.log(`\nAegis Simulation — mode: ${mode.toUpperCase()}`);
  console.log(`Running ${toRun.length} scenario${toRun.length !== 1 ? 's' : ''}\n`);

  const simStart = Date.now();
  const results = [];

  for (const scenario of toRun) {
    printScenarioHeader(scenario, mode);
    printWithoutAegis(scenario);
    printWithAegisHeader();

    const result = await runScenario(scenario, mode);

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

main().catch((err: unknown) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
