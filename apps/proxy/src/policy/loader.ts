// Policy loader: reads rind.policy.yaml from disk and validates it.
// Returns a PolicyConfig suitable for constructing an InMemoryPolicyStore.

import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { z } from 'zod';
import type { PolicyConfig } from '../types.js';

// ─── Sub-schemas ──────────────────────────────────────────────────────────────

const TimeWindowSchema = z.object({
  daysOfWeek: z.array(z.number().int().min(0).max(6)).optional(),
  hours: z.string().regex(/^\d{2}:\d{2}-\d{2}:\d{2}$/, 'hours must be HH:MM-HH:MM').optional(),
});

// D-016: parameter matcher schema
const ParameterMatcherSchema = z.object({
  contains: z.array(z.string()).optional(),
  regex: z.string().optional(),
  startsWith: z.string().optional(),
  gt: z.number().optional(),
  lt: z.number().optional(),
  gte: z.number().optional(),
  lte: z.number().optional(),
  eq: z.unknown().optional(),
  in: z.array(z.unknown()).optional(),
});

// D-017: rate limit schema
const RateLimitSchema = z.object({
  limit: z.number().int().positive(),
  window: z.string().regex(/^\d+(s|m|h|d)$/, 'window must be like "30s", "5m", "2h", "1d"'),
  scope: z.enum(['per_agent', 'per_tool', 'global']),
});

// D-013: approval metadata schema (informational in Phase 1)
const ApprovalSchema = z.object({
  timeout: z.string().optional(),
  onTimeout: z.enum(['DENY', 'ALLOW']).optional(),
});

// D-014: cost limits schema
const LimitsSchema = z.object({
  maxCallsPerSession: z.number().int().positive().optional(),
  maxCallsPerHour: z.number().int().positive().optional(),
  maxCostPerSession: z.number().nonnegative().optional(),
  maxCostPerHour: z.number().nonnegative().optional(),
});

// Policy-driven loop detection condition
const LoopConditionSchema = z.object({
  type: z.enum(['exact', 'consecutive', 'subcommand']),
  threshold: z.number().int().min(2, 'threshold must be at least 2'),
  window: z.number().int().min(2).default(30),
});

// D-036: rule metadata schema (authoring provenance, not used by engine)
const PolicyRuleMetaSchema = z.object({
  source: z.string(), // 'manual' | 'yaml' | 'pack:sql-protection' | 'ai-assisted'
  createdAt: z.string(),
  modifiedFromPack: z.boolean().optional(),
});

// ─── Full policy rule schema ──────────────────────────────────────────────────

const PolicyRuleSchema = z.object({
  name: z.string(),
  agent: z.string().default('*'),
  match: z.object({
    tool: z.array(z.string()).optional(),
    toolPattern: z.string().optional(),
    timeWindow: TimeWindowSchema.optional(),
    parameters: z.record(ParameterMatcherSchema).optional(), // D-016
  }),
  action: z.enum(['ALLOW', 'DENY', 'REQUIRE_APPROVAL', 'RATE_LIMIT']),
  approval: ApprovalSchema.optional(), // D-013
  costEstimate: z.number().nonnegative().optional(), // D-014
  limits: LimitsSchema.optional(), // D-014
  rateLimit: RateLimitSchema.optional(), // D-017
  failMode: z.enum(['closed', 'open']).default('closed'), // D-022
  // D-036: priority — lower = evaluated first; custom rules default to 50, pack rules to 100
  priority: z.number().int().min(0).default(50),
  // Policy-driven loop detection
  loop: LoopConditionSchema.optional(),
  // D-036: authoring metadata — stripped before engine eval, preserved for API responses
  _meta: PolicyRuleMetaSchema.optional(),
});

const PolicyConfigSchema = z.object({
  policies: z.array(PolicyRuleSchema),
});

// ─── Exports ──────────────────────────────────────────────────────────────────

export function loadPolicyFile(filePath: string): PolicyConfig {
  const raw = readFileSync(filePath, 'utf-8');
  const parsed = parse(raw) as unknown;
  const result = PolicyConfigSchema.safeParse(parsed);

  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid policy file at ${filePath}:\n${issues}`);
  }

  return result.data;
}

export function emptyPolicyConfig(): PolicyConfig {
  return { policies: [] };
}
