// Integration tests for all scenarios in REPLAY mode.
//
// These tests run in CI without any API keys or network access.
// Cassettes must be recorded first: `pnpm sim --mode record`

import { describe, it, expect } from 'vitest';
import { scenarios } from '../src/scenarios/index.js';
import { runScenario } from '../src/scenario-runner.js';

describe('Simulation scenarios (replay mode)', () => {
  for (const scenario of scenarios) {
    it(`${scenario.name} — all steps pass`, async () => {
      const result = await runScenario(scenario, 'replay');

      // Print failures with context if any step fails
      if (!result.passed) {
        const failures = result.steps.filter((s) => s.status === 'FAIL');
        console.error(`\n[${scenario.slug}] Failed steps:`);
        for (const f of failures) {
          console.error(`  ✗ ${f.label}: ${f.error ?? 'unknown error'}`);
          console.error(`    actual: ${JSON.stringify(f.actual)}`);
        }
      }

      expect(result.passed).toBe(true);
    }, 30_000); // 30s timeout for scenarios that might involve async work
  }
});
