// LLM response scanner — scans inbound LLM responses for prompt injection and credentials.
//
// Responsibility: given the accumulated response text from an LLM API call,
// detect injection attempts and credential leaks in the model's output.
//
// Design:
//   - Pure function, no I/O
//   - Reuses CREDENTIAL_PATTERNS and PROMPT_INJECTION_PATTERNS from inspector/response.ts
//   - Called async after stream completes — does NOT block the response
//   - Never throws

import type { LlmThreat } from './types.js';
import { CREDENTIAL_PATTERNS, PROMPT_INJECTION_PATTERNS, REDIRECT_PATTERNS } from '../../inspector/response.js';
import { PII_PATTERNS } from './request-scanner.js';

// ─── Scanner ──────────────────────────────────────────────────────────────────

/**
 * Scan the accumulated LLM response text for threats.
 * Returns an array of detected threats (empty = clean).
 * Never throws — scanning errors are silently dropped.
 */
export function scanLlmResponse(responseText: string | undefined): LlmThreat[] {
  if (!responseText) return [];

  const threats: LlmThreat[] = [];

  try {
    // Prompt injection patterns in the response (model instructed to override)
    for (const { pattern, label, severity } of PROMPT_INJECTION_PATTERNS) {
      if (pattern.test(responseText)) {
        threats.push({
          type: 'INJECTION_IN_RESPONSE',
          severity,
          detail: label,
        });
      }
    }

    // Credentials in the response (model leaking secrets)
    for (const { pattern, label } of CREDENTIAL_PATTERNS) {
      if (pattern.test(responseText)) {
        threats.push({
          type: 'CREDENTIAL_IN_RESPONSE',
          severity: 'critical',
          detail: label,
        });
      }
    }

    // PII in the response (model repeating sensitive data from context)
    for (const { pattern, detail } of PII_PATTERNS) {
      if (pattern.test(responseText)) {
        threats.push({
          type: 'PII_LEAK',
          severity: 'high',
          detail,
        });
      }
    }

    // Suspicious external URLs in the response (potential exfiltration vector)
    for (const { pattern, label } of REDIRECT_PATTERNS) {
      if (pattern.test(responseText)) {
        threats.push({
          type: 'INJECTION_IN_RESPONSE',
          severity: 'medium',
          detail: label,
        });
      }
    }
  } catch {
    // Scanning must never crash — silently drop errors
  }

  return threats;
}
