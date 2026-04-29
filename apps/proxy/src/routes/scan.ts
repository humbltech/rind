// Scan-on-connect and continuous re-scan routes.

import { Hono } from 'hono';
import type { Logger } from 'pino';
import { z } from 'zod';
import { runFullScan } from '../scanner/index.js';
import type { RindEventBus } from '../event-bus.js';
import type { ProxyConfig } from '../types.js';
import { emitAudit } from './helpers.js';

const ScanBodySchema = z.object({
  serverId: z.string().min(1),
  tools: z.array(z.unknown()),
});

export interface ScanRouteDeps {
  bus: RindEventBus;
  config: ProxyConfig;
  logger: Logger;
}

export function scanRoutes({ bus, config, logger }: ScanRouteDeps): Hono {
  const app = new Hono();

  app.post('/scan', async (c) => {
    const parsed = ScanBodySchema.safeParse(await c.req.json());
    if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
    const { serverId, tools } = parsed.data;
    logger.info({ serverId }, 'Scan-on-connect triggered');

    const result = runFullScan(serverId, tools as Parameters<typeof runFullScan>[1]);

    const level = result.passed ? 'info' : 'warn';
    logger[level](
      { serverId, findingCount: result.findings.length, passed: result.passed },
      'Scan complete',
    );

    bus.emit('scan:complete', result);
    emitAudit(bus, {
      eventType: 'scan:complete',
      sessionId: '',
      agentId: '',
      serverId,
      action: result.passed ? 'ALLOW' : 'DENY',
    });

    return c.json(result);
  });

  // ─── Continuous re-scan (D-030) ───────────────────────────────────────────────
  app.post('/scan/refresh', async (c) => {
    const parsed = ScanBodySchema.safeParse(await c.req.json());
    if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
    const { serverId, tools } = parsed.data;
    logger.info({ serverId }, 'Re-scan triggered (rug pull detection)');

    const result = runFullScan(serverId, tools as Parameters<typeof runFullScan>[1]);

    const level = result.passed ? 'info' : 'warn';
    logger[level](
      { serverId, findingCount: result.findings.length, passed: result.passed },
      'Re-scan complete',
    );

    bus.emit('scan:complete', result);
    emitAudit(bus, {
      eventType: 'scan:complete',
      sessionId: '',
      agentId: '',
      serverId,
      action: result.passed ? 'ALLOW' : 'DENY',
    });

    return c.json(result);
  });

  return app;
}
