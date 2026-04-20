// Session tracking: every proxy session has a unique ID, agent identity,
// start time, active flag, and running counters.
// The kill-switch sets active = false; the interceptor blocks subsequent calls.

import { randomUUID } from 'node:crypto';
import type { Session } from './types.js';

const sessions = new Map<string, Session>();

export function createSession(agentId: string): Session {
  const session: Session = {
    sessionId: randomUUID(),
    agentId,
    startedAt: Date.now(),
    active: true,
    toolCallCount: 0,
    estimatedCostUsd: 0,
  };
  sessions.set(session.sessionId, session);
  return session;
}

export function getSession(sessionId: string): Session | undefined {
  return sessions.get(sessionId);
}

export function killSession(sessionId: string): boolean {
  const session = sessions.get(sessionId);
  if (!session) return false;
  session.active = false;
  return true;
}

export function incrementToolCall(sessionId: string): void {
  const session = sessions.get(sessionId);
  if (session) {
    session.toolCallCount += 1;
  }
}

export function addCost(sessionId: string, costUsd: number): void {
  const session = sessions.get(sessionId);
  if (session) {
    session.estimatedCostUsd += costUsd;
  }
}

export function listSessions(): Session[] {
  return [...sessions.values()];
}

export function isSessionActive(sessionId: string): boolean {
  const session = sessions.get(sessionId);
  return session?.active === true;
}
