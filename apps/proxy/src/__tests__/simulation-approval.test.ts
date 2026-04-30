// Approval flow simulation — integration tests for REQUIRE_APPROVAL.
//
// The hook endpoint blocks the HTTP response until a human approves/denies
// via the /approvals/:id/* endpoints. Tests must send the evaluate request
// concurrently with the approve/deny action.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { createProxyServer } from '../lib.js';
import type { PolicyRule } from '../types.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function createApp(policies: PolicyRule[], timeoutMs?: number) {
  return createProxyServer({
    port: 0,
    agentId: 'sim-agent',
    upstreamMcpUrl: 'http://mock-unused',
    logLevel: 'error',
    policy: { policies },
    ...(timeoutMs !== undefined ? {} : {}),
  }).app;
}

const APPROVAL_POLICY: PolicyRule[] = [{
  name: 'require-approval-bash',
  agent: '*',
  match: { tool: ['Bash'] },
  action: 'REQUIRE_APPROVAL',
  priority: 10,
  approval: { timeout: '2s', onTimeout: 'DENY' },
}];

const APPROVAL_ALLOW_POLICY: PolicyRule[] = [{
  name: 'require-approval-bash',
  agent: '*',
  match: { tool: ['Bash'] },
  action: 'REQUIRE_APPROVAL',
  priority: 10,
  approval: { timeout: '2s', onTimeout: 'ALLOW' },
}];

function hookPayload(sessionId = 'approval-session') {
  return JSON.stringify({
    session_id: sessionId,
    hook_event_name: 'PreToolUse',
    tool_name: 'Bash',
    tool_input: { command: 'rm -rf /important' },
  });
}

async function getApprovals(app: ReturnType<typeof createApp>) {
  const res = await app.request('/approvals');
  return res.json() as Promise<Array<{ id: string; toolName: string; sessionId: string }>>;
}

async function getEvents(app: ReturnType<typeof createApp>) {
  const res = await app.request('/logs/tool-calls');
  return res.json() as Promise<Array<Record<string, unknown>>>;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('/hook/evaluate — REQUIRE_APPROVAL flow', () => {
  afterEach(() => { vi.useRealTimers(); });

  it('approve → permissionDecision: allow', async () => {
    const app = createApp(APPROVAL_POLICY);

    const evalPromise = app.request('/hook/evaluate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: hookPayload(),
    });

    // Give the evaluate request time to enqueue the approval
    await new Promise((r) => setTimeout(r, 50));

    const pending = await getApprovals(app);
    expect(pending.length).toBeGreaterThanOrEqual(1);

    await app.request(`/approvals/${pending[0]!.id}/approve`, { method: 'POST' });

    const evalRes = await evalPromise;
    const body = await evalRes.json() as Record<string, unknown>;
    const out = body['hookSpecificOutput'] as Record<string, unknown>;
    expect(out['permissionDecision']).toBe('allow');
  });

  it('deny → continue: false', async () => {
    const app = createApp(APPROVAL_POLICY);

    const evalPromise = app.request('/hook/evaluate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: hookPayload('deny-session'),
    });

    await new Promise((r) => setTimeout(r, 50));
    const pending = await getApprovals(app);
    const myApproval = pending.find((a) => a.sessionId === 'deny-session');
    expect(myApproval).toBeDefined();

    await app.request(`/approvals/${myApproval!.id}/deny`, { method: 'POST' });

    const evalRes = await evalPromise;
    const body = await evalRes.json() as Record<string, unknown>;
    expect(body['continue']).toBe(false);
  });

  it('timeout with onTimeout:DENY → continue: false', async () => {
    vi.useFakeTimers();
    const app = createApp(APPROVAL_POLICY);

    const evalPromise = app.request('/hook/evaluate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: hookPayload('timeout-deny-session'),
    });

    // Advance timers to trigger the 2s timeout
    await vi.advanceTimersByTimeAsync(3_000);

    const evalRes = await evalPromise;
    const body = await evalRes.json() as Record<string, unknown>;
    expect(body['continue']).toBe(false);
    expect(body['stopReason']).toMatch(/timed out/i);
  });

  it('timeout with onTimeout:ALLOW → permissionDecision: allow', async () => {
    vi.useFakeTimers();
    const app = createApp(APPROVAL_ALLOW_POLICY);

    const evalPromise = app.request('/hook/evaluate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: hookPayload('timeout-allow-session'),
    });

    await vi.advanceTimersByTimeAsync(3_000);

    const evalRes = await evalPromise;
    const body = await evalRes.json() as Record<string, unknown>;
    const out = body['hookSpecificOutput'] as Record<string, unknown>;
    expect(out['permissionDecision']).toBe('allow');
  });

  it('event outcome: approved', async () => {
    const app = createApp(APPROVAL_POLICY);

    const evalPromise = app.request('/hook/evaluate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: hookPayload('outcome-approve'),
    });

    await new Promise((r) => setTimeout(r, 50));
    const pending = await getApprovals(app);
    const mine = pending.find((a) => a.sessionId === 'outcome-approve');
    await app.request(`/approvals/${mine!.id}/approve`, { method: 'POST' });
    await evalPromise;

    const events = await getEvents(app);
    const event = events.find((e) => e['sessionId'] === 'outcome-approve' && e['toolName'] === 'Bash');
    expect(event?.['outcome']).toBe('approved');
  });

  it('event outcome: disapproved', async () => {
    const app = createApp(APPROVAL_POLICY);

    const evalPromise = app.request('/hook/evaluate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: hookPayload('outcome-deny'),
    });

    await new Promise((r) => setTimeout(r, 50));
    const pending = await getApprovals(app);
    const mine = pending.find((a) => a.sessionId === 'outcome-deny');
    await app.request(`/approvals/${mine!.id}/deny`, { method: 'POST' });
    await evalPromise;

    const events = await getEvents(app);
    const event = events.find((e) => e['sessionId'] === 'outcome-deny' && e['toolName'] === 'Bash');
    expect(event?.['outcome']).toBe('disapproved');
  });

  it('event outcome: approval-timeout', async () => {
    vi.useFakeTimers();
    const app = createApp(APPROVAL_POLICY);

    const evalPromise = app.request('/hook/evaluate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: hookPayload('outcome-timeout'),
    });

    await vi.advanceTimersByTimeAsync(3_000);
    await evalPromise;

    vi.useRealTimers();
    const events = await getEvents(app);
    const event = events.find((e) => e['sessionId'] === 'outcome-timeout');
    expect(event?.['outcome']).toBe('approval-timeout');
  });

  it('approval queue: shows pending → resolves → queue empty', async () => {
    const app = createApp(APPROVAL_POLICY);

    const evalPromise = app.request('/hook/evaluate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: hookPayload('queue-lifecycle'),
    });

    await new Promise((r) => setTimeout(r, 50));

    const beforeApprove = await getApprovals(app);
    const mine = beforeApprove.find((a) => a.sessionId === 'queue-lifecycle');
    expect(mine).toBeDefined();

    await app.request(`/approvals/${mine!.id}/approve`, { method: 'POST' });
    await evalPromise;

    const afterApprove = await getApprovals(app);
    const stillPending = afterApprove.find((a) => a.id === mine!.id);
    expect(stillPending).toBeUndefined();
  });
});
