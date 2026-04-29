// LLM PII patterns — detects personally identifiable information in outbound
// LLM prompts before they are forwarded to upstream model APIs.
// Used by the LLM request scanner to prevent unintentional PII leakage.
//
// Pattern count: 4
// Last updated: 2026-04-29

// Compile-time-checked IDs — any piiPatternById() call with a string not in this
// union will be caught by TypeScript before the runtime throw ever fires.
export type LlmPiiPatternId = 'llm-pii-001' | 'llm-pii-002' | 'llm-pii-003' | 'llm-pii-004';

export interface LlmPiiPattern {
  id: LlmPiiPatternId;
  pattern: RegExp;
  detail: string;
  description: string;
}

export const LLM_PII_PATTERNS: LlmPiiPattern[] = [
  {
    id: 'llm-pii-001',
    // SSN: hyphenated (123-45-6789), space-separated (123 45 6789), or bare (123456789)
    pattern: /\b(?:\d{3}-\d{2}-\d{4}|\d{3} \d{2} \d{4}|\d{9})\b/,
    detail: 'Social Security Number (SSN)',
    description: 'Detects US Social Security Numbers in hyphenated, space-separated, or bare formats',
  },
  {
    id: 'llm-pii-002',
    // Requires standard card separators (space or dash between groups of 4 digits).
    // Avoids false positives on arbitrary long numeric IDs (order IDs, UUIDs, etc.).
    pattern: /\b\d{4}[- ]\d{4}[- ]\d{4}[- ]\d{2,4}\b/,
    detail: 'potential credit/debit card number',
    description: 'Detects credit/debit card numbers in standard grouped formats (requires separators to reduce false positives)',
  },
  {
    id: 'llm-pii-003',
    pattern: /\b(?:\+?1[-.\s]?)?(?:\(\d{3}\)|\d{3})[-.\s]?\d{3}[-.\s]?\d{4}\b/,
    detail: 'phone number',
    description: 'Detects North American phone numbers in common formats',
  },
  {
    id: 'llm-pii-004',
    pattern: /\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b/,
    detail: 'email address',
    description: 'Detects email addresses',
  },
];

// Re-export as PII_PATTERNS for backward compatibility with request-scanner.ts
export const PII_PATTERNS = LLM_PII_PATTERNS;

/**
 * Look up a PII pattern by its stable ID.
 * Throws at module-load time if the ID is not found (fast fail, not a silent bug).
 * Prefer this over positional indexing — IDs are stable across array reordering.
 */
export function piiPatternById(id: LlmPiiPatternId): RegExp {
  const p = LLM_PII_PATTERNS.find((entry) => entry.id === id);
  if (!p) throw new Error(`llm-pii-patterns: pattern '${id}' not found — was it renamed or removed?`);
  return p.pattern;
}
