// Server registration routes (D-049).
//
// Manages the runtime MCP server registry — admins register upstream servers
// here before agents can connect through the proxy. Unregistered server IDs
// are blocked at the gateway and surfaced as shadow server attempts.
//
// Credential values in HTTP headers are never returned in GET responses.

import { Hono } from 'hono';
import { z } from 'zod';
import type { Logger } from 'pino';
import { StdioServerConfigSchema, HttpServerConfigSchema } from '../transport/types.js';
import type { UpstreamPool } from '../transport/pool.js';
import type { RindEventBus } from '../event-bus.js';
import type { UpstreamServerConfig } from '../transport/types.js';

// ─── Validation ───────────────────────────────────────────────────────────────

const serverIdField = z
  .string()
  .min(1)
  .max(64)
  .regex(
    /^[a-z0-9][a-z0-9-_]*$/,
    'Server ID must start with a letter or number and contain only lowercase letters, numbers, hyphens, or underscores',
  );

// Extend each transport variant with the `id` field, then re-discriminate.
// This keeps the discriminated union shape so Zod validates transport-specific
// fields correctly rather than producing a vague intersection error.
const RegisterBodySchema = z.discriminatedUnion('transport', [
  StdioServerConfigSchema.extend({ id: serverIdField }),
  HttpServerConfigSchema.extend({ id: serverIdField }),
]);

// ─── Credential redaction ─────────────────────────────────────────────────────

function redactConfig(config: UpstreamServerConfig): unknown {
  if (config.transport === 'http' && config.headers && Object.keys(config.headers).length > 0) {
    return {
      ...config,
      headers: Object.fromEntries(
        Object.keys(config.headers).map((k) => [k, '<redacted>']),
      ),
    };
  }
  return config;
}

// ─── Route deps ───────────────────────────────────────────────────────────────

export interface ServerRouteDeps {
  pool: UpstreamPool;
  bus: RindEventBus;
  logger: Logger;
}

// ─── Routes ───────────────────────────────────────────────────────────────────

export function serverRoutes({ pool, bus, logger }: ServerRouteDeps): Hono {
  const app = new Hono();

  // List all registered servers — header values redacted
  app.get('/servers', (c) => {
    const servers = pool.list().map(({ id, config }) => ({ id, ...redactConfig(config) }));
    return c.json({ servers });
  });

  // Get a single registered server — header values redacted
  app.get('/servers/:id', (c) => {
    const { id } = c.req.param();
    const entry = pool.list().find((s) => s.id === id);
    if (!entry) return c.json({ error: `Server "${id}" not found` }, 404);
    return c.json({ id: entry.id, ...redactConfig(entry.config) });
  });

  // Register a new MCP server (or replace an existing one)
  app.post('/servers', async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'Invalid JSON body' }, 400);
    }

    const parsed = RegisterBodySchema.safeParse(body);
    if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

    const { id, ...config } = parsed.data;
    const isUpdate = pool.has(id);

    pool.register(id, config as UpstreamServerConfig);
    bus.emit('server:registered', { serverId: id, transport: config.transport });
    logger.info({ serverId: id, transport: config.transport }, isUpdate ? 'MCP server updated' : 'MCP server registered');

    return c.json({ id, registered: true }, isUpdate ? 200 : 201);
  });

  // Unregister a server and close its upstream connection
  app.delete('/servers/:id', async (c) => {
    const { id } = c.req.param();
    if (!pool.has(id)) return c.json({ error: `Server "${id}" not found` }, 404);

    await pool.unregister(id);
    bus.emit('server:unregistered', { serverId: id });
    logger.info({ serverId: id }, 'MCP server unregistered');

    return c.json({ id, unregistered: true });
  });

  return app;
}
