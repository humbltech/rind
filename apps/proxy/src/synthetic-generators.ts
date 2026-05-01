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

import type { PiiEntity } from '@rind/core';

// ─── Per-entity generators ────────────────────────────────────────────────────

function syntheticEmail(index: number): string {
  // @example.com is RFC 2606 §3 reserved — guaranteed not a real address.
  // user1@example.com … user999@example.com give 999 distinct, obviously-fake addresses.
  return `user${index + 1}@example.com`;
}

function syntheticPhone(original: string, index: number): string {
  // NANP 555-010-XXXX range is permanently reserved for fictional use.
  // Preserve the original formatting separators so the structure looks familiar.
  const suffix = String((index * 7 + 1) % 10000).padStart(4, '0');
  // Detect separator style from the original: dashes, dots, spaces, or none.
  const sep = original.match(/[\s.\-]/)?.[0] ?? '-';
  return `555${sep}010${sep}${suffix}`;
}

function syntheticSsn(index: number): string {
  // SSA permanently reserves all SSNs with 000 in any group.
  // 000-00-XXXX (padded to 4 digits) gives 10 000 distinct invalid SSNs.
  const suffix = String(index + 1).padStart(4, '0');
  return `000-00-${suffix}`;
}

function syntheticSin(index: number): string {
  // Canadian SINs starting with 0 are permanently invalid.
  // 000-000-XXX (padded) gives 1 000 distinct invalid SINs.
  const suffix = String(index + 1).padStart(3, '0');
  return `000-000-${suffix}`;
}

function syntheticCreditCard(index: number): string {
  // 0000-prefix cards don't exist in any payment network (all real networks use 3-6
  // as the first digit). Using this prefix lets us exclude 0000-xxxx from the CC regex,
  // ensuring synthetic values are never re-detected as PII in subsequent requests.
  const n = String(index + 1).padStart(12, '0');
  return `0000-${n.slice(0, 4)}-${n.slice(4, 8)}-${n.slice(8, 12)}`;
}

function syntheticIp(index: number): string {
  // RFC 5737 §3 TEST-NET-1 (192.0.2.0/24) is reserved for documentation.
  // 192.0.2.1 … 192.0.2.254 give 254 distinct, never-routable addresses.
  return `192.0.2.${(index % 254) + 1}`;
}

function syntheticIban(original: string, index: number): string {
  // Keep the 4-char country+check prefix (e.g. "GB29") so the LLM knows the
  // country of origin and doesn't flag the value as structurally wrong.
  const prefix = original.slice(0, 4);
  const shift = (index * 6 + 5) % 9 + 1; // always 1–9
  const shifted = original.slice(4).replace(/\d/g, (d) => ((parseInt(d, 10) + shift) % 10).toString());
  return prefix + shifted;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Generate a reserved-range synthetic value for a detected PII entity.
 *
 * Every value:
 *   - Falls in an officially reserved / permanently invalid range for its type
 *   - Is indexed so N occurrences produce N distinct synthetics
 *   - Is deterministic per (entityType, index) — replay always produces the same value
 */
export function generateSyntheticValue(
  entityType: PiiEntity,
  original: string,
  index: number,
): string {
  switch (entityType) {
    case 'EMAIL':       return syntheticEmail(index);
    case 'PHONE':       return syntheticPhone(original, index);
    case 'SSN':         return syntheticSsn(index);
    case 'SIN':         return syntheticSin(index);
    case 'CREDIT_CARD': return syntheticCreditCard(index);
    case 'IP_ADDRESS':  return syntheticIp(index);
    case 'IBAN':        return syntheticIban(original, index);
    // Phase 2 entities require ml_ner — labelled placeholder still reads more
    // naturally than an opaque token, reducing LLM confusion.
    default:            return `[Redacted ${entityType.toLowerCase().replace(/_/g, ' ')} ${index + 1}]`;
  }
}
