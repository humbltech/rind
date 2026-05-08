// PII Vault — session-scoped pseudonymization and rehydration for PII entities.
//
// Replaces PII entities in outbound LLM prompts with realistic reserved-range synthetic
// values (e.g. synth+abc123@example.com instead of alice@corp.com) so LLMs process the
// request naturally and echo the synthetic back in their response, enabling reliable
// rehydration. Opaque tokens like <EMAIL_1> caused models to comment on the tag rather
// than answer the question.
//
// Design:
//   - Synthetics are HMAC-SHA256-derived (deterministic per agent+value, idempotent)
//   - Rehydration is destination-scoped: a PII value is only unwrapped when forwarding
//     to the same server that originally surfaced it (prevents cross-server leakage)
//   - Lifetime = session; disposed on session.kill() / sessionStore.reset()
//   - Original values never written to logs; debug API is non-production only
//
// Phase 2: replace HMAC tag derivation with AES-GCM-SIV ciphertext — same interface,
// same synthetic shape, same call sites. Only the inner deriveTag / lookup changes.

import { randomBytes, createHmac, createHash } from 'node:crypto';
import type { PiiDetectorConfig, PiiEntity, PIIAuditStats } from '@rind/core';
import { deriveAgentKey, deriveTag, generateSyntheticValue } from './synthetic-generators.js';
import { runPIIDetector } from './detectors/pii.js';

// Module-level master key: separate from CredentialVault's MASTER_KEY (independent blast radius).
// Generated once at process start, shared across all PII vaults.
const PII_MASTER_KEY: Buffer = randomBytes(32);

// ─── Internal entry ───────────────────────────────────────────────────────────

export interface PIIVaultEntry {
  tag: string;
  synthetic: string;
  entityType: PiiEntity;
  originServerId: string;
  originToolName: string;
  allowedDestinations: Set<string>; // serverId allowlist; rehydration blocked outside this set
  detectedAt: number;
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

export interface PIIRehydrateResult {
  text: string;
  rehydratedTokens: PIIVaultEntry[];
  blockedTokens: PIIVaultEntry[];
}

export interface PIIRehydrateValueResult {
  value: unknown;
  rehydratedTokens: PIIVaultEntry[];
  blockedTokens: PIIVaultEntry[];
}

export interface PIIVault {
  readonly agentId: string;
  /**
   * Scan text for PII and replace with deterministic synthetic values.
   * Mutates vault state (adds entries for each detected entity).
   * origin.serverId seeds allowedDestinations for destination-scoped rehydration.
   * config is optional — defaults to all Phase 1 entities when absent.
   */
  pseudonymize(
    text: string,
    origin: { serverId: string; toolName: string },
    config?: PiiDetectorConfig,
  ): PseudonymizeResult;
  /**
   * Walk an object tree, apply forward mapping (original value → synthetic) for
   * already-vaulted PII. Safe in all environments.
   */
  applyTokensDeep(value: unknown, origin: { serverId: string; toolName: string }): unknown;
  /**
   * Apply the vault's forward mapping (original value → synthetic) to a string.
   * Thin wrapper around applyTokensDeep for scalar strings.
   * Used by applyPseudonymizeToBody in content-policy.ts.
   */
  applyTokens(text: string): string;
  /**
   * Replace synthetics in text with originals, scoped to dest.serverId.
   * Tokens whose allowedDestinations does not include dest.serverId are left unchanged.
   */
  rehydrateForDestination(
    text: string,
    dest: { serverId: string; toolName: string },
  ): PIIRehydrateResult;
  /**
   * Walk an object tree, rehydrate synthetics scoped to dest.serverId.
   */
  rehydrateValueForDestination(
    value: unknown,
    dest: { serverId: string; toolName: string },
  ): PIIRehydrateValueResult;
  /**
   * Unscoped rehydration — replaces all known synthetics regardless of destination.
   * Kept for LLM gateway response path (single-LLM-call scope, no cross-server risk).
   */
  rehydrate(text: string): string;
  /**
   * Return the synthetic values generated for a given entity type.
   * Safe in all environments. Used to annotate audit matches with synthetic values.
   */
  getSyntheticsForEntity(entityType: PiiEntity): string[];
  /**
   * Raw vault entries including original values.
   * Only accessible when NODE_ENV !== 'production'.
   */
  getDebugEntries(): Array<PIIVaultEntry & { originalValue: string }>;
  readonly size: number;
  /**
   * Length of the longest synthetic currently in the vault.
   * Used to size the streaming hold-back window.
   */
  readonly maxTokenLength: number;
  /** Clear all mappings. Should be called on session.kill(). */
  dispose(): void;
}

// ─── Entity type → detector regex ────────────────────────────────────────────
//
// Phase 1: regex-only pipeline.
// Implemented:  SSN, SIN, CREDIT_CARD, PHONE, EMAIL, IP_ADDRESS, IBAN
// Phase 2 (requires ml_ner stage): PERSON_NAME, ADDRESS, PASSPORT,
//   DATE_OF_BIRTH, HEALTH_CARD
//
// All patterns have negative lookaheads to exclude Rind synthetic reserved ranges,
// preventing re-detection when synthetic values appear in multi-turn conversation history.
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
  // Our email synthetics are synth+<tag>@example.com.
  EMAIL:       /\b[A-Za-z0-9._%+-]+@(?!(?:example|test|invalid)\.(?:com|net|org)\b)[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/i,
  // Exclude RFC 5737 TEST-NET-1 (192.0.2.0/24) — reserved for documentation.
  // Our IP synthetics are 192.0.2.X.
  IP_ADDRESS:  /\b(?!192\.0\.2\.)(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\b/,
  // Exclude XX country prefix — no real IBAN uses XX; our IBAN synthetics are XX00<tag>.
  IBAN:        /\b(?!XX)[A-Z]{2}\d{2}[A-Z0-9]{4}\d{7}(?:[A-Z0-9]{0,16})\b/,
  // PERSON_NAME, ADDRESS, PASSPORT, DATE_OF_BIRTH, HEALTH_CARD:
  // Not implementable with regex alone — require ml_ner stage (Phase 2).
  // Configuring these entities in a regex-only pipeline silently produces no matches.
};

// Default entities scanned when no config is provided
const DEFAULT_ENTITIES: PiiEntity[] = ['SSN', 'SIN', 'CREDIT_CARD', 'PHONE', 'EMAIL', 'IP_ADDRESS', 'IBAN'];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function walkAndTransform(value: unknown, transform: (s: string) => string): unknown {
  if (typeof value === 'string') return transform(value);
  if (Array.isArray(value)) return value.map((v) => walkAndTransform(v, transform));
  if (value !== null && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      result[k] = walkAndTransform(v, transform);
    }
    return result;
  }
  return value;
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export function createPIIVault(agentId: string): PIIVault {
  const agentKey = deriveAgentKey(PII_MASTER_KEY, agentId);

  // tag → { entry }
  const entriesByTag = new Map<string, PIIVaultEntry>();
  // tag → original (plain) value — kept separate, never logged
  const originalByTag = new Map<string, string>();
  // synthetic → tag (reverse lookup for rehydration)
  const syntheticToTag = new Map<string, string>();

  function buildStats(rehydrated: boolean): PIIAuditStats {
    const breakdown: Record<string, number> = {};
    for (const entry of entriesByTag.values()) {
      breakdown[entry.entityType] = (breakdown[entry.entityType] ?? 0) + 1;
    }

    // Salted hashes — sha256(agentId + entityType + value), agent-scoped salt.
    const valueHashes: { hash: string; entityType: PiiEntity; occurrences: number }[] = [];
    for (const [tag, entry] of entriesByTag) {
      const original = originalByTag.get(tag);
      if (!original) continue;
      const hash = createHash('sha256')
        .update(agentId + entry.entityType + original)
        .digest('hex');
      valueHashes.push({ hash, entityType: entry.entityType, occurrences: 1 });
    }

    return {
      tokenCount: entriesByTag.size,
      entityTypeBreakdown: breakdown,
      valueHashes,
      rehydrated,
    };
  }

  function pseudonymizeText(
    text: string,
    origin: { serverId: string; toolName: string },
    entities: PiiEntity[],
  ): PseudonymizeResult {
    let result = text;
    const foundTypes = new Set<PiiEntity>();

    for (const entityType of entities) {
      const pattern = ENTITY_PATTERN_MAP[entityType];
      if (!pattern) continue;

      const globalPattern = new RegExp(
        pattern.source,
        pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g',
      );
      const matches = [...result.matchAll(globalPattern)];

      for (const match of matches) {
        const originalValue = match[0]!;

        const tag = deriveTag(agentKey, originalValue);
        const synthetic = generateSyntheticValue(entityType, originalValue, tag);

        let entry = entriesByTag.get(tag);
        if (!entry) {
          entry = {
            tag,
            synthetic,
            entityType,
            originServerId: origin.serverId,
            originToolName: origin.toolName,
            allowedDestinations: new Set([origin.serverId]),
            detectedAt: Date.now(),
            confidence: 0.9,
            detectedBy: 'regex',
          };
          entriesByTag.set(tag, entry);
          originalByTag.set(tag, originalValue);
          syntheticToTag.set(synthetic, tag);
        } else {
          entry.allowedDestinations.add(origin.serverId);
        }

        result = result.replaceAll(originalValue, synthetic);
        foundTypes.add(entityType);
      }
    }

    return {
      sanitized: result,
      entityCount: entriesByTag.size,
      entityTypes: Array.from(foundTypes),
      stats: buildStats(false),
    };
  }

  function rehydrateText(
    text: string,
    dest: { serverId: string; toolName: string } | null,
  ): PIIRehydrateResult {
    let result = text;
    const rehydratedTokens: PIIVaultEntry[] = [];
    const blockedTokens: PIIVaultEntry[] = [];

    for (const [synthetic, tag] of syntheticToTag) {
      if (!result.includes(synthetic)) continue;

      const entry = entriesByTag.get(tag);
      if (!entry) continue;

      // dest === null means unscoped (LLM single-call path)
      const allowed = dest === null || entry.allowedDestinations.has(dest.serverId);
      if (allowed) {
        const original = originalByTag.get(tag);
        if (original) {
          result = result.replaceAll(synthetic, original);
          rehydratedTokens.push(entry);
        }
      } else {
        blockedTokens.push(entry);
      }
    }

    return { text: result, rehydratedTokens, blockedTokens };
  }

  return {
    get agentId() { return agentId; },
    get size() { return entriesByTag.size; },
    get maxTokenLength() {
      let max = 0;
      for (const synthetic of syntheticToTag.keys()) {
        if (synthetic.length > max) max = synthetic.length;
      }
      return max;
    },

    pseudonymize(text, origin, config) {
      const entities = config?.entities ?? DEFAULT_ENTITIES;
      return pseudonymizeText(text, origin, entities);
    },

    applyTokensDeep(value, origin) {
      return walkAndTransform(value, (s) => pseudonymizeText(s, origin, DEFAULT_ENTITIES).sanitized);
    },

    applyTokens(text) {
      // Forward mapping: replace any original values already in the vault with their synthetics.
      let result = text;
      for (const [tag, entry] of entriesByTag) {
        const original = originalByTag.get(tag);
        if (original) result = result.replaceAll(original, entry.synthetic);
      }
      return result;
    },

    rehydrateForDestination(text, dest) {
      return rehydrateText(text, dest);
    },

    rehydrateValueForDestination(value, dest) {
      const allRehydrated: PIIVaultEntry[] = [];
      const allBlocked: PIIVaultEntry[] = [];

      const transformed = walkAndTransform(value, (s) => {
        const r = rehydrateText(s, dest);
        allRehydrated.push(...r.rehydratedTokens);
        allBlocked.push(...r.blockedTokens);
        return r.text;
      });

      return { value: transformed, rehydratedTokens: allRehydrated, blockedTokens: allBlocked };
    },

    rehydrate(text) {
      return rehydrateText(text, null).text;
    },

    getSyntheticsForEntity(entityType) {
      const result: string[] = [];
      for (const entry of entriesByTag.values()) {
        if (entry.entityType === entityType) result.push(entry.synthetic);
      }
      return result;
    },

    getDebugEntries() {
      if (process.env['NODE_ENV'] === 'production') {
        throw new Error('PIIVault.getDebugEntries() is not available in production');
      }
      return [...entriesByTag.values()].map((entry) => ({
        ...entry,
        originalValue: originalByTag.get(entry.tag) ?? '(unknown)',
      }));
    },

    dispose() {
      entriesByTag.clear();
      originalByTag.clear();
      syntheticToTag.clear();
    },
  };
}

