// Policy evaluation engine: evaluates tool call events against loaded policy rules.
// First matching rule wins (top-to-bottom). Default action is ALLOW.

import type { PolicyAction, PolicyConfig, ToolCallEvent } from '../types.js';
import { matchesRule } from './rules.js';

export class PolicyEngine {
  private rules: PolicyConfig['policies'];

  constructor(config: PolicyConfig) {
    this.rules = config.policies;
  }

  evaluate(event: ToolCallEvent): PolicyAction {
    for (const rule of this.rules) {
      if (matchesRule(rule, event.agentId, event.toolName)) {
        return rule.action;
      }
    }
    return 'ALLOW';
  }

  getRules(): PolicyConfig['policies'] {
    return this.rules;
  }
}
