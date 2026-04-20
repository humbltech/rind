import { describe, it, expect } from 'vitest';
import {
  createSession,
  getSession,
  killSession,
  isSessionActive,
  incrementToolCall,
  listSessions,
} from '../session.js';

describe('session management', () => {
  it('creates an active session', () => {
    const session = createSession('agent-test');
    expect(session.active).toBe(true);
    expect(session.agentId).toBe('agent-test');
    expect(session.toolCallCount).toBe(0);
    expect(session.sessionId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('retrieves a created session by ID', () => {
    const session = createSession('agent-get');
    const retrieved = getSession(session.sessionId);
    expect(retrieved).toBeDefined();
    expect(retrieved?.sessionId).toBe(session.sessionId);
  });

  it('kills a session and marks it inactive', () => {
    const session = createSession('agent-kill');
    expect(isSessionActive(session.sessionId)).toBe(true);
    killSession(session.sessionId);
    expect(isSessionActive(session.sessionId)).toBe(false);
  });

  it('returns false when killing a non-existent session', () => {
    const killed = killSession('does-not-exist');
    expect(killed).toBe(false);
  });

  it('increments tool call count', () => {
    const session = createSession('agent-count');
    incrementToolCall(session.sessionId);
    incrementToolCall(session.sessionId);
    const retrieved = getSession(session.sessionId);
    expect(retrieved?.toolCallCount).toBe(2);
  });

  it('lists all created sessions', () => {
    const before = listSessions().length;
    createSession('agent-list');
    const after = listSessions().length;
    expect(after).toBe(before + 1);
  });
});
