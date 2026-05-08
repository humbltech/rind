// Shared content evaluation core.
//
// Provides the reusable detector dispatch, audit building, and scope filtering
// used by both the LLM gateway evaluators and (Commit K) the MCP interceptor
// evaluator. Keeps the "single code path" invariant: all layers run the same
// detector → action logic; only text extraction and body transformation differ
// between callers.
//
// NOT imported by evaluators that already have their own matchesLlmScope —
// those are migrated onto matchesContentScope at the same time as this file is created.

import { createCredentialVault } from '../credential-vault.js';
import { createPIIVault } from '../pii-vault.js';
import type { CredentialVault } from '../credential-vault.js';
import type { PIIVault } from '../pii-vault.js';
import type {
  PolicyRule,
  LlmDetector,
  ContentInspectionAudit,
  DetectorAuditResult,
  PiiEntity,
  PIIAuditStats,
} from '@rind/core';
import { runSecretDetector } from '../detectors/secret.js';
import { runPIIDetector } from '../detectors/pii.js';
import { runInjectionDetector } from '../detectors/injection.js';
import { runDLPDetector } from '../detectors/dlp.js';
import type { DetectorRunResult } from '../detectors/types.js';

// ─── Scope filter ─────────────────────────────────────────────────────────────

/**
 * Metadata used to decide whether a policy rule applies to a given event.
 *
 * LLM events: provide agentId + llmModel + llmProvider; leave serverId undefined.
 * MCP events: provide agentId + serverId; leave llmModel/llmProvider undefined.
 * Either path: rules scoped to the OTHER domain are automatically skipped.
 */
export interface ContentScopeFilter {
  agentId: string;
  llmModel?: string;     // undefined for MCP events
  llmProvider?: string;  // undefined for MCP events
  serverId?: string;     // undefined for LLM events → server-scoped rules never match
}

/**
 * Return true if a content rule should be evaluated for the given scope filter.
 *
 * Handles:
 *   - Agent specifier ('*', exact, '!id')
 *   - Server scoping (serverId / serverPattern) — always false for LLM events (no serverId)
 *   - LLM provider + model matching — always true for MCP events (no provider/model)
 */
export function matchesContentScope(rule: PolicyRule, filter: ContentScopeFilter): boolean {
  // Agent specifier — '*' = all; exact; '!id' = all except id
  const agentSpec = rule.agent;
  if (agentSpec !== '*') {
    if (agentSpec.startsWith('!')) {
      if (filter.agentId === agentSpec.slice(1)) return false;
    } else if (agentSpec !== filter.agentId) {
      return false;
    }
  }

  const { serverId: ruleServerIds, serverPattern, llmProvider, llmModel } = rule.match;

  // Server-scoped rules apply to MCP tool calls only.
  // LLM events have no serverId → these rules never match them.
  if ((ruleServerIds && ruleServerIds.length > 0) || serverPattern) {
    if (filter.serverId == null) return false;
    // If a specific server list is set, enforce exact membership
    if (ruleServerIds && ruleServerIds.length > 0 && !ruleServerIds.includes(filter.serverId)) return false;
    // If a glob pattern is set, enforce it
    if (serverPattern && !matchGlob(serverPattern, filter.serverId)) return false;
  }

  // LLM provider/model — skip if rule targets a different provider or model.
  // MCP events supply neither, so these checks are skipped for them.
  if (llmProvider && filter.llmProvider && !llmProvider.includes(filter.llmProvider)) return false;
  if (llmModel && filter.llmModel) {
    const modelLower = filter.llmModel.toLowerCase();
    const matched = llmModel.some((pattern) => {
      if (pattern === '*') return true;
      if (pattern.endsWith('*')) return modelLower.startsWith(pattern.slice(0, -1).toLowerCase());
      return modelLower === pattern.toLowerCase();
    });
    if (!matched) return false;
  }

  return true;
}

function matchGlob(pattern: string, value: string): boolean {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(`^${escaped}$`).test(value);
}

// ─── Detector dispatch ────────────────────────────────────────────────────────

/** Run a single named detector against a flat text string. */
export function runDetector(
  detector: LlmDetector,
  rule: PolicyRule,
  text: string,
): DetectorRunResult {
  switch (detector) {
    case 'secret':          return runSecretDetector(text, rule.secrets ?? {});
    case 'pii':             return runPIIDetector(text, rule.pii ?? { entities: [] });
    case 'prompt_injection': return runInjectionDetector(text, rule.injection ?? {});
    case 'dlp':             return runDLPDetector(text, rule.dlp ?? { patterns: [] });
  }
}

// ─── Audit builder ────────────────────────────────────────────────────────────

/** Build the content inspection audit struct from accumulated detector results. */
export function buildContentInspection(
  results: DetectorAuditResult[],
  startMs: number,
  pseudonymization?: ContentInspectionAudit['pseudonymization'],
): ContentInspectionAudit {
  return {
    detectorsRan: [...new Set(results.map((r) => r.detector))],
    results,
    inspectionDurationMs: Date.now() - startMs,
    pseudonymization,
  };
}

// ─── Flat-text evaluation ─────────────────────────────────────────────────────

/**
 * Result of evaluating a flat text string through the content policy pipeline.
 *
 * The caller is responsible for applying any transformation to the full body:
 *   PSEUDONYMIZE → vault.applyTokensDeep(body) (vault was already populated)
 *   REDACT       → replace the scanned region with redactedText
 *   DENY         → block the request/response
 *   ALLOW        → pass through unchanged
 */
export interface FlatTextEvalResult {
  action: 'ALLOW' | 'DENY' | 'PSEUDONYMIZE' | 'REDACT';
  matchedRule?: string;
  reason?: string;
  /** Which vault was populated (PSEUDONYMIZE only). Caller applies it to the body. */
  vaultUsed?: 'credential' | 'pii';
  /** True when piiVault was created here and caller is responsible for disposal. */
  piiVaultOwned?: boolean;
  /** Replacement text for the scanned portion (REDACT only). */
  redactedText?: string;
  /** PII stats (PSEUDONYMIZE + pii detector only). */
  pseudoStats?: PIIAuditStats;
  /** Synthetic values for PII matches (for audit annotation). */
  syntheticsByEntity?: Array<{ entityType: PiiEntity; synthetics: string[] }>;
  inspection: ContentInspectionAudit;
}

/**
 * Evaluate a pre-extracted flat text string through content policy rules.
 *
 * Rules are filtered by scope and the caller's scope filter (agent/provider/model/server).
 * The first triggered detector determines the action. On PSEUDONYMIZE:
 *   - pii detector: vault.pseudonymize(text, origin) is called to populate the vault;
 *     caller then calls vault.applyTokensDeep(body) to transform the full body.
 *   - secret detector: credVault.pseudonymize(text, origin) is called similarly.
 * On REDACT: the returned redactedText replaces the scanned portion.
 */
export async function evaluateFlatText(
  text: string,
  rules: PolicyRule[],
  scope: 'request' | 'response',
  filter: ContentScopeFilter,
  opts: {
    credVault?: CredentialVault;
    piiVault?: PIIVault;
    origin: { serverId: string; toolName: string };
  },
): Promise<FlatTextEvalResult> {
  const startMs = Date.now();

  const applicable = rules
    .filter((r) => {
      if (r.enabled === false) return false;
      if (r.match.content == null) return false;
      const s = r.match.content.scope;
      if (scope === 'request'  && s === 'response') return false;
      if (scope === 'response' && s === 'request')  return false;
      return true;
    })
    .sort((a, b) => (a.priority ?? 50) - (b.priority ?? 50));

  if (applicable.length === 0 || !text) {
    return { action: 'ALLOW', inspection: buildContentInspection([], startMs) };
  }

  const auditResults: DetectorAuditResult[] = [];

  for (const rule of applicable) {
    if (!matchesContentScope(rule, filter)) continue;

    // Response path: PSEUDONYMIZE rules are skipped — vault rehydration handles them.
    if (scope === 'response' && rule.action === 'PSEUDONYMIZE') continue;

    const content = rule.match.content!;

    for (const detector of content.detectors) {
      const detectorStart = Date.now();
      const res = runDetector(detector, rule, text);
      const detectorMs = Date.now() - detectorStart;

      auditResults.push({
        detector,
        decidedBy: res.stage,
        matchCount: res.matches.length,
        maxConfidence: res.maxConfidence,
        action: res.triggered ? rule.action : 'ALLOW',
        durationMs: detectorMs,
        matches: res.matches,
      });

      if (!res.triggered) continue;

      if (rule.action === 'DENY') {
        return {
          action: 'DENY',
          matchedRule: rule.name,
          reason: `Content policy DENY: ${detector} detector matched (rule: ${rule.name})`,
          inspection: buildContentInspection(auditResults, startMs),
        };
      }

      if (rule.action === 'PSEUDONYMIZE') {
        if (detector === 'pii' && rule.pii) {
          const vaultOwned = opts.piiVault == null;
          const vault = opts.piiVault ?? createPIIVault(filter.agentId);
          const pseudoResult = vault.pseudonymize(text, opts.origin, rule.pii);
          const syntheticsByEntity = pseudoResult.entityTypes.map((et) => ({
            entityType: et,
            synthetics: vault.getSyntheticsForEntity(et),
          }));
          return {
            action: 'PSEUDONYMIZE',
            matchedRule: rule.name,
            vaultUsed: 'pii',
            piiVaultOwned: vaultOwned,
            pseudoStats: pseudoResult.stats,
            syntheticsByEntity,
            inspection: buildContentInspection(auditResults, startMs, pseudoResult.stats),
          };
        }
        if (detector === 'secret') {
          const vault = opts.credVault ?? createCredentialVault(filter.agentId);
          vault.pseudonymize(text, opts.origin);
          if (!opts.credVault) vault.dispose();
          return {
            action: 'PSEUDONYMIZE',
            matchedRule: rule.name,
            vaultUsed: 'credential',
            inspection: buildContentInspection(auditResults, startMs),
          };
        }
        // injection/dlp: no synthetic concept — fall back to REDACT
        return {
          action: 'REDACT',
          matchedRule: rule.name,
          redactedText: '[REDACTED]',
          inspection: buildContentInspection(auditResults, startMs),
        };
      }

      if (rule.action === 'REDACT') {
        if (detector === 'secret') {
          const vault = opts.credVault ?? createCredentialVault(filter.agentId);
          const origin = opts.origin;
          const redactedText = vault.pseudonymize(text, origin).sanitized;
          if (!opts.credVault) vault.dispose();
          return {
            action: 'REDACT',
            matchedRule: rule.name,
            redactedText,
            inspection: buildContentInspection(auditResults, startMs),
          };
        }
        return {
          action: 'REDACT',
          matchedRule: rule.name,
          redactedText: '[REDACTED]',
          inspection: buildContentInspection(auditResults, startMs),
        };
      }

      // ALLOW / RATE_LIMIT / REQUIRE_APPROVAL — treat as ALLOW for content transformation
    }
  }

  return { action: 'ALLOW', inspection: buildContentInspection(auditResults, startMs) };
}
