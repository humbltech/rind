// Tests for Bash sub-command policy expansion in the interceptor.
// When a Bash tool call contains compound commands (&&, ||, ;, |),
// the interceptor splits them and evaluates each sub-command individually.
// If ANY sub-command is blocked, the entire call is blocked.

import { describe, it, expect, beforeEach } from 'vitest';
import { intercept } from '../interceptor.js';
import { PolicyEngine } from '../policy/engine.js';
import { InMemoryPolicyStore } from '../policy/store.js';
import { InMemorySessionStore } from '../session.js';
import type { ToolCallEvent, PolicyConfig, ToolResponseEvent, PolicyRule } from '../types.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function bashEvent(command: string, sessionId = 'session-1'): ToolCallEvent {
  return {
    sessionId,
    agentId: 'agent-1',
    serverId: 'builtin',
    toolName: 'Bash',
    input: { command },
    timestamp: Date.now(),
  };
}

const noopForward = async () => ({ output: 'ok', durationMs: 1 });
const events: ToolCallEvent[] = [];
const responses: ToolResponseEvent[] = [];

let sessionStore: InMemorySessionStore;

function makeOpts(policyEngine: PolicyEngine) {
  events.length = 0;
  responses.length = 0;
  return {
    policyEngine,
    sessionStore,
    onToolCallEvent: (e: ToolCallEvent, _rule?: PolicyRule) => { events.push(e); },
    onToolResponseEvent: (e: ToolResponseEvent) => { responses.push(e); },
    blockOnCriticalResponseThreats: false,
    skipRequestInspection: true, // hook mode — skip injection scanning
  };
}

// ─── Policy: block rm -rf via parameter contains ────────────────────────────

const blockDestructiveBash: PolicyConfig = {
  policies: [
    {
      name: 'block-rm-rf',
      agent: '*',
      match: {
        tool: ['Bash'],
        parameters: { command: { contains: ['rm -rf'] } },
      },
      action: 'DENY',
      failMode: 'closed',
    },
    {
      name: 'block-chmod-777',
      agent: '*',
      match: {
        tool: ['Bash'],
        parameters: { command: { regex: 'chmod\\s+777' } },
      },
      action: 'DENY',
      failMode: 'closed',
    },
  ],
};

describe('Interceptor — Bash sub-command expansion', () => {
  beforeEach(() => {
    sessionStore = new InMemorySessionStore();
    sessionStore.create('agent-1', 'session-1');
  });

  it('blocks compound command when any sub-command matches DENY', async () => {
    const engine = new PolicyEngine(new InMemoryPolicyStore(blockDestructiveBash));
    const result = await intercept(
      bashEvent('git status && rm -rf /'),
      noopForward,
      makeOpts(engine),
    );
    expect(result.interceptorResult.action).toBe('DENY');
    expect(result.output).toBeNull();
  });

  it('allows compound command when no sub-command matches DENY', async () => {
    const engine = new PolicyEngine(new InMemoryPolicyStore(blockDestructiveBash));
    const result = await intercept(
      bashEvent('git status && git log --oneline -5'),
      noopForward,
      makeOpts(engine),
    );
    expect(result.interceptorResult.action).toBe('ALLOW');
    expect(result.output).toBe('ok');
  });

  it('blocks when destructive command is in a pipe chain', async () => {
    const engine = new PolicyEngine(new InMemoryPolicyStore(blockDestructiveBash));
    const result = await intercept(
      bashEvent('echo "test" | rm -rf /tmp/data'),
      noopForward,
      makeOpts(engine),
    );
    expect(result.interceptorResult.action).toBe('DENY');
  });

  it('blocks when destructive command is in semicolon chain', async () => {
    const engine = new PolicyEngine(new InMemoryPolicyStore(blockDestructiveBash));
    const result = await intercept(
      bashEvent('cd /tmp ; rm -rf ./*'),
      noopForward,
      makeOpts(engine),
    );
    expect(result.interceptorResult.action).toBe('DENY');
  });

  it('blocks regex-matched sub-command in compound', async () => {
    const engine = new PolicyEngine(new InMemoryPolicyStore(blockDestructiveBash));
    const result = await intercept(
      bashEvent('ls -la && chmod 777 /etc/passwd'),
      noopForward,
      makeOpts(engine),
    );
    expect(result.interceptorResult.action).toBe('DENY');
  });

  it('does not split single commands (no compound operators)', async () => {
    const engine = new PolicyEngine(new InMemoryPolicyStore(blockDestructiveBash));
    // A safe single command should pass
    const result = await intercept(
      bashEvent('git commit -m "fix && improve"'),
      noopForward,
      makeOpts(engine),
    );
    expect(result.interceptorResult.action).toBe('ALLOW');
  });

  it('full command match still works without splitting', async () => {
    const engine = new PolicyEngine(new InMemoryPolicyStore(blockDestructiveBash));
    // Single command that matches the DENY rule directly
    const result = await intercept(
      bashEvent('rm -rf /'),
      noopForward,
      makeOpts(engine),
    );
    expect(result.interceptorResult.action).toBe('DENY');
  });

  it('returns the matched rule from the blocked sub-command', async () => {
    const engine = new PolicyEngine(new InMemoryPolicyStore(blockDestructiveBash));
    const result = await intercept(
      bashEvent('git add . && rm -rf /backup'),
      noopForward,
      makeOpts(engine),
    );
    expect(result.interceptorResult.action).toBe('DENY');
    expect(result.interceptorResult.reason).toContain('block-rm-rf');
  });
});
