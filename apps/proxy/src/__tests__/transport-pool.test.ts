// Tests for transport/pool.ts — upstream connection pool.
//
// Coverage:
//   - get(): returns null for unknown server IDs
//   - get(): creates a client for a registered server on first call
//   - get(): returns the same instance on subsequent calls (lazy singleton)
//   - serverIds(): lists all registered server IDs
//   - has(): recognises registered and unregistered IDs
//   - closeAll(): closes all open connections
//
// The factory function is injected — no real network or process spawning.

import { describe, it, expect, vi } from 'vitest';
import { UpstreamPool } from '../transport/pool.js';
import type { UpstreamClient } from '../transport/upstream/interface.js';
import type { McpServerMap } from '../transport/types.js';

// ─── Test doubles ─────────────────────────────────────────────────────────────

function makeMockClient(): UpstreamClient & { closed: boolean } {
  const client = {
    closed: false,
    listTools: vi.fn().mockResolvedValue([]),
    callTool:  vi.fn().mockResolvedValue({ content: [] }),
    close:     vi.fn().mockImplementation(async () => { client.closed = true; }),
  };
  return client;
}

const SERVERS: McpServerMap = {
  github: { transport: 'http', url: 'https://mcp.github.com' },
  stripe: { transport: 'stdio', command: 'npx', args: ['@stripe/mcp'] },
};

// ─── Pool tests ───────────────────────────────────────────────────────────────

describe('UpstreamPool.get', () => {
  it('returns null for an unregistered server ID', () => {
    const pool = new UpstreamPool(SERVERS, makeMockClient);
    expect(pool.get('unknown-server')).toBeNull();
  });

  it('creates a client for a registered server on first call', () => {
    const factory = vi.fn().mockReturnValue(makeMockClient());
    const pool = new UpstreamPool(SERVERS, factory);

    const client = pool.get('github');
    expect(client).not.toBeNull();
    expect(factory).toHaveBeenCalledTimes(1);
    expect(factory).toHaveBeenCalledWith(SERVERS['github']);
  });

  it('returns the same client instance on repeated calls (lazy singleton)', () => {
    const factory = vi.fn().mockImplementation(makeMockClient);
    const pool = new UpstreamPool(SERVERS, factory);

    const first  = pool.get('github');
    const second = pool.get('github');
    expect(first).toBe(second);
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it('creates separate clients for separate servers', () => {
    const factory = vi.fn().mockImplementation(makeMockClient);
    const pool = new UpstreamPool(SERVERS, factory);

    const github = pool.get('github');
    const stripe = pool.get('stripe');
    expect(github).not.toBe(stripe);
    expect(factory).toHaveBeenCalledTimes(2);
    expect(factory).toHaveBeenNthCalledWith(1, SERVERS['github']);
    expect(factory).toHaveBeenNthCalledWith(2, SERVERS['stripe']);
  });
});

describe('UpstreamPool.serverIds', () => {
  it('returns all registered server IDs', () => {
    const pool = new UpstreamPool(SERVERS, makeMockClient);
    expect(pool.serverIds()).toContain('github');
    expect(pool.serverIds()).toContain('stripe');
    expect(pool.serverIds()).toHaveLength(2);
  });

  it('returns empty array when no servers are configured', () => {
    const pool = new UpstreamPool({}, makeMockClient);
    expect(pool.serverIds()).toHaveLength(0);
  });
});

describe('UpstreamPool.has', () => {
  it('returns true for registered servers', () => {
    const pool = new UpstreamPool(SERVERS, makeMockClient);
    expect(pool.has('github')).toBe(true);
    expect(pool.has('stripe')).toBe(true);
  });

  it('returns false for unregistered servers', () => {
    const pool = new UpstreamPool(SERVERS, makeMockClient);
    expect(pool.has('openai')).toBe(false);
  });
});

describe('UpstreamPool.closeAll', () => {
  it('closes all clients that were opened', async () => {
    const clients: ReturnType<typeof makeMockClient>[] = [];
    const factory = vi.fn().mockImplementation(() => {
      const c = makeMockClient();
      clients.push(c);
      return c;
    });
    const pool = new UpstreamPool(SERVERS, factory);

    // Open both connections
    pool.get('github');
    pool.get('stripe');

    await pool.closeAll();

    expect(clients[0]?.closed).toBe(true);
    expect(clients[1]?.closed).toBe(true);
  });

  it('does not error when no clients were opened', async () => {
    const pool = new UpstreamPool(SERVERS, makeMockClient);
    await expect(pool.closeAll()).resolves.not.toThrow();
  });

  it('does not error when no servers are configured', async () => {
    const pool = new UpstreamPool({}, makeMockClient);
    await expect(pool.closeAll()).resolves.not.toThrow();
  });
});
