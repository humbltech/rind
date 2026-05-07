// Agent API key routes (D-050).
//
// Operators issue static API keys scoped to specific registered MCP servers.
// Keys are returned in plaintext once at issuance time — the store only holds
// the SHA-256 hash. Revocation is immediate and permanent.

import { Hono } from 'hono';
import { z } from 'zod';
import type { Logger } from 'pino';
import type { ApiKeyStore } from '../key-store.js';
import type { RindEventBus } from '../event-bus.js';

// ─── Validation ───────────────────────────────────────────────────────────────

const IssueKeySchema = z.object({
  name: z.string().min(1).max(128),
  serverIds: z
    .array(z.string().min(1).max(64))
    .min(1)
    .refine(
      (ids) => ids.every((id) => /^[a-z0-9*][a-z0-9\-_*]*$/.test(id)),
      'Server IDs must be lowercase alphanumeric with hyphens/underscores, or "*" for all servers',
    ),
});

// ─── Route deps ───────────────────────────────────────────────────────────────

export interface KeyRouteDeps {
  keyStore: ApiKeyStore;
  bus: RindEventBus;
  logger: Logger;
}

// ─── Routes ───────────────────────────────────────────────────────────────────

export function keyRoutes({ keyStore, bus, logger }: KeyRouteDeps): Hono {
  const app = new Hono();

  // List all issued keys — no plaintext values returned
  app.get('/keys', (c) => {
    return c.json({ keys: keyStore.list() });
  });

  // Get a single key by ID — no plaintext value returned
  app.get('/keys/:id', (c) => {
    const record = keyStore.get(c.req.param('id'));
    if (!record) return c.json({ error: `Key "${c.req.param('id')}" not found` }, 404);
    return c.json(record);
  });

  // Issue a new key — plaintext returned ONCE in this response only
  app.post('/keys', async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'Invalid JSON body' }, 400);
    }

    const parsed = IssueKeySchema.safeParse(body);
    if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

    const { name, serverIds } = parsed.data;
    const { plaintext, record } = keyStore.issue(name, serverIds);

    bus.emit('key:issued', { keyId: record.id, name, serverIds });
    logger.info({ keyId: record.id, name, serverIds }, 'API key issued');

    return c.json({ ...record, key: plaintext }, 201);
  });

  // Revoke a key — immediate, permanent
  app.delete('/keys/:id', (c) => {
    const id = c.req.param('id');
    if (!keyStore.revoke(id)) return c.json({ error: `Key "${id}" not found` }, 404);

    bus.emit('key:revoked', { keyId: id });
    logger.info({ keyId: id }, 'API key revoked');

    return c.json({ id, revoked: true });
  });

  return app;
}
