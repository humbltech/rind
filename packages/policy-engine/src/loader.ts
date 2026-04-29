// Policy loader: reads rind.policy.yaml from disk and validates it.
// Returns a PolicyConfig suitable for constructing an InMemoryPolicyStore.

import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { z } from 'zod';
import type { PolicyConfig } from '@rind/core';
import { getPack, expandPackRules, listPacks } from './packs.js';

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

// ─── LLM content detection schemas ───────────────────────────────────────────

// Shared detection strategy mixin — used by all detector config schemas
const DetectionStrategySchema = z.object({
  pipeline: z.array(z.enum(['regex', 'ml_ner', 'llm_judge'])).optional(),
  advanceThreshold: z.number().min(0).max(1).optional(),
  llmJudge: z.object({
    model: z.string().optional(),
    threshold: z.number().min(0).max(1).optional(),
    timeoutMs: z.number().int().positive().optional(),
    failMode: z.enum(['open', 'closed']).optional(),
  }).optional(),
  mlModel: z.object({
    endpoint: z.string().url().optional(),
    modelId: z.string().optional(),
    timeoutMs: z.number().int().positive().optional(),
    failMode: z.enum(['open', 'closed']).optional(),
  }).optional(),
});

const PiiEntitySchema = z.enum([
  'EMAIL', 'PHONE', 'SIN', 'SSN', 'CREDIT_CARD',
  'IBAN', 'PASSPORT', 'PERSON_NAME', 'ADDRESS',
  'IP_ADDRESS', 'DATE_OF_BIRTH', 'HEALTH_CARD',
]);

const PiiDetectorConfigSchema = DetectionStrategySchema.extend({
  entities: z.array(PiiEntitySchema).min(1, 'pii.entities must have at least one entity type'),
  locale: z.string().optional(),
  confidenceThreshold: z.number().min(0).max(1).optional(),
});

const BuiltinSecretPatternSchema = z.enum([
  'openai_key', 'anthropic_key', 'aws_access_key', 'github_token',
  'stripe_key', 'jwt', 'private_key', 'bearer_token', 'generic_api_key',
]);

const SecretDetectorConfigSchema = DetectionStrategySchema.extend({
  patterns: z.array(BuiltinSecretPatternSchema).optional(),
  custom: z.array(z.object({
    name: z.string(),
    regex: z.string().refine((r) => { try { new RegExp(r); return true; } catch { return false; } }, 'invalid regex'),
  })).optional(),
});

const InjectionDetectorConfigSchema = DetectionStrategySchema;

const DlpDetectorConfigSchema = DetectionStrategySchema.extend({
  patterns: z.array(z.object({
    name: z.string(),
    regex: z.string().refine((r) => { try { new RegExp(r); return true; } catch { return false; } }, 'invalid regex'),
    severity: z.enum(['critical', 'high', 'medium']),
  })).min(1, 'dlp.patterns must have at least one pattern'),
});

const LlmContentMatchSchema = z.object({
  scope: z.enum(['request', 'response', 'both']),
  targets: z.array(z.enum(['system', 'user', 'assistant'])).optional(),
  detectors: z.array(z.enum(['pii', 'secret', 'prompt_injection', 'dlp']))
    .min(1, 'content.detectors must have at least one detector'),
});

// ─── Full policy rule schema ──────────────────────────────────────────────────

export const PolicyRuleSchema = z.object({
  name: z.string(),
  agent: z.string().default('*'),
  enabled: z.boolean().default(true),
  match: z.object({
    tool: z.array(z.string()).optional(),
    toolPattern: z.string().optional(),
    timeWindow: TimeWindowSchema.optional(),
    parameters: z.record(ParameterMatcherSchema).optional(), // D-016
    subcommand: z.array(z.string()).optional(), // Bash sub-command matching
    // D-041: LLM proxy matching — glob patterns for model names, provider names
    llmModel: z.array(z.string()).optional(),
    llmProvider: z.array(z.string()).optional(),
    // LLM content-based matching
    content: LlmContentMatchSchema.optional(),
  }),
  action: z.enum(['ALLOW', 'DENY', 'REQUIRE_APPROVAL', 'RATE_LIMIT', 'REDACT', 'PSEUDONYMIZE']),
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
  // LLM content detector configs — only used when match.content is set
  pii: PiiDetectorConfigSchema.optional(),
  secrets: SecretDetectorConfigSchema.optional(),
  injection: InjectionDetectorConfigSchema.optional(),
  dlp: DlpDetectorConfigSchema.optional(),
});

const PolicyConfigSchema = z.object({
  // Named pack IDs to expand — resolved to rules at load time
  packs: z.array(z.string()).optional(),
  policies: z.array(PolicyRuleSchema).optional().default([]),
});

// ─── Pack expansion ───────────────────────────────────────────────────────────

/**
 * Resolve pack IDs to their expanded rules and merge with inline policies.
 * Unknown pack IDs produce a descriptive error rather than silently being skipped.
 */
function expandPacks(
  packIds: string[],
  inlinePolicies: PolicyConfig['policies'],
): PolicyConfig {
  const packRules: PolicyConfig['policies'] = [];
  const unknownPacks: string[] = [];

  for (const id of packIds) {
    const pack = getPack(id);
    if (!pack) {
      unknownPacks.push(id);
      continue;
    }
    packRules.push(...expandPackRules(pack));
  }

  if (unknownPacks.length > 0) {
    throw new Error(
      `Unknown policy pack(s): ${unknownPacks.join(', ')}.\n` +
      `Available packs: ${listPacks().map((p) => p.id).join(', ')}`,
    );
  }

  return { policies: [...inlinePolicies, ...packRules] };
}

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

  const { packs = [], policies } = result.data;
  return expandPacks(packs, policies);
}

export function emptyPolicyConfig(): PolicyConfig {
  return { policies: [] };
}
