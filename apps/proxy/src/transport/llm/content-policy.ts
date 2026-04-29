// LLM content policy evaluator.
//
// Evaluates content-based policy rules (rules with match.content) against an
// LLM request body. Runs AFTER passive scanning and BEFORE metadata policy.
// May block the request or return a mutated body (pseudonymized / redacted).
//
// Separate from policyEngine.evaluateLlm because:
//   - Operates on the raw request body, not just event metadata
//   - Potentially async (future: llm_judge stage)
//   - Produces mutations (sanitized body, vault reference)
//
// Scope semantics:
//   - scope:'request' — evaluate during this pre-forward call (default)
//   - scope:'response' — skip here; response evaluation is Phase 2
//   - scope:'both' — evaluate during this call; Phase 2 adds response pass

import type {
  PolicyRule,
  LlmDetector,
  ContentInspectionAudit,
  DetectorAuditResult,
  PolicyAction,
} from '@rind/core';
import type { LlmCallEvent } from './types.js';
import type { PIIVault } from '../../pii-vault.js';
import { createPIIVault } from '../../pii-vault.js';
import { runSecretDetector } from '../../detectors/secret.js';
import { runPIIDetector } from '../../detectors/pii.js';
import { runInjectionDetector } from '../../detectors/injection.js';
import { runDLPDetector } from '../../detectors/dlp.js';
import type { DetectorRunResult } from '../../detectors/types.js';

// ─── Public result type ───────────────────────────────────────────────────────

export interface ContentPolicyResult {
  action: 'ALLOW' | 'DENY' | 'PSEUDONYMIZE' | 'REDACT';
  matchedRule?: string;
  reason?: string;
  /**
   * Request body to forward to upstream.
   * Identical to input when action is ALLOW.
   * Contains tokenized text when action is PSEUDONYMIZE.
   * Contains [REDACTED] substitutions when action is REDACT.
   */
  sanitizedBody: unknown;
  /**
   * Active vault instance — only present when action is PSEUDONYMIZE.
   * Caller must call vault.rehydrate(responseText) then vault.dispose().
   */
  vault?: PIIVault;
  /** Safe for main audit log — no original PII values */
  inspection: ContentInspectionAudit;
}

// ─── Text extraction ──────────────────────────────────────────────────────────

/**
 * Extract all text from an LLM request body targeting the specified roles.
 * Returns a flat string for scanning.
 */
function extractText(
  body: unknown,
  targets: ('system' | 'user' | 'assistant')[],
): string {
  if (typeof body !== 'object' || body === null) return '';
  const b = body as Record<string, unknown>;
  const parts: string[] = [];

  // System prompt (Anthropic format: string or content block array)
  if (targets.includes('system') && b['system']) {
    if (typeof b['system'] === 'string') {
      parts.push(b['system']);
    } else if (Array.isArray(b['system'])) {
      for (const block of b['system']) {
        if (typeof block === 'object' && block !== null &&
            (block as Record<string, unknown>)['type'] === 'text') {
          const text = (block as Record<string, unknown>)['text'];
          if (typeof text === 'string') parts.push(text);
        }
      }
    }
  }

  // Messages array
  if (Array.isArray(b['messages'])) {
    for (const msg of b['messages']) {
      if (typeof msg !== 'object' || msg === null) continue;
      const m = msg as Record<string, unknown>;
      const role = m['role'] as string | undefined;
      if (!role || !targets.includes(role as 'system' | 'user' | 'assistant')) continue;

      if (typeof m['content'] === 'string') {
        parts.push(m['content']);
      } else if (Array.isArray(m['content'])) {
        for (const block of m['content']) {
          if (typeof block === 'object' && block !== null &&
              (block as Record<string, unknown>)['type'] === 'text') {
            const text = (block as Record<string, unknown>)['text'];
            if (typeof text === 'string') parts.push(text);
          }
        }
      }
    }
  }

  return parts.join('\n');
}

// ─── Body mutation helpers ────────────────────────────────────────────────────

/**
 * Apply pseudonymization tokens throughout the body structure.
 * Walks every string field and replaces original PII values with vault tokens.
 * Uses vault.applyTokens() which reads the internal forward map — safe in production.
 *
 * Intentionally walks the entire body, not just the fields in content.targets.
 * Once a value is identified as PII anywhere in the scanned targets, removing it
 * from the entire forwarded body is the safer choice — we don't want the same
 * email to appear tokenized in one message block but plain in another field.
 */
function applyPseudonymizeToBody(body: unknown, vault: PIIVault): unknown {
  if (typeof body === 'string') {
    return vault.applyTokens(body);
  }
  if (Array.isArray(body)) {
    return body.map((item) => applyPseudonymizeToBody(item, vault));
  }
  if (typeof body === 'object' && body !== null) {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
      result[key] = applyPseudonymizeToBody(value, vault);
    }
    return result;
  }
  return body;
}

// ─── Scope helpers ────────────────────────────────────────────────────────────

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
  pseudoStats?: ContentInspectionAudit['pseudonymization'],
): ContentInspectionAudit {
  return {
    detectorsRan: [...new Set(results.map((r) => r.detector))],
    results,
    inspectionDurationMs: Date.now() - startMs,
    pseudonymization: pseudoStats,
  };
}

// ─── Main evaluator ───────────────────────────────────────────────────────────

/**
 * Evaluate content-based policy rules against an LLM request body.
 *
 * Rules are sorted by priority (lower = first). The first rule whose detectors
 * trigger determines the action. Rules without match.content are ignored.
 * Rules with scope:'response' are skipped here (response pass is Phase 2).
 */
export async function evaluateLlmContent(
  body: unknown,
  event: LlmCallEvent,
  rules: PolicyRule[],
): Promise<ContentPolicyResult> {
  const startMs = Date.now();

  const contentRules = rules
    .filter((r) => r.enabled !== false && r.match.content != null)
    .sort((a, b) => (a.priority ?? 50) - (b.priority ?? 50));

  if (contentRules.length === 0) {
    return {
      action: 'ALLOW',
      sanitizedBody: body,
      inspection: buildInspection([], startMs),
    };
  }

  const auditResults: DetectorAuditResult[] = [];

  for (const rule of contentRules) {
    if (!matchesLlmScope(rule, event)) continue;

    const content = rule.match.content!;

    // scope:'response' — skip at request time; response evaluation is Phase 2.
    // scope:'request' and scope:'both' — evaluate against the request body here.
    if (content.scope === 'response') continue;

    const targets = content.targets ?? ['system', 'user', 'assistant'];
    const text = extractText(body, targets);

    if (!text) continue;

    for (const detector of content.detectors) {
      const detectorStart = Date.now();
      const result = runDetector(detector, rule, text);
      const detectorMs = Date.now() - detectorStart;

      const auditResult: DetectorAuditResult = {
        detector,
        decidedBy: result.stage,
        matchCount: result.matches.length,
        maxConfidence: result.maxConfidence,
        action: result.triggered ? rule.action : 'ALLOW',
        durationMs: detectorMs,
        matches: result.matches,
      };
      auditResults.push(auditResult);

      if (!result.triggered) continue;

      // First triggered detector determines the action
      if (rule.action === 'DENY') {
        return {
          action: 'DENY',
          matchedRule: rule.name,
          reason: `Content policy DENY: ${detector} detector matched (rule: ${rule.name})`,
          sanitizedBody: body,
          inspection: buildInspection(auditResults, startMs),
        };
      }

      if (rule.action === 'PSEUDONYMIZE' && detector === 'pii' && rule.pii) {
        const vault = createPIIVault(event.id);
        const pseudoResult = vault.pseudonymize(text, rule.pii);
        const sanitizedBody = applyPseudonymizeToBody(body, vault);
        return {
          action: 'PSEUDONYMIZE',
          matchedRule: rule.name,
          sanitizedBody,
          vault,
          inspection: buildInspection(auditResults, startMs, pseudoResult.stats),
        };
      }

      if (rule.action === 'REDACT') {
        const sanitizedBody = applyRedaction(body, targets);
        return {
          action: 'REDACT',
          matchedRule: rule.name,
          sanitizedBody,
          inspection: buildInspection(auditResults, startMs),
        };
      }

      // ALLOW/RATE_LIMIT/REQUIRE_APPROVAL on content rules — treat as ALLOW for body mutation
      // (enforcement handled by metadata policy engine for REQUIRE_APPROVAL/RATE_LIMIT)
    }
  }

  return {
    action: 'ALLOW',
    sanitizedBody: body,
    inspection: buildInspection(auditResults, startMs),
  };
}

// ─── Redaction helper ─────────────────────────────────────────────────────────

function redactString(text: string): string {
  // Whole-field replacement — avoids leaking line count via /.+/g per-line replacement.
  return text ? '[REDACTED]' : text;
}

function applyRedaction(
  body: unknown,
  targets: ('system' | 'user' | 'assistant')[],
): unknown {
  if (typeof body !== 'object' || body === null) return body;
  const b = body as Record<string, unknown>;
  const result: Record<string, unknown> = { ...b };

  if (targets.includes('system')) {
    if (typeof result['system'] === 'string') {
      result['system'] = redactString(result['system']);
    } else if (Array.isArray(result['system'])) {
      // Anthropic API supports system as an array of content blocks
      result['system'] = result['system'].map((block) => {
        if (typeof block === 'object' && block !== null &&
            (block as Record<string, unknown>)['type'] === 'text') {
          const b2 = block as Record<string, unknown>;
          const text = b2['text'];
          return { ...b2, text: typeof text === 'string' ? redactString(text) : text };
        }
        return block;
      });
    }
  }

  if (Array.isArray(result['messages'])) {
    result['messages'] = result['messages'].map((msg) => {
      if (typeof msg !== 'object' || msg === null) return msg;
      const m = msg as Record<string, unknown>;
      const role = m['role'] as string | undefined;
      if (!role || !targets.includes(role as 'system' | 'user' | 'assistant')) return msg;

      if (typeof m['content'] === 'string') {
        return { ...m, content: redactString(m['content']) };
      }
      if (Array.isArray(m['content'])) {
        return {
          ...m,
          content: m['content'].map((block) => {
            if (typeof block === 'object' && block !== null &&
                (block as Record<string, unknown>)['type'] === 'text') {
              const b2 = block as Record<string, unknown>;
              const text = b2['text'];
              return { ...b2, text: typeof text === 'string' ? redactString(text) : text };
            }
            return block;
          }),
        };
      }
      return msg;
    });
  }

  return result;
}
