// Over-permissioning scanner: flags tools that combine destructive and
// read capabilities in a single call, or that expose file system / shell
// access without scoping.
// Ref: OWASP MCP Top 10 — A04 (Tool Over-Permissioning)

import type { ScanFinding, ToolDefinition } from './types.js';
import {
  DESTRUCTIVE_PATTERNS,
  BROAD_SCOPE_PATTERNS,
  SHELL_EXECUTION_PATTERNS,
  UNRESTRICTED_FS_PATTERNS,
  OUTBOUND_HTTP_PATTERNS,
  SENSITIVE_DATA_PATTERNS,
  SERVICE_LIFECYCLE_PATTERNS,
} from '../rules/index.js';

export function checkPermissions(tools: ToolDefinition[]): ScanFinding[] {
  const findings: ScanFinding[] = [];

  for (const tool of tools) {
    const text = `${tool.name} ${tool.description}`;

    const isDestructive = DESTRUCTIVE_PATTERNS.some((p) => p.pattern.test(text));
    const isBroadScope = BROAD_SCOPE_PATTERNS.some((p) => p.pattern.test(text));

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

    if (SHELL_EXECUTION_PATTERNS.some((p) => p.pattern.test(text))) {
      findings.push({
        category: 'OVER_PERMISSIONED',
        severity: 'critical',
        toolName: tool.name,
        detail: `Tool "${tool.name}" appears to execute arbitrary shell commands or code. This is an RCE surface — any prompt injection into this tool's arguments yields code execution.`,
      });
    }

    if (UNRESTRICTED_FS_PATTERNS.some((p) => p.pattern.test(text))) {
      findings.push({
        category: 'OVER_PERMISSIONED',
        severity: 'high',
        toolName: tool.name,
        detail: `Tool "${tool.name}" appears to provide unrestricted file system access. Verify it enforces path allowlisting.`,
      });
    }

    if (OUTBOUND_HTTP_PATTERNS.some((p) => p.pattern.test(text))) {
      findings.push({
        category: 'OVER_PERMISSIONED',
        severity: 'critical',
        toolName: tool.name,
        detail: `Tool "${tool.name}" can send HTTP requests to caller-supplied external URLs. This is a one-call data exfiltration path — any prompt injection into this tool's arguments can exfiltrate data.`,
      });
    }

    if (SENSITIVE_DATA_PATTERNS.some((p) => p.pattern.test(text))) {
      findings.push({
        category: 'OVER_PERMISSIONED',
        severity: 'high',
        toolName: tool.name,
        detail: `Tool "${tool.name}" exposes environment variables or secrets without per-agent scoping. Any agent granted this tool can read all credentials for all services.`,
      });
    }

    if (SERVICE_LIFECYCLE_PATTERNS.some((p) => p.pattern.test(text))) {
      findings.push({
        category: 'OVER_PERMISSIONED',
        severity: 'high',
        toolName: tool.name,
        detail: `Tool "${tool.name}" can restart or redeploy a service, potentially causing a production outage. Verify it enforces environment scoping (staging vs. production).`,
      });
    }
  }

  return findings;
}
