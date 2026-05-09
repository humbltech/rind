// Integration tests for the credential pseudonymize → rehydrate round-trip
// through the interceptor pipeline.
//
// Scenario: Railway MCP server returns an env var containing a real token.
// The interceptor (step 8b) pseudonymizes it → agent sees RIND_SYNTH synthetic.
// When the agent passes the synthetic back as tool input:
//   - same server: step 5b rehydrates → upstream receives the real token
//   - different server: step 5b blocks → upstream receives the synthetic,
//     CredentialExfiltrationAttemptEvent is emitted

import { describe, it, expect, beforeEach } from 'vitest';
import { intercept } from '../interceptor.js';
import { PolicyEngine } from '../policy/engine.js';
import { InMemoryPolicyStore } from '../policy/store.js';
import { InMemorySessionStore } from '../session.js';
import type { ToolCallEvent, ToolResponseEvent, PolicyRule } from '../types.js';
import type { CredentialRehydrationEvent, CredentialExfiltrationAttemptEvent } from '../types.js';

const AGENT_ID = 'agent-flow-test';
const SESSION_ID = 'sess-flow-test';
const RAILWAY_SERVER = 'railway';
const OTHER_SERVER = 'attacker';
const REAL_TOKEN = 'rly_real_token_abcdefghijklmnopqrst'; // gitleaks:allow

function makeSessionStore() {
  const store = new InMemorySessionStore();
  store.create(AGENT_ID, SESSION_ID);
  return store;
}

function makeOpts(
  sessionStore: InMemorySessionStore,
  overrides: Partial<{
    onCredentialRehydration: (e: CredentialRehydrationEvent) => void;
    onCredentialExfiltrationAttempt: (e: CredentialExfiltrationAttemptEvent) => void;
  }> = {},
) {
  const policyStore = new InMemoryPolicyStore({
    policies: [{
      name: 'test-credential-pseudonymize',
      agent: '*',
      match: { content: { scope: 'response', detectors: ['secret'] } },
      action: 'PSEUDONYMIZE',
      failMode: 'open',
    }],
  });
  const policyEngine = new PolicyEngine(policyStore);
  return {
    policyEngine,
    sessionStore,
    onToolCallEvent: (_e: ToolCallEvent, _r?: PolicyRule) => {},
    onToolResponseEvent: (_e: ToolResponseEvent) => {},
    blockOnCriticalResponseThreats: false,
    skipRequestInspection: true,
    ...overrides,
  };
}

describe('interceptor credential flow', () => {
  let sessionStore: InMemorySessionStore;

  beforeEach(() => {
    sessionStore = makeSessionStore();
  });

  it('step 8b: Railway getEnv response has token replaced with RIND_SYNTH synthetic', async () => {
    const forward = async () => ({
      output: `RAILWAY_TOKEN=${REAL_TOKEN}`,
      durationMs: 1,
    });

    const event: ToolCallEvent = {
      sessionId: SESSION_ID,
      agentId: AGENT_ID,
      serverId: RAILWAY_SERVER,
      toolName: 'getEnv',
      input: {},
      timestamp: Date.now(),
    };

    const { output } = await intercept(event, forward, makeOpts(sessionStore));
    expect(typeof output).toBe('string');
    expect(output as string).not.toContain(REAL_TOKEN);
    expect(output as string).toContain('rly_RIND_SYNTH_');
  });

  it('step 5b: same-server tool input with synthetic → upstream receives real token', async () => {
    // Step 1: run getEnv to populate the vault with the synthetic
    const getEnvForward = async () => ({
      output: `RAILWAY_TOKEN=${REAL_TOKEN}`,
      durationMs: 1,
    });
    const getEnvEvent: ToolCallEvent = {
      sessionId: SESSION_ID,
      agentId: AGENT_ID,
      serverId: RAILWAY_SERVER,
      toolName: 'getEnv',
      input: {},
      timestamp: Date.now(),
    };
    const { output: getEnvOutput } = await intercept(getEnvEvent, getEnvForward, makeOpts(sessionStore));
    const synthetic = (getEnvOutput as string).split('=')[1] ?? '';
    expect(synthetic).toContain('rly_RIND_SYNTH_');

    // Step 2: agent passes the synthetic to volumeDelete on the same server
    let capturedUpstreamInput: unknown;
    const volumeDeleteForward = async (e: ToolCallEvent) => {
      capturedUpstreamInput = e.input;
      return { output: 'deleted', durationMs: 1 };
    };
    const volumeDeleteEvent: ToolCallEvent = {
      sessionId: SESSION_ID,
      agentId: AGENT_ID,
      serverId: RAILWAY_SERVER,
      toolName: 'volumeDelete',
      input: { token: synthetic },
      timestamp: Date.now(),
    };

    const rehydrationEvents: CredentialRehydrationEvent[] = [];
    await intercept(
      volumeDeleteEvent,
      volumeDeleteForward,
      makeOpts(sessionStore, {
        onCredentialRehydration: (e) => rehydrationEvents.push(e),
      }),
    );

    // Upstream received the real token
    expect((capturedUpstreamInput as { token: string }).token).toBe(REAL_TOKEN);
    // Rehydration event emitted
    expect(rehydrationEvents).toHaveLength(1);
    expect(rehydrationEvents[0]?.entityType).toBe('cred-010');
    expect(rehydrationEvents[0]?.sourceTool).toBe('getEnv');
    expect(rehydrationEvents[0]?.targetTool).toBe('volumeDelete');
  });

  it('step 5b: cross-server tool input with synthetic → upstream gets synthetic, exfil event emitted', async () => {
    // Step 1: populate vault via getEnv
    const getEnvForward = async () => ({
      output: `RAILWAY_TOKEN=${REAL_TOKEN}`,
      durationMs: 1,
    });
    const getEnvEvent: ToolCallEvent = {
      sessionId: SESSION_ID,
      agentId: AGENT_ID,
      serverId: RAILWAY_SERVER,
      toolName: 'getEnv',
      input: {},
      timestamp: Date.now(),
    };
    const { output: getEnvOutput } = await intercept(getEnvEvent, getEnvForward, makeOpts(sessionStore));
    const synthetic = (getEnvOutput as string).split('=')[1] ?? '';

    // Step 2: agent tries to pass synthetic to a different (attacker) server
    let capturedUpstreamInput: unknown;
    const attackerForward = async (e: ToolCallEvent) => {
      capturedUpstreamInput = e.input;
      return { output: 'ok', durationMs: 1 };
    };
    const exfilEvent: ToolCallEvent = {
      sessionId: SESSION_ID,
      agentId: AGENT_ID,
      serverId: OTHER_SERVER,   // ← different server
      toolName: 'webhook',
      input: { token: synthetic },
      timestamp: Date.now(),
    };

    const exfilAttempts: CredentialExfiltrationAttemptEvent[] = [];
    await intercept(
      exfilEvent,
      attackerForward,
      makeOpts(sessionStore, {
        onCredentialExfiltrationAttempt: (e) => exfilAttempts.push(e),
      }),
    );

    // Upstream received the synthetic — real token NOT leaked
    expect((capturedUpstreamInput as { token: string }).token).toBe(synthetic);
    expect((capturedUpstreamInput as { token: string }).token).not.toContain(REAL_TOKEN);
    // Exfiltration attempt event emitted
    expect(exfilAttempts).toHaveLength(1);
    expect(exfilAttempts[0]?.reason).toBe('destination_scope_violation');
    expect(exfilAttempts[0]?.entityType).toBe('cred-010');
    expect(exfilAttempts[0]?.targetServerId).toBe(OTHER_SERVER);
  });

  it('audit log holds synthetic on both legs: onToolCallEvent receives synthetic, not real value', async () => {
    // Step 1: populate vault
    const getEnvForward = async () => ({
      output: `RAILWAY_TOKEN=${REAL_TOKEN}`,
      durationMs: 1,
    });
    const getEnvEvent: ToolCallEvent = {
      sessionId: SESSION_ID,
      agentId: AGENT_ID,
      serverId: RAILWAY_SERVER,
      toolName: 'getEnv',
      input: {},
      timestamp: Date.now(),
    };
    const { output: getEnvOutput } = await intercept(getEnvEvent, getEnvForward, makeOpts(sessionStore));
    const synthetic = (getEnvOutput as string).split('=')[1] ?? '';

    // Step 2: second call with synthetic in input — capture what onToolCallEvent sees
    const auditInputs: unknown[] = [];
    const policyStore = new InMemoryPolicyStore({
      policies: [{
        name: 'test-credential-pseudonymize',
        agent: '*',
        match: { content: { scope: 'response', detectors: ['secret'] } },
        action: 'PSEUDONYMIZE',
        failMode: 'open',
      }],
    });
    const policyEngine = new PolicyEngine(policyStore);
    const opts = {
      policyEngine,
      sessionStore,
      onToolCallEvent: (e: ToolCallEvent) => auditInputs.push(e.input),
      onToolResponseEvent: (_e: ToolResponseEvent) => {},
      blockOnCriticalResponseThreats: false,
      skipRequestInspection: true,
    };

    await intercept(
      {
        sessionId: SESSION_ID,
        agentId: AGENT_ID,
        serverId: RAILWAY_SERVER,
        toolName: 'volumeDelete',
        input: { token: synthetic },
        timestamp: Date.now(),
      },
      async () => ({ output: 'deleted', durationMs: 1 }),
      opts,
    );

    // Audit event must carry the synthetic — real token must NOT appear
    const auditInput = auditInputs[0] as { token: string };
    expect(auditInput.token).toBe(synthetic);
    expect(auditInput.token).not.toContain(REAL_TOKEN);
  });
});
