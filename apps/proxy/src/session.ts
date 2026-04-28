// Session tracking: every proxy session has a unique ID, agent identity,
// start time, active flag, and running counters.
// The kill-switch sets active = false; the interceptor blocks subsequent calls.

import { randomUUID } from 'node:crypto';
import type { Session } from './types.js';

// ─── Interface ────────────────────────────────────────────────────────────────

export interface ISessionStore {
  create(agentId: string, sessionId?: string): Session;
  get(sessionId: string): Session | undefined;
  kill(sessionId: string): boolean;
  isActive(sessionId: string): boolean;
  list(): Session[];
  incrementToolCall(sessionId: string): void;
  addCost(sessionId: string, costUsd: number): void;
  recordCall(sessionId: string, costUsd: number): void;
  getHourlyStats(sessionId: string): { calls: number; costUsd: number };
  reset(): void;
}

// ─── D-014: hourly call/cost records ─────────────────────────────────────────

interface CallRecord {
  timestamp: number;
  costUsd: number;
}

// ─── Implementation ───────────────────────────────────────────────────────────

export class InMemorySessionStore implements ISessionStore {
  private sessions = new Map<string, Session>();
  private sessionCallLog = new Map<string, CallRecord[]>();

  create(agentId: string, sessionId?: string): Session {
    const id = sessionId ?? randomUUID();
    const session: Session = {
      sessionId: id,
      agentId,
      startedAt: Date.now(),
      active: true,
      toolCallCount: 0,
      estimatedCostUsd: 0,
    };
    this.sessions.set(id, session);
    this.sessionCallLog.set(id, []);
    return session;
  }

  get(sessionId: string): Session | undefined {
    return this.sessions.get(sessionId);
  }

  kill(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;
    session.active = false;
    return true;
  }

  isActive(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    // Unknown session IDs are allowed — the kill-switch only blocks sessions
    // that were explicitly created and then explicitly killed via DELETE /sessions/:id.
    if (!session) return true;
    return session.active;
  }

  list(): Session[] {
    return [...this.sessions.values()];
  }

  incrementToolCall(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) session.toolCallCount += 1;
  }

  addCost(sessionId: string, costUsd: number): void {
    const session = this.sessions.get(sessionId);
    if (session) session.estimatedCostUsd += costUsd;
  }

  recordCall(sessionId: string, costUsd: number): void {
    const records = this.sessionCallLog.get(sessionId) ?? [];
    records.push({ timestamp: Date.now(), costUsd });
    this.sessionCallLog.set(sessionId, records);
  }

  getHourlyStats(sessionId: string): { calls: number; costUsd: number } {
    const cutoff = Date.now() - 3_600_000;
    const records = (this.sessionCallLog.get(sessionId) ?? []).filter((r) => r.timestamp > cutoff);
    return {
      calls: records.length,
      costUsd: records.reduce((sum, r) => sum + r.costUsd, 0),
    };
  }

  reset(): void {
    this.sessions.clear();
    this.sessionCallLog.clear();
  }
}

// ─── Shared default instance ──────────────────────────────────────────────────

const defaultStore = new InMemorySessionStore();

// ─── Module-level function API (backward-compatible wrappers) ─────────────────

export function createSession(agentId: string, sessionId?: string): Session {
  return defaultStore.create(agentId, sessionId);
}

export function getSession(sessionId: string): Session | undefined {
  return defaultStore.get(sessionId);
}

export function killSession(sessionId: string): boolean {
  return defaultStore.kill(sessionId);
}

export function isSessionActive(sessionId: string): boolean {
  return defaultStore.isActive(sessionId);
}

export function listSessions(): Session[] {
  return defaultStore.list();
}

export function incrementToolCall(sessionId: string): void {
  defaultStore.incrementToolCall(sessionId);
}

export function addCost(sessionId: string, costUsd: number): void {
  defaultStore.addCost(sessionId, costUsd);
}

/**
 * Record a tool call for hourly cost/count limit tracking (D-014).
 * Called after successful forwarding, before returning the response.
 */
export function recordCall(sessionId: string, costUsd: number): void {
  defaultStore.recordCall(sessionId, costUsd);
}

/**
 * Return call count and total cost in the last hour for a session.
 * Used to enforce maxCallsPerHour and maxCostPerHour limits (D-014).
 */
export function getHourlyStats(sessionId: string): { calls: number; costUsd: number } {
  return defaultStore.getHourlyStats(sessionId);
}

/** Reset all session state — used in tests and simulation to prevent state bleed between runs. */
export function resetSessions(): void {
  defaultStore.reset();
}
