// Scan orchestrator: runs all checks on first connect, detects drift on reconnect.
// Called by the interceptor on every new MCP server connection.

import type { ScanFinding, ScanResult, ServerSchema, ToolDefinition } from './types.js';
import { checkAuth } from './auth.js';
import { checkPoisoning } from './poisoning.js';
import { checkPermissions } from './permissions.js';
import { detectSchemaDrift, hashToolSchema } from './schema-hash.js';

// In-memory schema store — keyed by serverId
// Phase 2: persist to Redis/Postgres so drift is detected across proxy restarts
const schemaStore = new Map<string, ServerSchema>();

export function runFullScan(serverId: string, tools: ToolDefinition[]): ScanResult {
  const findings: ScanFinding[] = [
    ...checkAuth(tools),
    ...checkPoisoning(tools),
    ...checkPermissions(tools),
  ];

  const stored = schemaStore.get(serverId);

  if (stored) {
    // Subsequent connection — check for drift against known schema
    const driftFindings = detectSchemaDrift(serverId, stored, tools);
    findings.push(...driftFindings);
  }

  // Update stored schema with current state
  const schema: ServerSchema = {
    serverId,
    hash: hashToolSchema(tools),
    tools,
    scannedAt: Date.now(),
    findings,
  };
  schemaStore.set(serverId, schema);

  const passed = !findings.some((f) => f.severity === 'critical' || f.severity === 'high');

  return {
    serverId,
    scannedAt: schema.scannedAt,
    findings,
    passed,
  };
}

export function getStoredSchema(serverId: string): ServerSchema | undefined {
  return schemaStore.get(serverId);
}

export function clearSchemaStore(): void {
  schemaStore.clear();
}

export type { ScanFinding, ScanResult, ToolDefinition };
