// Policy evaluation engine: evaluates tool call events against loaded policy rules.
// Rules are sorted by priority (ascending) — lower priority number = evaluated first.
// Within the same priority, insertion order is preserved. Default action is ALLOW.
//
// The engine reads from a PolicyStore (D-021) and caches the current config.
// When the store is updated (via API in Phase 2), the cache is invalidated
// immediately — the next request uses the new policies without a restart.
//
// Loop detection is policy-driven: rules with a `loop` field only trigger when
// the loop condition is met AND the rule's match criteria apply. The LoopDetector
// is an optional dependency — if not provided, loop conditions are ignored.

import type { LlmCallEvent, LoopCondition, PolicyAction, PolicyConfig, PolicyRule, ToolCallEvent } from '@rind/core';
import type { PolicyStore } from './store.js';
import { matchesLlmRule, matchesRule } from './rules.js';

/** Minimal interface satisfied by the concrete LoopDetector in the proxy. */
export interface ILoopDetector {
  checkCondition(
    sessionId: string,
    toolName: string,
    input: unknown,
    condition: LoopCondition,
  ): { loop: boolean; reason?: string };
}

// Stable sort: lower priority number = evaluated first. Rules without priority default to 50.
function sortByPriority(rules: PolicyConfig['policies']): PolicyConfig['policies'] {
  return [...rules].sort((a, b) => (a.priority ?? 50) - (b.priority ?? 50));
}

export interface PolicyEvalResult {
  action: PolicyAction;
  matchedRule?: PolicyRule; // the rule that triggered the action (undefined = default allow)
  reason?: string; // human-readable reason (for loop detection, includes threshold info)
}

export class PolicyEngine {
  private rules: PolicyConfig['policies'];
  // Pre-compiled regexes keyed by pattern string — compiled once at load/reload time
  private compiledRegexes = new Map<string, RegExp>();
  private loopDetector?: ILoopDetector;

  constructor(store: PolicyStore, loopDetector?: ILoopDetector) {
    this.rules = sortByPriority(store.get().policies);
    this.loopDetector = loopDetector;
    this.compileRegexes();

    // Subscribe to store updates — swap cache + recompile + re-sort immediately
    store.subscribe(() => {
      this.rules = sortByPriority(store.get().policies);
      this.compileRegexes();
    });
  }

  evaluate(event: ToolCallEvent): PolicyEvalResult {
    for (const rule of this.rules) {
      // Skip disabled rules (enabled defaults to true when not set)
      if (rule.enabled === false) continue;

      if (!matchesRule(rule, event.agentId, event.toolName, event.input, this.compiledRegexes)) {
        continue;
      }

      // If the rule has a loop condition, only trigger when the condition is met
      if (rule.loop) {
        if (!this.loopDetector) continue; // no detector → skip loop rules
        const loopResult = this.loopDetector.checkCondition(
          event.sessionId, event.toolName, event.input, rule.loop,
        );
        if (!loopResult.loop) continue; // condition not met → skip this rule
        return {
          action: rule.action,
          matchedRule: rule,
          reason: loopResult.reason,
        };
      }

      return { action: rule.action, matchedRule: rule };
    }
    return { action: 'ALLOW' };
  }

  /**
   * Evaluate an LLM call event against metadata-only policy rules.
   * Only rules with llmModel or llmProvider criteria (or agent-only rules) are considered.
   * Rules with match.content are explicitly excluded — they are evaluated separately
   * by evaluateLlmContent() in the content policy pipeline (gateway step 3c).
   * Without this exclusion a content DENY rule would block ALL matching provider
   * requests regardless of actual content, because matchesLlmRule's agent-only
   * fallback returns true for any rule lacking tool/LLM criteria.
   * Loop detection does not apply to LLM calls. Default action is ALLOW.
   */
  evaluateLlm(event: LlmCallEvent): PolicyEvalResult {
    for (const rule of this.rules) {
      if (rule.enabled === false) continue;
      if (rule.match.content != null) continue; // handled by evaluateLlmContent
      if (!matchesLlmRule(rule, event)) continue;
      return { action: rule.action, matchedRule: rule };
    }
    return { action: 'ALLOW' };
  }

  getRules(): PolicyConfig['policies'] {
    return this.rules;
  }

  /**
   * Return rules that have content-based match criteria.
   * Used by evaluateLlmContent() in the content policy pipeline.
   */
  getContentRules(): PolicyConfig['policies'] {
    return this.rules.filter((r) => r.enabled !== false && r.match.content != null);
  }

  private compileRegexes(): void {
    this.compiledRegexes.clear();
    for (const rule of this.rules) {
      if (!rule.match.parameters) continue;
      for (const matcher of Object.values(rule.match.parameters)) {
        if (matcher.regex && !this.compiledRegexes.has(matcher.regex)) {
          try {
            this.compiledRegexes.set(matcher.regex, new RegExp(matcher.regex, 'i'));
          } catch {
            // Invalid regex in policy — skip (loader Zod validation should have caught it)
          }
        }
      }
    }
  }
}
