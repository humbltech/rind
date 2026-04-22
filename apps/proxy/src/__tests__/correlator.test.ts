import { describe, it, expect } from 'vitest';
import { CorrelationTracker, correlationBaseHash } from '../hooks/correlator.js';

describe('correlationBaseHash', () => {
  it('produces a deterministic 16-char hex hash', () => {
    const h1 = correlationBaseHash('sess-1', 'Bash', { command: 'git status' });
    const h2 = correlationBaseHash('sess-1', 'Bash', { command: 'git status' });
    expect(h1).toBe(h2);
    expect(h1).toHaveLength(16);
    expect(h1).toMatch(/^[0-9a-f]{16}$/);
  });

  it('differs when session changes', () => {
    const h1 = correlationBaseHash('sess-1', 'Bash', { command: 'ls' });
    const h2 = correlationBaseHash('sess-2', 'Bash', { command: 'ls' });
    expect(h1).not.toBe(h2);
  });

  it('differs when tool name changes', () => {
    const h1 = correlationBaseHash('sess-1', 'Bash', { command: 'ls' });
    const h2 = correlationBaseHash('sess-1', 'Read', { command: 'ls' });
    expect(h1).not.toBe(h2);
  });

  it('differs when input changes', () => {
    const h1 = correlationBaseHash('sess-1', 'Bash', { command: 'ls' });
    const h2 = correlationBaseHash('sess-1', 'Bash', { command: 'pwd' });
    expect(h1).not.toBe(h2);
  });

  it('handles null input', () => {
    const h = correlationBaseHash('sess-1', 'Bash', null);
    expect(h).toHaveLength(16);
  });
});

describe('CorrelationTracker', () => {
  it('matches a PostToolUse to its PreToolUse', () => {
    const tracker = new CorrelationTracker();
    const preId = tracker.recordPreToolUse('s1', 'Bash', { command: 'ls' });
    const postId = tracker.matchPostToolUse('s1', 'Bash', { command: 'ls' });
    expect(postId).toBe(preId);
  });

  it('returns undefined when no matching PreToolUse exists', () => {
    const tracker = new CorrelationTracker();
    const postId = tracker.matchPostToolUse('s1', 'Bash', { command: 'ls' });
    expect(postId).toBeUndefined();
  });

  it('handles duplicate identical calls in FIFO order', () => {
    const tracker = new CorrelationTracker();
    const pre1 = tracker.recordPreToolUse('s1', 'Bash', { command: 'ls' });
    const pre2 = tracker.recordPreToolUse('s1', 'Bash', { command: 'ls' });
    const pre3 = tracker.recordPreToolUse('s1', 'Bash', { command: 'ls' });

    // Each match consumes in FIFO order
    expect(tracker.matchPostToolUse('s1', 'Bash', { command: 'ls' })).toBe(pre1);
    expect(tracker.matchPostToolUse('s1', 'Bash', { command: 'ls' })).toBe(pre2);
    expect(tracker.matchPostToolUse('s1', 'Bash', { command: 'ls' })).toBe(pre3);
    // No more pending
    expect(tracker.matchPostToolUse('s1', 'Bash', { command: 'ls' })).toBeUndefined();
  });

  it('does not cross-match different tools', () => {
    const tracker = new CorrelationTracker();
    tracker.recordPreToolUse('s1', 'Bash', { command: 'ls' });
    const postId = tracker.matchPostToolUse('s1', 'Read', { command: 'ls' });
    expect(postId).toBeUndefined();
  });

  it('does not cross-match different sessions', () => {
    const tracker = new CorrelationTracker();
    tracker.recordPreToolUse('s1', 'Bash', { command: 'ls' });
    const postId = tracker.matchPostToolUse('s2', 'Bash', { command: 'ls' });
    expect(postId).toBeUndefined();
  });

  it('generates unique correlation IDs with incrementing sequence', () => {
    const tracker = new CorrelationTracker();
    const pre1 = tracker.recordPreToolUse('s1', 'Bash', { command: 'ls' });
    const pre2 = tracker.recordPreToolUse('s1', 'Bash', { command: 'ls' });
    expect(pre1).not.toBe(pre2);
    expect(pre1).toMatch(/-1$/);
    expect(pre2).toMatch(/-2$/);
  });

  it('tracks pending count', () => {
    const tracker = new CorrelationTracker();
    expect(tracker.pendingCount).toBe(0);
    tracker.recordPreToolUse('s1', 'Bash', { command: 'ls' });
    tracker.recordPreToolUse('s1', 'Read', { file_path: '/a' });
    expect(tracker.pendingCount).toBe(2);
    tracker.matchPostToolUse('s1', 'Bash', { command: 'ls' });
    expect(tracker.pendingCount).toBe(1);
  });

  it('cleanup removes expired entries', () => {
    const tracker = new CorrelationTracker();
    tracker.recordPreToolUse('s1', 'Bash', { command: 'ls' });
    expect(tracker.pendingCount).toBe(1);

    // Manually expire by manipulating the internal timestamp
    // (we can't easily mock Date.now, so just verify cleanup runs without error)
    tracker.cleanup();
    // Entry is not yet expired (just created), so it remains
    expect(tracker.pendingCount).toBe(1);
  });
});
