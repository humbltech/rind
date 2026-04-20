// Loop detection (D-015) — catches infinite agent tool-call loops before they reach upstream.
//
// Two complementary checks:
//   1. Exact-hash match  — same tool + same input repeated K times in a sliding window of N
//   2. Consecutive cap   — same tool name called M times in a row (regardless of input)
//
// Both are configurable via policy YAML; sensible defaults apply with zero config.

import { createHash } from 'node:crypto';

// ─── Config ───────────────────────────────────────────────────────────────────

export interface LoopDetectorConfig {
  maxIdenticalCalls: number; // trigger if same hash appears ≥ this many times in window (default 3)
  windowSize: number; // sliding window of recent calls tracked per session (default 20)
  maxConsecutiveSameTool: number; // trigger if same tool name called ≥ this many consecutive times (default 10)
}

const DEFAULT_CONFIG: LoopDetectorConfig = {
  maxIdenticalCalls: 3,
  windowSize: 20,
  maxConsecutiveSameTool: 10,
};

// ─── State ────────────────────────────────────────────────────────────────────

interface SessionState {
  hashes: string[]; // sliding window of recent call hashes (oldest at index 0)
  consecutive: { toolName: string; count: number };
}

// ─── Detector ─────────────────────────────────────────────────────────────────

export class LoopDetector {
  private sessions = new Map<string, SessionState>();
  private cfg: LoopDetectorConfig;

  constructor(config?: Partial<LoopDetectorConfig>) {
    this.cfg = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Record a tool call and check whether it constitutes a loop.
   * Returns { loop: false } when fine, { loop: true, reason } when blocked.
   */
  check(
    sessionId: string,
    toolName: string,
    input: unknown,
  ): { loop: boolean; reason?: string } {
    if (!this.sessions.has(sessionId)) {
      this.sessions.set(sessionId, {
        hashes: [],
        consecutive: { toolName: '', count: 0 },
      });
    }
    const state = this.sessions.get(sessionId)!;

    // 1. Consecutive same-tool check (fast path — no hashing needed)
    if (state.consecutive.toolName === toolName) {
      state.consecutive.count++;
      if (state.consecutive.count >= this.cfg.maxConsecutiveSameTool) {
        return {
          loop: true,
          reason: `Tool "${toolName}" called ${state.consecutive.count} consecutive times (limit: ${this.cfg.maxConsecutiveSameTool}).`,
        };
      }
    } else {
      state.consecutive = { toolName, count: 1 };
    }

    // 2. Sliding-window exact-hash check
    const hash = callHash(toolName, input);

    // Evict oldest entry if at capacity
    if (state.hashes.length >= this.cfg.windowSize) {
      state.hashes.shift();
    }
    state.hashes.push(hash);

    const occurrences = state.hashes.reduce((n, h) => (h === hash ? n + 1 : n), 0);
    if (occurrences >= this.cfg.maxIdenticalCalls) {
      return {
        loop: true,
        reason:
          `Identical tool call "${toolName}" repeated ${occurrences} times in the last ` +
          `${state.hashes.length} calls (limit: ${this.cfg.maxIdenticalCalls}).`,
      };
    }

    return { loop: false };
  }

  clearSession(sessionId: string): void {
    this.sessions.delete(sessionId);
  }

  reset(): void {
    this.sessions.clear();
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function callHash(toolName: string, input: unknown): string {
  // SHA-256 truncated to 16 hex chars — sufficient uniqueness for loop detection
  return createHash('sha256')
    .update(toolName + '\x00' + JSON.stringify(input))
    .digest('hex')
    .slice(0, 16);
}
