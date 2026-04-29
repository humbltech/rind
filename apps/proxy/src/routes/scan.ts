// Scan-on-connect and continuous re-scan routes.

import { Hono } from 'hono';
import type { Logger } from 'pino';
import { z } from 'zod';
import { runFullScan } from '../scanner/index.js';
import type { RindEventBus } from '../event-bus.js';
import { emitAudit } from './helpers.js';

const ScanBodySchema = z.object({
  serverId: z.string().min(1),
  tools: z.array(z.unknown()),
});

export interface ScanRouteDeps {
  bus: RindEventBus;
  logger: Logger;
}

export function scanRoutes({ bus, logger }: ScanRouteDeps): Hono {
  const app = new Hono();

  function handleScan(serverId: string, tools: Parameters<typeof runFullScan>[1], logLabel: string) {
    logger.info({ serverId }, logLabel);
    const result = runFullScan(serverId, tools);
    const level = result.passed ? 'info' : 'warn';
    logger[level]({ serverId, findingCount: result.findings.length, passed: result.passed }, `${logLabel} complete`);
    bus.emit('scan:complete', result);
    emitAudit(bus, { eventType: 'scan:complete', sessionId: '', agentId: '', serverId, action: result.passed ? 'ALLOW' : 'DENY' });
    return result;
  }

  app.post('/scan', async (c) => {
    const parsed = ScanBodySchema.safeParse(await c.req.json());
    if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
    const { serverId, tools } = parsed.data;
    return c.json(handleScan(serverId, tools as Parameters<typeof runFullScan>[1], 'Scan-on-connect'));
  });

  // ─── Continuous re-scan (D-030) ───────────────────────────────────────────────
  app.post('/scan/refresh', async (c) => {
    const parsed = ScanBodySchema.safeParse(await c.req.json());
    if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
    const { serverId, tools } = parsed.data;
    return c.json(handleScan(serverId, tools as Parameters<typeof runFullScan>[1], 'Re-scan (rug pull detection)'));
  });

  return app;
}
