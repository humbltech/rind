// Rate limiter unit + integration tests.
//
// Unit tests cover the RateLimiter class and parseWindowMs directly.
// Integration tests exercise the RATE_LIMIT action through the MCP proxy endpoint
// (/proxy/tool-call) — the hook path intentionally skips rate limiting.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RateLimiter, parseWindowMs } from '../rate-limiter.js';
import { createProxyServer } from '../lib.js';
import type { PolicyRule } from '../types.js';

// ─── parseWindowMs ────────────────────────────────────────────────────────────

describe('parseWindowMs', () => {
  it('parses seconds', () => {
    expect(parseWindowMs('30s')).toBe(30_000);
    expect(parseWindowMs('1s')).toBe(1_000);
  });

  it('parses minutes', () => {
    expect(parseWindowMs('5m')).toBe(300_000);
    expect(parseWindowMs('1m')).toBe(60_000);
  });

  it('parses hours', () => {
    expect(parseWindowMs('2h')).toBe(7_200_000);
  });

  it('parses days', () => {
    expect(parseWindowMs('1d')).toBe(86_400_000);
  });

  it('throws on invalid format', () => {
    expect(() => parseWindowMs('abc')).toThrow();
    expect(() => parseWindowMs('')).toThrow();
    expect(() => parseWindowMs('5x')).toThrow();
    expect(() => parseWindowMs('5')).toThrow();
  });
});

// ─── RateLimiter unit tests ───────────────────────────────────────────────────

describe('RateLimiter', () => {
  let limiter: RateLimiter;

  beforeEach(() => { limiter = new RateLimiter(); });
  afterEach(() => { limiter.destroy(); });

  it('allows calls up to the limit', () => {
    const cfg = { limit: 3, windowMs: 60_000, scope: 'per_tool' as const };
    expect(limiter.check('agent1', 'db.query', cfg).allowed).toBe(true);
    expect(limiter.check('agent1', 'db.query', cfg).allowed).toBe(true);
    expect(limiter.check('agent1', 'db.query', cfg).allowed).toBe(true);
  });

  it('blocks at limit+1', () => {
    const cfg = { limit: 3, windowMs: 60_000, scope: 'per_tool' as const };
    limiter.check('agent1', 'db.query', cfg);
    limiter.check('agent1', 'db.query', cfg);
    limiter.check('agent1', 'db.query', cfg);
    expect(limiter.check('agent1', 'db.query', cfg).allowed).toBe(false);
    expect(limiter.check('agent1', 'db.query', cfg).remaining).toBe(0);
  });

  it('per_tool: different tools have independent counters', () => {
    const cfg = { limit: 1, windowMs: 60_000, scope: 'per_tool' as const };
    limiter.check('agent1', 'db.query', cfg); // exhausts db.query
    expect(limiter.check('agent1', 'db.query', cfg).allowed).toBe(false);
    expect(limiter.check('agent1', 'fs.read', cfg).allowed).toBe(true); // separate counter
  });

  it('per_agent: different agents have independent counters', () => {
    const cfg = { limit: 1, windowMs: 60_000, scope: 'per_agent' as const };
    limiter.check('agent1', 'db.query', cfg); // exhausts agent1
    expect(limiter.check('agent1', 'db.query', cfg).allowed).toBe(false);
    expect(limiter.check('agent2', 'db.query', cfg).allowed).toBe(true); // separate counter
  });

  it('global: all agents share one counter', () => {
    const cfg = { limit: 2, windowMs: 60_000, scope: 'global' as const };
    limiter.check('agent1', 'db.query', cfg);
    limiter.check('agent2', 'fs.read', cfg);
    expect(limiter.check('agent3', 'any.tool', cfg).allowed).toBe(false);
  });

  it('window expiry: calls are allowed again after window elapses', () => {
    vi.useFakeTimers();
    const cfg = { limit: 2, windowMs: 5_000, scope: 'per_tool' as const };
    limiter.check('agent1', 'db.query', cfg);
    limiter.check('agent1', 'db.query', cfg);
    expect(limiter.check('agent1', 'db.query', cfg).allowed).toBe(false);

    vi.advanceTimersByTime(6_000); // advance past the window
    expect(limiter.check('agent1', 'db.query', cfg).allowed).toBe(true);
    vi.useRealTimers();
  });
});

// ─── Integration tests via /proxy/tool-call ───────────────────────────────────

function makeRateLimitPolicy(limit: number, scope: 'per_tool' | 'per_agent' | 'global'): PolicyRule[] {
  return [{
    name: 'rate-test',
    agent: '*',
    match: { tool: ['db.query'] },
    action: 'RATE_LIMIT',
    priority: 10,
    rateLimit: { limit, window: '1m', scope },
  }];
}

async function proxyCall(
  app: ReturnType<typeof createProxyServer>['app'],
  toolName: string,
  sessionId = 'test-session',
  agentId?: string,
) {
  return app.request('/proxy/tool-call', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, serverId: 'test-server', toolName, input: {}, ...(agentId ? { agentId } : {}) }),
  });
}

describe('/proxy/tool-call — RATE_LIMIT integration', () => {
  it('allows N calls and blocks the N+1th', async () => {
    const { app } = createProxyServer({
      port: 0, agentId: 'test', upstreamMcpUrl: 'http://mock',
      forwardFn: async () => ({ output: {}, durationMs: 1 }),
      logLevel: 'error', policy: { policies: makeRateLimitPolicy(3, 'per_tool') },
    });

    for (let i = 0; i < 3; i++) {
      const res = await proxyCall(app, 'db.query');
      expect(res.status).toBe(200);
      const body = await res.json() as { blocked?: boolean };
      expect(body.blocked).toBeFalsy();
    }

    const blocked = await proxyCall(app, 'db.query');
    expect(blocked.status).toBe(403);
    const blockedBody = await blocked.json() as { blocked: boolean; action: string; reason: string };
    expect(blockedBody.blocked).toBe(true);
    expect(blockedBody.action).toBe('RATE_LIMIT');
    expect(blockedBody.reason).toMatch(/rate.limit/i);
  });

  it('per_tool: different tools have independent limits', async () => {
    const { app } = createProxyServer({
      port: 0, agentId: 'test', upstreamMcpUrl: 'http://mock',
      forwardFn: async () => ({ output: {}, durationMs: 1 }),
      logLevel: 'error', policy: { policies: makeRateLimitPolicy(1, 'per_tool') },
    });

    // Exhaust db.query
    await proxyCall(app, 'db.query');
    const blocked = await proxyCall(app, 'db.query');
    expect(blocked.status).toBe(403);
    const blockedBody = await blocked.json() as { blocked: boolean };
    expect(blockedBody.blocked).toBe(true);

    // A different tool (not in policy) should pass freely
    const other = await proxyCall(app, 'fs.read');
    expect(other.status).toBe(200);
    const otherBody = await other.json() as { blocked?: boolean };
    expect(otherBody.blocked).toBeFalsy();
  });

  it('per_agent: different sessions have independent limits', async () => {
    const { app } = createProxyServer({
      port: 0, agentId: 'test', upstreamMcpUrl: 'http://mock',
      forwardFn: async () => ({ output: {}, durationMs: 1 }),
      logLevel: 'error', policy: { policies: makeRateLimitPolicy(1, 'per_agent') },
    });

    await proxyCall(app, 'db.query', 'session-a', 'agent-a');
    const blocked = await proxyCall(app, 'db.query', 'session-a', 'agent-a');
    expect(blocked.status).toBe(403);
    const blockedBody = await blocked.json() as { blocked: boolean };
    expect(blockedBody.blocked).toBe(true);

    // agent-b has its own counter
    const other = await proxyCall(app, 'db.query', 'session-b', 'agent-b');
    expect(other.status).toBe(200);
    const otherBody = await other.json() as { blocked?: boolean };
    expect(otherBody.blocked).toBeFalsy();
  });

  it('rate-limited event is recorded in the ring buffer', async () => {
    const { app } = createProxyServer({
      port: 0, agentId: 'test', upstreamMcpUrl: 'http://mock',
      forwardFn: async () => ({ output: {}, durationMs: 1 }),
      logLevel: 'error', policy: { policies: makeRateLimitPolicy(1, 'per_tool') },
    });

    await proxyCall(app, 'db.query');
    await proxyCall(app, 'db.query'); // this one gets rate-limited

    const logsRes = await app.request('/logs/tool-calls');
    const events = await logsRes.json() as Array<{ toolName: string; outcome?: string; reason?: string }>;
    const rateLimited = events.filter((e) => e.toolName === 'db.query' && e.outcome === 'blocked');
    expect(rateLimited.length).toBeGreaterThanOrEqual(1);
    expect(rateLimited[0]?.reason).toMatch(/rate.limit/i);
  });
});
