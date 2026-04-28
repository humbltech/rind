import { describe, it, expect } from 'vitest';
import { PolicyEngine } from '../engine.js';
import { InMemoryPolicyStore } from '../store.js';
import type { PolicyConfig, ToolCallEvent } from '@rind/core';

function makeEvent(toolName: string, agentId = 'agent-1', input: unknown = {}): ToolCallEvent {
  return {
    sessionId: 'session-1',
    agentId,
    serverId: 'server-1',
    toolName,
    input,
    timestamp: Date.now(),
  };
}

const config: PolicyConfig = {
  policies: [
    {
      name: 'block-destructive',
      agent: '*',
      match: { tool: ['delete', 'drop', 'truncate'] },
      action: 'DENY',
      failMode: 'closed',
    },
    {
      name: 'public-agent-restrictions',
      agent: 'agent-public',
      match: { toolPattern: 'billing.*' },
      action: 'DENY',
      failMode: 'closed',
    },
    {
      name: 'require-approval-export',
      agent: '*',
      match: { tool: ['export'] },
      action: 'REQUIRE_APPROVAL',
      failMode: 'closed',
    },
  ],
};

function makeEngine(cfg: PolicyConfig = config): PolicyEngine {
  return new PolicyEngine(new InMemoryPolicyStore(cfg));
}

describe('PolicyEngine — basic evaluation', () => {
  const engine = makeEngine();

  it('allows unmatched tool calls', () => {
    expect(engine.evaluate(makeEvent('get_user')).action).toBe('ALLOW');
  });

  it('returns no matchedRule on allow', () => {
    expect(engine.evaluate(makeEvent('get_user')).matchedRule).toBeUndefined();
  });

  it('denies tool names matching keyword list', () => {
    expect(engine.evaluate(makeEvent('user.delete')).action).toBe('DENY');
    expect(engine.evaluate(makeEvent('drop_table')).action).toBe('DENY');
  });

  it('denies billing tools for public agent', () => {
    expect(engine.evaluate(makeEvent('billing.charge', 'agent-public')).action).toBe('DENY');
  });

  it('allows billing tools for internal agent', () => {
    expect(engine.evaluate(makeEvent('billing.charge', 'agent-internal')).action).toBe('ALLOW');
  });

  it('first matching rule wins', () => {
    const result = engine.evaluate(makeEvent('export'));
    expect(result.action).toBe('REQUIRE_APPROVAL');
    expect(result.matchedRule?.name).toBe('require-approval-export');
  });
});

describe('PolicyEngine — store invalidation (D-021)', () => {
  it('picks up policy changes immediately after store update', () => {
    const store = new InMemoryPolicyStore({ policies: [] });
    const engine = new PolicyEngine(store);

    expect(engine.evaluate(makeEvent('db.execute')).action).toBe('ALLOW');

    store.update({
      policies: [
        {
          name: 'block-all-db',
          agent: '*',
          match: { tool: ['db.execute'] },
          action: 'DENY',
          failMode: 'closed',
        },
      ],
    });

    expect(engine.evaluate(makeEvent('db.execute')).action).toBe('DENY');
  });
});

describe('PolicyEngine — parameter matching (D-016)', () => {
  const paramCfg: PolicyConfig = {
    policies: [
      {
        name: 'block-drop-sql',
        agent: '*',
        match: {
          tool: ['db.execute'],
          parameters: { query: { contains: ['DROP', 'TABLE'] } },
        },
        action: 'DENY',
        failMode: 'closed',
      },
      {
        name: 'block-large-amounts',
        agent: '*',
        match: {
          tool: ['payment.charge'],
          parameters: { amount: { gt: 10000 } },
        },
        action: 'REQUIRE_APPROVAL',
        failMode: 'closed',
      },
    ],
  };
  const engine = makeEngine(paramCfg);

  it('blocks SQL containing DROP TABLE', () => {
    expect(engine.evaluate(makeEvent('db.execute', 'agent-1', { query: 'DROP TABLE users' })).action).toBe('DENY');
  });

  it('allows SQL that does not contain the pattern', () => {
    expect(engine.evaluate(makeEvent('db.execute', 'agent-1', { query: 'SELECT * FROM users' })).action).toBe('ALLOW');
  });

  it('requires approval for large amounts', () => {
    expect(engine.evaluate(makeEvent('payment.charge', 'agent-1', { amount: 50000 })).action).toBe('REQUIRE_APPROVAL');
  });

  it('allows small amounts', () => {
    expect(engine.evaluate(makeEvent('payment.charge', 'agent-1', { amount: 100 })).action).toBe('ALLOW');
  });
});

describe('PolicyEngine — subcommand matching', () => {
  const subConfig: PolicyConfig = {
    policies: [
      {
        name: 'block-git-push',
        agent: '*',
        match: {
          tool: ['Bash'],
          subcommand: ['git push', 'git reset'],
        },
        action: 'DENY',
        failMode: 'closed',
      },
    ],
  };
  const engine = makeEngine(subConfig);

  it('blocks git push', () => {
    expect(engine.evaluate(makeEvent('Bash', 'agent-1', { command: 'git push origin main' })).action).toBe('DENY');
  });

  it('blocks git push in compound command', () => {
    expect(engine.evaluate(makeEvent('Bash', 'agent-1', { command: 'git add . && git push' })).action).toBe('DENY');
  });

  it('allows git status', () => {
    expect(engine.evaluate(makeEvent('Bash', 'agent-1', { command: 'git status' })).action).toBe('ALLOW');
  });
});

describe('PolicyEngine — priority ordering', () => {
  it('evaluates lower priority numbers first', () => {
    const cfg: PolicyConfig = {
      policies: [
        { name: 'high-priority', agent: '*', match: { tool: ['action'] }, action: 'DENY', failMode: 'closed', priority: 10 },
        { name: 'low-priority', agent: '*', match: { tool: ['action'] }, action: 'ALLOW', failMode: 'closed', priority: 90 },
      ],
    };
    const result = makeEngine(cfg).evaluate(makeEvent('action'));
    expect(result.action).toBe('DENY');
    expect(result.matchedRule?.name).toBe('high-priority');
  });
});

describe('PolicyEngine — disabled rules', () => {
  it('skips disabled rules', () => {
    const cfg: PolicyConfig = {
      policies: [
        { name: 'disabled', agent: '*', match: { tool: ['action'] }, action: 'DENY', failMode: 'closed', enabled: false },
      ],
    };
    expect(makeEngine(cfg).evaluate(makeEvent('action')).action).toBe('ALLOW');
  });
});
