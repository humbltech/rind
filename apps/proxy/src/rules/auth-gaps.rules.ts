// Auth gap patterns — detects MCP tools that perform privileged operations
// without documented authentication requirements. Advisory-level findings;
// does not quarantine servers on its own.
// Ref: OWASP MCP Top 10 — A03 (Insufficient Authorization)
//
// Pattern count: 15 privileged + 3 auth guard
// Last updated: 2026-04-29

export interface AuthPattern {
  id: string;
  pattern: RegExp;
  description: string;
}

// Patterns that imply a tool performs privileged operations
export const PRIVILEGED_OPERATION_PATTERNS: AuthPattern[] = [
  { id: 'auth-priv-001', pattern: /\badmin\b/i, description: 'Admin-level operation' },
  { id: 'auth-priv-002', pattern: /\bdelete/i, description: 'Delete operation' },
  { id: 'auth-priv-003', pattern: /\bdrop\b/i, description: 'Drop/destroy operation' },
  { id: 'auth-priv-004', pattern: /\btruncate\b/i, description: 'Truncate operation' },
  { id: 'auth-priv-005', pattern: /\bpayment\b/i, description: 'Payment processing' },
  { id: 'auth-priv-006', pattern: /\bbilling\b/i, description: 'Billing access' },
  { id: 'auth-priv-007', pattern: /\bcredential/i, description: 'Credential access' },
  { id: 'auth-priv-008', pattern: /\bsecret\b/i, description: 'Secret/key access' },
  { id: 'auth-priv-009', pattern: /\bapi.?key\b/i, description: 'API key access' },
  { id: 'auth-priv-010', pattern: /\bpassword\b/i, description: 'Password access' },
  { id: 'auth-priv-011', pattern: /\btoken\b/i, description: 'Token access' },
  { id: 'auth-priv-012', pattern: /\bwrite.*file\b/i, description: 'File write operation' },
  { id: 'auth-priv-013', pattern: /\bexecute\b/i, description: 'Execute operation' },
  { id: 'auth-priv-014', pattern: /\bshell\b/i, description: 'Shell access' },
  { id: 'auth-priv-015', pattern: /\bcommand\b/i, description: 'Command execution' },
];

// Patterns that suggest the tool itself documents auth requirements (safe)
export const AUTH_GUARD_PATTERNS: AuthPattern[] = [
  { id: 'auth-guard-001', pattern: /\bauth(entic|oriz)/i, description: 'Explicit authentication mention' },
  { id: 'auth-guard-002', pattern: /\brequires?.*(api.?key|token|credential|permission|role)/i, description: 'Documented credential requirement' },
  { id: 'auth-guard-003', pattern: /\bonly.*with.*(key|token|auth)/i, description: 'Conditional auth guard statement' },
];
