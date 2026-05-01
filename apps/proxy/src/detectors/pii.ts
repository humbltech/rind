// PII detector — wraps PII_PATTERNS from rules/llm-pii-patterns.rules.ts.
//
// Phase 1: regex-only pipeline.
// Implemented entity types: SSN, SIN, CREDIT_CARD, PHONE, EMAIL, IP_ADDRESS, IBAN
// Phase 2 (requires ml_ner stage): PERSON_NAME, ADDRESS, PASSPORT,
//   DATE_OF_BIRTH, HEALTH_CARD
// Requesting an unimplemented entity type silently produces no matches.

import type { PiiDetectorConfig, PiiEntity } from '@rind/core';
import type { DetectorRunResult } from './types.js';

// ─── Entity → pattern ────────────────────────────────────────────────────────
//
// Patterns looked up by stable ID — not by position.
// Adding or reordering entries in LLM_PII_PATTERNS will not silently break this.
//
// IP_ADDRESS and IBAN use inline patterns (not in the shared PII_PATTERNS array).

// All patterns exclude Rind synthetic reserved ranges to prevent re-detection
// when synthetic values appear in multi-turn conversation history.
const ENTITY_PATTERN_MAP: Partial<Record<PiiEntity, RegExp>> = {
  // Exclude SSNs/SINs starting with 000 — SSA permanently reserves 000-xx-xxxx.
  SSN:         /\b(?!000)(?:\d{3}-\d{2}-\d{4}|\d{3} \d{2} \d{4}|\d{9})\b/,
  SIN:         /\b(?!000)(?:\d{3}-\d{2}-\d{4}|\d{3} \d{2} \d{4}|\d{9})\b/,
  // Exclude 0000-xxxx-xxxx-xxxx — no real payment network uses 0000 as the first group.
  CREDIT_CARD: /\b(?!0000[- ])\d{4}[- ]\d{4}[- ]\d{4}[- ]\d{2,4}\b/,
  // Exclude NANP 555-01xx — permanently reserved for fictional use.
  PHONE:       /\b(?:\+?1[-.\s]?)?(?!\(?555\)?[-.\s]?01\d)(?:\(\d{3}\)|\d{3})[-.\s]?\d{3}[-.\s]?\d{4}\b/,
  // Exclude RFC 2606 §3 reserved domains — so synthetic values are never re-detected.
  EMAIL:       /\b[A-Za-z0-9._%+-]+@(?!(?:example|test|invalid)\.(?:com|net|org)\b)[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/i,
  // Exclude RFC 5737 TEST-NET-1 (192.0.2.0/24) — reserved for documentation.
  IP_ADDRESS:  /\b(?!192\.0\.2\.)(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\b/,
  IBAN:        /\b[A-Z]{2}\d{2}[A-Z0-9]{4}\d{7}(?:[A-Z0-9]{0,16})\b/,
  // PERSON_NAME, ADDRESS, PASSPORT, DATE_OF_BIRTH, HEALTH_CARD: Phase 2 (ml_ner)
};

// ─── Detector ─────────────────────────────────────────────────────────────────

export function runPIIDetector(
  text: string,
  config: PiiDetectorConfig,
): DetectorRunResult {
  const matches: DetectorRunResult['matches'] = [];
  const seen = new Set<PiiEntity>(); // one match entry per entity type per call

  for (const entityType of config.entities) {
    if (seen.has(entityType)) continue;
    const pattern = ENTITY_PATTERN_MAP[entityType];
    if (!pattern) continue; // entity type not yet implemented (Phase 2)

    // Build a fresh global regex for matchAll — the stored patterns are non-global
    const globalPattern = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g');
    const occurrences = [...text.matchAll(globalPattern)];
    if (occurrences.length > 0) {
      matches.push({
        label: entityType,
        type: entityType,
        confidence: 0.9,
        stage: 'regex',
        occurrenceCount: occurrences.length,
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
