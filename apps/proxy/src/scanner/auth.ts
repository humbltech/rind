// Auth scanner: detects MCP servers with missing or weak authentication
// Checks tool descriptions for auth-gated operations that have no apparent guard

import type { ScanFinding, ToolDefinition } from './types.js';
import { PRIVILEGED_OPERATION_PATTERNS, AUTH_GUARD_PATTERNS } from '../rules/index.js';

export function checkAuth(tools: ToolDefinition[]): ScanFinding[] {
  const findings: ScanFinding[] = [];

  for (const tool of tools) {
    const descAndName = `${tool.name} ${tool.description}`;
    const isPrivileged = PRIVILEGED_OPERATION_PATTERNS.some((p) => p.pattern.test(descAndName));
    const hasAuthGuard = AUTH_GUARD_PATTERNS.some((p) => p.pattern.test(tool.description));

    if (isPrivileged && !hasAuthGuard) {
      findings.push({
        category: 'AUTH_MISSING',
        // medium, not high — AUTH_MISSING is a documentation/configuration gap advisory.
        // It flags that auth isn't visible in the tool description, but the tool may still
        // be protected at the infrastructure layer. Quarantine-worthy findings (critical/high)
        // are reserved for definitive evidence of active compromise: TOOL_POISONING,
        // SCHEMA_DRIFT_TOOL_ADDED, CROSS_SERVER_SHADOWING. This keeps AUTH_MISSING as a
        // surface-and-warn finding, not a blanket quarantine trigger.
        severity: 'medium',
        toolName: tool.name,
        detail: `Tool "${tool.name}" appears to perform a privileged operation but its description does not document authentication requirements. An unauthenticated caller may be able to invoke it.`,
      });
    }
  }

  return findings;
}
