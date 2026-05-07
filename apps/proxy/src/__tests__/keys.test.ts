import { describe, it, expect, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { keyRoutes } from '../routes/keys.js';
import { ApiKeyStore } from '../key-store.js';
import { RindEventBus } from '../event-bus.js';
import pino from 'pino';

// ─── Test doubles ─────────────────────────────────────────────────────────────

function makeApp(keyStore = new ApiKeyStore(), bus = new RindEventBus()) {
  const app = new Hono();
  app.route('/', keyRoutes({ keyStore, bus, logger: pino({ level: 'silent' }) }));
  return { app, keyStore, bus };
}

async function json(res: Response) {
  return res.json() as Promise<Record<string, unknown>>;
}

// ─── ApiKeyStore unit tests ───────────────────────────────────────────────────

describe('ApiKeyStore', () => {
  let store: ApiKeyStore;

  beforeEach(() => {
    store = new ApiKeyStore();
  });

  it('issues a key with rind_live_ prefix', () => {
    const { plaintext } = store.issue('test-key', ['railway']);
    expect(plaintext).toMatch(/^rind_live_[0-9a-f]{40}$/);
  });

  it('issued key validates against its scoped server', () => {
    const { plaintext } = store.issue('test-key', ['railway']);
    const record = store.validate(plaintext, 'railway');
    expect(record).not.toBeNull();
    expect(record!.name).toBe('test-key');
  });

  it('issued key rejects an unscoped server', () => {
    const { plaintext } = store.issue('test-key', ['railway']);
    const record = store.validate(plaintext, 'stripe');
    expect(record).toBeNull();
  });

  it('wildcard key validates against any server', () => {
    const { plaintext } = store.issue('admin-key', ['*']);
    expect(store.validate(plaintext, 'railway')).not.toBeNull();
    expect(store.validate(plaintext, 'stripe')).not.toBeNull();
  });

  it('validates without serverId check when omitted', () => {
    const { plaintext } = store.issue('test-key', ['railway']);
    expect(store.validate(plaintext)).not.toBeNull();
  });

  it('returns null for an unknown key', () => {
    expect(store.validate('rind_live_notakey')).toBeNull();
  });

  it('revoke removes the key', () => {
    const { plaintext, record } = store.issue('temp-key', ['railway']);
    expect(store.revoke(record.id)).toBe(true);
    expect(store.validate(plaintext)).toBeNull();
  });

  it('revoke returns false for unknown ID', () => {
    expect(store.revoke('deadbeef')).toBe(false);
  });

  it('different issues produce different plaintexts', () => {
    const k1 = store.issue('a', ['*']);
    const k2 = store.issue('b', ['*']);
    expect(k1.plaintext).not.toBe(k2.plaintext);
  });

  it('tracks lastUsedAt after validation', () => {
    const { plaintext, record } = store.issue('test-key', ['*']);
    expect(record.lastUsedAt).toBeUndefined();
    store.validate(plaintext);
    const updated = store.get(record.id);
    expect(updated?.lastUsedAt).toBeDefined();
  });
});

// ─── GET /keys ────────────────────────────────────────────────────────────────

describe('GET /keys', () => {
  it('returns empty list when no keys issued', async () => {
    const { app } = makeApp();
    const res = await app.request('/keys');
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.keys).toEqual([]);
  });

  it('returns issued keys without plaintext', async () => {
    const store = new ApiKeyStore();
    store.issue('ci-key', ['railway']);
    const { app } = makeApp(store);
    const res = await app.request('/keys');
    const body = await json(res);
    const keys = body.keys as Array<Record<string, unknown>>;
    expect(keys).toHaveLength(1);
    expect(keys[0]!['name']).toBe('ci-key');
    expect(keys[0]!['key']).toBeUndefined();
  });
});

// ─── GET /keys/:id ────────────────────────────────────────────────────────────

describe('GET /keys/:id', () => {
  it('returns 404 for unknown key ID', async () => {
    const { app } = makeApp();
    const res = await app.request('/keys/deadbeef');
    expect(res.status).toBe(404);
  });

  it('returns the key record for a valid ID', async () => {
    const store = new ApiKeyStore();
    const { record } = store.issue('demo-key', ['railway']);
    const { app } = makeApp(store);
    const res = await app.request(`/keys/${record.id}`);
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body['name']).toBe('demo-key');
    expect(body['key']).toBeUndefined();
  });
});

// ─── POST /keys ───────────────────────────────────────────────────────────────

describe('POST /keys', () => {
  it('issues a key and returns 201 with plaintext', async () => {
    const { app } = makeApp();
    const res = await app.request('/keys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'demo-key', serverIds: ['railway'] }),
    });
    expect(res.status).toBe(201);
    const body = await json(res);
    expect(typeof body['key']).toBe('string');
    expect((body['key'] as string)).toMatch(/^rind_live_/);
    expect(body['name']).toBe('demo-key');
    expect(body['serverIds']).toEqual(['railway']);
    expect(body['id']).toBeDefined();
  });

  it('accepts wildcard serverIds', async () => {
    const { app } = makeApp();
    const res = await app.request('/keys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'admin', serverIds: ['*'] }),
    });
    expect(res.status).toBe(201);
    const body = await json(res);
    expect(body['serverIds']).toEqual(['*']);
  });

  it('rejects missing name', async () => {
    const { app } = makeApp();
    const res = await app.request('/keys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ serverIds: ['railway'] }),
    });
    expect(res.status).toBe(400);
  });

  it('rejects empty serverIds array', async () => {
    const { app } = makeApp();
    const res = await app.request('/keys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'test', serverIds: [] }),
    });
    expect(res.status).toBe(400);
  });

  it('rejects malformed JSON body', async () => {
    const { app } = makeApp();
    const res = await app.request('/keys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not json',
    });
    expect(res.status).toBe(400);
  });

  it('emits key:issued event on the bus', async () => {
    const bus = new RindEventBus();
    let emitted: { keyId: string; name: string; serverIds: string[] } | null = null;
    bus.on('key:issued', (p) => { emitted = p; });

    const { app } = makeApp(new ApiKeyStore(), bus);
    await app.request('/keys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'ci', serverIds: ['railway'] }),
    });

    expect(emitted).not.toBeNull();
    expect(emitted!.name).toBe('ci');
    expect(emitted!.serverIds).toEqual(['railway']);
  });
});

// ─── DELETE /keys/:id ─────────────────────────────────────────────────────────

describe('DELETE /keys/:id', () => {
  it('revokes a key and returns 200', async () => {
    const store = new ApiKeyStore();
    const { record } = store.issue('to-revoke', ['railway']);
    const { app } = makeApp(store);
    const res = await app.request(`/keys/${record.id}`, { method: 'DELETE' });
    expect(res.status).toBe(200);
    expect(store.get(record.id)).toBeUndefined();
  });

  it('returns 404 for unknown key ID', async () => {
    const { app } = makeApp();
    const res = await app.request('/keys/deadbeef', { method: 'DELETE' });
    expect(res.status).toBe(404);
  });

  it('emits key:revoked event on the bus', async () => {
    const bus = new RindEventBus();
    let emitted: { keyId: string } | null = null;
    bus.on('key:revoked', (p) => { emitted = p; });

    const store = new ApiKeyStore();
    const { record } = store.issue('temp', ['*']);
    const { app } = makeApp(store, bus);
    await app.request(`/keys/${record.id}`, { method: 'DELETE' });

    expect(emitted?.keyId).toBe(record.id);
  });
});
