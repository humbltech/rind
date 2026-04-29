// Secret detector — wraps CREDENTIAL_PATTERNS from inspector/response.ts.
//
// Phase 1: regex-only pipeline. 'ml_ner' and 'llm_judge' stages are stubs
// that fail open and log a warning if accidentally configured.

import type { SecretDetectorConfig } from '@rind/core';
import { CREDENTIAL_PATTERNS } from '../inspector/response.js';
import type { DetectorRunResult } from './types.js';

// ─── Built-in pattern registry ────────────────────────────────────────────────
//
// Maps BuiltinSecretPattern names to their CREDENTIAL_PATTERNS entries.
// CREDENTIAL_PATTERNS labels are used as the canonical name.

const BUILTIN_PATTERN_MAP = new Map(
  CREDENTIAL_PATTERNS.map((p) => [p.label, p]),
);

// Named aliases from BuiltinSecretPattern → exact CREDENTIAL_PATTERNS labels.
// Labels must match CREDENTIAL_PATTERNS entries in inspector/response.ts exactly.
// Aliases with no corresponding CREDENTIAL_PATTERNS entry map to [] and are no-ops
// (filtering to them selects zero patterns — documented intentionally).
const BUILTIN_ALIASES: Record<string, string[]> = {
  // Single pattern covers both providers — 'sk-' prefix format
  openai_key:      ['OpenAI / Anthropic API key format'],
  anthropic_key:   ['OpenAI / Anthropic API key format'],
  // Both AWS credential types
  aws_access_key:  ['AWS access key', 'AWS secret key'],
  github_token:    ['GitHub personal access token'],
  // No built-in Stripe pattern in CREDENTIAL_PATTERNS yet — no-op until added
  stripe_key:      [],
  jwt:             ['JWT token'],
  private_key:     ['private key block'],
  // No built-in bearer token pattern — too generic to match reliably — no-op
  bearer_token:    [],
  generic_api_key: ['API key'],
};

// ─── Detector ─────────────────────────────────────────────────────────────────

export function runSecretDetector(
  text: string,
  config: SecretDetectorConfig,
): DetectorRunResult {
  const matches: DetectorRunResult['matches'] = [];

  // Determine which patterns to run
  let patternsToRun = CREDENTIAL_PATTERNS;
  if (config.patterns && config.patterns.length > 0) {
    const allowedLabels = new Set<string>();
    for (const name of config.patterns) {
      for (const alias of BUILTIN_ALIASES[name] ?? []) {
        allowedLabels.add(alias);
      }
    }
    patternsToRun = CREDENTIAL_PATTERNS.filter((p) => allowedLabels.has(p.label));
  }

  // Run built-in patterns
  for (const { pattern, label } of patternsToRun) {
    pattern.lastIndex = 0; // reset stateful global regexes before test()
    if (pattern.test(text)) {
      matches.push({
        label,
        type: label,
        confidence: 0.95,
        stage: 'regex',
      });
    }
  }

  // Run custom patterns
  for (const { name, regex } of config.custom ?? []) {
    try {
      if (new RegExp(regex).test(text)) {
        matches.push({
          label: name,
          type: name,
          confidence: 0.85,
          stage: 'regex',
        });
      }
    } catch {
      // Invalid regex — skip silently (Zod validation catches this at startup)
    }
  }

  return {
    triggered: matches.length > 0,
    stage: 'regex',
    maxConfidence: matches.length > 0 ? Math.max(...matches.map((m) => m.confidence)) : 0,
    matches,
  };
}

// Re-export pattern list for use in built-in pack definitions
export { BUILTIN_PATTERN_MAP };
