// Response inspector: scans tool outputs for threats before returning them to
// the agent. The attack surface: a compromised MCP server returns a response
// containing injected instructions, which the agent then follows.
// Ref: OWASP MCP Top 10 — A05 (Prompt Injection via Tool Responses)

import type { ResponseThreat } from '../types.js';
import {
  PROMPT_INJECTION_PATTERNS,
  CREDENTIAL_PATTERNS,
  INDIRECT_INJECTION_PATTERNS,
  REDIRECT_PATTERNS,
} from '../rules/index.js';

export {
  PROMPT_INJECTION_PATTERNS,
  CREDENTIAL_PATTERNS,
  INDIRECT_INJECTION_PATTERNS,
  REDIRECT_PATTERNS,
} from '../rules/index.js';

// ─── Helpers ───────────────────────────────────────────────────────────────────────────────

function extractStrings(value: unknown, depth = 0): string[] {
  if (depth > 5) return [];
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap((v) => extractStrings(v, depth + 1));
  if (value !== null && typeof value === 'object') {
    return Object.values(value as Record<string, unknown>).flatMap((v) =>
      extractStrings(v, depth + 1),
    );
  }
  return [];
}

// ─── Exports ───────────────────────────────────────────────────────────────────────────────

export function inspectResponse(output: unknown): ResponseThreat[] {
  const threats: ResponseThreat[] = [];
  const text = extractStrings(output).join('\n');

  for (const { pattern, label, severity } of PROMPT_INJECTION_PATTERNS) {
    if (pattern.test(text)) {
      threats.push({
        type: 'PROMPT_INJECTION',
        severity,
        pattern: label,
        sanitized: false,
      });
    }
  }

  for (const { pattern, label } of CREDENTIAL_PATTERNS) {
    if (pattern.test(text)) {
      threats.push({
        type: 'CREDENTIAL_LEAK',
        severity: 'critical',
        pattern: label,
        sanitized: false,
      });
    }
  }

  for (const { pattern, label } of REDIRECT_PATTERNS) {
    if (pattern.test(text)) {
      threats.push({
        type: 'SUSPICIOUS_REDIRECT',
        severity: 'medium',
        pattern: label,
        sanitized: false,
      });
    }
  }

  for (const { pattern, label } of INDIRECT_INJECTION_PATTERNS) {
    if (pattern.test(text)) {
      threats.push({
        type: 'INDIRECT_PROMPT_INJECTION',
        severity: 'critical',
        pattern: label,
        sanitized: false,
      });
    }
  }

  return threats;
}
