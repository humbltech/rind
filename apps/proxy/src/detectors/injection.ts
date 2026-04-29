// Prompt injection detector — wraps patterns from inspector/request.ts and
// inspector/response.ts for use in the LLM content policy pipeline.
//
// Phase 1: regex-only pipeline. llmJudge stage is a forward-compatible stub.

import type { InjectionDetectorConfig } from '@rind/core';
import { INPUT_INJECTION_PATTERNS } from '../inspector/request.js';
import { PROMPT_INJECTION_PATTERNS } from '../inspector/response.js';
import type { DetectorRunResult } from './types.js';

// ─── Detector ─────────────────────────────────────────────────────────────────

export function runInjectionDetector(
  text: string,
  _config: InjectionDetectorConfig,
): DetectorRunResult {
  const matches: DetectorRunResult['matches'] = [];

  // Request-side injection patterns (role overrides, shell injection, etc.)
  for (const { pattern, label } of INPUT_INJECTION_PATTERNS) {
    if (pattern.test(text)) {
      matches.push({
        label,
        type: 'PROMPT_INJECTION',
        confidence: 0.95,
        stage: 'regex',
      });
    }
  }

  // Response-side injection patterns (instruction smuggling in model output)
  for (const { pattern, label, severity } of PROMPT_INJECTION_PATTERNS) {
    if (pattern.test(text)) {
      matches.push({
        label,
        type: 'PROMPT_INJECTION',
        confidence: severity === 'critical' ? 0.95 : 0.8,
        stage: 'regex',
      });
    }
  }

  // Phase 1: only the 'regex' pipeline stage is implemented.
  // If 'ml_ner' or 'llm_judge' are configured they are silently skipped —
  // only regex results are returned. This is intentional fail-open behaviour
  // so misconfigured stage lists do not break the request pipeline.
  // Phase 2 will add ml_ner and llm_judge support.

  return {
    triggered: matches.length > 0,
    stage: 'regex',
    maxConfidence: matches.length > 0 ? Math.max(...matches.map((m) => m.confidence)) : 0,
    matches,
  };
}
