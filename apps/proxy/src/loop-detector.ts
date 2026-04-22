// Loop detection (D-015) — policy-driven loop detection for AI agent tool calls.
//
// The LoopDetector is a stateful service that tracks tool call history per session.
// It provides two operations:
//   1. record()         — records a call in the sliding window (called by interceptor)
//   2. checkCondition() — checks whether a specific loop condition is met (called by policy engine)
//
// Loop condition types (configured per-rule in policy YAML):
//   - exact:       same tool + same input hash repeated ≥ threshold in window
//   - consecutive: same tool name called ≥ threshold times in a row (any input)
//   - subcommand:  same extracted sub-command (Bash only) repeated ≥ threshold in window

import { createHash } from 'node:crypto';
import type { LoopCondition } from './types.js';

// ─── State ────────────────────────────────────────────────────────────────────

interface CallRecord {
  toolName: string;
  inputHash: string;
  subCommands: string[]; // extracted from Bash commands; empty for other tools
}

interface SessionState {
  calls: CallRecord[]; // sliding window (oldest at index 0)
  lastToolName: string;
  consecutiveCount: number;
}

// ─── Detector ─────────────────────────────────────────────────────────────────

export class LoopDetector {
  private sessions = new Map<string, SessionState>();
  /** Max calls to keep per session regardless of per-rule window size. Prevents unbounded memory. */
  private maxWindowSize: number;

  constructor(maxWindowSize = 100) {
    this.maxWindowSize = maxWindowSize;
  }

  /**
   * Record a tool call in the session's sliding window.
   * Called by the interceptor on every tool call, before policy evaluation.
   */
  record(sessionId: string, toolName: string, input: unknown): void {
    const state = this.getOrCreateState(sessionId);

    // Update consecutive tracking
    if (state.lastToolName === toolName) {
      state.consecutiveCount++;
    } else {
      state.lastToolName = toolName;
      state.consecutiveCount = 1;
    }

    // Record in sliding window
    const record: CallRecord = {
      toolName,
      inputHash: callHash(toolName, input),
      subCommands: toolName === 'Bash' ? extractSubCommands(input) : [],
    };

    if (state.calls.length >= this.maxWindowSize) {
      state.calls.shift();
    }
    state.calls.push(record);
  }

  /**
   * Check whether a loop condition is met for the current session state.
   * Called by the policy engine when a matched rule has a `loop` field.
   * Returns { loop: true, reason } if the condition is met.
   */
  checkCondition(
    sessionId: string,
    toolName: string,
    input: unknown,
    condition: LoopCondition,
  ): { loop: boolean; reason?: string } {
    const state = this.sessions.get(sessionId);
    if (!state) return { loop: false };

    const window = Math.min(condition.window ?? 30, this.maxWindowSize);
    const threshold = condition.threshold;

    switch (condition.type) {
      case 'exact':
        return this.checkExact(state, toolName, input, threshold, window);
      case 'consecutive':
        return this.checkConsecutive(state, toolName, threshold);
      case 'subcommand':
        return this.checkSubcommand(state, input, threshold, window);
      default:
        return { loop: false };
    }
  }

  clearSession(sessionId: string): void {
    this.sessions.delete(sessionId);
  }

  reset(): void {
    this.sessions.clear();
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private getOrCreateState(sessionId: string): SessionState {
    let state = this.sessions.get(sessionId);
    if (!state) {
      state = { calls: [], lastToolName: '', consecutiveCount: 0 };
      this.sessions.set(sessionId, state);
    }
    return state;
  }

  /** Exact: same tool + same input hash repeated ≥ threshold in the last N calls. */
  private checkExact(
    state: SessionState,
    toolName: string,
    input: unknown,
    threshold: number,
    window: number,
  ): { loop: boolean; reason?: string } {
    const hash = callHash(toolName, input);
    const recent = state.calls.slice(-window);
    const count = recent.reduce((n, r) => (r.inputHash === hash ? n + 1 : n), 0);

    if (count >= threshold) {
      return {
        loop: true,
        reason: `Identical "${toolName}" call repeated ${count} times in the last ${recent.length} calls (threshold: ${threshold}).`,
      };
    }
    return { loop: false };
  }

  /** Consecutive: same tool name called ≥ threshold times in a row. */
  private checkConsecutive(
    state: SessionState,
    toolName: string,
    threshold: number,
  ): { loop: boolean; reason?: string } {
    if (state.lastToolName === toolName && state.consecutiveCount >= threshold) {
      return {
        loop: true,
        reason: `"${toolName}" called ${state.consecutiveCount} consecutive times (threshold: ${threshold}).`,
      };
    }
    return { loop: false };
  }

  /** Subcommand: same extracted sub-command repeated ≥ threshold in the last N calls (Bash only). */
  private checkSubcommand(
    state: SessionState,
    input: unknown,
    threshold: number,
    window: number,
  ): { loop: boolean; reason?: string } {
    const currentSubs = extractSubCommands(input);
    if (currentSubs.length === 0) return { loop: false };

    const recent = state.calls.slice(-window);

    // Check each current sub-command against all recent sub-commands
    for (const sub of currentSubs) {
      let count = 0;
      for (const record of recent) {
        if (record.subCommands.includes(sub)) count++;
      }
      if (count >= threshold) {
        return {
          loop: true,
          reason: `Sub-command "${sub}" repeated ${count} times in the last ${recent.length} calls (threshold: ${threshold}).`,
        };
      }
    }
    return { loop: false };
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function callHash(toolName: string, input: unknown): string {
  return createHash('sha256')
    .update(toolName + '\x00' + JSON.stringify(input))
    .digest('hex')
    .slice(0, 16);
}

/**
 * Extract meaningful sub-command labels from Bash tool input.
 * "git add f1 && npm test" → ["git add", "npm test"]
 * Non-Bash tools or non-compound commands → extract the primary command.
 */
function extractSubCommands(input: unknown): string[] {
  const inp = input as Record<string, unknown> | null | undefined;
  if (!inp || typeof inp !== 'object') return [];
  const cmd = typeof inp.command === 'string' ? inp.command.trim() : '';
  if (!cmd) return [];

  // Split on compound operators
  const parts = cmd.split(/\s*(?:&&|\|\||[;|])\s*/);
  const subs: string[] = [];

  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    subs.push(summarizeCommand(trimmed));
  }

  return subs;
}

/** Reduce a single command to its meaningful parts: binary + sub-command. */
function summarizeCommand(cmd: string): string {
  const tokens = cmd.split(/\s+/);
  if (tokens.length === 0) return cmd;
  const binary = tokens[0]!;

  // Commands with sub-commands: git, npm, npx, pnpm, docker
  if (['git', 'npm', 'npx', 'pnpm', 'docker'].includes(binary)) {
    const sub = findSubCommand(tokens, 1);
    return sub ? `${binary} ${sub}` : binary;
  }

  return binary;
}

/** Walk tokens, skip flags and their values, return first non-flag token. */
function findSubCommand(tokens: string[], from: number): string | undefined {
  let i = from;
  while (i < tokens.length) {
    const t = tokens[i]!;
    if (t.startsWith('--')) { i++; continue; }
    if (t.startsWith('-') && t.length <= 3) { i += 2; continue; }
    if (t.startsWith('/') || t.startsWith('"') || t.startsWith("'")) { i++; continue; }
    return t;
  }
  return undefined;
}
