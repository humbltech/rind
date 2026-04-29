// Session management routes.

import { Hono } from 'hono';
import type { Logger } from 'pino';
import { z } from 'zod';
import type { ISessionStore } from '../session.js';
import type { RindEventBus } from '../event-bus.js';
import type { ProxyConfig } from '../types.js';
import { emitAudit } from './helpers.js';

const CreateSessionBodySchema = z.object({
  agentId: z.string().optional(),
});

export interface SessionRouteDeps {
  bus: RindEventBus;
  config: ProxyConfig;
  logger: Logger;
  sessionStore: ISessionStore;
}

export function sessionRoutes({ bus, config, logger, sessionStore }: SessionRouteDeps): Hono {
  const app = new Hono();

  app.post('/sessions', async (c) => {
    const parsed = CreateSessionBodySchema.safeParse(await c.req.json());
    if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
    const session = sessionStore.create(parsed.data.agentId ?? config.agentId);
    logger.info({ sessionId: session.sessionId, agentId: session.agentId }, 'Session created');
    bus.emit('session:created', session);
    emitAudit(bus, {
      eventType: 'session:created',
      sessionId: session.sessionId,
      agentId: session.agentId,
      serverId: '',
      action: 'ALLOW',
    });
    return c.json(session, 201);
  });

  app.get('/sessions', (c) => c.json(sessionStore.list()));

  app.delete('/sessions/:sessionId', (c) => {
    const { sessionId } = c.req.param();
    const sessions = sessionStore.list();
    const session = sessions.find((s) => s.sessionId === sessionId);
    const killed = sessionStore.kill(sessionId);
    if (!killed) return c.json({ error: 'Session not found' }, 404);
    logger.warn({ sessionId }, 'Session killed via kill-switch');
    bus.emit('session:killed', { sessionId, agentId: session?.agentId ?? 'unknown' });
    emitAudit(bus, {
      eventType: 'session:killed',
      sessionId,
      agentId: session?.agentId ?? 'unknown',
      serverId: '',
      action: 'ALLOW',
    });
    return c.json({ killed: true, sessionId });
  });

  return app;
}
