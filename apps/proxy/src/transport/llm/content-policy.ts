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
  DetectorMatchAudit,
  PiiEntity,
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
import { redactCredentialString } from '../../inspector/response.js';
import type { CredentialVault } from '../../credential-vault.js';
import { createCredentialVault } from '../../credential-vault.js';

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
          if (typeof block !== 'object' || block === null) continue;
          const b = block as Record<string, unknown>;
          if (b['type'] === 'text') {
            const text = b['text'];
            if (typeof text === 'string') parts.push(text);
          } else if (b['type'] === 'tool_result') {
            // Tool result content: string or array of text blocks
            if (typeof b['content'] === 'string') {
              parts.push(b['content']);
            } else if (Array.isArray(b['content'])) {
              for (const inner of b['content']) {
                if (typeof inner === 'object' && inner !== null &&
                    (inner as Record<string, unknown>)['type'] === 'text') {
                  const t = (inner as Record<string, unknown>)['text'];
                  if (typeof t === 'string') parts.push(t);
                }
              }
            }
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
export function applyPseudonymizeToBody(body: unknown, vault: PIIVault): unknown {
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
  // Agent matching — mirrors matchesAgentSpecifier in packages/policy-engine/src/rules.ts.
  // Must stay in sync: '*' = all, exact = specific agent, '!id' = all EXCEPT that agent.
  // Content rules bypass matchesLlmRule (they come via getContentRules + evaluateLlmContent),
  // so agent filtering must be applied here or it is never applied.
  const agentSpec = rule.agent;
  if (agentSpec !== '*') {
    if (agentSpec.startsWith('!')) {
      if (event.agentId === agentSpec.slice(1)) return false;
    } else if (agentSpec !== event.agentId) {
      return false;
    }
  }

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
  credVault?: CredentialVault,
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

    for (const detector of content.detectors) {
      const detectorStart = Date.now();

      // Run the detector once per target so each match can be tagged with its
      // source role (system/user/assistant). Aggregated into one DetectorAuditResult.
      const taggedMatches: DetectorMatchAudit[] = [];
      let triggered = false;
      let maxConf = 0;
      let decidedByStage: DetectorAuditResult['decidedBy'] = 'regex';

      for (const target of targets) {
        const targetText = extractText(body, [target]);
        if (!targetText) continue;

        const res = runDetector(detector, rule, targetText);
        if (res.triggered) triggered = true;
        if (res.maxConfidence > maxConf) maxConf = res.maxConfidence;
        decidedByStage = res.stage;

        for (const match of res.matches) {
          // For non-PII detectors: optionally include a short excerpt of the
          // triggering target text for debugging false positives in dev/staging.
          // Never for PII — synthetic value is added separately below.
          const excerpt =
            detector !== 'pii' && rule.debugMatchContext
              ? targetText.slice(0, 120) + (targetText.length > 120 ? '…' : '')
              : undefined;

          taggedMatches.push({ ...match, sourceTarget: target, excerpt });
        }
      }

      const detectorMs = Date.now() - detectorStart;
      const auditResult: DetectorAuditResult = {
        detector,
        decidedBy: decidedByStage,
        matchCount: taggedMatches.length,
        maxConfidence: maxConf,
        action: triggered ? rule.action : 'ALLOW',
        durationMs: detectorMs,
        matches: taggedMatches,
      };
      auditResults.push(auditResult);

      if (!triggered) continue;

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
        const vault = createPIIVault(event.agentId);
        // Pseudonymize the combined text of all targets to populate the vault with
        // all entity mappings before applying to the body. Vault deduplicates — the
        // same value across targets gets the same synthetic.
        const flatText = extractText(body, targets);
        const origin = { serverId: '_llm_request', toolName: '_llm_request' };
        const pseudoResult = vault.pseudonymize(flatText, origin, rule.pii);

        // Annotate PII matches with the synthetic values that were generated.
        // syntheticValue is safe to log — it's the reserved-range placeholder, not
        // the original. Admins can see "EMAIL → user1@example.com in user message"
        // to understand and tune the rule without accessing original PII.
        const matchesWithSynthetics = taggedMatches.map((match) => ({
          ...match,
          syntheticValue: vault.getSyntheticsForEntity(match.type as PiiEntity).join(', '),
        }));
        auditResults[auditResults.length - 1] = { ...auditResult, matches: matchesWithSynthetics };

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
        // Use session-scoped vault if provided; otherwise create a temporary one for this call.
        // Determinism guarantees same agentId + same credential → same synthetic in both cases.
        const vaultToUse = credVault ?? createCredentialVault(event.agentId);
        const sanitizedBody = applyRedaction(body, targets, vaultToUse);
        if (!credVault) vaultToUse.dispose();
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
  credVault?: CredentialVault,
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
            if (typeof block !== 'object' || block === null) return block;
            const b2 = block as Record<string, unknown>;
            if (b2['type'] === 'text') {
              const text = b2['text'];
              return { ...b2, text: typeof text === 'string' ? redactString(text) : text };
            }
            // tool_result: replace credentials with RIND_SYNTH synthetics (preserves agent context)
            if (b2['type'] === 'tool_result') {
              const origin = { serverId: '_llm_tool_result', toolName: 'tool_result' };
              if (typeof b2['content'] === 'string') {
                const text = credVault
                  ? credVault.pseudonymize(b2['content'], origin).sanitized
                  : redactCredentialString(b2['content']);
                return { ...b2, content: text };
              }
              if (Array.isArray(b2['content'])) {
                return {
                  ...b2,
                  content: b2['content'].map((inner) => {
                    if (typeof inner === 'object' && inner !== null &&
                        (inner as Record<string, unknown>)['type'] === 'text') {
                      const t = inner as Record<string, unknown>;
                      if (typeof t['text'] === 'string') {
                        const text = credVault
                          ? credVault.pseudonymize(t['text'], origin).sanitized
                          : redactCredentialString(t['text']);
                        return { ...t, text };
                      }
                    }
                    return inner;
                  }),
                };
              }
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
