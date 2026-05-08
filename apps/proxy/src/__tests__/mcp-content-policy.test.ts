// MCP content policy tests.
//
// Covers the rule-driven content evaluation path for MCP tool responses:
//   - evaluateMcpResponseContent unit tests (ALLOW / DENY / PSEUDONYMIZE / REDACT)
//   - Server-scoped rule matching
//   - Full intercept round-trips: step 8b pseudonymization + step 5c rehydration

import { describe, it, expect, vi } from 'vitest';
import { evaluateMcpResponseContent } from '../inspector/content-evaluator.js';
import { intercept } from '../interceptor.js';
import { PolicyEngine } from '../policy/engine.js';
import { InMemoryPolicyStore } from '../policy/store.js';
import { InMemorySessionStore } from '../session.js';
import { createCredentialVault } from '../credential-vault.js';
import { createPIIVault } from '../pii-vault.js';
import type { ToolCallEvent, ToolResponseEvent, PolicyRule } from '../types.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeEvent(overrides: Partial<ToolCallEvent> = {}): ToolCallEvent {
  return {
    sessionId: 'sess-1',
    agentId: 'agent-1',
    serverId: 'railway',
    toolName: 'getEnv',
    input: {},
    timestamp: Date.now(),
    source: 'mcp',
    ...overrides,
  };
}

const PII_PSEUDONYMIZE_RULE: PolicyRule = {
  name: 'pseudonymize-pii',
  agent: '*',
  match: { content: { scope: 'response', detectors: ['pii'] } },
  pii: { entities: ['EMAIL', 'PHONE'] },
  action: 'PSEUDONYMIZE',
  priority: 10,
};

const SECRET_PSEUDONYMIZE_RULE: PolicyRule = {
  name: 'pseudonymize-secrets',
  agent: '*',
  match: { content: { scope: 'response', detectors: ['secret'] } },
  secrets: {},
  action: 'PSEUDONYMIZE',
  priority: 10,
};

const SECRET_DENY_RULE: PolicyRule = {
  name: 'deny-secrets',
  agent: '*',
  match: { content: { scope: 'response', detectors: ['secret'] } },
  secrets: {},
  action: 'DENY',
  priority: 5,
};

// ─── Unit: evaluateMcpResponseContent ─────────────────────────────────────────

describe('evaluateMcpResponseContent — ALLOW', () => {
  it('returns ALLOW when output has no matching content', async () => {
    const credVault = createCredentialVault('agent-1');
    const piiVault = createPIIVault('agent-1');
    const result = await evaluateMcpResponseContent(
      { message: 'deployed successfully' },
      makeEvent(),
      [PII_PSEUDONYMIZE_RULE],
      credVault,
      piiVault,
    );
    expect(result.action).toBe('ALLOW');
    expect(result.transformedOutput).toBeUndefined();
    credVault.dispose();
    piiVault.dispose();
  });

  it('returns ALLOW when no content rules exist', async () => {
    const credVault = createCredentialVault('agent-1');
    const piiVault = createPIIVault('agent-1');
    const metadataOnlyRule: PolicyRule = {
      name: 'no-content',
      agent: '*',
      match: { tool: ['deploy'] },
      action: 'DENY',
    };
    const result = await evaluateMcpResponseContent(
      'alice@corp.com',
      makeEvent(),
      [metadataOnlyRule],
      credVault,
      piiVault,
    );
    expect(result.action).toBe('ALLOW');
    credVault.dispose();
    piiVault.dispose();
  });

  it('skips scope:request rules on the response path', async () => {
    const requestRule: PolicyRule = {
      name: 'request-only',
      agent: '*',
      match: { content: { scope: 'request', detectors: ['pii'] } },
      pii: { entities: ['EMAIL'] },
      action: 'DENY',
      priority: 5,
    };
    const credVault = createCredentialVault('agent-1');
    const piiVault = createPIIVault('agent-1');
    const result = await evaluateMcpResponseContent(
      'contact alice@corp.com',
      makeEvent(),
      [requestRule],
      credVault,
      piiVault,
    );
    expect(result.action).toBe('ALLOW');
    credVault.dispose();
    piiVault.dispose();
  });
});

describe('evaluateMcpResponseContent — DENY', () => {
  it('blocks output when a DENY rule fires on secret detection', async () => {
    const credVault = createCredentialVault('agent-1');
    const piiVault = createPIIVault('agent-1');
    const result = await evaluateMcpResponseContent(
      { token: 'sk-abcdefghijklmnopqrstuvwxyz1234567890abcd' }, // gitleaks:allow
      makeEvent(),
      [SECRET_DENY_RULE],
      credVault,
      piiVault,
    );
    expect(result.action).toBe('DENY');
    expect(result.matchedRule).toBe('deny-secrets');
    expect(result.transformedOutput).toBeUndefined();
    credVault.dispose();
    piiVault.dispose();
  });
});

describe('evaluateMcpResponseContent — PSEUDONYMIZE (pii)', () => {
  it('replaces email with synthetic in string output', async () => {
    const credVault = createCredentialVault('agent-1');
    const piiVault = createPIIVault('agent-1');
    const result = await evaluateMcpResponseContent(
      'Contact alice@corp.com for details',
      makeEvent(),
      [PII_PSEUDONYMIZE_RULE],
      credVault,
      piiVault,
    );
    expect(result.action).toBe('PSEUDONYMIZE');
    expect(result.transformedOutput).not.toContain('alice@corp.com');
    expect(result.transformedOutput).toContain('@example.com');
    credVault.dispose();
    piiVault.dispose();
  });

  it('replaces email in nested object output', async () => {
    const credVault = createCredentialVault('agent-1');
    const piiVault = createPIIVault('agent-1');
    const output = { user: { name: 'Alice', email: 'alice@corp.com' }, status: 'active' };
    const result = await evaluateMcpResponseContent(
      output,
      makeEvent(),
      [PII_PSEUDONYMIZE_RULE],
      credVault,
      piiVault,
    );
    expect(result.action).toBe('PSEUDONYMIZE');
    const transformed = result.transformedOutput as typeof output;
    expect(transformed.user.email).not.toBe('alice@corp.com');
    expect(transformed.user.email).toContain('@example.com');
    expect(transformed.user.name).toBe('Alice');
    credVault.dispose();
    piiVault.dispose();
  });

  it('real email never appears in the returned result (audit-ordering invariant)', async () => {
    const credVault = createCredentialVault('agent-1');
    const piiVault = createPIIVault('agent-1');
    const result = await evaluateMcpResponseContent(
      { email: 'alice@corp.com', phone: '416-555-7890' },
      makeEvent(),
      [PII_PSEUDONYMIZE_RULE],
      credVault,
      piiVault,
    );
    const jsonOut = JSON.stringify(result.transformedOutput);
    expect(jsonOut).not.toContain('alice@corp.com');
    expect(jsonOut).not.toContain('416-555-7890');
    credVault.dispose();
    piiVault.dispose();
  });
});

describe('evaluateMcpResponseContent — PSEUDONYMIZE (secret)', () => {
  it('replaces credential with RIND_SYNTH synthetic in output', async () => {
    const credVault = createCredentialVault('agent-1');
    const piiVault = createPIIVault('agent-1');
    // gitleaks:allow
    const realToken = 'rly_mcp_policy_test_abcdefghijklmnopqrst';
    const result = await evaluateMcpResponseContent(
      `RAILWAY_TOKEN=${realToken}`,
      makeEvent(),
      [SECRET_PSEUDONYMIZE_RULE],
      credVault,
      piiVault,
    );
    expect(result.action).toBe('PSEUDONYMIZE');
    const out = result.transformedOutput as string;
    expect(out).not.toContain(realToken);
    expect(out).toContain('rly_RIND_SYNTH_');
    credVault.dispose();
    piiVault.dispose();
  });
});

describe('evaluateMcpResponseContent — REDACT', () => {
  it('pseudonymizes credential (REDACT+secret) via credVault.applyTokensDeep', async () => {
    const credVault = createCredentialVault('agent-1');
    const piiVault = createPIIVault('agent-1');
    // gitleaks:allow
    const realToken = 'rly_mcp_redact_test_abcdefghijklmnopqrst';
    const redactRule: PolicyRule = {
      name: 'redact-secrets',
      agent: '*',
      match: { content: { scope: 'response', detectors: ['secret'] } },
      secrets: { patterns: ['railway_token'] },
      action: 'REDACT',
      priority: 5,
    };
    const result = await evaluateMcpResponseContent(
      // The Railway pattern requires RAILWAY_TOKEN= prefix
      `RAILWAY_TOKEN=${realToken}`,
      makeEvent(),
      [redactRule],
      credVault,
      piiVault,
    );
    expect(result.action).toBe('REDACT');
    const out = result.transformedOutput as string;
    expect(out).not.toContain(realToken);
    expect(out).toContain('rly_RIND_SYNTH_');
    credVault.dispose();
    piiVault.dispose();
  });

  it('blanks all strings with [REDACTED] for dlp/injection detectors', async () => {
    const credVault = createCredentialVault('agent-1');
    const piiVault = createPIIVault('agent-1');
    const dlpRule: PolicyRule = {
      name: 'dlp-block',
      agent: '*',
      match: { content: { scope: 'response', detectors: ['dlp'] } },
      dlp: { patterns: [{ name: 'internal-id', regex: 'CORP-\\d+', severity: 'high' }] },
      action: 'REDACT',
      priority: 5,
    };
    const result = await evaluateMcpResponseContent(
      { id: 'CORP-12345', label: 'resource' },
      makeEvent(),
      [dlpRule],
      credVault,
      piiVault,
    );
    expect(result.action).toBe('REDACT');
    const out = result.transformedOutput as { id: string; label: string };
    expect(out.id).toBe('[REDACTED]');
    expect(out.label).toBe('[REDACTED]');
    credVault.dispose();
    piiVault.dispose();
  });
});

describe('evaluateMcpResponseContent — server scoping', () => {
  it('rule with match.serverId only fires for that server', async () => {
    const railwayRule: PolicyRule = {
      name: 'railway-pii',
      agent: '*',
      match: {
        serverId: ['railway'],
        content: { scope: 'response', detectors: ['pii'] },
      },
      pii: { entities: ['EMAIL'] },
      action: 'PSEUDONYMIZE',
      priority: 10,
    };
    const credVault = createCredentialVault('agent-1');
    const piiVault = createPIIVault('agent-1');

    // Matches railway
    const railwayResult = await evaluateMcpResponseContent(
      'email: alice@corp.com',
      makeEvent({ serverId: 'railway' }),
      [railwayRule],
      credVault,
      piiVault,
    );
    expect(railwayResult.action).toBe('PSEUDONYMIZE');

    // Does NOT match github
    const githubResult = await evaluateMcpResponseContent(
      'email: alice@corp.com',
      makeEvent({ serverId: 'github' }),
      [railwayRule],
      credVault,
      piiVault,
    );
    expect(githubResult.action).toBe('ALLOW');

    credVault.dispose();
    piiVault.dispose();
  });
});

// ─── Integration: step 8b + step 5c round-trip ────────────────────────────────

describe('MCP intercept — PII pseudonymize + rehydrate round-trip', () => {
  function makeStore() {
    const store = new InMemorySessionStore();
    store.create('agent-rt', 'sess-rt');
    return store;
  }

  function makeEngine(rules: PolicyRule[]) {
    return new PolicyEngine(new InMemoryPolicyStore({ policies: rules }));
  }

  it('step 8b: PII in tool response is pseudonymized; real email not in ToolResponseEvent', async () => {
    const store = makeStore();
    const policyEngine = makeEngine([PII_PSEUDONYMIZE_RULE]);

    const responseEvents: ToolResponseEvent[] = [];
    const opts = {
      policyEngine,
      sessionStore: store,
      onToolCallEvent: vi.fn(),
      onToolResponseEvent: (e: ToolResponseEvent) => responseEvents.push(e),
      blockOnCriticalResponseThreats: false,
      skipRequestInspection: true,
    };

    const { output } = await intercept(
      makeEvent({ agentId: 'agent-rt', sessionId: 'sess-rt', serverId: 'railway', toolName: 'getUser' }),
      async () => ({ output: { email: 'alice@corp.com', name: 'Alice' }, durationMs: 5 }),
      opts,
    );

    // The agent-facing output should carry synthetic, not real email
    const out = output as { email: string; name: string };
    expect(out.email).not.toBe('alice@corp.com');
    expect(out.email).toContain('@example.com');
    expect(out.name).toBe('Alice');

    // ToolResponseEvent also carries synthetic (audit-ordering invariant)
    expect(responseEvents).toHaveLength(1);
    const respOutput = responseEvents[0]!.output as { email: string };
    expect(respOutput.email).not.toBe('alice@corp.com');
  });

  it('step 5c: synthetic email in next tool input is rehydrated to real email upstream (same server)', async () => {
    const store = makeStore();
    const policyEngine = makeEngine([PII_PSEUDONYMIZE_RULE]);

    const opts = {
      policyEngine,
      sessionStore: store,
      onToolCallEvent: vi.fn(),
      onToolResponseEvent: vi.fn(),
      blockOnCriticalResponseThreats: false,
      skipRequestInspection: true,
    };

    // Phase 1: populate vault via tool response
    const { output: phase1Out } = await intercept(
      makeEvent({ agentId: 'agent-rt', sessionId: 'sess-rt', serverId: 'railway', toolName: 'getUser' }),
      async () => ({ output: 'User email: alice@corp.com', durationMs: 5 }),
      opts,
    );
    const synthetic = (phase1Out as string).replace('User email: ', '');
    expect(synthetic).toContain('@example.com');

    // Phase 2: agent passes synthetic back in tool input — upstream should see real email
    const upstreamInputs: unknown[] = [];
    await intercept(
      makeEvent({
        agentId: 'agent-rt',
        sessionId: 'sess-rt',
        serverId: 'railway',
        toolName: 'sendEmail',
        input: { to: synthetic, subject: 'hello' },
      }),
      async (e: ToolCallEvent) => {
        upstreamInputs.push(e.input);
        return { output: 'sent', durationMs: 5 };
      },
      opts,
    );

    expect(upstreamInputs).toHaveLength(1);
    const fwdInput = upstreamInputs[0] as { to: string };
    expect(fwdInput.to).toBe('alice@corp.com');
    expect(fwdInput.to).not.toContain('@example.com');
  });

  it('step 5c: synthetic email blocked when forwarded to different server; exfil event emitted', async () => {
    const store = makeStore();
    const policyEngine = makeEngine([PII_PSEUDONYMIZE_RULE]);

    const exfilEvents: unknown[] = [];
    const opts = {
      policyEngine,
      sessionStore: store,
      onToolCallEvent: vi.fn(),
      onToolResponseEvent: vi.fn(),
      onCredentialExfiltrationAttempt: (e: unknown) => exfilEvents.push(e),
      blockOnCriticalResponseThreats: false,
      skipRequestInspection: true,
    };

    // Phase 1: populate vault via railway tool response
    const { output: phase1Out } = await intercept(
      makeEvent({ agentId: 'agent-rt', sessionId: 'sess-rt', serverId: 'railway', toolName: 'getUser' }),
      async () => ({ output: 'alice@corp.com', durationMs: 5 }),
      opts,
    );
    const synthetic = phase1Out as string;
    expect(synthetic).toContain('@example.com');

    // Phase 2: agent passes synthetic to DIFFERENT server — should NOT rehydrate
    const upstreamInputs: unknown[] = [];
    await intercept(
      makeEvent({
        agentId: 'agent-rt',
        sessionId: 'sess-rt',
        serverId: 'github', // different server
        toolName: 'createIssue',
        input: { body: synthetic },
      }),
      async (e: ToolCallEvent) => {
        upstreamInputs.push(e.input);
        return { output: 'ok', durationMs: 5 };
      },
      opts,
    );

    // Upstream gets synthetic (not real email)
    const fwdInput = upstreamInputs[0] as { body: string };
    expect(fwdInput.body).toBe(synthetic);
    expect(fwdInput.body).not.toBe('alice@corp.com');

    // Exfiltration attempt event emitted
    expect(exfilEvents).toHaveLength(1);
  });

  it('step 8b DENY: blocked output returns no-output result', async () => {
    const store = makeStore();
    const policyEngine = makeEngine([SECRET_DENY_RULE]);

    const opts = {
      policyEngine,
      sessionStore: store,
      onToolCallEvent: vi.fn(),
      onToolResponseEvent: vi.fn(),
      blockOnCriticalResponseThreats: false,
      skipRequestInspection: true,
    };

    const result = await intercept(
      makeEvent({ agentId: 'agent-rt', sessionId: 'sess-rt' }),
      async () => ({ output: 'ANTHROPIC_API_KEY=sk-abcdefghijklmnopqrstuvwxyz1234567890abcd', durationMs: 5 }), // gitleaks:allow
      opts,
    );

    expect(result.output).toBeNull();
    expect(result.interceptorResult.action).toBe('BLOCKED_THREAT');
    expect(result.interceptorResult.matchedRule).toBe('deny-secrets');
  });
});
