// LLM response content policy evaluator.
//
// Evaluates content-based policy rules against the accumulated LLM response text.
// Only rules with scope:'response' or scope:'both' are considered here.
//
// PSEUDONYMIZE rules are intentionally skipped: vault rehydration (already wired
// into the enriched event path) handles token replacement for scope:'both' rules.
//
// Enforcement semantics by path:
//   Non-streaming — full enforcement: DENY blocks the response before the client
//   receives it; REDACT replaces assistant text in the response body.
//   Streaming — post-hoc only: the stream was already forwarded to the client.
//   Violations are flagged via outcome:'policy-violation' in the response event.

import type {
  PolicyRule,
  LlmDetector,
  ContentInspectionAudit,
  DetectorAuditResult,
} from '@rind/core';
import type { LlmCallEvent } from './types.js';
import { runSecretDetector } from '../../detectors/secret.js';
import { runPIIDetector } from '../../detectors/pii.js';
import { runInjectionDetector } from '../../detectors/injection.js';
import { runDLPDetector } from '../../detectors/dlp.js';
import type { DetectorRunResult } from '../../detectors/types.js';

// ─── Public result type ───────────────────────────────────────────────────────

export interface ResponseContentPolicyResult {
  action: 'ALLOW' | 'DENY' | 'REDACT';
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

// ─── Scope filtering ──────────────────────────────────────────────────────────

function matchesLlmScope(rule: PolicyRule, event: LlmCallEvent): boolean {
  const { llmModel, llmProvider } = rule.match;
  if (llmProvider && !llmProvider.includes(event.provider)) return false;
  if (llmModel) {
    const matchesModel = llmModel.some((pattern) => {
      if (pattern === '*') return true;
      if (pattern.endsWith('*')) return event.model.startsWith(pattern.slice(0, -1));
      return event.model === pattern;
    });
    if (!matchesModel) return false;
  }
  return true;
}

// ─── Detector dispatch ────────────────────────────────────────────────────────

function runDetector(
  detector: LlmDetector,
  rule: PolicyRule,
  text: string,
): DetectorRunResult {
  switch (detector) {
    case 'secret':
      return runSecretDetector(text, rule.secrets ?? {});
    case 'pii':
      return runPIIDetector(text, rule.pii ?? { entities: [] });
    case 'prompt_injection':
      return runInjectionDetector(text, rule.injection ?? {});
    case 'dlp':
      return runDLPDetector(text, rule.dlp ?? { patterns: [] });
  }
}

// ─── Audit builder ────────────────────────────────────────────────────────────

function buildInspection(
  results: DetectorAuditResult[],
  startMs: number,
): ContentInspectionAudit {
  return {
    detectorsRan: [...new Set(results.map((r) => r.detector))],
    results,
    inspectionDurationMs: Date.now() - startMs,
  };
}

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
): Promise<ResponseContentPolicyResult> {
  const startMs = Date.now();

  if (!responseText) {
    return { action: 'ALLOW', inspection: buildInspection([], startMs) };
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
    return { action: 'ALLOW', inspection: buildInspection([], startMs) };
  }

  const auditResults: DetectorAuditResult[] = [];

  for (const rule of responseRules) {
    if (!matchesLlmScope(rule, event)) continue;
    // PSEUDONYMIZE on response: vault.rehydrate() already handles token replacement
    if (rule.action === 'PSEUDONYMIZE') continue;

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
          inspection: buildInspection(auditResults, startMs),
        };
      }

      if (rule.action === 'REDACT') {
        return {
          action: 'REDACT',
          matchedRule: rule.name,
          redactedText: '[REDACTED]',
          inspection: buildInspection(auditResults, startMs),
        };
      }
    }
  }

  return { action: 'ALLOW', inspection: buildInspection(auditResults, startMs) };
}

// ─── Response body patching ───────────────────────────────────────────────────

/**
 * Replace all assistant text content in a non-streaming response body with [REDACTED].
 * Handles Anthropic (content[*].type:'text') and OpenAI (choices[*].message.content).
 * Only called when action is REDACT.
 */
export function patchResponseBodyWithRedaction(body: unknown): unknown {
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
          return { ...(block as object), text: '[REDACTED]' };
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
            return { ...c, message: { ...m, content: '[REDACTED]' } };
          }
        }
        return choice;
      }),
    };
  }

  return body;
}
