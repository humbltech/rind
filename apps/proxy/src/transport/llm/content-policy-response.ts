// LLM response content policy evaluator.
//
// Evaluates content-based policy rules against the accumulated LLM response text.
// Only rules with scope:'response' or scope:'both' are considered here.
//
// PSEUDONYMIZE rules: pii detector pseudonymizes newly-detected PII in the response
// (e.g. LLM-generated entities the client should not see); piiVault is populated so
// step 5c can rehydrate synthetic tokens if they appear in subsequent tool inputs.
// For secret/injection/dlp detectors, PSEUDONYMIZE falls through (vault rehydration
// handles scope:'both' credential rules; injection/dlp have no synthetic concept).
//
// Enforcement semantics by path:
//   Non-streaming — full enforcement: DENY blocks the response before the client
//   receives it; REDACT/PSEUDONYMIZE replaces assistant text in the response body.
//   Streaming — post-hoc only: the stream was already forwarded to the client.
//   Violations are flagged via outcome:'policy-violation' in the response event.

import type {
  PolicyRule,
  ContentInspectionAudit,
  DetectorAuditResult,
} from '@rind/core';
import type { LlmCallEvent } from './types.js';
import type { PIIVault } from '../../pii-vault.js';
import type { CredentialVault } from '../../credential-vault.js';
import { createCredentialVault } from '../../credential-vault.js';
import {
  runDetector,
  buildContentInspection,
  matchesContentScope,
} from '../../policy/evaluate-content.js';

// ─── Public result type ───────────────────────────────────────────────────────

export interface ResponseContentPolicyResult {
  action: 'ALLOW' | 'DENY' | 'REDACT' | 'PSEUDONYMIZE';
  matchedRule?: string;
  reason?: string;
  /**
   * Redacted response text — only present when action is REDACT.
   * Callers should use this value in both the response body and the audit event.
   */
  redactedText?: string;
  /** Safe for audit log — no original content values */
  inspection: ContentInspectionAudit;
}

// (runDetector, buildInspection, matchesLlmScope — now in ../../policy/evaluate-content.ts)

// ─── Main evaluator ───────────────────────────────────────────────────────────

/**
 * Evaluate content-based policy rules against an LLM response text.
 *
 * Only rules with scope:'response' or scope:'both' are evaluated.
 * Rules are sorted by priority (lower = first). The first triggered detector
 * determines the action. PSEUDONYMIZE rules are skipped (vault handles rehydration).
 */
export async function evaluateLlmResponseContent(
  responseText: string,
  event: LlmCallEvent,
  rules: PolicyRule[],
  credVault?: CredentialVault,
  piiVault?: PIIVault,
): Promise<ResponseContentPolicyResult> {
  const startMs = Date.now();

  if (!responseText) {
    return { action: 'ALLOW', inspection: buildContentInspection([], startMs) };
  }

  const responseRules = rules
    .filter((r) => {
      if (r.enabled === false) return false;
      if (r.match.content == null) return false;
      const scope = r.match.content.scope;
      return scope === 'response' || scope === 'both';
    })
    .sort((a, b) => (a.priority ?? 50) - (b.priority ?? 50));

  if (responseRules.length === 0) {
    return { action: 'ALLOW', inspection: buildContentInspection([], startMs) };
  }

  const auditResults: DetectorAuditResult[] = [];

  const scopeFilter = { agentId: event.agentId, llmModel: event.model, llmProvider: event.provider };

  for (const rule of responseRules) {
    if (!matchesContentScope(rule, scopeFilter)) continue;

    const content = rule.match.content!;

    for (const detector of content.detectors) {
      const detectorStart = Date.now();
      const result = runDetector(detector, rule, responseText);
      const detectorMs = Date.now() - detectorStart;

      auditResults.push({
        detector,
        decidedBy: result.stage,
        matchCount: result.matches.length,
        maxConfidence: result.maxConfidence,
        action: result.triggered ? rule.action : 'ALLOW',
        durationMs: detectorMs,
        matches: result.matches,
      });

      if (!result.triggered) continue;

      if (rule.action === 'DENY') {
        return {
          action: 'DENY',
          matchedRule: rule.name,
          reason: `Response content policy DENY: ${detector} detector matched (rule: ${rule.name})`,
          inspection: buildContentInspection(auditResults, startMs),
        };
      }

      if (rule.action === 'PSEUDONYMIZE') {
        // pii detector: pseudonymize newly-detected PII in the response so the
        // client sees a synthetic. piiVault is populated; subsequent tool inputs
        // carrying the synthetic are rehydrated by step 5c.
        if (detector === 'pii' && rule.pii && piiVault) {
          const origin = { serverId: '_llm_response', toolName: 'llm_response' };
          const { sanitized } = piiVault.pseudonymize(responseText, origin, rule.pii);
          return {
            action: 'PSEUDONYMIZE',
            matchedRule: rule.name,
            redactedText: sanitized,
            inspection: buildContentInspection(auditResults, startMs),
          };
        }
        // secret/injection/dlp PSEUDONYMIZE: vault rehydration handles scope:'both'
        // credential rules; injection/dlp have no synthetic concept. Fall through.
        continue;
      }

      if (rule.action === 'REDACT') {
        const origin = { serverId: '_llm_response', toolName: 'llm_response' };
        let redactedText: string;
        if (detector === 'secret') {
          const vaultToUse = credVault ?? createCredentialVault(event.agentId);
          redactedText = vaultToUse.pseudonymize(responseText, origin).sanitized;
          if (!credVault) vaultToUse.dispose();
        } else if (detector === 'pii' && piiVault) {
          // PII REDACT: pseudonymize detected entities (synthetic replaces values,
          // surrounding context preserved). Client sees synthetic, not original PII.
          redactedText = piiVault.pseudonymize(responseText, origin).sanitized;
        } else {
          // injection/dlp: no synthetic concept — replace entire response text.
          redactedText = '[REDACTED]';
        }
        return {
          action: 'REDACT',
          matchedRule: rule.name,
          redactedText,
          inspection: buildContentInspection(auditResults, startMs),
        };
      }
    }
  }

  return { action: 'ALLOW', inspection: buildContentInspection(auditResults, startMs) };
}

// ─── Response body rehydration ────────────────────────────────────────────────

/**
 * Walk every string in the response body and replace pseudonymization tokens
 * with their original values. Inverse of applyPseudonymizeToBody.
 *
 * Accepts any vault with a rehydrate(text) method — both PIIVault and CredentialVault
 * satisfy this shape. Called with each vault separately so credential synthetics and
 * PII synthetics are both resolved before the response reaches the client.
 *
 * Called on the non-streaming response body BEFORE it is sent to the client,
 * and on buffered SSE text for streaming responses. Must run before vault.dispose().
 */
export function rehydrateResponseBody(body: unknown, vault: { rehydrate(text: string): string }): unknown {
  if (typeof body === 'string') return vault.rehydrate(body);
  if (Array.isArray(body)) return body.map((item) => rehydrateResponseBody(item, vault));
  if (typeof body === 'object' && body !== null) {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
      result[key] = rehydrateResponseBody(value, vault);
    }
    return result;
  }
  return body;
}

// ─── Response body patching ───────────────────────────────────────────────────

/**
 * Replace all assistant text content in a non-streaming response body with the provided text.
 * When called from the REDACT path, `replacementText` is the pseudonymized response text
 * (credentials replaced with RIND_SYNTH synthetics, surrounding context preserved).
 * Handles Anthropic (content[*].type:'text') and OpenAI (choices[*].message.content).
 */
export function patchResponseBodyWithRedaction(body: unknown, replacementText = '[REDACTED]'): unknown {
  if (typeof body !== 'object' || body === null) return body;
  const b = body as Record<string, unknown>;

  // Anthropic message format: top-level content array
  if (Array.isArray(b['content'])) {
    return {
      ...b,
      content: b['content'].map((block) => {
        if (
          typeof block === 'object' &&
          block !== null &&
          (block as Record<string, unknown>)['type'] === 'text'
        ) {
          return { ...(block as object), text: replacementText };
        }
        return block;
      }),
    };
  }

  // OpenAI-compatible format: choices[*].message.content
  if (Array.isArray(b['choices'])) {
    return {
      ...b,
      choices: b['choices'].map((choice) => {
        if (typeof choice !== 'object' || choice === null) return choice;
        const c = choice as Record<string, unknown>;
        const msg = c['message'];
        if (typeof msg === 'object' && msg !== null) {
          const m = msg as Record<string, unknown>;
          if (typeof m['content'] === 'string') {
            return { ...c, message: { ...m, content: replacementText } };
          }
        }
        return choice;
      }),
    };
  }

  return body;
}
