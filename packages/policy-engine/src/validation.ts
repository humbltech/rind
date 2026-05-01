// Semantic rule validation — checks beyond what Zod can express.
//
// Zod validates shape: required fields, correct types, valid enum values, regex syntax.
// This module validates meaning: that a rule's action is compatible with its match criteria,
// and that no config is present that can never be reached.
//
// Used at two points:
//   1. Policy file load (startup) — invalid rules abort startup with a clear error
//   2. API save (POST/PUT) — invalid rules are rejected with a 400 before touching the store

import type { PolicyRule } from '@rind/core';
import { classifyRuleCriteria } from './rules.js';

export interface RuleValidationResult {
  valid: boolean;
  errors: string[];   // Must fix — save is rejected
  warnings: string[]; // Should review — save is allowed but operator should investigate
}

/**
 * Validate a single rule for semantic correctness.
 *
 * Catches mismatches that Zod cannot: e.g. PSEUDONYMIZE action on a rule with no
 * content match, or detector configs that can never be reached.
 */
export function validateRuleSemantics(rule: PolicyRule): RuleValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const { hasToolCriteria, hasLlmCriteria } = classifyRuleCriteria(rule.match);

  // PSEUDONYMIZE and REDACT only apply inside the LLM content pipeline.
  // A tool-call rule with these actions can never execute the transformation.
  if (rule.action === 'PSEUDONYMIZE' || rule.action === 'REDACT') {
    if (!rule.match.content) {
      errors.push(
        `action "${rule.action}" requires match.content — this action only applies to LLM content rules (add match.content with detectors, or change the action)`,
      );
    }
  }

  // RATE_LIMIT is meaningless without a rateLimit config block.
  if (rule.action === 'RATE_LIMIT' && !rule.rateLimit) {
    errors.push(`action "RATE_LIMIT" requires a rateLimit config block (add rateLimit.limit and rateLimit.window)`);
  }

  // Loop detection only fires in the tool-call interceptor, never for LLM calls.
  if (rule.loop && hasLlmCriteria && !hasToolCriteria) {
    errors.push(
      `loop condition is only valid for tool call rules — remove llmProvider/llmModel/content from match, or remove the loop condition`,
    );
  }

  // Detector configs without a content match are dead — they are loaded but never consulted.
  if (!rule.match.content) {
    if (rule.pii)       warnings.push(`pii config is present but match.content is not set — the pii config will never be used`);
    if (rule.secrets)   warnings.push(`secrets config is present but match.content is not set — the secrets config will never be used`);
    if (rule.injection) warnings.push(`injection config is present but match.content is not set — the injection config will never be used`);
    if (rule.dlp)       warnings.push(`dlp config is present but match.content is not set — the dlp config will never be used`);
  }

  // A rule that is both tool-specific and LLM-specific is unusual — warn so the
  // operator can confirm this is intentional.
  if (hasToolCriteria && hasLlmCriteria) {
    warnings.push(
      `rule matches both tool calls (tool/toolPattern/parameters) and LLM calls (llmProvider/llmModel/content) — verify this cross-domain rule is intentional`,
    );
  }

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Validate all rules in a policy config.
 * Returns a flat list of errors with the rule name prepended for context.
 * Warnings are returned separately and do not block the load.
 */
export function validateAllRules(rules: PolicyRule[]): {
  errors: string[];
  warnings: string[];
} {
  const allErrors: string[] = [];
  const allWarnings: string[] = [];

  for (const rule of rules) {
    const result = validateRuleSemantics(rule);
    for (const e of result.errors)   allErrors.push(`[${rule.name}] ${e}`);
    for (const w of result.warnings) allWarnings.push(`[${rule.name}] ${w}`);
  }

  return { errors: allErrors, warnings: allWarnings };
}
