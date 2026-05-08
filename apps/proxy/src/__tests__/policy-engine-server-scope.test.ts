import { describe, it, expect } from 'vitest';
import { PolicyEngine } from '../policy/engine.js';
import { InMemoryPolicyStore } from '../policy/store.js';
import type { ToolCallEvent, LlmCallEvent, PolicyRule } from '@rind/core';

// Minimal ToolCallEvent factory
function makeToolEvent(overrides: Partial<ToolCallEvent> = {}): ToolCallEvent {
  return {
    sessionId: 'sess-1',
    agentId: 'agent-a',
    serverId: 'railway',
    toolName: 'deploy',
    input: {},
    timestamp: Date.now(),
    source: 'mcp',
    ...overrides,
  };
}

// Minimal LlmCallEvent factory
function makeLlmEvent(overrides: Partial<LlmCallEvent> = {}): LlmCallEvent {
  return {
    id: 'llm-1',
    agentId: 'agent-a',
    sessionId: 'sess-1',
    provider: 'anthropic',
    model: 'claude-opus-4-7',
    messages: [],
    timestamp: Date.now(),
    ...overrides,
  } as LlmCallEvent;
}

function makeEngine(rules: PolicyRule[]): PolicyEngine {
  const store = new InMemoryPolicyStore({ policies: rules });
  return new PolicyEngine(store);
}

describe('Policy engine — server scoping', () => {
  describe('serverId exact matching', () => {
    it('matches when event.serverId is in the list', () => {
      const engine = makeEngine([
        {
          name: 'railway-only',
          agent: '*',
          match: { serverId: ['railway'] },
          action: 'DENY',
        },
      ]);
      const result = engine.evaluate(makeToolEvent({ serverId: 'railway' }));
      expect(result.action).toBe('DENY');
      expect(result.matchedRule?.name).toBe('railway-only');
    });

    it('does NOT match when event.serverId is not in the list', () => {
      const engine = makeEngine([
        {
          name: 'railway-only',
          agent: '*',
          match: { serverId: ['railway'] },
          action: 'DENY',
        },
      ]);
      const result = engine.evaluate(makeToolEvent({ serverId: 'github' }));
      expect(result.action).toBe('ALLOW');
    });

    it('matches any of multiple listed server IDs', () => {
      const engine = makeEngine([
        {
          name: 'multi-server',
          agent: '*',
          match: { serverId: ['railway', 'vercel'] },
          action: 'DENY',
        },
      ]);
      expect(engine.evaluate(makeToolEvent({ serverId: 'railway' })).action).toBe('DENY');
      expect(engine.evaluate(makeToolEvent({ serverId: 'vercel' })).action).toBe('DENY');
      expect(engine.evaluate(makeToolEvent({ serverId: 'github' })).action).toBe('ALLOW');
    });
  });

  describe('serverPattern glob matching', () => {
    it('matches when serverId matches the glob pattern', () => {
      const engine = makeEngine([
        {
          name: 'rail-glob',
          agent: '*',
          match: { serverPattern: 'rail*' },
          action: 'DENY',
        },
      ]);
      expect(engine.evaluate(makeToolEvent({ serverId: 'railway' })).action).toBe('DENY');
      expect(engine.evaluate(makeToolEvent({ serverId: 'railwayone' })).action).toBe('DENY');
    });

    it('does NOT match when serverId does not match the glob', () => {
      const engine = makeEngine([
        {
          name: 'rail-glob',
          agent: '*',
          match: { serverPattern: 'rail*' },
          action: 'DENY',
        },
      ]);
      expect(engine.evaluate(makeToolEvent({ serverId: 'github' })).action).toBe('ALLOW');
    });
  });

  describe('LLM events never match server-scoped rules', () => {
    it('serverId rule does not fire on LLM events', () => {
      const engine = makeEngine([
        {
          name: 'server-scoped',
          agent: '*',
          match: { serverId: ['railway'], content: { scope: 'request', detectors: ['secret'] } },
          action: 'DENY',
        },
      ]);
      // LLM evaluateLlm (metadata path) should not match tool-only rules
      const llmResult = engine.evaluateLlm(makeLlmEvent());
      expect(llmResult.action).toBe('ALLOW');
    });

    it('serverPattern rule does not fire on LLM events', () => {
      const engine = makeEngine([
        {
          name: 'server-pattern-scoped',
          agent: '*',
          match: { serverPattern: 'rail*' },
          action: 'DENY',
        },
      ]);
      const llmResult = engine.evaluateLlm(makeLlmEvent());
      expect(llmResult.action).toBe('ALLOW');
    });
  });

  describe('server + tool criteria AND semantics', () => {
    it('requires both serverId AND tool to match', () => {
      const engine = makeEngine([
        {
          name: 'server-and-tool',
          agent: '*',
          match: { serverId: ['railway'], tool: ['deploy'] },
          action: 'DENY',
        },
      ]);
      // Both match
      expect(engine.evaluate(makeToolEvent({ serverId: 'railway', toolName: 'deploy' })).action).toBe('DENY');
      // Wrong server
      expect(engine.evaluate(makeToolEvent({ serverId: 'github', toolName: 'deploy' })).action).toBe('ALLOW');
      // Wrong tool
      expect(engine.evaluate(makeToolEvent({ serverId: 'railway', toolName: 'status' })).action).toBe('ALLOW');
    });
  });

  describe('rules without server scoping match any server', () => {
    it('rule without serverId/serverPattern matches all servers', () => {
      const engine = makeEngine([
        {
          name: 'all-servers',
          agent: '*',
          match: { tool: ['deploy'] },
          action: 'DENY',
        },
      ]);
      expect(engine.evaluate(makeToolEvent({ serverId: 'railway', toolName: 'deploy' })).action).toBe('DENY');
      expect(engine.evaluate(makeToolEvent({ serverId: 'github', toolName: 'deploy' })).action).toBe('DENY');
    });
  });
});
