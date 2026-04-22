// Tests for the approval queue — the in-memory store that holds pending
// REQUIRE_APPROVAL requests until a human decides or the timeout expires.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { ApprovalQueue } from '../approval-queue.js';

afterEach(() => {
  vi.useRealTimers();
});

describe('ApprovalQueue', () => {
  it('enqueues a pending approval and returns it in list()', () => {
    const q = new ApprovalQueue();
    const { approval } = q.enqueue({
      sessionId: 's1',
      agentId: 'agent-1',
      toolName: 'Bash',
      input: { command: 'rm -rf /' },
      reason: 'Dangerous command',
    });

    expect(approval.id).toBeTruthy();
    expect(q.size).toBe(1);
    expect(q.list()).toHaveLength(1);
    expect(q.get(approval.id)?.toolName).toBe('Bash');
    q.destroy();
  });

  it('resolves with approve when approved', async () => {
    const q = new ApprovalQueue();
    const { approval, wait } = q.enqueue({
      sessionId: 's1',
      agentId: 'agent-1',
      toolName: 'Bash',
      input: {},
      reason: 'test',
    });

    // Approve immediately
    const found = q.approve(approval.id, 'admin');
    expect(found).toBe(true);
    expect(q.size).toBe(0);

    const result = await wait;
    expect(result.decision).toBe('approve');
    expect(result.decidedBy).toBe('admin');
    q.destroy();
  });

  it('resolves with deny when denied', async () => {
    const q = new ApprovalQueue();
    const { approval, wait } = q.enqueue({
      sessionId: 's1',
      agentId: 'agent-1',
      toolName: 'Bash',
      input: {},
      reason: 'test',
    });

    q.deny(approval.id, 'security-team');
    const result = await wait;
    expect(result.decision).toBe('deny');
    expect(result.decidedBy).toBe('security-team');
    q.destroy();
  });

  it('resolves with timeout when timeout expires', async () => {
    vi.useFakeTimers();
    const q = new ApprovalQueue();
    const { wait } = q.enqueue({
      sessionId: 's1',
      agentId: 'agent-1',
      toolName: 'Bash',
      input: {},
      reason: 'test',
      timeoutMs: 5000,
    });

    vi.advanceTimersByTime(5000);
    const result = await wait;
    expect(result.decision).toBe('timeout');
    expect(q.size).toBe(0);
    q.destroy();
  });

  it('returns false when approving a non-existent ID', () => {
    const q = new ApprovalQueue();
    expect(q.approve('non-existent')).toBe(false);
    q.destroy();
  });

  it('returns false when approving an already-resolved request', async () => {
    const q = new ApprovalQueue();
    const { approval, wait } = q.enqueue({
      sessionId: 's1',
      agentId: 'agent-1',
      toolName: 'Bash',
      input: {},
      reason: 'test',
    });

    q.approve(approval.id);
    await wait;
    // Second approve should fail
    expect(q.approve(approval.id)).toBe(false);
    q.destroy();
  });

  it('uses default timeout of 120s and onTimeout DENY', () => {
    const q = new ApprovalQueue();
    const { approval } = q.enqueue({
      sessionId: 's1',
      agentId: 'agent-1',
      toolName: 'Bash',
      input: {},
      reason: 'test',
    });

    expect(approval.timeoutMs).toBe(120_000);
    expect(approval.onTimeout).toBe('DENY');
    q.destroy();
  });

  it('respects custom timeout and onTimeout', () => {
    const q = new ApprovalQueue();
    const { approval } = q.enqueue({
      sessionId: 's1',
      agentId: 'agent-1',
      toolName: 'Bash',
      input: {},
      reason: 'test',
      timeoutMs: 30_000,
      onTimeout: 'ALLOW',
    });

    expect(approval.timeoutMs).toBe(30_000);
    expect(approval.onTimeout).toBe('ALLOW');
    q.destroy();
  });

  it('destroy() clears all pending approvals', () => {
    const q = new ApprovalQueue();
    q.enqueue({ sessionId: 's1', agentId: 'a1', toolName: 'T1', input: {}, reason: 'r' });
    q.enqueue({ sessionId: 's2', agentId: 'a2', toolName: 'T2', input: {}, reason: 'r' });
    expect(q.size).toBe(2);

    q.destroy();
    expect(q.size).toBe(0);
  });
});
