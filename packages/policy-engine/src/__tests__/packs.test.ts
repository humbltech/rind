import { describe, it, expect } from 'vitest';
import { listPacks, getPack, expandPackRules, rulesFromPack, recommendPacks } from '../packs.js';
import { InMemoryPolicyStore } from '../store.js';
import { PolicyEngine } from '../engine.js';
import type { ToolCallEvent } from '@rind/core';

function makeEvent(toolName: string, input: unknown = {}): ToolCallEvent {
  return { sessionId: 'sess-1', agentId: 'agent-1', serverId: 'srv-1', toolName, input, timestamp: Date.now() };
}

describe('listPacks', () => {
  it('returns at least the four Phase 1A packs', () => {
    const ids = listPacks().map((p) => p.id);
    expect(ids).toContain('sql-protection');
    expect(ids).toContain('shell-protection');
    expect(ids).toContain('filesystem-protection');
    expect(ids).toContain('exfil-protection');
  });
});

describe('getPack', () => {
  it('returns pack by id', () => {
    const pack = getPack('sql-protection');
    expect(pack).toBeDefined();
    expect(pack?.name).toBe('SQL Protection');
  });

  it('returns undefined for unknown pack', () => {
    expect(getPack('unknown-pack')).toBeUndefined();
  });
});

describe('expandPackRules', () => {
  it('stamps each rule with source metadata', () => {
    const pack = getPack('sql-protection')!;
    for (const rule of expandPackRules(pack)) {
      expect(rule._meta?.source).toBe('pack:sql-protection');
    }
  });

  it('sets priority to 100 (pack default)', () => {
    const pack = getPack('sql-protection')!;
    for (const rule of expandPackRules(pack)) {
      expect(rule.priority).toBe(100);
    }
  });
});

describe('rulesFromPack', () => {
  it('identifies rules from a given pack', () => {
    const pack = getPack('sql-protection')!;
    const expanded = expandPackRules(pack);
    const store = new InMemoryPolicyStore({ policies: expanded });
    const found = rulesFromPack(store.get().policies, 'sql-protection');
    expect(found.length).toBe(expanded.length);
  });

  it('returns empty when pack not enabled', () => {
    const store = new InMemoryPolicyStore({ policies: [] });
    expect(rulesFromPack(store.get().policies, 'sql-protection')).toHaveLength(0);
  });
});

describe('recommendPacks', () => {
  it('recommends sql-protection for sql_ tools', () => {
    const packs = recommendPacks(['sql_query', 'sql_execute']);
    expect(packs.map((p) => p.id)).toContain('sql-protection');
  });

  it('returns empty for unrelated tools', () => {
    expect(recommendPacks(['get_weather', 'lookup_address'])).toHaveLength(0);
  });
});

describe('cli-protection pack integration', () => {
  it('blocks rm -rf via engine', () => {
    const pack = getPack('cli-protection')!;
    const store = new InMemoryPolicyStore({ policies: expandPackRules(pack) });
    const engine = new PolicyEngine(store);
    const result = engine.evaluate(makeEvent('Bash', { command: 'rm -rf /' }));
    expect(result.action).toBe('DENY');
  });

  it('allows safe commands', () => {
    const pack = getPack('cli-protection')!;
    const store = new InMemoryPolicyStore({ policies: expandPackRules(pack) });
    const engine = new PolicyEngine(store);
    const result = engine.evaluate(makeEvent('Bash', { command: 'ls -la' }));
    expect(result.action).toBe('ALLOW');
  });
});
