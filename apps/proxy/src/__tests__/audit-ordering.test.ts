// Regression guard for council SEC-6: onToolCallEvent must fire BEFORE step 5b
// rehydration so that audit log entries always carry synthetics, not real credentials.
//
// If step 5b ever moves before onToolCallEvent, this test will catch the regression:
// the audit event's input would contain the real credential instead of the synthetic.

import { describe, it, expect } from 'vitest';
import { intercept } from '../interceptor.js';
import { PolicyEngine } from '../policy/engine.js';
import { InMemoryPolicyStore } from '../policy/store.js';
import { InMemorySessionStore } from '../session.js';
import type { ToolCallEvent, ToolResponseEvent, PolicyRule } from '../types.js';

const AGENT_ID = 'agent-order-test';
const SESSION_ID = 'sess-order-test';
const RAILWAY_SERVER = 'railway';
const REAL_TOKEN = 'rly_order_test_abcdefghijklmnopqrst'; // gitleaks:allow

describe('audit ordering: onToolCallEvent fires before step 5b rehydration (SEC-6)', () => {
  it('audit event input carries synthetic; upstream forward receives real value', async () => {
    const store = new InMemorySessionStore();
    store.create(AGENT_ID, SESSION_ID);

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

    // ── Phase 1: populate the vault ──────────────────────────────────────────
    const populateOpts = {
      policyEngine,
      sessionStore: store,
      onToolCallEvent: (_e: ToolCallEvent, _r?: PolicyRule) => {},
      onToolResponseEvent: (_e: ToolResponseEvent) => {},
      blockOnCriticalResponseThreats: false,
      skipRequestInspection: true,
    };

    const { output: rawOutput } = await intercept(
      {
        sessionId: SESSION_ID,
        agentId: AGENT_ID,
        serverId: RAILWAY_SERVER,
        toolName: 'getEnv',
        input: {},
        timestamp: Date.now(),
      },
      async () => ({ output: `RAILWAY_TOKEN=${REAL_TOKEN}`, durationMs: 1 }),
      populateOpts,
    );

    const synthetic = (rawOutput as string).split('=')[1] ?? '';
    expect(synthetic).toContain('rly_RIND_SYNTH_');

    // ── Phase 2: send synthetic back; record audit event input + upstream input ─
    const auditEventInputs: unknown[] = [];
    const upstreamInputs: unknown[] = [];

    const opts = {
      policyEngine,
      sessionStore: store,
      onToolCallEvent: (e: ToolCallEvent) => {
        // Capture BEFORE step 5b fires — must still hold the synthetic
        auditEventInputs.push(e.input);
      },
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
      async (e: ToolCallEvent) => {
        upstreamInputs.push(e.input);
        return { output: 'deleted', durationMs: 1 };
      },
      opts,
    );

    // Audit event (step 4) carries the synthetic — real value not yet rehydrated
    const auditInput = auditEventInputs[0] as { token: string };
    expect(auditInput.token).toBe(synthetic);
    expect(auditInput.token).not.toBe(REAL_TOKEN);

    // Upstream (step 6) receives the real token — rehydration happened in step 5b
    const upstreamInput = upstreamInputs[0] as { token: string };
    expect(upstreamInput.token).toBe(REAL_TOKEN);
    expect(upstreamInput.token).not.toContain('RIND_SYNTH');
  });
});
