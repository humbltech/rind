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
  railway_token:   ['Railway API token'],
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

// ─── Pattern metadata for UI display ─────────────────────────────────────────
// Human-readable descriptions of what each built-in pattern detects.
// Intentionally excludes raw regex — exposing the exact pattern would help
// attackers craft bypass strings. Labels match CREDENTIAL_PATTERNS.label exactly.

export interface SecretPatternMeta {
  label: string;
  description: string;
  example: string; // format hint, not a real secret
}

export const SECRET_DETECTOR_PATTERNS_META: SecretPatternMeta[] = [
  {
    label: 'Plaintext password',
    description: 'password= or passwd: followed by a value',
    example: 'password=hunter2',
  },
  {
    label: 'API key',
    description: 'api_key or apikey assignment with 16+ character value',
    example: 'api_key=AbCdEfGhIjKlMnOp',
  },
  {
    label: 'AWS access key',
    description: 'AWS_ACCESS_KEY_ID assignment',
    example: 'AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE',
  },
  {
    label: 'AWS secret key',
    description: 'AWS_SECRET_ACCESS_KEY assignment',
    example: 'AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/...',
  },
  {
    label: 'private key block',
    description: 'PEM-encoded private key header (RSA, EC, OpenSSH, PGP)',
    example: '-----BEGIN RSA PRIVATE KEY-----',
  },
  {
    label: 'Database connection string',
    description: 'Connection URI with embedded credentials (MongoDB, PostgreSQL, MySQL, Redis)',
    example: 'postgresql://user:pass@host/db',
  },
  {
    label: 'GitHub personal access token',
    description: 'GitHub PAT in ghp_ format',
    example: 'ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcd1234',
  },
  {
    label: 'OpenAI / Anthropic API key format',
    description: 'API keys starting with sk- (OpenAI, Anthropic, and similar providers)',
    example: 'sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
  },
  {
    label: 'JWT token',
    description: 'JSON Web Token in eyJ... three-part format',
    example: 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyIn0.signature',
  },
];
