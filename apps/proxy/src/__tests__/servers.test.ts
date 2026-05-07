import { describe, it, expect, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { serverRoutes } from '../routes/servers.js';
import { UpstreamPool } from '../transport/pool.js';
import { RindEventBus } from '../event-bus.js';
import type { UpstreamClient } from '../transport/upstream/interface.js';
import pino from 'pino';

// ─── Test doubles ─────────────────────────────────────────────────────────────

function makePool(initial: Record<string, { transport: 'http'; url: string }> = {}): UpstreamPool {
  const noop: UpstreamClient = {
    listTools: async () => [],
    callTool: async () => ({}),
    close: async () => undefined,
  };
  return new UpstreamPool(initial as never, () => noop);
}

function makeApp(pool: UpstreamPool, bus = new RindEventBus()) {
  const app = new Hono();
  app.route('/', serverRoutes({ pool, bus, logger: pino({ level: 'silent' }) }));
  return app;
}

async function json(res: Response) {
  return res.json() as Promise<Record<string, unknown>>;
}

// ─── GET /servers ─────────────────────────────────────────────────────────────

describe('GET /servers', () => {
  it('returns empty list when no servers registered', async () => {
    const res = await makeApp(makePool()).request('/servers');
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.servers).toEqual([]);
  });

  it('returns registered server IDs', async () => {
    const pool = makePool({ railway: { transport: 'http', url: 'http://localhost:8082/mcp' } });
    const res = await makeApp(pool).request('/servers');
    const body = await json(res);
    const servers = body.servers as Array<{ id: string }>;
    expect(servers.map((s) => s.id)).toContain('railway');
  });

  it('redacts header values in HTTP server configs', async () => {
    const pool = makePool();
    pool.register('stripe', { transport: 'http', url: 'http://stripe.local/mcp', headers: { Authorization: 'Bearer sk_live_secret123' } });
    const res = await makeApp(pool).request('/servers');
    const body = await json(res);
    const stripe = (body.servers as Array<Record<string, unknown>>).find((s) => s['id'] === 'stripe');
    expect(JSON.stringify(stripe)).not.toContain('sk_live_secret123');
    expect(JSON.stringify(stripe)).toContain('<redacted>');
  });
});

// ─── GET /servers/:id ─────────────────────────────────────────────────────────

describe('GET /servers/:id', () => {
  it('returns 404 for unknown server', async () => {
    const res = await makeApp(makePool()).request('/servers/unknown');
    expect(res.status).toBe(404);
  });

  it('returns the server config for a known server', async () => {
    const pool = makePool({ railway: { transport: 'http', url: 'http://localhost:8082/mcp' } });
    const res = await makeApp(pool).request('/servers/railway');
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body['id']).toBe('railway');
    expect(body['url']).toBe('http://localhost:8082/mcp');
  });
});

// ─── POST /servers ────────────────────────────────────────────────────────────

describe('POST /servers', () => {
  it('registers a new HTTP server and returns 201', async () => {
    const pool = makePool();
    const res = await makeApp(pool).request('/servers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 'railway', transport: 'http', url: 'http://localhost:8082/mcp' }),
    });
    expect(res.status).toBe(201);
    expect(pool.has('railway')).toBe(true);
  });

  it('returns 200 when updating an existing server', async () => {
    const pool = makePool({ railway: { transport: 'http', url: 'http://old.local/mcp' } });
    const res = await makeApp(pool).request('/servers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 'railway', transport: 'http', url: 'http://new.local/mcp' }),
    });
    expect(res.status).toBe(200);
  });

  it('rejects an invalid server ID', async () => {
    const pool = makePool();
    const res = await makeApp(pool).request('/servers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 'UPPER-CASE', transport: 'http', url: 'http://localhost/mcp' }),
    });
    expect(res.status).toBe(400);
  });

  it('rejects an invalid URL', async () => {
    const pool = makePool();
    const res = await makeApp(pool).request('/servers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 'test', transport: 'http', url: 'not-a-url' }),
    });
    expect(res.status).toBe(400);
  });

  it('rejects malformed JSON body', async () => {
    const res = await makeApp(makePool()).request('/servers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not json',
    });
    expect(res.status).toBe(400);
  });

  it('emits server:registered event on the bus', async () => {
    const bus = new RindEventBus();
    let emitted: { serverId: string; transport: string } | null = null;
    bus.on('server:registered', (p) => { emitted = p; });

    await makeApp(makePool(), bus).request('/servers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 'stripe', transport: 'http', url: 'http://stripe.local/mcp' }),
    });

    expect(emitted).not.toBeNull();
    expect(emitted!.serverId).toBe('stripe');
    expect(emitted!.transport).toBe('http');
  });
});

// ─── DELETE /servers/:id ──────────────────────────────────────────────────────

describe('DELETE /servers/:id', () => {
  it('unregisters a server and returns 200', async () => {
    const pool = makePool({ railway: { transport: 'http', url: 'http://localhost:8082/mcp' } });
    const res = await makeApp(pool).request('/servers/railway', { method: 'DELETE' });
    expect(res.status).toBe(200);
    expect(pool.has('railway')).toBe(false);
  });

  it('returns 404 when server does not exist', async () => {
    const res = await makeApp(makePool()).request('/servers/unknown', { method: 'DELETE' });
    expect(res.status).toBe(404);
  });

  it('emits server:unregistered event on the bus', async () => {
    const bus = new RindEventBus();
    let emitted: { serverId: string } | null = null;
    bus.on('server:unregistered', (p) => { emitted = p; });

    const pool = makePool({ railway: { transport: 'http', url: 'http://localhost:8082/mcp' } });
    await makeApp(pool, bus).request('/servers/railway', { method: 'DELETE' });

    expect(emitted?.serverId).toBe('railway');
  });
});

// ─── UpstreamPool runtime registration ───────────────────────────────────────

describe('UpstreamPool.register / unregister', () => {
  it('register makes a new server available via has()', () => {
    const pool = makePool();
    expect(pool.has('new-server')).toBe(false);
    pool.register('new-server', { transport: 'http', url: 'http://localhost/mcp' });
    expect(pool.has('new-server')).toBe(true);
  });

  it('unregister removes the server', async () => {
    const pool = makePool({ 'to-remove': { transport: 'http', url: 'http://localhost/mcp' } });
    await pool.unregister('to-remove');
    expect(pool.has('to-remove')).toBe(false);
  });

  it('list returns all registered servers', () => {
    const pool = makePool({ a: { transport: 'http', url: 'http://a.local/mcp' }, b: { transport: 'http', url: 'http://b.local/mcp' } });
    const ids = pool.list().map((s) => s.id);
    expect(ids).toContain('a');
    expect(ids).toContain('b');
  });
});
