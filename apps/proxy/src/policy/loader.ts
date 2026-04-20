// Policy loader: reads aegis.policy.yaml from disk and validates it.
// Returns a PolicyConfig suitable for constructing a PolicyEngine.

import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { z } from 'zod';
import type { PolicyConfig } from '../types.js';

const TimeWindowSchema = z.object({
  daysOfWeek: z.array(z.number().int().min(0).max(6)).optional(),
  hours: z.string().regex(/^\d{2}:\d{2}-\d{2}:\d{2}$/, 'hours must be HH:MM-HH:MM').optional(),
});

const PolicyRuleSchema = z.object({
  name: z.string(),
  agent: z.string().default('*'),
  match: z.object({
    tool: z.array(z.string()).optional(),
    toolPattern: z.string().optional(),
    timeWindow: TimeWindowSchema.optional(),
  }),
  action: z.enum(['ALLOW', 'DENY', 'REQUIRE_APPROVAL', 'RATE_LIMIT']),
});

const PolicyConfigSchema = z.object({
  policies: z.array(PolicyRuleSchema),
});

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
