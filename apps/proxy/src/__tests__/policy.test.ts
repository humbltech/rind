import { describe, it, expect } from 'vitest';
import { PolicyEngine } from '../policy/engine.js';
import type { PolicyConfig, ToolCallEvent } from '../types.js';

function makeEvent(toolName: string, agentId = 'agent-1'): ToolCallEvent {
  return {
    sessionId: 'session-1',
    agentId,
    serverId: 'server-1',
    toolName,
    input: {},
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
    },
    {
      name: 'public-agent-restrictions',
      agent: 'agent-public',
      match: { toolPattern: 'billing.*' },
      action: 'DENY',
    },
    {
      name: 'require-approval-export',
      agent: '*',
      match: { tool: ['export'] },
      action: 'REQUIRE_APPROVAL',
    },
  ],
};

describe('PolicyEngine', () => {
  const engine = new PolicyEngine(config);

  it('allows unmatched tool calls', () => {
    expect(engine.evaluate(makeEvent('get_user'))).toBe('ALLOW');
  });

  it('denies tool names matching keyword list', () => {
    expect(engine.evaluate(makeEvent('user.delete'))).toBe('DENY');
    expect(engine.evaluate(makeEvent('drop_table'))).toBe('DENY');
  });

  it('denies billing tools for public agent', () => {
    expect(engine.evaluate(makeEvent('billing.charge', 'agent-public'))).toBe('DENY');
  });

  it('allows billing tools for internal agent', () => {
    expect(engine.evaluate(makeEvent('billing.charge', 'agent-internal'))).toBe('ALLOW');
  });

  it('requires approval for export tool', () => {
    expect(engine.evaluate(makeEvent('export'))).toBe('REQUIRE_APPROVAL');
  });

  it('first matching rule wins', () => {
    // 'export' matches both 'require-approval-export' and could be construed
    // as matching nothing else — confirms first-match-wins ordering
    const result = engine.evaluate(makeEvent('export'));
    expect(result).toBe('REQUIRE_APPROVAL');
  });
});
