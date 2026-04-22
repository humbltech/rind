// Tests for policy-driven loop detection.
// Loop detection is now a policy condition — rules with a `loop` field only
// trigger their action when the loop condition is met AND the match criteria apply.

import { describe, it, expect, beforeEach } from 'vitest';
import { PolicyEngine } from '../policy/engine.js';
import { InMemoryPolicyStore } from '../policy/store.js';
import { LoopDetector } from '../loop-detector.js';
import { intercept } from '../interceptor.js';
import { createSession } from '../session.js';
import type { ToolCallEvent, PolicyConfig, PolicyRule, ToolResponseEvent } from '../types.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeEvent(toolName: string, input: unknown = {}, sessionId = 'session-1'): ToolCallEvent {
  return {
    sessionId,
    agentId: 'agent-1',
    serverId: 'builtin',
    toolName,
    input,
    timestamp: Date.now(),
  };
}

const noopForward = async () => ({ output: 'ok', durationMs: 1 });
const events: ToolCallEvent[] = [];
const responses: ToolResponseEvent[] = [];

function makeOpts(policyEngine: PolicyEngine, loopDetector: LoopDetector) {
  events.length = 0;
  responses.length = 0;
  return {
    policyEngine,
    loopDetector,
    onToolCallEvent: (e: ToolCallEvent, _rule?: PolicyRule) => { events.push(e); },
    onToolResponseEvent: (e: ToolResponseEvent) => { responses.push(e); },
    blockOnCriticalResponseThreats: false,
    skipRequestInspection: true,
  };
}

// ─── Exact loop detection ────────────────────────────────────────────────────

describe('Policy-driven loop detection — exact', () => {
  const config: PolicyConfig = {
    policies: [
      {
        name: 'bash-exact-loop',
        agent: '*',
        match: { tool: ['Bash'] },
        action: 'DENY',
        failMode: 'closed',
        loop: { type: 'exact', threshold: 3, window: 20 },
      },
    ],
  };

  let loopDetector: LoopDetector;

  beforeEach(() => {
    loopDetector = new LoopDetector();
    createSession('agent-1', 'session-1');
  });

  it('allows calls below threshold', async () => {
    const engine = new PolicyEngine(new InMemoryPolicyStore(config), loopDetector);
    const opts = makeOpts(engine, loopDetector);

    // Two identical calls — below threshold of 3
    const event = makeEvent('Bash', { command: 'git status' });
    const r1 = await intercept(event, noopForward, opts);
    expect(r1.interceptorResult.action).toBe('ALLOW');
    const r2 = await intercept(event, noopForward, opts);
    expect(r2.interceptorResult.action).toBe('ALLOW');
  });

  it('blocks on exact threshold', async () => {
    const engine = new PolicyEngine(new InMemoryPolicyStore(config), loopDetector);
    const opts = makeOpts(engine, loopDetector);

    const event = makeEvent('Bash', { command: 'git status' });
    await intercept(event, noopForward, opts);
    await intercept(event, noopForward, opts);
    const r3 = await intercept(event, noopForward, opts);
    expect(r3.interceptorResult.action).toBe('BLOCKED_LOOP');
    expect(r3.output).toBeNull();
  });

  it('does not block different inputs', async () => {
    const engine = new PolicyEngine(new InMemoryPolicyStore(config), loopDetector);
    const opts = makeOpts(engine, loopDetector);

    // Three different commands — no exact match
    await intercept(makeEvent('Bash', { command: 'git status' }), noopForward, opts);
    await intercept(makeEvent('Bash', { command: 'git log' }), noopForward, opts);
    const r3 = await intercept(makeEvent('Bash', { command: 'git diff' }), noopForward, opts);
    expect(r3.interceptorResult.action).toBe('ALLOW');
  });

  it('does not apply to non-matching tools', async () => {
    const engine = new PolicyEngine(new InMemoryPolicyStore(config), loopDetector);
    const opts = makeOpts(engine, loopDetector);

    // Read is not matched by the policy (tool: ['Bash'])
    const event = makeEvent('Read', { file_path: '/foo.ts' });
    await intercept(event, noopForward, opts);
    await intercept(event, noopForward, opts);
    const r3 = await intercept(event, noopForward, opts);
    expect(r3.interceptorResult.action).toBe('ALLOW');
  });

  it('includes threshold info in reason', async () => {
    const engine = new PolicyEngine(new InMemoryPolicyStore(config), loopDetector);
    const opts = makeOpts(engine, loopDetector);

    const event = makeEvent('Bash', { command: 'ls' });
    await intercept(event, noopForward, opts);
    await intercept(event, noopForward, opts);
    const r3 = await intercept(event, noopForward, opts);
    expect(r3.interceptorResult.reason).toContain('3');
    expect(r3.interceptorResult.reason).toContain('threshold');
  });
});

// ─── Consecutive loop detection ──────────────────────────────────────────────

describe('Policy-driven loop detection — consecutive', () => {
  const config: PolicyConfig = {
    policies: [
      {
        name: 'consecutive-read-spam',
        agent: '*',
        match: { tool: ['Read'] },
        action: 'DENY',
        failMode: 'closed',
        loop: { type: 'consecutive', threshold: 4 },
      },
    ],
  };

  let loopDetector: LoopDetector;

  beforeEach(() => {
    loopDetector = new LoopDetector();
    createSession('agent-1', 'session-1');
  });

  it('allows below consecutive threshold', async () => {
    const engine = new PolicyEngine(new InMemoryPolicyStore(config), loopDetector);
    const opts = makeOpts(engine, loopDetector);

    // 3 consecutive reads — below threshold of 4
    for (let i = 0; i < 3; i++) {
      const r = await intercept(makeEvent('Read', { file_path: `/file${i}.ts` }), noopForward, opts);
      expect(r.interceptorResult.action).toBe('ALLOW');
    }
  });

  it('blocks on consecutive threshold', async () => {
    const engine = new PolicyEngine(new InMemoryPolicyStore(config), loopDetector);
    const opts = makeOpts(engine, loopDetector);

    // 4 consecutive reads — hits threshold
    for (let i = 0; i < 3; i++) {
      await intercept(makeEvent('Read', { file_path: `/file${i}.ts` }), noopForward, opts);
    }
    const r4 = await intercept(makeEvent('Read', { file_path: '/file3.ts' }), noopForward, opts);
    expect(r4.interceptorResult.action).toBe('BLOCKED_LOOP');
  });

  it('resets consecutive count when a different tool is used', async () => {
    const engine = new PolicyEngine(new InMemoryPolicyStore(config), loopDetector);
    const opts = makeOpts(engine, loopDetector);

    // 2 reads, then a Bash, then 2 more reads — never hits 4 consecutive
    await intercept(makeEvent('Read', { file_path: '/a.ts' }), noopForward, opts);
    await intercept(makeEvent('Read', { file_path: '/b.ts' }), noopForward, opts);
    await intercept(makeEvent('Bash', { command: 'ls' }), noopForward, opts);
    await intercept(makeEvent('Read', { file_path: '/c.ts' }), noopForward, opts);
    const r = await intercept(makeEvent('Read', { file_path: '/d.ts' }), noopForward, opts);
    expect(r.interceptorResult.action).toBe('ALLOW');
  });
});

// ─── Subcommand loop detection ───────────────────────────────────────────────

describe('Policy-driven loop detection — subcommand', () => {
  const config: PolicyConfig = {
    policies: [
      {
        name: 'bash-subcommand-loop',
        agent: '*',
        match: { tool: ['Bash'] },
        action: 'DENY',
        failMode: 'closed',
        loop: { type: 'subcommand', threshold: 3, window: 20 },
      },
    ],
  };

  let loopDetector: LoopDetector;

  beforeEach(() => {
    loopDetector = new LoopDetector();
    createSession('agent-1', 'session-1');
  });

  it('blocks when same sub-command repeats across different compound commands', async () => {
    const engine = new PolicyEngine(new InMemoryPolicyStore(config), loopDetector);
    const opts = makeOpts(engine, loopDetector);

    // "git status" appears in all three, even though full commands differ
    await intercept(makeEvent('Bash', { command: 'git status && ls' }), noopForward, opts);
    await intercept(makeEvent('Bash', { command: 'echo hi && git status' }), noopForward, opts);
    const r3 = await intercept(makeEvent('Bash', { command: 'git status' }), noopForward, opts);
    expect(r3.interceptorResult.action).toBe('BLOCKED_LOOP');
  });

  it('allows when sub-commands are all different', async () => {
    const engine = new PolicyEngine(new InMemoryPolicyStore(config), loopDetector);
    const opts = makeOpts(engine, loopDetector);

    await intercept(makeEvent('Bash', { command: 'git status' }), noopForward, opts);
    await intercept(makeEvent('Bash', { command: 'git log' }), noopForward, opts);
    const r3 = await intercept(makeEvent('Bash', { command: 'git diff' }), noopForward, opts);
    expect(r3.interceptorResult.action).toBe('ALLOW');
  });
});

// ─── No loop detector = loop rules skipped ───────────────────────────────────

describe('Policy-driven loop detection — no detector', () => {
  const config: PolicyConfig = {
    policies: [
      {
        name: 'bash-loop-rule',
        agent: '*',
        match: { tool: ['Bash'] },
        action: 'DENY',
        failMode: 'closed',
        loop: { type: 'exact', threshold: 2, window: 10 },
      },
    ],
  };

  beforeEach(() => {
    createSession('agent-1', 'session-1');
  });

  it('skips loop rules when no detector is provided', async () => {
    // Engine without loopDetector — loop rules should be skipped (default ALLOW)
    const engine = new PolicyEngine(new InMemoryPolicyStore(config));
    const opts = {
      policyEngine: engine,
      onToolCallEvent: () => {},
      onToolResponseEvent: () => {},
      blockOnCriticalResponseThreats: false,
      skipRequestInspection: true,
    };

    const event = makeEvent('Bash', { command: 'git status' });
    const r1 = await intercept(event, noopForward, opts);
    expect(r1.interceptorResult.action).toBe('ALLOW');
    const r2 = await intercept(event, noopForward, opts);
    expect(r2.interceptorResult.action).toBe('ALLOW');
    const r3 = await intercept(event, noopForward, opts);
    expect(r3.interceptorResult.action).toBe('ALLOW');
  });
});

// ─── Mixed: loop rule + regular rule ─────────────────────────────────────────

describe('Policy-driven loop detection — mixed with regular rules', () => {
  const config: PolicyConfig = {
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
        priority: 10, // Higher priority than loop rule
      },
      {
        name: 'bash-loop',
        agent: '*',
        match: { tool: ['Bash'] },
        action: 'DENY',
        failMode: 'closed',
        loop: { type: 'exact', threshold: 3, window: 20 },
        priority: 50,
      },
    ],
  };

  let loopDetector: LoopDetector;

  beforeEach(() => {
    loopDetector = new LoopDetector();
    createSession('agent-1', 'session-1');
  });

  it('regular DENY rule fires immediately without needing loop threshold', async () => {
    const engine = new PolicyEngine(new InMemoryPolicyStore(config), loopDetector);
    const opts = makeOpts(engine, loopDetector);

    // rm -rf is blocked on first call by the regular rule
    const r = await intercept(makeEvent('Bash', { command: 'rm -rf /' }), noopForward, opts);
    expect(r.interceptorResult.action).toBe('DENY');
  });

  it('loop rule triggers only after threshold is reached', async () => {
    const engine = new PolicyEngine(new InMemoryPolicyStore(config), loopDetector);
    const opts = makeOpts(engine, loopDetector);

    const event = makeEvent('Bash', { command: 'git status' });
    const r1 = await intercept(event, noopForward, opts);
    expect(r1.interceptorResult.action).toBe('ALLOW');
    const r2 = await intercept(event, noopForward, opts);
    expect(r2.interceptorResult.action).toBe('ALLOW');
    const r3 = await intercept(event, noopForward, opts);
    expect(r3.interceptorResult.action).toBe('BLOCKED_LOOP');
  });
});
