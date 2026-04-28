import { describe, it, expect } from 'vitest';
import { InMemoryPolicyStore } from '../store.js';
import type { PolicyRule } from '@rind/core';

function makeRule(name: string): PolicyRule {
  return { name, agent: '*', match: { tool: [name] }, action: 'DENY', failMode: 'closed' };
}

describe('InMemoryPolicyStore', () => {
  it('get() returns the initial config', () => {
    const store = new InMemoryPolicyStore({ policies: [makeRule('r1')] });
    expect(store.get().policies).toHaveLength(1);
  });

  it('update() replaces config atomically', () => {
    const store = new InMemoryPolicyStore({ policies: [] });
    store.update({ policies: [makeRule('r1'), makeRule('r2')] });
    expect(store.get().policies).toHaveLength(2);
  });

  it('subscribe() fires callback on update', () => {
    const store = new InMemoryPolicyStore({ policies: [] });
    let fired = 0;
    store.subscribe(() => fired++);
    store.update({ policies: [makeRule('r1')] });
    expect(fired).toBe(1);
  });

  it('subscribe() returns unsubscribe function', () => {
    const store = new InMemoryPolicyStore({ policies: [] });
    let fired = 0;
    const unsub = store.subscribe(() => fired++);
    unsub();
    store.update({ policies: [makeRule('r1')] });
    expect(fired).toBe(0);
  });

  it('addRule() appends a rule', () => {
    const store = new InMemoryPolicyStore({ policies: [] });
    store.addRule(makeRule('r1'));
    expect(store.get().policies).toHaveLength(1);
  });

  it('addRule() throws if name already exists', () => {
    const store = new InMemoryPolicyStore({ policies: [makeRule('r1')] });
    expect(() => store.addRule(makeRule('r1'))).toThrow('already exists');
  });

  it('updateRule() replaces by name', () => {
    const store = new InMemoryPolicyStore({ policies: [makeRule('r1')] });
    store.updateRule('r1', { ...makeRule('r1'), action: 'ALLOW' });
    expect(store.get().policies[0]?.action).toBe('ALLOW');
  });

  it('updateRule() throws if name not found', () => {
    const store = new InMemoryPolicyStore({ policies: [] });
    expect(() => store.updateRule('missing', makeRule('missing'))).toThrow('not found');
  });

  it('removeRule() removes by name and returns true', () => {
    const store = new InMemoryPolicyStore({ policies: [makeRule('r1')] });
    expect(store.removeRule('r1')).toBe(true);
    expect(store.get().policies).toHaveLength(0);
  });

  it('removeRule() returns false if name not found', () => {
    const store = new InMemoryPolicyStore({ policies: [] });
    expect(store.removeRule('missing')).toBe(false);
  });

  it('update() deduplicates rules by name (last wins)', () => {
    const store = new InMemoryPolicyStore({ policies: [] });
    store.update({
      policies: [makeRule('dup'), { ...makeRule('dup'), action: 'ALLOW' }],
    });
    expect(store.get().policies).toHaveLength(1);
    expect(store.get().policies[0]?.action).toBe('ALLOW');
  });
});
