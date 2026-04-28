// Policy management and pack routes.

import { Hono } from 'hono';
import type { Logger } from 'pino';
import { z } from 'zod';
import type { PolicyEngine } from '../policy/engine.js';
import type { InMemoryPolicyStore } from '../policy/store.js';
import { listPacks, getPack, expandPackRules, rulesFromPack, recommendPacks } from '../policy/packs.js';
import { listStoredSchemas } from '../scanner/index.js';
import type { RindEventBus } from '../event-bus.js';
import type { PolicyRule } from '../types.js';
import { emitPolicyAudit } from './helpers.js';

// ─── Validation schemas ────────────────────────────────────────────────────────

const PolicyRuleSchema: z.ZodType<PolicyRule> = z.object({
  name: z.string(),
  agent: z.string().default('*'),
  enabled: z.boolean().default(true),
  match: z.object({
    tool: z.array(z.string()).optional(),
    toolPattern: z.string().optional(),
    timeWindow: z
      .object({
        daysOfWeek: z.array(z.number().int().min(0).max(6)).optional(),
        hours: z.string().regex(/^\d{2}:\d{2}-\d{2}:\d{2}$/).optional(),
      })
      .optional(),
    parameters: z.record(z.object({
      contains: z.array(z.string()).optional(),
      regex: z.string().optional(),
      startsWith: z.string().optional(),
      gt: z.number().optional(),
      lt: z.number().optional(),
      gte: z.number().optional(),
      lte: z.number().optional(),
      eq: z.unknown().optional(),
      in: z.array(z.unknown()).optional(),
    })).optional(),
    subcommand: z.array(z.string()).optional(),
    llmModel: z.array(z.string()).optional(),
    llmProvider: z.array(z.string()).optional(),
  }),
  action: z.enum(['ALLOW', 'DENY', 'REQUIRE_APPROVAL', 'RATE_LIMIT']),
  approval: z.object({ timeout: z.string().optional(), onTimeout: z.enum(['DENY', 'ALLOW']).optional() }).optional(),
  costEstimate: z.number().nonnegative().optional(),
  limits: z.object({
    maxCallsPerSession: z.number().int().positive().optional(),
    maxCallsPerHour: z.number().int().positive().optional(),
    maxCostPerSession: z.number().nonnegative().optional(),
    maxCostPerHour: z.number().nonnegative().optional(),
  }).optional(),
  rateLimit: z.object({
    limit: z.number().int().positive(),
    window: z.string().regex(/^\d+(s|m|h|d)$/),
    scope: z.enum(['per_agent', 'per_tool', 'global']),
  }).optional(),
  failMode: z.enum(['closed', 'open']).default('closed'),
  priority: z.number().int().min(0).default(50),
  loop: z.object({
    type: z.enum(['exact', 'consecutive', 'subcommand']),
    threshold: z.number().int().min(2),
    window: z.number().int().min(2).default(30),
  }).optional(),
}) as z.ZodType<PolicyRule>;

const PolicyConfigSchema = z.object({
  policies: z.array(PolicyRuleSchema),
});

// ─── Route deps ───────────────────────────────────────────────────────────────

export interface PolicyRouteDeps {
  policyEngine: PolicyEngine;
  policyStore: InMemoryPolicyStore;
  bus: RindEventBus;
  logger: Logger;
}

// ─── Routes ───────────────────────────────────────────────────────────────────

export function policyRoutes({ policyEngine, policyStore, bus, logger }: PolicyRouteDeps): Hono {
  const app = new Hono();

  // ─── Policy management (D-021 + D-036) ───────────────────────────────────────

  app.get('/policies', (c) => c.json({ policies: policyEngine.getRules() }));

  app.post('/policies/rules', async (c) => {
    const body = await c.req.json<unknown>();
    const parsed = PolicyRuleSchema.safeParse(body);
    if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
    try {
      policyStore.addRule(parsed.data);
      emitPolicyAudit(bus, 'rule-added', parsed.data.name);
      return c.json({ added: true, rule: parsed.data }, 201);
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : 'Unknown error' }, 409);
    }
  });

  app.put('/policies/rules/:name', async (c) => {
    const { name } = c.req.param();
    const body = await c.req.json<unknown>();
    const parsed = PolicyRuleSchema.safeParse(body);
    if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
    try {
      policyStore.updateRule(name, parsed.data);
      emitPolicyAudit(bus, 'rule-updated', name);
      return c.json({ updated: true, rule: parsed.data });
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : 'Unknown error' }, 404);
    }
  });

  app.patch('/policies/rules/:name/toggle', async (c) => {
    const { name } = c.req.param();
    const rules = policyStore.get().policies;
    const rule = rules.find((r) => r.name === name);
    if (!rule) return c.json({ error: `Rule "${name}" not found` }, 404);
    const updated = { ...rule, enabled: rule.enabled === false ? true : false };
    policyStore.updateRule(name, updated);
    emitPolicyAudit(bus, `rule-${updated.enabled ? 'enabled' : 'disabled'}`, name);
    return c.json({ toggled: true, name, enabled: updated.enabled });
  });

  app.delete('/policies/rules/:name', (c) => {
    const { name } = c.req.param();
    const removed = policyStore.removeRule(name);
    if (!removed) return c.json({ error: `Rule "${name}" not found` }, 404);
    emitPolicyAudit(bus, 'rule-removed', name);
    return c.json({ removed: true, name });
  });

  app.put('/policies', async (c) => {
    const body = await c.req.json<unknown>();
    const parsed = PolicyConfigSchema.safeParse(body);
    if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
    policyStore.update(parsed.data);
    emitPolicyAudit(bus, 'config-replaced', '*');
    return c.json({ replaced: true, ruleCount: parsed.data.policies.length });
  });

  app.post('/policies/validate', async (c) => {
    const body = await c.req.json<unknown>();
    const parsed = PolicyConfigSchema.safeParse(body);
    if (!parsed.success) return c.json({ valid: false, error: parsed.error.flatten() }, 400);
    return c.json({ valid: true, ruleCount: parsed.data.policies.length });
  });

  // ─── Policy packs (D-036) ─────────────────────────────────────────────────────

  app.get('/packs', (c) => {
    const activePolicies = policyStore.get().policies;
    const packs = listPacks().map((pack) => {
      const enabledRules = rulesFromPack(activePolicies, pack.id);
      return { ...pack, enabled: enabledRules.length > 0 };
    });
    return c.json(packs);
  });

  app.get('/packs/:packId', (c) => {
    const { packId } = c.req.param();
    const pack = getPack(packId);
    if (!pack) return c.json({ error: `Pack "${packId}" not found` }, 404);
    const activePolicies = policyStore.get().policies;
    return c.json({ ...pack, enabled: rulesFromPack(activePolicies, pack.id).length > 0 });
  });

  app.post('/packs/:packId/enable', (c) => {
    const { packId } = c.req.param();
    const pack = getPack(packId);
    if (!pack) return c.json({ error: `Pack "${packId}" not found` }, 404);
    const current = policyStore.get();
    const alreadyEnabled = rulesFromPack(current.policies, packId);
    if (alreadyEnabled.length > 0) return c.json({ error: `Pack "${packId}" is already enabled` }, 409);
    const newRules = expandPackRules(pack);
    policyStore.update({ policies: [...current.policies, ...newRules] });
    emitPolicyAudit(bus, 'pack-enabled', packId);
    logger.info({ packId, ruleCount: newRules.length }, 'Policy pack enabled');
    return c.json({ enabled: true, packId, ruleCount: newRules.length }, 201);
  });

  app.delete('/packs/:packId', (c) => {
    const { packId } = c.req.param();
    const pack = getPack(packId);
    if (!pack) return c.json({ error: `Pack "${packId}" not found` }, 404);
    const current = policyStore.get();
    const prefix = `pack:${packId}`;
    const next = current.policies.filter(
      (r) => !('_meta' in r && (r as { _meta?: { source?: string } })._meta?.source === prefix),
    );
    if (next.length === current.policies.length) {
      return c.json({ error: `Pack "${packId}" is not enabled` }, 404);
    }
    policyStore.update({ policies: next });
    emitPolicyAudit(bus, 'pack-disabled', packId);
    logger.info({ packId }, 'Policy pack disabled');
    return c.json({ disabled: true, packId });
  });

  app.get('/suggestions', (c) => {
    const schemas = listStoredSchemas();
    const toolNames = schemas.flatMap((s) => s.tools.map((t) => t.name));
    const recommendations = recommendPacks(toolNames);
    const activePolicies = policyStore.get().policies;
    return c.json(
      recommendations.map((pack) => ({
        ...pack,
        enabled: rulesFromPack(activePolicies, pack.id).length > 0,
      })),
    );
  });

  return app;
}
