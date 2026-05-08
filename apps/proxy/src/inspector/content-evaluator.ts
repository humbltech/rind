// MCP content policy evaluator.
//
// Thin wrapper around evaluateFlatText (policy/evaluate-content.ts) for the
// MCP tool response path. Handles the MCP-specific concern: the "body" is an
// arbitrary JSON-serializable value (tool output), not a structured LLM message.
//
// For PSEUDONYMIZE: evaluateFlatText populates the vault; this wrapper applies
// the forward mapping to the full output via vault.applyTokensDeep().
// For REDACT+secret: same two-step flow — vault populated then applyTokensDeep.
// For REDACT+other (injection/dlp): deep-walks the output and blanks all strings.

import type { ToolCallEvent, PolicyRule, ContentInspectionAudit } from '../types.js';
import type { CredentialVault } from '../credential-vault.js';
import type { PIIVault } from '../pii-vault.js';
import { evaluateFlatText, type ContentScopeFilter } from '../policy/evaluate-content.js';

export interface McpContentEvalResult {
  action: 'ALLOW' | 'DENY' | 'PSEUDONYMIZE' | 'REDACT';
  matchedRule?: string;
  reason?: string;
  /** Transformed output — present when action is PSEUDONYMIZE or REDACT. */
  transformedOutput?: unknown;
  inspection: ContentInspectionAudit;
}

function extractStrings(value: unknown): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(extractStrings).join('\n');
  if (value !== null && typeof value === 'object') {
    return Object.values(value as Record<string, unknown>).map(extractStrings).join('\n');
  }
  return '';
}

function redactDeep(value: unknown): unknown {
  if (typeof value === 'string') return value ? '[REDACTED]' : value;
  if (Array.isArray(value)) return value.map(redactDeep);
  if (value !== null && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      result[k] = redactDeep(v);
    }
    return result;
  }
  return value;
}

/**
 * Evaluate content-based policy rules against an MCP tool response output.
 *
 * Rules with scope:'request' are skipped (response pass only).
 * Applies the same detector → action matrix as the LLM evaluators:
 *   DENY → block the response
 *   PSEUDONYMIZE/REDACT+secret → vault-populated synthetic substitution via applyTokensDeep
 *   REDACT+other → blank all strings (injection/dlp: no synthetic concept)
 *   ALLOW → pass through unchanged
 */
export async function evaluateMcpResponseContent(
  output: unknown,
  event: ToolCallEvent,
  rules: PolicyRule[],
  credVault: CredentialVault,
  piiVault: PIIVault,
): Promise<McpContentEvalResult> {
  const flatText = extractStrings(output);
  const filter: ContentScopeFilter = { agentId: event.agentId, serverId: event.serverId };
  const origin = { serverId: event.serverId, toolName: event.toolName };

  const result = await evaluateFlatText(flatText, rules, 'response', filter, {
    credVault,
    piiVault,
    origin,
  });

  if (result.action === 'DENY') {
    return {
      action: 'DENY',
      matchedRule: result.matchedRule,
      reason: result.reason,
      inspection: result.inspection,
    };
  }

  if (result.action === 'PSEUDONYMIZE') {
    const transformedOutput =
      result.vaultUsed === 'pii'
        ? piiVault.applyTokensDeep(output, origin)
        : credVault.applyTokensDeep(output, origin);
    return {
      action: 'PSEUDONYMIZE',
      matchedRule: result.matchedRule,
      transformedOutput,
      inspection: result.inspection,
    };
  }

  if (result.action === 'REDACT') {
    // vaultUsed:'credential' → credVault was populated during evaluateFlatText;
    // apply forward mapping to the full output tree.
    // No vaultUsed → injection/dlp detector; no synthetic concept, blank all strings.
    const transformedOutput =
      result.vaultUsed === 'credential'
        ? credVault.applyTokensDeep(output, origin)
        : redactDeep(output);
    return {
      action: 'REDACT',
      matchedRule: result.matchedRule,
      transformedOutput,
      inspection: result.inspection,
    };
  }

  return { action: 'ALLOW', inspection: result.inspection };
}
