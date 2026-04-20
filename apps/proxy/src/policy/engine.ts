// Policy evaluation engine: evaluates tool call events against loaded policy rules.
// Rules are sorted by priority (ascending) — lower priority number = evaluated first.
// Within the same priority, insertion order is preserved. Default action is ALLOW.
//
// The engine reads from a PolicyStore (D-021) and caches the current config.
// When the store is updated (via API in Phase 2), the cache is invalidated
// immediately — the next request uses the new policies without a restart.

import type { PolicyAction, PolicyConfig, PolicyRule, ToolCallEvent } from '../types.js';
import type { PolicyStore } from './store.js';
import { matchesRule } from './rules.js';

// Stable sort: lower priority number = evaluated first. Rules without priority default to 50.
function sortByPriority(rules: PolicyConfig['policies']): PolicyConfig['policies'] {
  return [...rules].sort((a, b) => (a.priority ?? 50) - (b.priority ?? 50));
}

export interface PolicyEvalResult {
  action: PolicyAction;
  matchedRule?: PolicyRule; // the rule that triggered the action (undefined = default allow)
}

export class PolicyEngine {
  private rules: PolicyConfig['policies'];
  // Pre-compiled regexes keyed by pattern string — compiled once at load/reload time
  private compiledRegexes = new Map<string, RegExp>();

  constructor(store: PolicyStore) {
    this.rules = sortByPriority(store.get().policies);
    this.compileRegexes();

    // Subscribe to store updates — swap cache + recompile + re-sort immediately
    store.subscribe(() => {
      this.rules = sortByPriority(store.get().policies);
      this.compileRegexes();
    });
  }

  evaluate(event: ToolCallEvent): PolicyEvalResult {
    for (const rule of this.rules) {
      if (matchesRule(rule, event.agentId, event.toolName, event.input, this.compiledRegexes)) {
        return { action: rule.action, matchedRule: rule };
      }
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
