// CLI entry point for `pnpm sim`
//
// Usage:
//   pnpm sim list                                 # list all scenarios
//   pnpm sim replit-db-deletion                   # demo mode — chat-like output (streamed)
//   pnpm sim replit-db-deletion --no-proxy        # demo without Rind — shows damage
//   pnpm sim replit-db-deletion --interactive     # pause for Enter before sending
//   pnpm sim replit-db-deletion --instant         # skip streaming delays
//   pnpm sim                                      # run all scenarios (streamed chat format)
//   pnpm sim --mode record                        # record cassettes
//   pnpm sim --http http://localhost:7777 <slug>  # run against live proxy

import { scenarios, scenariosBySlug } from './scenarios/index.js';
import { runScenario, runScenarioWithoutProxy } from './scenario-runner.js';
import { printScenarioList } from './reporter.js';
import { runDemoProtected, runDemoUnprotected } from './demo.js';
import type { SimMode } from './scenarios/types.js';

interface ParsedArgs {
  command: 'list' | 'run';
  mode: SimMode;
  slugs: string[];
  proxyUrl?: string;
  fixturePort: number;
  noProxy: boolean;
  interactive: boolean;
  instant: boolean;
}

function parseArgs(args: string[]): ParsedArgs {
  let mode: SimMode = 'replay';
  const slugs: string[] = [];
  let proxyUrl: string | undefined;
  let fixturePort = 3100;
  let noProxy = false;
  let interactive = false;
  let instant = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg === 'list') {
      return { command: 'list', mode, slugs: [], proxyUrl: undefined, fixturePort, noProxy: false, interactive: false, instant: false };
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
    } else if (arg === '--fixture-port' && args[i + 1]) {
      fixturePort = Number(args[++i]!);
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

  return { command: 'run', mode, slugs, proxyUrl, fixturePort, noProxy, interactive, instant };
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

async function runDemo(slugs: string[], mode: SimMode, noProxy: boolean, interactive: boolean, proxyUrl?: string, fixturePort = 3100) {
  const toRun = resolveScenarios(slugs);

  for (const scenario of toRun) {
    if (noProxy) {
      const result = await runScenarioWithoutProxy(scenario);
      await runDemoUnprotected(scenario, result.steps, interactive);
    } else {
      const result = await runScenario(scenario, mode, proxyUrl, fixturePort);
      await runDemoProtected(scenario, result, interactive);
    }
  }
}

// ─── Batch mode (all scenarios — demo chat format) ─────���────────────────────

async function runBatch(mode: SimMode, proxyUrl?: string, fixturePort = 3100) {
  const toRun = scenarios;
  console.log(`\n  Running all ${toRun.length} scenarios\n`);

  for (const scenario of toRun) {
    const result = await runScenario(scenario, mode, proxyUrl, fixturePort);
    await runDemoProtected(scenario, result, false);
  }
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
    await runDemo(parsed.slugs, parsed.mode, parsed.noProxy, parsed.interactive, parsed.proxyUrl, parsed.fixturePort);
    return;
  }

  // No slug → batch mode (test all scenarios)
  await runBatch(parsed.mode, parsed.proxyUrl, parsed.fixturePort);
}

main().catch((err: unknown) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
