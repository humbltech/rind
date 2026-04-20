// Scan orchestrator: runs all checks on first connect, detects drift on reconnect.
// Called by the interceptor on every new MCP server connection.

import type { ScanFinding, ScanResult, ServerSchema, ToolDefinition } from './types.js';
import { checkAuth } from './auth.js';
import { checkPoisoning, checkCrossServerShadowing } from './poisoning.js';
import { checkPermissions } from './permissions.js';
import { detectSchemaDrift, hashToolSchema } from './schema-hash.js';

// In-memory schema store — keyed by serverId
// Phase 2: persist to Redis/Postgres so drift is detected across proxy restarts
const schemaStore = new Map<string, ServerSchema>();

export function runFullScan(serverId: string, tools: ToolDefinition[]): ScanResult {
  // Collect tool names from all OTHER registered servers for cross-server shadowing check (D-028)
  const externalToolNames: string[] = [];
  for (const [id, schema] of schemaStore) {
    if (id !== serverId) {
      for (const t of schema.tools) externalToolNames.push(t.name);
    }
  }

  const findings: ScanFinding[] = [
    ...checkAuth(tools),
    ...checkPoisoning(tools),
    ...checkPermissions(tools),
    ...checkCrossServerShadowing(tools, externalToolNames),
  ];

  const stored = schemaStore.get(serverId);

  if (stored) {
    // Subsequent connection — check for drift against known schema
    const driftFindings = detectSchemaDrift(serverId, stored, tools);
    findings.push(...driftFindings);
  }

  // Compute pass/fail before deciding whether to update the stored baseline.
  // Only update the baseline on clean scans — this preserves the last-known-good
  // schema so drift is detectable on repeated scans of a poisoned/drifted server,
  // not just the first reconnect.
  const passed = !findings.some((f) => f.severity === 'critical' || f.severity === 'high');
  const scannedAt = Date.now();

  if (passed) {
    schemaStore.set(serverId, {
      serverId,
      hash: hashToolSchema(tools),
      tools,
      scannedAt,
      findings,
    });
  }

  return { serverId, scannedAt, findings, passed };
}

export function getStoredSchema(serverId: string): ServerSchema | undefined {
  return schemaStore.get(serverId);
}

export function clearSchemaStore(): void {
  schemaStore.clear();
}

export type { ScanFinding, ScanResult, ToolDefinition };
