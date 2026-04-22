// PreToolUse ↔ PostToolUse correlation (D-040).
//
// Claude Code does not send a request ID across both hooks, so we generate a
// deterministic correlation key from the fields that ARE identical in both:
//   hash(session_id + tool_name + canonical(tool_input))
//
// Problem: two identical calls in quick succession produce the same hash.
// Solution: per-session monotonic counter keyed by base hash. PreToolUse
// increments the counter and stores `baseHash-N`. PostToolUse reads the
// counter for the same base hash and matches from the most recent unmatched
// PreToolUse event.

import { createHash } from 'node:crypto';

// ─── Correlation key generation ──────────────────────────────────────────────

export function correlationBaseHash(
  sessionId: string,
  toolName: string,
  toolInput: unknown,
): string {
  const inputStr = toolInput != null ? JSON.stringify(toolInput) : '';
  return createHash('sha256')
    .update(`${sessionId}\0${toolName}\0${inputStr}`)
    .digest('hex')
    .slice(0, 16); // 16 hex chars = 64 bits — sufficient for correlation
}

// ─── Correlation tracker ─────────────────────────────────────────────────────
// Tracks PreToolUse calls and matches them with PostToolUse events.
// Uses a short-lived FIFO queue per base hash to handle duplicate calls.

interface PendingCall {
  correlationId: string;
  timestamp: number;
}

const MAX_PENDING_AGE_MS = 5 * 60 * 1000; // 5 minutes — unmatched calls expire
const MAX_PENDING_PER_KEY = 50; // cap queue depth per base hash

export class CorrelationTracker {
  // baseHash → FIFO queue of unmatched PreToolUse correlation IDs
  private pending = new Map<string, PendingCall[]>();
  private counter = new Map<string, number>();

  /** Called at PreToolUse time. Returns the correlation ID to store on the event. */
  recordPreToolUse(sessionId: string, toolName: string, toolInput: unknown): string {
    const base = correlationBaseHash(sessionId, toolName, toolInput);
    const seq = (this.counter.get(base) ?? 0) + 1;
    this.counter.set(base, seq);

    const correlationId = `${base}-${seq}`;

    const queue = this.pending.get(base) ?? [];
    queue.push({ correlationId, timestamp: Date.now() });
    // Cap queue depth
    if (queue.length > MAX_PENDING_PER_KEY) queue.shift();
    this.pending.set(base, queue);

    return correlationId;
  }

  /** Called at PostToolUse time. Returns the matched correlation ID (FIFO order). */
  matchPostToolUse(sessionId: string, toolName: string, toolInput: unknown): string | undefined {
    const base = correlationBaseHash(sessionId, toolName, toolInput);
    const queue = this.pending.get(base);
    if (!queue || queue.length === 0) return undefined;

    // Expire stale entries
    const now = Date.now();
    while (queue.length > 0 && now - queue[0]!.timestamp > MAX_PENDING_AGE_MS) {
      queue.shift();
    }
    if (queue.length === 0) {
      this.pending.delete(base);
      return undefined;
    }

    // FIFO: match the oldest pending PreToolUse
    const matched = queue.shift()!;
    if (queue.length === 0) this.pending.delete(base);

    return matched.correlationId;
  }

  /** Periodic cleanup of expired entries. Call from a setInterval. */
  cleanup(): void {
    const now = Date.now();
    for (const [base, queue] of this.pending) {
      while (queue.length > 0 && now - queue[0]!.timestamp > MAX_PENDING_AGE_MS) {
        queue.shift();
      }
      if (queue.length === 0) this.pending.delete(base);
    }
    // Also clean up counters for hashes with no pending entries
    for (const base of this.counter.keys()) {
      if (!this.pending.has(base)) this.counter.delete(base);
    }
  }

  /** Number of pending unmatched PreToolUse entries (for monitoring). */
  get pendingCount(): number {
    let count = 0;
    for (const queue of this.pending.values()) count += queue.length;
    return count;
  }
}
