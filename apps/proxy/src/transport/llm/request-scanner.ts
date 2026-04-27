// LLM request scanner — scans outbound prompts for PII and credentials.
//
// Responsibility: given the messages array from an LLM API request body,
// extract all text content and match it against credential and PII patterns.
//
// Design:
//   - Pure function, no I/O
//   - Reuses CREDENTIAL_PATTERNS from inspector/response.ts
//   - Adds PII patterns (SSN, credit card, phone, email)
//   - Only scans text content — skips image/tool_result blocks (too expensive, low signal)
//   - Large contexts: scans only the last MAX_MESSAGES messages + system prompt

import type { LlmThreat } from './types.js';
import { CREDENTIAL_PATTERNS } from '../../inspector/response.js';

// Maximum number of recent messages to scan (system + this many from the tail)
const MAX_MESSAGES = 20;

// ─── PII patterns ─────────────────────────────────────────────────────────────

export const PII_PATTERNS: Array<{ pattern: RegExp; detail: string }> = [
  {
    // SSN: hyphenated (123-45-6789), space-separated (123 45 6789), or bare (123456789)
    pattern: /\b(?:\d{3}-\d{2}-\d{4}|\d{3} \d{2} \d{4}|\d{9})\b/,
    detail: 'Social Security Number (SSN)',
  },
  {
    // Requires standard card separators (space or dash between groups of 4 digits).
    // Avoids false positives on arbitrary long numeric IDs (order IDs, UUIDs, etc.).
    pattern: /\b\d{4}[- ]\d{4}[- ]\d{4}[- ]\d{2,4}\b/,
    detail: 'potential credit/debit card number',
  },
  {
    pattern: /\b(?:\+?1[-.\s]?)?(?:\(\d{3}\)|\d{3})[-.\s]?\d{3}[-.\s]?\d{4}\b/,
    detail: 'phone number',
  },
  {
    pattern: /\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b/,
    detail: 'email address',
  },
];

// ─── Text extraction ──────────────────────────────────────────────────────────

/**
 * Extract all scannable text from an Anthropic or OpenAI messages array.
 * Handles:
 *   - String content: `{ role, content: "..." }`
 *   - Content block arrays: `{ role, content: [{ type: 'text', text: '...' }] }`
 * Skips image, tool_result, and tool_use blocks.
 */
function extractMessageText(messages: unknown): string {
  if (!Array.isArray(messages)) return '';

  // Always include messages[0] (OpenAI system prompt lives here) plus the last
  // MAX_MESSAGES-1 messages. For short conversations all messages are included anyway.
  const tail = messages.length > MAX_MESSAGES
    ? [messages[0], ...messages.slice(-(MAX_MESSAGES - 1))]
    : messages;
  const parts: string[] = [];

  for (const msg of tail) {
    if (typeof msg !== 'object' || msg === null) continue;
    const m = msg as Record<string, unknown>;

    if (typeof m['content'] === 'string') {
      parts.push(m['content']);
    } else if (Array.isArray(m['content'])) {
      for (const block of m['content']) {
        if (typeof block !== 'object' || block === null) continue;
        const b = block as Record<string, unknown>;
        // Only scan text blocks
        if (b['type'] === 'text' && typeof b['text'] === 'string') {
          parts.push(b['text']);
        }
      }
    }
  }

  return parts.join('\n');
}

/**
 * Extract the system prompt text from a request body.
 * Handles both string and content-block-array formats (Anthropic).
 */
function extractSystemText(body: unknown): string {
  if (typeof body !== 'object' || body === null) return '';
  const b = body as Record<string, unknown>;
  const system = b['system'];

  if (typeof system === 'string') return system;
  if (Array.isArray(system)) {
    return system
      .filter((block): block is { type: string; text: string } =>
        typeof block === 'object' && block !== null &&
        (block as Record<string, unknown>)['type'] === 'text' &&
        typeof (block as Record<string, unknown>)['text'] === 'string',
      )
      .map((block) => block.text)
      .join('\n');
  }
  return '';
}

// ─── Scanner ──────────────────────────────────────────────────────────────────

/**
 * Scan an LLM request body for PII and credentials in the outbound prompt.
 * Returns an array of detected threats (empty = clean).
 * Never throws — scanning errors are silently dropped.
 */
export function scanLlmRequest(body: unknown): LlmThreat[] {
  const threats: LlmThreat[] = [];

  try {
    const b = body as Record<string, unknown> | null;
    if (!b || typeof b !== 'object') return threats;

    const systemText = extractSystemText(body);
    const messageText = extractMessageText(b['messages']);
    const fullText = [systemText, messageText].filter(Boolean).join('\n');

    if (!fullText) return threats;

    // Credential patterns (shared with tool response scanner)
    for (const { pattern, label } of CREDENTIAL_PATTERNS) {
      if (pattern.test(fullText)) {
        threats.push({
          type: 'CREDENTIAL_IN_PROMPT',
          severity: 'critical',
          detail: label,
        });
      }
    }

    // PII patterns
    for (const { pattern, detail } of PII_PATTERNS) {
      if (pattern.test(fullText)) {
        threats.push({
          type: 'PII_LEAK',
          severity: 'high',
          detail,
        });
      }
    }
  } catch {
    // Scanning must never crash — silently drop errors
  }

  return threats;
}
