// Scan orchestrator: runs all checks on first connect, detects drift on reconnect.
// Called by the interceptor on every new MCP server connection.

import type { ScanFinding, ScanFindingCategory, ScanResult, ServerSchema, ToolDefinition } from './types.js';
import { checkAuth } from './auth.js';
import { checkPoisoning, checkCrossServerShadowing } from './poisoning.js';
import { checkPermissions } from './permissions.js';
import { detectSchemaDrift, hashToolSchema } from './schema-hash.js';

// In-memory schema store — keyed by serverId
// Phase 2: persist to Redis/Postgres so drift is detected across proxy restarts
const schemaStore = new Map<string, ServerSchema>();

// Last scan result per server, including failed scans.
// Used to quarantine servers that didn't pass — schemaStore only holds clean baselines.
const lastScanResults = new Map<string, ScanResult & { tools: ToolDefinition[] }>();

export function runFullScan(
  serverId: string,
  tools: ToolDefinition[],
  mode: 'block' | 'alert' | 'off' = 'block',
): ScanResult {
  if (mode === 'off') {
    return { serverId, scannedAt: Date.now(), findings: [], passed: true };
  }

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

  // Two separate severity checks with different purposes:
  //
  // hasHighFindings — any critical/high finding, regardless of category.
  //   Used to guard schema baseline updates: we never adopt a schema with ANY
  //   high/critical issues as the new ground truth (even advisory ones like
  //   OVER_PERMISSIONED), because that would mask future drift detection.
  //
  // hasQuarantineFindings — only categories that indicate active compromise or
  //   post-install tampering. These quarantine the server so all tool calls are
  //   blocked. Advisory findings (OVER_PERMISSIONED, AUTH_MISSING, schema
  //   additions/removals) do NOT quarantine: the server is legitimate, just
  //   misconfigured. Policy rules handle individual over-permissioned tools.
  const QUARANTINE_CATEGORIES = new Set<ScanFindingCategory>([
    'TOOL_POISONING',
    'SCHEMA_DRIFT_TOOL_MODIFIED',
    'CROSS_SERVER_SHADOWING',
  ]);

  const hasHighFindings = findings.some((f) => f.severity === 'critical' || f.severity === 'high');
  const hasQuarantineFindings = findings.some(
    (f) => (f.severity === 'critical' || f.severity === 'high') && QUARANTINE_CATEGORIES.has(f.category),
  );
  const passed = mode === 'alert' ? true : !hasQuarantineFindings;
  const scannedAt = Date.now();

  const result: ScanResult = { serverId, scannedAt, findings, passed };

  // Always record the latest scan result so callers can check quarantine status.
  lastScanResults.set(serverId, { ...result, tools });

  // Only update the baseline when no critical/high findings are present — even in alert mode.
  // Alert mode doesn't block, but must not adopt a poisoned schema as the new ground truth,
  // otherwise subsequent scans compare poisoned-against-poisoned and drift goes undetected.
  if (!hasHighFindings) {
    schemaStore.set(serverId, {
      serverId,
      hash: hashToolSchema(tools),
      tools,
      scannedAt,
      findings,
    });
  }

  return result;
}

export function getStoredSchema(serverId: string): ServerSchema | undefined {
  return schemaStore.get(serverId);
}

export function listStoredSchemas(): ServerSchema[] {
  return Array.from(schemaStore.values());
}

export function clearSchemaStore(): void {
  schemaStore.clear();
  lastScanResults.clear();
}

/** Returns the last scan result for a server, or undefined if never scanned. */
export function getLastScanResult(serverId: string): (ScanResult & { tools: ToolDefinition[] }) | undefined {
  return lastScanResults.get(serverId);
}

/** Returns all last scan results (clean and failed) for every scanned server. */
export function listAllScanResults(): Array<ScanResult & { tools: ToolDefinition[] }> {
  return Array.from(lastScanResults.values());
}

/** True if the server's last scan failed (critical/high findings). */
export function isServerQuarantined(serverId: string): boolean {
  const result = lastScanResults.get(serverId);
  return result !== undefined && !result.passed;
}

export type { ScanFinding, ScanResult, ToolDefinition };
