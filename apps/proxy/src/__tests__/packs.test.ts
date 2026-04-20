import { describe, it, expect } from 'vitest';
import { listPacks, getPack, expandPackRules, rulesFromPack, recommendPacks } from '../policy/packs.js';
import { InMemoryPolicyStore } from '../policy/store.js';
import { PolicyEngine } from '../policy/engine.js';
import type { PolicyConfig, ToolCallEvent } from '../types.js';

function makeEvent(toolName: string, input: unknown = {}): ToolCallEvent {
  return {
    sessionId: 'sess-1',
    agentId: 'agent-1',
    serverId: 'srv-1',
    toolName,
    input,
    timestamp: Date.now(),
  };
}

// ─── Pack registry ────────────────────────────────────────────────────────────

describe('listPacks', () => {
  it('returns at least the four Phase 1A packs', () => {
    const packs = listPacks();
    const ids = packs.map((p) => p.id);
    expect(ids).toContain('sql-protection');
    expect(ids).toContain('shell-protection');
    expect(ids).toContain('filesystem-protection');
    expect(ids).toContain('exfil-protection');
  });
});

describe('getPack', () => {
  it('returns the pack by id', () => {
    const pack = getPack('sql-protection');
    expect(pack).toBeDefined();
    expect(pack?.name).toBe('SQL Protection');
  });

  it('returns undefined for unknown pack', () => {
    expect(getPack('unknown-pack')).toBeUndefined();
  });
});

// ─── expandPackRules ──────────────────────────────────────────────────────────

describe('expandPackRules', () => {
  it('stamps each rule with source metadata', () => {
    const pack = getPack('sql-protection')!;
    const rules = expandPackRules(pack);
    for (const rule of rules) {
      expect(rule._meta?.source).toBe('pack:sql-protection');
      expect(rule._meta?.createdAt).toBeTruthy();
    }
  });

  it('assigns priority 100 to pack rules', () => {
    const pack = getPack('sql-protection');
    if (!pack) throw new Error('sql-protection pack not found');
    const rules = expandPackRules(pack);
    for (const rule of rules) {
      expect(rule.priority).toBe(100);
    }
  });
});

// ─── rulesFromPack ────────────────────────────────────────────────────────────

describe('rulesFromPack', () => {
  it('identifies rules that came from a pack', () => {
    const pack = getPack('sql-protection');
    if (!pack) throw new Error('sql-protection pack not found');
    const expanded = expandPackRules(pack);
    const found = rulesFromPack(expanded, 'sql-protection');
    expect(found.length).toBe(pack.rules.length);
  });

  it('returns empty array when pack has no rules in the list', () => {
    const found = rulesFromPack([], 'sql-protection');
    expect(found).toHaveLength(0);
  });
});

// ─── recommendPacks ───────────────────────────────────────────────────────────

describe('recommendPacks', () => {
  it('recommends sql-protection when sql tools are present', () => {
    const recs = recommendPacks(['sql_execute', 'db_query']);
    expect(recs.some((p) => p.id === 'sql-protection')).toBe(true);
  });

  it('recommends shell-protection when shell tools are present', () => {
    const recs = recommendPacks(['shell_run', 'exec_command']);
    expect(recs.some((p) => p.id === 'shell-protection')).toBe(true);
  });

  it('returns empty when no matching tools', () => {
    const recs = recommendPacks(['read_calendar', 'send_event']);
    // communication tools may match exfil-protection via "send_" prefix
    // but should not match sql/shell/filesystem
    expect(recs.some((p) => p.id === 'sql-protection')).toBe(false);
    expect(recs.some((p) => p.id === 'shell-protection')).toBe(false);
  });
});

// ─── InMemoryPolicyStore CRUD ─────────────────────────────────────────────────

describe('InMemoryPolicyStore.addRule', () => {
  it('appends a rule and notifies subscribers', () => {
    const store = new InMemoryPolicyStore({ policies: [] });
    let notified = false;
    store.subscribe(() => { notified = true; });

    store.addRule({ name: 'my-rule', agent: '*', match: { tool: ['delete'] }, action: 'DENY', failMode: 'closed' });

    const policies = store.get().policies;
    expect(policies).toHaveLength(1);
    expect(policies[0]?.name).toBe('my-rule');
    expect(notified).toBe(true);
  });

  it('throws if a rule with the same name already exists', () => {
    const store = new InMemoryPolicyStore({
      policies: [{ name: 'existing', agent: '*', match: {}, action: 'DENY', failMode: 'closed' }],
    });
    expect(() => store.addRule({ name: 'existing', agent: '*', match: {}, action: 'ALLOW', failMode: 'closed' }))
      .toThrow('existing');
  });
});

describe('InMemoryPolicyStore.updateRule', () => {
  it('replaces the rule by name', () => {
    const store = new InMemoryPolicyStore({
      policies: [{ name: 'my-rule', agent: '*', match: {}, action: 'DENY', failMode: 'closed' }],
    });
    store.updateRule('my-rule', { name: 'my-rule', agent: '*', match: {}, action: 'ALLOW', failMode: 'closed' });
    expect(store.get().policies[0]?.action).toBe('ALLOW');
  });

  it('throws if rule not found', () => {
    const store = new InMemoryPolicyStore({ policies: [] });
    expect(() => store.updateRule('nonexistent', { name: 'x', agent: '*', match: {}, action: 'DENY', failMode: 'closed' }))
      .toThrow('nonexistent');
  });
});

describe('InMemoryPolicyStore.removeRule', () => {
  it('removes the rule and returns true', () => {
    const store = new InMemoryPolicyStore({
      policies: [{ name: 'my-rule', agent: '*', match: {}, action: 'DENY', failMode: 'closed' }],
    });
    const result = store.removeRule('my-rule');
    expect(result).toBe(true);
    expect(store.get().policies).toHaveLength(0);
  });

  it('returns false if rule not found', () => {
    const store = new InMemoryPolicyStore({ policies: [] });
    expect(store.removeRule('nonexistent')).toBe(false);
  });
});

// ─── Priority ordering ────────────────────────────────────────────────────────

describe('PolicyEngine priority ordering', () => {
  it('evaluates lower-priority-number rules first', () => {
    // Pack rule (priority 100) says ALLOW, custom rule (priority 50) says DENY.
    // Engine should DENY because custom rule is evaluated first.
    const config: PolicyConfig = {
      policies: [
        { name: 'pack-rule', agent: '*', match: { tool: ['delete'] }, action: 'ALLOW', failMode: 'closed', priority: 100 },
        { name: 'custom-rule', agent: '*', match: { tool: ['delete'] }, action: 'DENY', failMode: 'closed', priority: 50 },
      ],
    };
    const store = new InMemoryPolicyStore(config);
    const engine = new PolicyEngine(store);
    const result = engine.evaluate(makeEvent('delete'));
    expect(result.action).toBe('DENY');
    expect(result.matchedRule?.name).toBe('custom-rule');
  });

  it('custom rule overrides pack rule even when pack is added first', () => {
    // Pack rules are added first — custom rule added second but lower priority number should still win
    const store = new InMemoryPolicyStore({ policies: [] });
    const engine = new PolicyEngine(store);

    store.addRule({ name: 'pack-allow', agent: '*', match: { tool: ['sql_exec'] }, action: 'ALLOW', failMode: 'closed', priority: 100 });
    store.addRule({ name: 'custom-deny', agent: '*', match: { tool: ['sql_exec'] }, action: 'DENY', failMode: 'closed', priority: 50 });

    const result = engine.evaluate(makeEvent('sql_exec'));
    expect(result.action).toBe('DENY');
    expect(result.matchedRule?.name).toBe('custom-deny');
  });

  it('engine re-sorts after store update', () => {
    const store = new InMemoryPolicyStore({
      policies: [
        { name: 'rule-a', agent: '*', match: { tool: ['run'] }, action: 'DENY', failMode: 'closed', priority: 100 },
      ],
    });
    const engine = new PolicyEngine(store);

    // Before adding custom rule: pack rule fires
    expect(engine.evaluate(makeEvent('run')).matchedRule?.name).toBe('rule-a');

    // Add higher-priority custom rule
    store.addRule({ name: 'rule-b', agent: '*', match: { tool: ['run'] }, action: 'ALLOW', failMode: 'closed', priority: 1 });

    // Now custom rule fires first
    expect(engine.evaluate(makeEvent('run')).action).toBe('ALLOW');
    expect(engine.evaluate(makeEvent('run')).matchedRule?.name).toBe('rule-b');
  });
});

// ─── SQL protection pack enforcement ─────────────────────────────────────────

describe('sql-protection pack enforcement', () => {
  it('blocks SQL DELETE when pack is active', () => {
    const pack = getPack('sql-protection')!;
    const rules = expandPackRules(pack);
    const store = new InMemoryPolicyStore({ policies: rules });
    const engine = new PolicyEngine(store);

    const result = engine.evaluate(makeEvent('sql_execute', { query: 'DELETE FROM users' }));
    expect(result.action).toBe('DENY');
  });

  it('allows SQL SELECT when pack is active', () => {
    const pack = getPack('sql-protection')!;
    const rules = expandPackRules(pack);
    const store = new InMemoryPolicyStore({ policies: rules });
    const engine = new PolicyEngine(store);

    const result = engine.evaluate(makeEvent('sql_execute', { query: 'SELECT * FROM users' }));
    expect(result.action).toBe('ALLOW');
  });
});
