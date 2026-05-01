// PII Vault — per-request pseudonymization and rehydration.
//
// Replaces PII entities in outbound LLM prompts with realistic synthetic values
// (e.g. alex.chen@company.com instead of <EMAIL_1>) so LLMs process the request
// naturally and echo the synthetic back in their response, enabling reliable
// rehydration. Opaque tokens like <EMAIL_1> caused models to comment on the tag
// rather than answer the question.
//
// Design constraints:
//   - In-memory only — no persistence, no disk, no DB
//   - Lifetime = single request; dispose() must be called after response
//   - Original values never written to logs; audit stats use salted hashes
//   - Debug entries (original values) only accessible in non-production environments

import { createHash } from 'node:crypto';
import type { PiiDetectorConfig, PiiEntity, PIIAuditStats } from '@rind/core';
import { generateSyntheticValue } from './synthetic-generators.js';

// ─── Internal entry ───────────────────────────────────────────────────────────

interface VaultEntry {
  token: string;
  originalValue: string;
  entityType: PiiEntity;
  confidence: number;
  detectedBy: 'regex' | 'ml_ner' | 'llm_judge';
}

// ─── Public interfaces ────────────────────────────────────────────────────────

export interface PseudonymizeResult {
  sanitized: string;
  entityCount: number;
  entityTypes: PiiEntity[];
  /** Safe for production audit log — no original values */
  stats: PIIAuditStats;
}

export interface PIIVault {
  readonly requestId: string;
  /**
   * Scan text for PII and replace with tokens.
   * Mutates vault state (adds entries for each detected entity).
   */
  pseudonymize(text: string, config: PiiDetectorConfig): PseudonymizeResult;
  /**
   * Replace tokens in LLM response with original values.
   * Tokens not present in vault are left unchanged.
   */
  rehydrate(text: string): string;
  /**
   * Apply the vault's forward mapping (original value → token) to a string.
   * Safe in all environments — does not access original values via debug API.
   * Used by content-policy to pseudonymize individual body string fields.
   */
  applyTokens(text: string): string;
  /**
   * Return the synthetic values generated for a given entity type.
   * Safe in all environments — returns the replacement values, never originals.
   * Used to populate syntheticValue in audit matches after pseudonymization.
   */
  getSyntheticsForEntity(entityType: PiiEntity): string[];
  /**
   * Raw vault entries including original values.
   * Only accessible when NODE_ENV !== 'production'.
   * For development debugging of false positives only.
   */
  getDebugEntries(): VaultEntry[];
  readonly size: number;
  /**
   * Length of the longest token currently in the vault (e.g. `<DATE_OF_BIRTH_1>` = 17).
   * Used to size the streaming hold-back window: hold back this many bytes so no
   * token can span a send boundary.
   */
  readonly maxTokenLength: number;
  /** Clear all mappings. Must be called after request completes. */
  dispose(): void;
}

// ─── Entity type → regex pattern ─────────────────────────────────────────────
//
// Phase 1: regex-only pipeline.
// Implemented:  SSN, SIN, CREDIT_CARD, PHONE, EMAIL, IP_ADDRESS, IBAN
// Phase 2 (requires ml_ner stage): PERSON_NAME, ADDRESS, PASSPORT,
//   DATE_OF_BIRTH, HEALTH_CARD
//
// All patterns exclude Rind synthetic reserved ranges to prevent re-detection
// when synthetic values appear in multi-turn conversation history.
const ENTITY_PATTERN_MAP: Partial<Record<PiiEntity, RegExp>> = {
  // Exclude SSNs/SINs starting with 000 — SSA permanently reserves 000-xx-xxxx.
  // Our SSN synthetics are 000-00-XXXX; our SIN synthetics are 000-000-XXX.
  SSN:         /\b(?!000)(?:\d{3}-\d{2}-\d{4}|\d{3} \d{2} \d{4}|\d{9})\b/,
  SIN:         /\b(?!000)(?:\d{3}-\d{2}-\d{4}|\d{3} \d{2} \d{4}|\d{9})\b/,
  // Exclude 0000-xxxx-xxxx-xxxx — no real payment network uses 0000 as the first group.
  // Our CC synthetics always start with 0000-.
  CREDIT_CARD: /\b(?!0000[- ])\d{4}[- ]\d{4}[- ]\d{4}[- ]\d{2,4}\b/,
  // Exclude NANP 555-01xx — permanently reserved for fictional use.
  // Our phone synthetics are 555-010-XXXX. Lookahead checks area code 555 + exchange 01x.
  PHONE:       /\b(?:\+?1[-.\s]?)?(?!\(?555\)?[-.\s]?01\d)(?:\(\d{3}\)|\d{3})[-.\s]?\d{3}[-.\s]?\d{4}\b/,
  // Exclude RFC 2606 §3 reserved domains — @example.com/net/org, @test.com, @invalid.
  // Our email synthetics are user1@example.com.
  EMAIL:       /\b[A-Za-z0-9._%+-]+@(?!(?:example|test|invalid)\.(?:com|net|org)\b)[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/i,
  // Exclude RFC 5737 TEST-NET-1 (192.0.2.0/24) — reserved for documentation.
  // Our IP synthetics are 192.0.2.X.
  IP_ADDRESS:  /\b(?!192\.0\.2\.)(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\b/,
  IBAN:        /\b[A-Z]{2}\d{2}[A-Z0-9]{4}\d{7}(?:[A-Z0-9]{0,16})\b/,
  // PERSON_NAME, ADDRESS, PASSPORT, DATE_OF_BIRTH, HEALTH_CARD:
  // Not implementable with regex alone — require ml_ner stage (Phase 2).
  // Configuring these entities in a regex-only pipeline silently produces no matches.
};

// ─── Factory ──────────────────────────────────────────────────────────────────

export function createPIIVault(requestId: string): PIIVault {
  const entries: VaultEntry[] = [];
  // Per-entity-type occurrence counter — used as the index into synthetic generators
  const counters = new Map<string, number>();
  // synthetic → original (for rehydration — O(1) lookup)
  const tokenMap = new Map<string, string>();
  // original → synthetic (for forward application — applyTokens)
  const valueToToken = new Map<string, string>();

  function buildStats(rehydrated: boolean): PIIAuditStats {
    const breakdown: Record<string, number> = {};
    for (const entry of entries) {
      breakdown[entry.entityType] = (breakdown[entry.entityType] ?? 0) + 1;
    }

    // Salted hashes — sha256(requestId + entityType + value), request-scoped salt.
    // entries is already deduplicated (same value → same token → one entry), so
    // occurrences is always 1 per unique value in Phase 1 (regex-only pipeline).
    // Phase 2 (ml_ner) may produce multiple detections of the same value from
    // different stages, which would increment occurrences > 1.
    const hashCounts = new Map<string, { hash: string; entityType: PiiEntity; occurrences: number }>();
    for (const entry of entries) {
      const key = `${entry.entityType}:${entry.originalValue}`;
      const existing = hashCounts.get(key);
      if (existing) {
        existing.occurrences++;
      } else {
        const hash = createHash('sha256')
          .update(requestId + entry.entityType + entry.originalValue)
          .digest('hex');
        hashCounts.set(key, { hash, entityType: entry.entityType, occurrences: 1 });
      }
    }

    return {
      tokenCount: entries.length,
      entityTypeBreakdown: breakdown,
      valueHashes: Array.from(hashCounts.values()),
      rehydrated,
    };
  }

  return {
    get requestId() { return requestId; },
    get size() { return entries.length; },
    get maxTokenLength() {
      return entries.reduce((max, e) => Math.max(max, e.token.length), 0);
    },

    pseudonymize(text: string, config: PiiDetectorConfig): PseudonymizeResult {
      let result = text;
      const foundTypes = new Set<PiiEntity>();

      // Phase 1: regex-only pipeline
      // Only scan entities requested in config
      for (const entityType of config.entities) {
        const pattern = ENTITY_PATTERN_MAP[entityType];
        if (!pattern) continue;

        // Build a fresh global regex from the source pattern (the stored ones are non-global)
        const globalPattern = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g');
        const matches = [...result.matchAll(globalPattern)];

        for (const match of matches) {
          const originalValue = match[0]!;
          // Dedup: same original value in the same request always maps to the same synthetic
          const existing = entries.find(
            (e) => e.originalValue === originalValue && e.entityType === entityType,
          );

          let synthetic: string;
          if (existing) {
            synthetic = existing.token;
          } else {
            const index = counters.get(entityType) ?? 0;
            synthetic = generateSyntheticValue(entityType, originalValue, index);
            counters.set(entityType, index + 1);
            entries.push({
              token: synthetic,
              originalValue,
              entityType,
              confidence: 0.9, // regex detections are high-confidence
              detectedBy: 'regex',
            });
            tokenMap.set(synthetic, originalValue);
            valueToToken.set(originalValue, synthetic);
          }

          result = result.replaceAll(originalValue, synthetic);
          foundTypes.add(entityType);
        }
      }

      return {
        sanitized: result,
        entityCount: entries.length,
        entityTypes: Array.from(foundTypes),
        stats: buildStats(false),
      };
    },

    rehydrate(text: string): string {
      let result = text;
      // Replace all known tokens with original values
      for (const [token, original] of tokenMap) {
        result = result.replaceAll(token, original);
      }
      return result;
    },

    applyTokens(text: string): string {
      // Forward mapping: replace original values with their assigned tokens.
      // Safe in all environments — reads valueToToken, never exposes original values externally.
      let result = text;
      for (const [original, token] of valueToToken) {
        result = result.replaceAll(original, token);
      }
      return result;
    },

    getSyntheticsForEntity(entityType: PiiEntity): string[] {
      return entries
        .filter((e) => e.entityType === entityType)
        .map((e) => e.token);
    },

    getDebugEntries(): VaultEntry[] {
      if (process.env['NODE_ENV'] === 'production') {
        throw new Error('PIIVault.getDebugEntries() is not available in production');
      }
      return [...entries];
    },

    dispose(): void {
      entries.length = 0;
      counters.clear();
      tokenMap.clear();
      valueToToken.clear();
    },
  };
}
