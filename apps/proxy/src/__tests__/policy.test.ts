import { describe, it, expect } from 'vitest';
import { PolicyEngine } from '../policy/engine.js';
import { InMemoryPolicyStore } from '../policy/store.js';
import type { PolicyConfig, ToolCallEvent } from '../types.js';

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

describe('PolicyEngine', () => {
  const engine = makeEngine();

  it('allows unmatched tool calls', () => {
    expect(engine.evaluate(makeEvent('get_user')).action).toBe('ALLOW');
  });

  it('allows unmatched tool calls with no matched rule', () => {
    const result = engine.evaluate(makeEvent('get_user'));
    expect(result.matchedRule).toBeUndefined();
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

  it('requires approval for export tool', () => {
    expect(engine.evaluate(makeEvent('export')).action).toBe('REQUIRE_APPROVAL');
  });

  it('first matching rule wins', () => {
    const result = engine.evaluate(makeEvent('export'));
    expect(result.action).toBe('REQUIRE_APPROVAL');
    expect(result.matchedRule?.name).toBe('require-approval-export');
  });

  it('returns matched rule name on deny', () => {
    const result = engine.evaluate(makeEvent('user.delete'));
    expect(result.matchedRule?.name).toBe('block-destructive');
  });
});

describe('PolicyEngine — time window matching', () => {
  it('applies time-window rules when configured', () => {
    // Always-outside-window: daysOfWeek = [] means never matches
    const cfg: PolicyConfig = {
      policies: [
        {
          name: 'no-weekend-calls',
          agent: '*',
          match: { tool: ['transfer'], timeWindow: { daysOfWeek: [] } },
          action: 'DENY',
          failMode: 'closed',
        },
      ],
    };
    const engine = makeEngine(cfg);
    // daysOfWeek: [] → never includes the current day → ALLOW
    expect(engine.evaluate(makeEvent('transfer')).action).toBe('ALLOW');
  });
});

describe('PolicyEngine — input parameter matching (D-016)', () => {
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
    const event = makeEvent('db.execute', 'agent-1', { query: 'DROP TABLE users' });
    expect(engine.evaluate(event).action).toBe('DENY');
  });

  it('allows SQL that does not match the pattern', () => {
    const event = makeEvent('db.execute', 'agent-1', { query: 'SELECT * FROM users' });
    expect(engine.evaluate(event).action).toBe('ALLOW');
  });

  it('requires approval for large payment amounts', () => {
    const event = makeEvent('payment.charge', 'agent-1', { amount: 50000 });
    expect(engine.evaluate(event).action).toBe('REQUIRE_APPROVAL');
  });

  it('allows small payment amounts', () => {
    const event = makeEvent('payment.charge', 'agent-1', { amount: 100 });
    expect(engine.evaluate(event).action).toBe('ALLOW');
  });

  it('matches nested parameter keys', () => {
    const nestedCfg: PolicyConfig = {
      policies: [
        {
          name: 'block-nested-drop',
          agent: '*',
          match: { tool: ['db.batch'], parameters: { sql: { contains: ['DROP'] } } },
          action: 'DENY',
          failMode: 'closed',
        },
      ],
    };
    const nestedEngine = makeEngine(nestedCfg);
    const event = makeEvent('db.batch', 'agent-1', { operations: [{ sql: 'DROP TABLE logs' }] });
    expect(nestedEngine.evaluate(event).action).toBe('DENY');
  });
});

describe('PolicyEngine — store invalidation (D-021)', () => {
  it('picks up policy changes immediately after store update', () => {
    const store = new InMemoryPolicyStore({ policies: [] });
    const engine = new PolicyEngine(store);

    // Initially no rules → ALLOW
    expect(engine.evaluate(makeEvent('db.execute')).action).toBe('ALLOW');

    // Update store with a DENY rule
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

    // Engine cache invalidated — next request sees new policy
    expect(engine.evaluate(makeEvent('db.execute')).action).toBe('DENY');
  });
});
