// In-memory sliding window rate limiter (D-017).
// Counts requests per (scope, agentId, toolName) in a rolling time window.
// Cleanup runs every 60s to prevent unbounded memory growth.
//
// Scopes:
//   per_agent  — all tool calls by this agent count toward the limit
//   per_tool   — calls to this specific tool by this agent count toward the limit
//   global     — all calls across all agents count toward the limit

export type RateLimitScope = 'per_agent' | 'per_tool' | 'global';

export interface RateLimitConfig {
  limit: number; // max calls allowed in the window
  windowMs: number; // rolling window duration in milliseconds
  scope: RateLimitScope;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number; // calls left in current window
  resetMs: number; // ms until oldest call expires (approx when headroom returns)
}

export class RateLimiter {
  // Map<scopeKey, timestamp[]> — timestamps of calls within the window
  private windows = new Map<string, number[]>();
  private cleanupTimer: ReturnType<typeof setInterval>;

  constructor() {
    // Prune stale entries every 60 seconds to prevent unbounded memory growth.
    // `.unref()` prevents this timer from keeping the Node.js process alive.
    this.cleanupTimer = setInterval(() => this.cleanup(), 60_000);
    if (this.cleanupTimer.unref) this.cleanupTimer.unref();
  }

  check(agentId: string, toolName: string, cfg: RateLimitConfig): RateLimitResult {
    const key = this.scopeKey(agentId, toolName, cfg.scope);
    const now = Date.now();
    const cutoff = now - cfg.windowMs;

    // Retrieve and prune expired timestamps
    let timestamps = (this.windows.get(key) ?? []).filter((t) => t > cutoff);

    const remaining = Math.max(0, cfg.limit - timestamps.length);
    const resetMs = timestamps.length > 0 ? (timestamps[0]! + cfg.windowMs) - now : 0;

    if (timestamps.length >= cfg.limit) {
      this.windows.set(key, timestamps);
      return { allowed: false, remaining: 0, resetMs };
    }

    timestamps = [...timestamps, now];
    this.windows.set(key, timestamps);
    return { allowed: true, remaining: remaining - 1, resetMs };
  }

  destroy(): void {
    clearInterval(this.cleanupTimer);
  }

  private scopeKey(agentId: string, toolName: string, scope: RateLimitScope): string {
    switch (scope) {
      case 'per_agent':
        return `a:${agentId}`;
      case 'per_tool':
        return `t:${agentId}:${toolName}`;
      case 'global':
        return 'g';
    }
  }

  private cleanup(): void {
    // Use a conservative 24-hour cutoff — any window <= 24h is already pruned on check()
    const cutoff = Date.now() - 86_400_000;
    for (const [key, timestamps] of this.windows) {
      const pruned = timestamps.filter((t) => t > cutoff);
      if (pruned.length === 0) {
        this.windows.delete(key);
      } else {
        this.windows.set(key, pruned);
      }
    }
  }
}

// ─── Helper ───────────────────────────────────────────────────────────────────

/** Parse a window string like "1m", "30s", "2h", "1d" to milliseconds. */
export function parseWindowMs(window: string): number {
  const match = /^(\d+)(s|m|h|d)$/.exec(window);
  if (!match) {
    throw new Error(
      `Invalid rate limit window: "${window}". Expected format: "30s", "5m", "2h", "1d".`,
    );
  }
  const value = parseInt(match[1]!, 10);
  const multipliers: Record<string, number> = {
    s: 1_000,
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000,
  };
  return value * multipliers[match[2]!]!;
}
