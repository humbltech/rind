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

import type { PolicyAction, PolicyConfig, PolicyRule, ToolCallEvent } from '../types.js';
import type { PolicyStore } from './store.js';
import type { LoopDetector } from '../loop-detector.js';
import { matchesRule } from './rules.js';

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
  private loopDetector?: LoopDetector;

  constructor(store: PolicyStore, loopDetector?: LoopDetector) {
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

  getRules(): PolicyConfig['policies'] {
    return this.rules;
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
