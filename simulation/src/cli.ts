// CLI entry point for `pnpm sim`
//
// Usage:
//   pnpm sim                                    # replay all scenarios (in-process)
//   pnpm sim replit-db-deletion                 # replay one scenario
//   pnpm sim --mode record                      # record all scenarios (requires real tool handlers)
//   pnpm sim --mode live                        # live mode (no cassette save, verifies drift)
//   pnpm sim --mode record tool-poisoning       # record one scenario
//   pnpm sim --http http://localhost:7777        # demo mode: send real HTTP to running proxy
//   pnpm sim --http http://localhost:7777 replit-db-deletion  # demo one scenario via HTTP

import { scenarios, scenariosBySlug } from './scenarios/index.js';
import { runScenario } from './scenario-runner.js';
import {
  printScenarioHeader,
  printWithoutRind,
  printWithRindHeader,
  printStep,
  printTheMoment,
  printScenarioResult,
  printSummary,
} from './reporter.js';
import type { SimMode } from './scenarios/types.js';

function parseArgs(args: string[]): { mode: SimMode; slugs: string[]; proxyUrl?: string } {
  let mode: SimMode = 'replay';
  const slugs: string[] = [];
  let proxyUrl: string | undefined;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg === '--mode' && args[i + 1]) {
      const m = args[++i]!;
      if (m !== 'replay' && m !== 'record' && m !== 'live') {
        console.error(`Unknown mode: ${m}. Use replay | record | live`);
        process.exit(1);
      }
      mode = m as SimMode;
    } else if (arg === '--http' && args[i + 1]) {
      proxyUrl = args[++i]!;
    } else if (!arg.startsWith('--')) {
      slugs.push(arg);
    }
  }

  return { mode, slugs, proxyUrl };
}

async function main() {
  const { mode, slugs, proxyUrl } = parseArgs(process.argv.slice(2));

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

main().catch((err: unknown) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
