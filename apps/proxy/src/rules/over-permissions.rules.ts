// Over-permissioning patterns — flags tools that combine destructive and broad
// capabilities, or expose shell/filesystem access without scoping restrictions.
// Ref: OWASP MCP Top 10 — A04 (Tool Over-Permissioning)
//
// Pattern count: 9 destructive + 5 broad scope + 5 shell + 4 unrestricted FS + 5 outbound HTTP
// Last updated: 2026-04-29

export interface PermissionsPattern {
  id: string;
  pattern: RegExp;
  description: string;
}

// Destructive capability signals in tool name or description
export const DESTRUCTIVE_PATTERNS: PermissionsPattern[] = [
  { id: 'perm-dest-001', pattern: /\bdelete\b/i, description: 'Delete operation' },
  { id: 'perm-dest-002', pattern: /\bdrop\b/i, description: 'Drop/destroy operation' },
  { id: 'perm-dest-003', pattern: /\btruncate\b/i, description: 'Truncate operation' },
  { id: 'perm-dest-004', pattern: /\bwipe\b/i, description: 'Wipe operation' },
  { id: 'perm-dest-005', pattern: /\bremove\s+all\b/i, description: 'Remove-all operation' },
  { id: 'perm-dest-006', pattern: /\bformat\s+(disk|drive|volume)\b/i, description: 'Format disk/drive/volume' },
  { id: 'perm-dest-007', pattern: /\bkill\s+(process|pid)\b/i, description: 'Kill process' },
  { id: 'perm-dest-008', pattern: /\bshutdown\b/i, description: 'Shutdown operation' },
  { id: 'perm-dest-009', pattern: /\brm\s*-rf\b/i, description: 'Recursive force remove (rm -rf)' },
];

// Broad scope signals — operations with no tenant/scope restriction
export const BROAD_SCOPE_PATTERNS: PermissionsPattern[] = [
  { id: 'perm-scope-001', pattern: /\ball\s+(users?|records?|files?|documents?)\b/i, description: 'All users/records/files without scoping' },
  { id: 'perm-scope-002', pattern: /\bentire\s+(database|table|collection|bucket)\b/i, description: 'Entire database/table/collection access' },
  { id: 'perm-scope-003', pattern: /\bunscoped\b/i, description: 'Explicitly unscoped operation' },
  { id: 'perm-scope-004', pattern: /\bglobal\b/i, description: 'Global scope operation' },
  { id: 'perm-scope-005', pattern: /\bany\s+(file|path|directory)\b/i, description: 'Any file/path/directory access' },
];

// Shell / arbitrary code execution signals
export const SHELL_EXECUTION_PATTERNS: PermissionsPattern[] = [
  { id: 'perm-shell-001', pattern: /\bexecute\b.{0,30}(command|shell|script|code)\b/i, description: 'Execute arbitrary command/shell/script/code' },
  { id: 'perm-shell-002', pattern: /\brun\b.{0,30}(arbitrary|any|shell|system)\b/i, description: 'Run arbitrary/any/shell/system commands' },
  { id: 'perm-shell-003', pattern: /\beval\b/i, description: 'Eval (dynamic code execution)' },
  { id: 'perm-shell-004', pattern: /\bspawn\s+(process|subprocess)\b/i, description: 'Spawn process/subprocess' },
  { id: 'perm-shell-005', pattern: /\b\/bin\/sh\b|\bbash\b/i, description: 'Direct shell reference (/bin/sh or bash)' },
];

// File system access without path restrictions
export const UNRESTRICTED_FS_PATTERNS: PermissionsPattern[] = [
  { id: 'perm-fs-001', pattern: /\bread\s+(?:any\s+)?file\b/i, description: 'Read any file without path restriction' },
  { id: 'perm-fs-002', pattern: /\bwrite\s+(?:to\s+)?(?:any\s+)?file\b/i, description: 'Write to any file without path restriction' },
  { id: 'perm-fs-003', pattern: /\bfile\s+system\s+access\b/i, description: 'Generic file system access claim' },
  { id: 'perm-fs-004', pattern: /\barbitrary\s+path\b/i, description: 'Arbitrary path access' },
];

// Outbound HTTP to external URLs — one-call data exfiltration vector
export const OUTBOUND_HTTP_PATTERNS: PermissionsPattern[] = [
  { id: 'perm-http-001', pattern: /\bhttp(?:s)?\s*(?:post|get|put|patch|request)\b.{0,60}external/i, description: 'HTTP request to external endpoint' },
  { id: 'perm-http-002', pattern: /\bsend\s+(?:an?\s+)?http/i, description: 'Send HTTP request capability' },
  { id: 'perm-http-003', pattern: /\bwebhook\b/i, description: 'Webhook (outbound HTTP to caller-supplied URL)' },
  { id: 'perm-http-004', pattern: /\bpost\s+(?:to\s+)?(?:an?\s+)?(?:external\s+)?url\b/i, description: 'Post to external URL' },
  { id: 'perm-http-005', pattern: /\bhttp\s+request\s+to\b/i, description: 'HTTP request to caller-supplied destination' },
];

// Sensitive data access — tools that expose credentials or secrets broadly.
// These are high-severity even without a destructive action: any credential leak
// enables follow-on attacks, as in the PocketOS Railway incident.
export const SENSITIVE_DATA_PATTERNS: PermissionsPattern[] = [
  { id: 'perm-data-001', pattern: /\blist\b.{0,40}\b(variable|secret|credential|env(?:ironment)?|token)\b/i, description: 'Lists all variables/secrets (broad credential read)' },
  { id: 'perm-data-002', pattern: /\b(retrieve|get|fetch|read)\b.{0,40}\ball\b.{0,40}\b(variable|secret|credential|env(?:ironment)?)\b/i, description: 'Retrieves all variables/secrets' },
  { id: 'perm-data-003', pattern: /\b(variable|secret|credential)s?\b.{0,40}\b(list|retrieve|dump|export)\b/i, description: 'Variables/secrets listing or export operation' },
];

// Service lifecycle — operations that can cause production outages.
// Restart/redeploy of a service has the same blast radius as deletion if it
// hits production; the PocketOS incident used volumeDelete but service-restart
// is equally dangerous and equally un-scoped in most MCP catalogs.
export const SERVICE_LIFECYCLE_PATTERNS: PermissionsPattern[] = [
  { id: 'perm-svc-001', pattern: /\b(restart|reboot|redeploy)\b.{0,40}\bservice\b/i, description: 'Restart/reboot/redeploy service (outage risk)' },
  { id: 'perm-svc-002', pattern: /\bservice\b.{0,40}\b(restart|reboot|stop|redeploy)\b/i, description: 'Service stop/restart/redeploy operation' },
  { id: 'perm-svc-003', pattern: /\b(trigger|force)\b.{0,30}\b(restart|redeploy|reboot)\b/i, description: 'Force restart/redeploy (outage risk)' },
];
