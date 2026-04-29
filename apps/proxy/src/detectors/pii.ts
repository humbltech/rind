// PII detector — wraps PII_PATTERNS from rules/llm-pii-patterns.rules.ts.
//
// Phase 1: regex-only pipeline.
// Implemented entity types: SSN, SIN, CREDIT_CARD, PHONE, EMAIL, IP_ADDRESS, IBAN
// Phase 2 (requires ml_ner stage): PERSON_NAME, ADDRESS, PASSPORT,
//   DATE_OF_BIRTH, HEALTH_CARD
// Requesting an unimplemented entity type silently produces no matches.

import type { PiiDetectorConfig, PiiEntity } from '@rind/core';
import { piiPatternById } from '../rules/llm-pii-patterns.rules.js';
import type { DetectorRunResult } from './types.js';

// ─── Entity → pattern ────────────────────────────────────────────────────────
//
// Patterns looked up by stable ID — not by position.
// Adding or reordering entries in LLM_PII_PATTERNS will not silently break this.
//
// IP_ADDRESS and IBAN use inline patterns (not in the shared PII_PATTERNS array).

const ENTITY_PATTERN_MAP: Partial<Record<PiiEntity, RegExp>> = {
  SSN:         piiPatternById('llm-pii-001'),
  SIN:         piiPatternById('llm-pii-001'), // same digit structure; locale label differs
  CREDIT_CARD: piiPatternById('llm-pii-002'),
  PHONE:       piiPatternById('llm-pii-003'),
  EMAIL:       piiPatternById('llm-pii-004'),
  IP_ADDRESS:  /\b(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\b/,
  IBAN:        /\b[A-Z]{2}\d{2}[A-Z0-9]{4}\d{7}(?:[A-Z0-9]{0,16})\b/,
  // PERSON_NAME, ADDRESS, PASSPORT, DATE_OF_BIRTH, HEALTH_CARD: Phase 2 (ml_ner)
};

// ─── Detector ─────────────────────────────────────────────────────────────────

export function runPIIDetector(
  text: string,
  config: PiiDetectorConfig,
): DetectorRunResult {
  const matches: DetectorRunResult['matches'] = [];
  const seen = new Set<PiiEntity>(); // one match per entity type per call

  for (const entityType of config.entities) {
    if (seen.has(entityType)) continue;
    const pattern = ENTITY_PATTERN_MAP[entityType];
    if (!pattern) continue; // entity type not yet implemented (Phase 2)

    // Reset lastIndex before test() — guards against stateful global regexes
    // on shared module-level pattern instances.
    pattern.lastIndex = 0;
    if (pattern.test(text)) {
      matches.push({
        label: entityType,
        type: entityType,
        confidence: 0.9,
        stage: 'regex',
      });
      seen.add(entityType);
    }
  }

  return {
    triggered: matches.length > 0,
    stage: 'regex',
    maxConfidence: matches.length > 0 ? Math.max(...matches.map((m) => m.confidence)) : 0,
    matches,
  };
}
