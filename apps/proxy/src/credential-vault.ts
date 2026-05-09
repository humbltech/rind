// Credential Vault — session-scoped pseudonymization and rehydration for credentials.
//
// Replaces detected credential values (tokens, API keys, passwords, etc.) in upstream
// tool responses with deterministic RIND_SYNTH_*-prefixed synthetic values so agents
// never see real credentials. When the agent later passes a synthetic back in a tool
// input, the vault rehydrates it to the real value before forwarding upstream.
//
// Design:
//   - Synthetics are HMAC-SHA256-derived (deterministic per agent+secret, idempotent)
//   - Rehydration is destination-scoped: a credential is only unwrapped when forwarding
//     to the same server that originally surfaced it (prevents cross-server exfiltration)
//   - Lifetime = session; disposed on session.kill() / sessionStore.reset()
//   - Real credential values never written to logs; debug API is non-production only
//
// Phase 2: replace HMAC tag derivation with AES-GCM-SIV ciphertext — same interface,
// same synthetic shape, same call sites. Only the inner deriveTag / lookup changes.

import { randomBytes } from 'node:crypto';
import { deriveAgentKey, deriveTag, syntheticCredential } from './synthetic-generators.js';
import { CREDENTIAL_PATTERNS } from './rules/index.js';

// Module-level master key: generated once at process start, shared across all vaults.
// Per-agent isolation is cryptographic (HMAC subkey derivation), not scoping.
const MASTER_KEY: Buffer = randomBytes(32);

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CredentialVaultEntry {
  tag: string;
  synthetic: string;
  entityType: string;
  originServerId: string;
  originToolName: string;
  allowedDestinations: Set<string>; // serverId allowlist; rehydration blocked outside this set
  detectedAt: number;
}

export interface PseudonymizeResult {
  sanitized: string;
  count: number;
  types: string[];
}

export interface RehydrateResult {
  text: string;
  rehydratedTokens: CredentialVaultEntry[];
  blockedTokens: CredentialVaultEntry[];
}

export interface RehydrateValueResult {
  value: unknown;
  rehydratedTokens: CredentialVaultEntry[];
  blockedTokens: CredentialVaultEntry[];
}

export interface CredentialVault {
  /** Detect credentials in text, replace with synthetics, populate the vault. */
  pseudonymize(text: string, origin: { serverId: string; toolName: string }): PseudonymizeResult;
  /** Walk an object tree, apply forward mapping (original→synthetic) for already-vaulted credentials. */
  applyTokensDeep(value: unknown, origin: { serverId: string; toolName: string }): unknown;
  /** Replace synthetics in text with originals, scoped to dest.serverId. */
  rehydrateForDestination(text: string, dest: { serverId: string; toolName: string }): RehydrateResult;
  /** Walk an object tree, rehydrate synthetics scoped to dest.serverId. */
  rehydrateValueForDestination(value: unknown, dest: { serverId: string; toolName: string }): RehydrateValueResult;
  /**
   * Unconditionally replace all credential synthetics in text with their originals.
   * No destination scoping — used for LLM response rehydration where we're returning
   * to the agent that already holds the synthetics (destination scoping enforced at
   * step 5b for MCP tool call inputs instead).
   */
  rehydrate(text: string): string;
  getDebugEntries(): Array<CredentialVaultEntry & { originalValue: string }>;
  readonly maxTokenLength: number;
  dispose(): void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Extract the value portion of a keyed pattern match ("key=value" → "value").
// Mirrors redactMatch() in inspector/response.ts.
function extractValue(match: string): { prefix: string; value: string } {
  const sep = match.search(/[:=]/);
  if (sep === -1) return { prefix: '', value: match };
  return { prefix: match.slice(0, sep + 1), value: match.slice(sep + 1) };
}

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

export function createCredentialVault(agentId: string): CredentialVault {
  const agentKey = deriveAgentKey(MASTER_KEY, agentId);

  // tag → { entry, originalValue }
  // originalValue deliberately kept separate (never logged, debug-only)
  const entriesByTag = new Map<string, CredentialVaultEntry>();
  const originalByTag = new Map<string, string>(); // tag → original (plain) value
  // synthetic → tag (reverse lookup for rehydration)
  const syntheticToTag = new Map<string, string>();

  function pseudonymizeText(text: string, origin: { serverId: string; toolName: string }): PseudonymizeResult {
    let result = text;
    const foundTypes = new Set<string>();
    let count = 0;

    for (const { id, pattern } of CREDENTIAL_PATTERNS) {
      const globalPattern = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g');
      const matches = [...result.matchAll(globalPattern)];

      for (const match of matches) {
        const fullMatch = match[0];
        if (!fullMatch) continue;

        const { prefix, value: originalValue } = extractValue(fullMatch);

        const tag = deriveTag(agentKey, originalValue);
        const synthetic = syntheticCredential(id, originalValue, tag);

        let entry = entriesByTag.get(tag);
        if (!entry) {
          entry = {
            tag,
            synthetic,
            entityType: id,
            originServerId: origin.serverId,
            originToolName: origin.toolName,
            allowedDestinations: new Set([origin.serverId]),
            detectedAt: Date.now(),
          };
          entriesByTag.set(tag, entry);
          originalByTag.set(tag, originalValue);
          syntheticToTag.set(synthetic, tag);
          count++;
        } else {
          // Widen allowedDestinations if re-encountered from a different (but already-known) origin.
          entry.allowedDestinations.add(origin.serverId);
        }

        result = result.replaceAll(fullMatch, `${prefix}${synthetic}`);
        foundTypes.add(id);
      }
    }

    return { sanitized: result, count, types: [...foundTypes] };
  }

  function rehydrateText(text: string, dest: { serverId: string; toolName: string }): RehydrateResult {
    let result = text;
    const rehydratedTokens: CredentialVaultEntry[] = [];
    const blockedTokens: CredentialVaultEntry[] = [];

    for (const [synthetic, tag] of syntheticToTag) {
      if (!result.includes(synthetic)) continue;

      const entry = entriesByTag.get(tag);
      if (!entry) continue;

      if (entry.allowedDestinations.has(dest.serverId)) {
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
    pseudonymize(text, origin) {
      return pseudonymizeText(text, origin);
    },

    applyTokensDeep(value, origin) {
      return walkAndTransform(value, (s) => pseudonymizeText(s, origin).sanitized);
    },

    rehydrateForDestination(text, dest) {
      return rehydrateText(text, dest);
    },

    rehydrateValueForDestination(value, dest) {
      const allRehydrated: CredentialVaultEntry[] = [];
      const allBlocked: CredentialVaultEntry[] = [];

      const transformed = walkAndTransform(value, (s) => {
        const r = rehydrateText(s, dest);
        allRehydrated.push(...r.rehydratedTokens);
        allBlocked.push(...r.blockedTokens);
        return r.text;
      });

      return { value: transformed, rehydratedTokens: allRehydrated, blockedTokens: allBlocked };
    },

    rehydrate(text) {
      let result = text;
      for (const [synthetic, tag] of syntheticToTag) {
        if (!result.includes(synthetic)) continue;
        const original = originalByTag.get(tag);
        if (original) result = result.replaceAll(synthetic, original);
      }
      return result;
    },

    getDebugEntries() {
      if (process.env['NODE_ENV'] === 'production') {
        throw new Error('CredentialVault.getDebugEntries() is not available in production');
      }
      return [...entriesByTag.values()].map((entry) => ({
        ...entry,
        originalValue: originalByTag.get(entry.tag) ?? '(unknown)',
      }));
    },

    get maxTokenLength() {
      let max = 0;
      for (const synthetic of syntheticToTag.keys()) {
        if (synthetic.length > max) max = synthetic.length;
      }
      return max;
    },

    dispose() {
      entriesByTag.clear();
      originalByTag.clear();
      syntheticToTag.clear();
    },
  };
}
