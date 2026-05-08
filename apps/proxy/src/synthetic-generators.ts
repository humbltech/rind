// Synthetic PII value generators.
//
// Produces well-known, officially-reserved placeholder values so LLMs process
// pseudonymized requests naturally. Opaque tokens like <EMAIL_1> confuse models
// (they comment on the tag rather than answering the question). Realistic
// synthetics are echoed back verbatim, enabling reliable rehydration.
//
// All values use officially reserved / permanently invalid ranges:
//   EMAIL    — @example.com  (RFC 2606 §3, reserved for documentation)
//   PHONE    — 555-010-XXXX  (NANP 555-01xx range, reserved for fictional use)
//   SSN      — 000-00-XXXX   (SSA documents 000-xx-xxxx as permanently unassignable)
//   SIN      — 000-000-XXX   (SINs starting with 0 are invalid in Canada)
//   IP       — 192.0.2.X     (RFC 5737 TEST-NET-1, reserved for documentation)
//   IBAN     — keep country prefix, digit-shift account number
//   CREDIT_CARD — 0000-xxxx-xxxx-xxxx (no real network uses 0000 prefix)
//
// Design constraints:
//   - Distinct per occurrence index — N entities → N different synthetics
//   - Deterministic per (entityType, index) — same index always gives same synthetic

import { createHmac } from 'node:crypto';
import type { PiiEntity } from '@rind/core';

// ─── Credential tag derivation ───────────────────────────────────────────────
//
// HMAC-based tag derivation for deterministic credential synthetics.
// Phase 2 will replace these with AES-GCM-SIV ciphertext — same shapes,
// pure swap of the derivation primitive. Public so credential-vault.ts can use them.

/** Derive a per-agent subkey: HMAC-SHA256(masterKey, agentId) */
export function deriveAgentKey(masterKey: Buffer, agentId: string): Buffer {
  return createHmac('sha256', masterKey).update(agentId).digest();
}

/** Derive a 22-char base64url tag from a secret under an agent key. */
export function deriveTag(agentKey: Buffer, secret: string): string {
  return createHmac('sha256', agentKey).update(secret).digest().subarray(0, 16).toString('base64url');
}

// base32-uppercase encoder for cred-003 (AWS access key char class [A-Z0-9]).
// Encodes 16 raw bytes → 26-char base32 string using alphabet A-Z2-7.
function toBase32Upper(rawBytes: Buffer): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0;
  let value = 0;
  let output = '';
  for (let i = 0; i < rawBytes.length; i++) {
    value = (value << 8) | (rawBytes[i] as number);
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      output += alphabet[(value >> bits) & 0x1f];
    }
  }
  if (bits > 0) output += alphabet[(value << (5 - bits)) & 0x1f];
  return output;
}

// ─── Credential synthetic generator ──────────────────────────────────────────

/**
 * Generate a RIND_SYNTH_*-prefixed synthetic value for a detected credential.
 *
 * Every synthetic embeds a `RIND_SYNTH` marker so self-exclusion lookaheads
 * in CREDENTIAL_PATTERNS can suppress re-detection on subsequent passes.
 * The tag suffix is a 22-char base64url derived from HMAC(agentKey, secret),
 * making synthetics deterministic per (agent, secret) and idempotent.
 *
 * @param entityType  credential pattern id, e.g. 'cred-010'
 * @param original    the original matched string (used for shape-preserving generators)
 * @param tag         22-char base64url tag from deriveTag()
 */
export function syntheticCredential(entityType: string, original: string, tag: string): string {
  switch (entityType) {
    case 'cred-001': return `RIND_SYNTH_pw_${tag}`;
    case 'cred-002': return `RIND_SYNTH_ak_${tag}`;
    case 'cred-003': {
      // AWS access key char class is [A-Z0-9] — use base32-uppercase encoding
      const rawTag = Buffer.from(tag, 'base64url');
      return `RIND_SYNTH_AK${toBase32Upper(rawTag)}`;
    }
    case 'cred-004': return `RIND_SYNTH_${tag}`;
    case 'cred-005':
      // PEM block — preserve structural shape; BEGIN line regex matches RSA|EC|OPENSSH|PGP
      // not RIND_SYNTH, so synthetic won't re-match without any extra lookahead.
      return `-----BEGIN RIND_SYNTH PRIVATE KEY-----\nRIND_SYNTH_${tag}\n-----END RIND_SYNTH PRIVATE KEY-----`; // gitleaks:allow
    case 'cred-006': {
      // DB connection string — replace user:pass segment, keep protocol and host.
      const atIdx = original.indexOf('@');
      if (atIdx === -1) return `RIND_SYNTH_${tag}`;
      const slashSlash = original.indexOf('//');
      const proto = slashSlash !== -1 ? original.slice(0, slashSlash + 2) : '';
      const afterAt = original.slice(atIdx);
      return `${proto}RIND_SYNTH_u_${tag}:RIND_SYNTH_p_${tag}${afterAt}`;
    }
    case 'cred-007': return `ghp_RIND_SYNTH_${tag}`;
    case 'cred-008': return `sk-RIND_SYNTH_${tag}`;
    case 'cred-009':
      // JWT requires 3 base64url segments separated by dots.
      // eyJSSU5EX1NZTlRI = base64url('{"RIND_SYNTH') — trivially identifiable.
      return `eyJSSU5EX1NZTlRI.${tag.slice(0, 11)}.${tag.slice(11)}`;
    case 'cred-010': return `rly_RIND_SYNTH_${tag}`;
    default:          return `RIND_SYNTH_${tag}`;
  }
}

// ─── Per-entity PII generators ────────────────────────────────────────────────

function syntheticEmail(tag: string): string {
  // @example.com is RFC 2606 §3 reserved — guaranteed not a real address.
  // Tag suffix gives 2^128 distinct, deterministic per-(agent,value) addresses.
  return `synth+${tag}@example.com`;
}

function syntheticPhone(original: string, tag: string): string {
  // NANP 555-010-XXXX range is permanently reserved for fictional use.
  // Preserve the original formatting separators so the structure looks familiar.
  const tagBytes = Buffer.from(tag, 'base64url');
  const suffix = String((tagBytes.readUInt16BE(0)) % 10000).padStart(4, '0');
  // Detect separator style from the original: dashes, dots, spaces, or none.
  const sep = original.match(/[\s.\-]/)?.[0] ?? '-';
  return `555${sep}010${sep}${suffix}`;
}

function syntheticSsn(tag: string): string {
  // SSA permanently reserves all SSNs with 000 in any group.
  // 000-00-XXXX (4 decimal digits) gives 10 000 distinct invalid SSNs.
  // Entropy caveat: birthday collision at ~117 entries; acceptable for session scope.
  const tagBytes = Buffer.from(tag, 'base64url');
  const suffix = String(tagBytes.readUInt16BE(0) % 10000).padStart(4, '0');
  return `000-00-${suffix}`;
}

function syntheticSin(tag: string): string {
  // Canadian SINs starting with 0 are permanently invalid.
  // 000-000-XXX (3 decimal digits) gives 1 000 distinct invalid SINs.
  const tagBytes = Buffer.from(tag, 'base64url');
  const suffix = String(tagBytes.readUInt16BE(0) % 1000).padStart(3, '0');
  return `000-000-${suffix}`;
}

function syntheticCreditCard(tag: string): string {
  // 0000-prefix cards don't exist in any payment network (all real networks use 3-6
  // as the first digit). Using this prefix lets us exclude 0000-xxxx from the CC regex,
  // ensuring synthetic values are never re-detected as PII in subsequent requests.
  const tagBytes = Buffer.from(tag, 'base64url');
  const n1 = String(tagBytes.readUInt16BE(0) % 10000).padStart(4, '0');
  const n2 = String(tagBytes.readUInt16BE(2) % 10000).padStart(4, '0');
  const n3 = String(tagBytes.readUInt16BE(4) % 10000).padStart(4, '0');
  return `0000-${n1}-${n2}-${n3}`;
}

function syntheticIp(tag: string): string {
  // RFC 5737 §3 TEST-NET-1 (192.0.2.0/24) is reserved for documentation.
  // 192.0.2.1 … 192.0.2.254 give 254 distinct, never-routable addresses.
  const tagBytes = Buffer.from(tag, 'base64url');
  return `192.0.2.${(tagBytes[0]! % 254) + 1}`;
}

function syntheticIban(tag: string): string {
  // XX is not a valid ISO 3166-1 country code; no real IBAN starts with XX.
  // Raw base64url tag (A-Za-z0-9-_) prevents re-match by the IBAN detector regex
  // (\d{7} requirement fails on letters/symbols); XX prefix is additionally
  // excluded by the (?!XX) lookahead in ENTITY_PATTERN_MAP.
  return `XX00${tag}`;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Generate a reserved-range synthetic value for a detected PII entity.
 *
 * Every value:
 *   - Falls in an officially reserved / permanently invalid range for its type
 *   - Is HMAC-deterministic: same (agent, value) → same synthetic across requests
 *   - Is self-excluding: the entity detector patterns skip reserved ranges
 *
 * @param tag  22-char base64url from deriveTag(agentKey, originalValue)
 */
export function generateSyntheticValue(
  entityType: PiiEntity,
  original: string,
  tag: string,
): string {
  switch (entityType) {
    case 'EMAIL':       return syntheticEmail(tag);
    case 'PHONE':       return syntheticPhone(original, tag);
    case 'SSN':         return syntheticSsn(tag);
    case 'SIN':         return syntheticSin(tag);
    case 'CREDIT_CARD': return syntheticCreditCard(tag);
    case 'IP_ADDRESS':  return syntheticIp(tag);
    case 'IBAN':        return syntheticIban(tag);
    // Phase 2 entities require ml_ner — use HMAC tag as a unique placeholder suffix.
    default:            return `[${entityType.toLowerCase().replace(/_/g, '-')}-${tag.slice(0, 8)}]`;
  }
}
