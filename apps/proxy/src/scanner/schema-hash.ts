// Schema drift detection: hashes MCP tool schemas on first connect.
// On subsequent connections, compares hashes and flags any changes.
// Addresses the runtime trust gap: once a package is installed, nothing
// re-verifies that its tool definitions haven't been silently modified.

import { createHash } from 'node:crypto';
import type { ScanFinding, ServerSchema, ToolDefinition } from './types.js';

export function hashToolSchema(tools: ToolDefinition[]): string {
  // Sort by name for deterministic hashing regardless of server declaration order
  const sorted = [...tools].sort((a: ToolDefinition, b: ToolDefinition) => a.name.localeCompare(b.name));
  const canonical = JSON.stringify(sorted);
  return createHash('sha256').update(canonical).digest('hex');
}

export function detectSchemaDrift(
  serverId: string,
  previousSchema: ServerSchema,
  currentTools: ToolDefinition[],
): ScanFinding[] {
  const findings: ScanFinding[] = [];

  const currentHash = hashToolSchema(currentTools);

  // No change — fast path
  if (previousSchema.hash === currentHash) {
    return findings;
  }

  // Hash changed — identify what changed
  const previousToolNames = new Set(previousSchema.tools.map((t) => t.name));
  const currentToolNames = new Set(currentTools.map((t) => t.name));

  // Tools added since last connect
  for (const tool of currentTools) {
    if (!previousToolNames.has(tool.name)) {
      findings.push({
        category: 'SCHEMA_DRIFT_TOOL_ADDED',
        severity: 'critical',
        toolName: tool.name,
        detail: `MCP server "${serverId}" added tool "${tool.name}" since the last connection. New tools added between connections are a rug-pull signal — the server definition changed without a version bump. Verify this addition was intentional.`,
      });
    }
  }

  // Tools removed since last connect
  for (const tool of previousSchema.tools) {
    if (!currentToolNames.has(tool.name)) {
      findings.push({
        category: 'SCHEMA_DRIFT_TOOL_REMOVED',
        severity: 'high',
        toolName: tool.name,
        detail: `MCP server "${serverId}" removed tool "${tool.name}" since the last connection. Removed tools break agent workflows that depend on them. Verify this removal was intentional.`,
      });
    }
  }

  // Tools present in both but with changed definitions
  const currentByName = new Map(currentTools.map((t) => [t.name, t]));
  for (const previousTool of previousSchema.tools) {
    const currentTool = currentByName.get(previousTool.name);
    if (!currentTool) continue;

    const prevHash = createHash('sha256').update(JSON.stringify(previousTool)).digest('hex');
    const currHash = createHash('sha256').update(JSON.stringify(currentTool)).digest('hex');

    if (prevHash !== currHash) {
      findings.push({
        category: 'SCHEMA_DRIFT_TOOL_MODIFIED',
        severity: 'critical',
        toolName: previousTool.name,
        detail: `MCP server "${serverId}" modified tool "${previousTool.name}" since the last connection. A changed tool description is the primary vector for a post-install tool poisoning attack (cf. LiteLLM supply chain attack pattern).`,
      });
    }
  }

  return findings;
}
