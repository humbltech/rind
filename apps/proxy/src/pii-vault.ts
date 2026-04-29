// PII Vault — per-request pseudonymization and rehydration.
//
// Replaces PII entities in outbound LLM prompts with opaque tokens
// (<EMAIL_1>, <SIN_2>, etc.) and restores original values in the LLM response.
//
// Design constraints:
//   - In-memory only — no persistence, no disk, no DB
//   - Lifetime = single request; dispose() must be called after response
//   - Original values never written to logs; audit stats use salted hashes
//   - Debug entries (original values) only accessible in non-production environments

import { createHash } from 'node:crypto';
import type { PiiDetectorConfig, PiiEntity, PIIAuditStats } from '@rind/core';
import { PII_PATTERNS } from './transport/llm/request-scanner.js';

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
   * Raw vault entries including original values.
   * Only accessible when NODE_ENV !== 'production'.
   * For development debugging of false positives only.
   */
  getDebugEntries(): VaultEntry[];
  readonly size: number;
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
// PII_PATTERNS order (from request-scanner.ts):
//   [0] SSN, [1] CREDIT_CARD, [2] PHONE, [3] EMAIL

const ENTITY_PATTERN_MAP: Partial<Record<PiiEntity, RegExp>> = {
  // From PII_PATTERNS (shared with passive scanner)
  SSN:         PII_PATTERNS[0]!.pattern,
  SIN:         PII_PATTERNS[0]!.pattern, // same digit structure; locale label differs
  CREDIT_CARD: PII_PATTERNS[1]!.pattern,
  PHONE:       PII_PATTERNS[2]!.pattern,
  EMAIL:       PII_PATTERNS[3]!.pattern,
  // Additional Phase 1 patterns (inline — not in passive scanner)
  IP_ADDRESS: /\b(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\b/,
  IBAN:       /\b[A-Z]{2}\d{2}[A-Z0-9]{4}\d{7}(?:[A-Z0-9]{0,16})\b/,
  // PERSON_NAME, ADDRESS, PASSPORT, DATE_OF_BIRTH, HEALTH_CARD:
  // Not implementable with regex alone — require ml_ner stage (Phase 2).
  // Configuring these entities in a regex-only pipeline silently produces no matches.
};

// ─── Factory ──────────────────────────────────────────────────────────────────

export function createPIIVault(requestId: string): PIIVault {
  const entries: VaultEntry[] = [];
  const counters = new Map<string, number>();
  // token → original value (for rehydration — O(1) lookup)
  const tokenMap = new Map<string, string>();
  // original value → token (for forward application — applyTokens)
  const valueToToken = new Map<string, string>();

  function nextToken(entityType: PiiEntity): string {
    const count = (counters.get(entityType) ?? 0) + 1;
    counters.set(entityType, count);
    return `<${entityType}_${count}>`;
  }

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
          // Check if we already have a token for this exact value (dedup)
          const existing = entries.find(
            (e) => e.originalValue === originalValue && e.entityType === entityType,
          );
          const token = existing?.token ?? nextToken(entityType);

          if (!existing) {
            entries.push({
              token,
              originalValue,
              entityType,
              confidence: 0.9, // regex detections are high-confidence
              detectedBy: 'regex',
            });
            tokenMap.set(token, originalValue);
            valueToToken.set(originalValue, token);
          }

          result = result.replaceAll(originalValue, token);
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
