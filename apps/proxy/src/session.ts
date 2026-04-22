// Session tracking: every proxy session has a unique ID, agent identity,
// start time, active flag, and running counters.
// The kill-switch sets active = false; the interceptor blocks subsequent calls.

import { randomUUID } from 'node:crypto';
import type { Session } from './types.js';

const sessions = new Map<string, Session>();

// D-014: hourly call/cost records — not part of the exported Session interface
interface CallRecord {
  timestamp: number;
  costUsd: number;
}
const sessionCallLog = new Map<string, CallRecord[]>();

// ─── Session lifecycle ────────────────────────────────────────────────────────

export function createSession(agentId: string, sessionId?: string): Session {
  const id = sessionId ?? randomUUID();
  const session: Session = {
    sessionId: id,
    agentId,
    startedAt: Date.now(),
    active: true,
    toolCallCount: 0,
    estimatedCostUsd: 0,
  };
  sessions.set(id, session);
  sessionCallLog.set(id, []);
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

export function isSessionActive(sessionId: string): boolean {
  const session = sessions.get(sessionId);
  // Unknown session IDs are allowed — the kill-switch only blocks sessions
  // that were explicitly created and then explicitly killed via DELETE /sessions/:id.
  // A random UUID that was never registered is not a killed session.
  if (!session) return true;
  return session.active;
}

export function listSessions(): Session[] {
  return [...sessions.values()];
}

// ─── Counters ─────────────────────────────────────────────────────────────────

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

/**
 * Record a tool call for hourly cost/count limit tracking (D-014).
 * Called after successful forwarding, before returning the response.
 */
export function recordCall(sessionId: string, costUsd: number): void {
  const records = sessionCallLog.get(sessionId) ?? [];
  records.push({ timestamp: Date.now(), costUsd });
  sessionCallLog.set(sessionId, records);
}

/**
 * Return call count and total cost in the last hour for a session.
 * Used to enforce maxCallsPerHour and maxCostPerHour limits (D-014).
 */
export function getHourlyStats(sessionId: string): { calls: number; costUsd: number } {
  const cutoff = Date.now() - 3_600_000;
  const records = (sessionCallLog.get(sessionId) ?? []).filter((r) => r.timestamp > cutoff);
  return {
    calls: records.length,
    costUsd: records.reduce((sum, r) => sum + r.costUsd, 0),
  };
}

// ─── Test/simulation cleanup ──────────────────────────────────────────────────

/** Reset all session state — used in tests and simulation to prevent state bleed between runs. */
export function resetSessions(): void {
  sessions.clear();
  sessionCallLog.clear();
}
