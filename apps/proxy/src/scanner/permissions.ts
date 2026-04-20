// Over-permissioning scanner: flags tools that combine destructive and
// read capabilities in a single call, or that expose file system / shell
// access without scoping.
// Ref: OWASP MCP Top 10 — A04 (Tool Over-Permissioning)

import type { ScanFinding, ToolDefinition } from './types.js';

// Destructive capability signals in name or description
const DESTRUCTIVE_PATTERNS = [
  /\bdelete\b/i,
  /\bdrop\b/i,
  /\btruncate\b/i,
  /\bwipe\b/i,
  /\bremove\s+all\b/i,
  /\bformat\s+(disk|drive|volume)\b/i,
  /\bkill\s+(process|pid)\b/i,
  /\bshutdown\b/i,
  /\brm\s*-rf\b/i,
];

// Broad scope signals (no tenant/scope restriction mentioned)
const BROAD_SCOPE_PATTERNS = [
  /\ball\s+(users?|records?|files?|documents?)\b/i,
  /\bentire\s+(database|table|collection|bucket)\b/i,
  /\bunscoped\b/i,
  /\bglobal\b/i,
  /\bany\s+(file|path|directory)\b/i,
];

// Shell / arbitrary execution signals
const SHELL_EXECUTION_PATTERNS = [
  /\bexecute\b.{0,30}(command|shell|script|code)\b/i,
  /\brun\b.{0,30}(arbitrary|any|shell|system)\b/i,
  /\beval\b/i,
  /\bspawn\s+(process|subprocess)\b/i,
  /\b\/bin\/sh\b|\bbash\b/i,
];

// File system access without path restrictions
const UNRESTRICTED_FS_PATTERNS = [
  /\bread\s+(?:any\s+)?file\b/i,
  /\bwrite\s+(?:to\s+)?(?:any\s+)?file\b/i,
  /\bfile\s+system\s+access\b/i,
  /\barbitrary\s+path\b/i,
];

// Outbound HTTP to external URLs — data exfiltration vector
// Any tool that can POST/GET to a caller-supplied URL is a one-call exfiltration path
const OUTBOUND_HTTP_PATTERNS = [
  /\bhttp(?:s)?\s*(?:post|get|put|patch|request)\b.{0,60}external/i,
  /\bsend\s+(?:an?\s+)?http/i,
  /\bwebhook\b/i,
  /\bpost\s+(?:to\s+)?(?:an?\s+)?(?:external\s+)?url\b/i,
  /\bhttp\s+request\s+to\b/i,
];

export function checkPermissions(tools: ToolDefinition[]): ScanFinding[] {
  const findings: ScanFinding[] = [];

  for (const tool of tools) {
    const text = `${tool.name} ${tool.description}`;

    const isDestructive = DESTRUCTIVE_PATTERNS.some((p) => p.test(text));
    const isBroadScope = BROAD_SCOPE_PATTERNS.some((p) => p.test(text));

    if (isDestructive && isBroadScope) {
      findings.push({
        category: 'OVER_PERMISSIONED',
        severity: 'critical',
        toolName: tool.name,
        detail: `Tool "${tool.name}" combines destructive capability with broad/unscoped access. This is the rug-pull risk pattern: a single tool call can affect all data with no scope guard.`,
      });
    } else if (isDestructive) {
      findings.push({
        category: 'OVER_PERMISSIONED',
        severity: 'high',
        toolName: tool.name,
        detail: `Tool "${tool.name}" appears to perform a destructive operation. Verify it enforces tenant/user scoping in the implementation.`,
      });
    }

    if (SHELL_EXECUTION_PATTERNS.some((p) => p.test(text))) {
      findings.push({
        category: 'OVER_PERMISSIONED',
        severity: 'critical',
        toolName: tool.name,
        detail: `Tool "${tool.name}" appears to execute arbitrary shell commands or code. This is an RCE surface — any prompt injection into this tool's arguments yields code execution.`,
      });
    }

    if (UNRESTRICTED_FS_PATTERNS.some((p) => p.test(text))) {
      findings.push({
        category: 'OVER_PERMISSIONED',
        severity: 'high',
        toolName: tool.name,
        detail: `Tool "${tool.name}" appears to provide unrestricted file system access. Verify it enforces path allowlisting.`,
      });
    }

    if (OUTBOUND_HTTP_PATTERNS.some((p) => p.test(text))) {
      findings.push({
        category: 'OVER_PERMISSIONED',
        severity: 'critical',
        toolName: tool.name,
        detail: `Tool "${tool.name}" can send HTTP requests to caller-supplied external URLs. This is a one-call data exfiltration path — any prompt injection into this tool's arguments can exfiltrate data.`,
      });
    }
  }

  return findings;
}
