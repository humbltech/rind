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

// ─── Redaction ─────────────────────────────────────────────────────────────────────────────

/**
 * Replaces matched credential patterns in the output with [REDACTED], preserving the key name.
 * Returns the redacted output and an updated threats array with sanitized: true on any
 * CREDENTIAL_LEAK entries. The original output and threats are not mutated.
 *
 * Used in the MCP response path when a credential is detected but we want to return
 * a sanitized response instead of blocking entirely.
 */
/**
 * Surgically replaces matched credential patterns in a plain string, preserving key names.
 * Example: RAILWAY_TOKEN=railway_prod_abc → RAILWAY_TOKEN=[REDACTED]
 * Used by the LLM content policy to redact credentials from tool_result content.
 */
export function redactCredentialString(text: string): string {
  let result = text;
  for (const { pattern } of CREDENTIAL_PATTERNS) {
    const globalPattern = new RegExp(pattern.source, `${pattern.flags.includes('i') ? 'i' : ''}g`);
    result = result.replace(globalPattern, redactMatch);
  }
  return result;
}

export function redactCredentialsInOutput(
  output: unknown,
  threats: ResponseThreat[],
): { redactedOutput: unknown; threats: ResponseThreat[] } {
  const credentialThreats = threats.filter((t) => t.type === 'CREDENTIAL_LEAK');
  if (credentialThreats.length === 0) return { redactedOutput: output, threats };

  const redactedOutput = redactStrings(output, 0);
  const updatedThreats = threats.map((t) =>
    t.type === 'CREDENTIAL_LEAK' ? { ...t, sanitized: true } : t,
  );
  return { redactedOutput, threats: updatedThreats };
}

function redactMatch(match: string): string {
  // Preserve the key name (everything up to and including the separator = or :),
  // replace just the value portion with [REDACTED].
  const sep = match.search(/[:=]/);
  if (sep === -1) return '[REDACTED]';
  return `${match.slice(0, sep + 1)}[REDACTED]`;
}

function redactStrings(value: unknown, depth: number): unknown {
  if (depth > 5) return value;
  if (typeof value === 'string') {
    let result = value;
    for (const { pattern } of CREDENTIAL_PATTERNS) {
      // Recreate with g flag so multiple occurrences in a single string are all redacted
      const globalPattern = new RegExp(pattern.source, `${pattern.flags.includes('i') ? 'i' : ''}g`);
      result = result.replace(globalPattern, redactMatch);
    }
    return result;
  }
  if (Array.isArray(value)) return value.map((v) => redactStrings(v, depth + 1));
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, redactStrings(v, depth + 1)]),
    );
  }
  return value;
}

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
