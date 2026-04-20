// Auth scanner: detects MCP servers with missing or weak authentication
// Checks tool descriptions for auth-gated operations that have no apparent guard

import type { ScanFinding, ToolDefinition } from './types.js';

// Patterns that imply a tool performs privileged operations
const PRIVILEGED_OPERATION_PATTERNS = [
  /\badmin\b/i,
  /\bdelete/i,
  /\bdrop\b/i,
  /\btruncate\b/i,
  /\bpayment\b/i,
  /\bbilling\b/i,
  /\bcredential/i,
  /\bsecret\b/i,
  /\bapi.?key\b/i,
  /\bpassword\b/i,
  /\btoken\b/i,
  /\bwrite.*file\b/i,
  /\bexecute\b/i,
  /\bshell\b/i,
  /\bcommand\b/i,
];

// Patterns that suggest the tool itself handles auth (OK)
const AUTH_GUARD_PATTERNS = [
  /\bauth(entic|oriz)/i,
  /\brequires?.*(api.?key|token|credential|permission|role)/i,
  /\bonly.*with.*(key|token|auth)/i,
];

export function checkAuth(tools: ToolDefinition[]): ScanFinding[] {
  const findings: ScanFinding[] = [];

  for (const tool of tools) {
    const descAndName = `${tool.name} ${tool.description}`;
    const isPrivileged = PRIVILEGED_OPERATION_PATTERNS.some((p) => p.test(descAndName));
    const hasAuthGuard = AUTH_GUARD_PATTERNS.some((p) => p.test(tool.description));

    if (isPrivileged && !hasAuthGuard) {
      findings.push({
        category: 'AUTH_MISSING',
        severity: 'high',
        toolName: tool.name,
        detail: `Tool "${tool.name}" appears to perform a privileged operation but its description does not document authentication requirements. An unauthenticated caller may be able to invoke it.`,
      });
    }
  }

  return findings;
}
