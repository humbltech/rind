// Public library API — imported by other workspace packages (simulation, SDK wrappers, etc.)
// This is NOT the server entry point (src/index.ts starts the server).
// Only export what external consumers need.

export { createProxyServer } from './server.js';
export { resetSessions } from './session.js';
export { clearSchemaStore } from './scanner/index.js';
export { InMemoryPolicyStore } from './policy/store.js';
export type { PolicyStore } from './policy/store.js';
export type {
  ProxyConfig,
  ForwardFn,
  PolicyConfig,
  PolicyRule,
  ParameterMatcher,
  PolicyAction,
  ToolDefinition,
  ToolCallEvent,
  ToolResponseEvent,
  ScanResult,
  ScanFinding,
  ScanFindingCategory,
  ScanFindingSeverity,
  Session,
  AuditEntry,
} from './types.js';
