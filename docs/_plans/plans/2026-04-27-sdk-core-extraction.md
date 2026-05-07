# sdk-core Type Extraction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move all shared types and the event bus out of `apps/proxy/src/` into `packages/sdk-core` (`@rind/core`), so any future app or package can import them without depending on the proxy.

**Architecture:** `packages/sdk-core/src/types.ts` becomes the single source of truth for every event, policy, scan, and audit type. `packages/sdk-core/src/event-bus.ts` holds `RindEventBus`. The proxy keeps thin barrel files at their existing paths so zero internal imports need to change. `ProxyConfig` and `ForwardFn` stay in the proxy because they reference proxy-internal transport types.

**Tech Stack:** TypeScript 5.4, tsup (ESM + `.d.ts` emit), pnpm workspaces, Turborepo.

---

## File Map

| Action | Path | What changes |
|--------|------|-------------|
| Create | `packages/sdk-core/src/types.ts` | All shared type definitions (moved from proxy) |
| Create | `packages/sdk-core/src/event-bus.ts` | `RindEventBus` + `RindEventMap` (moved from proxy) |
| Modify | `packages/sdk-core/src/index.ts` | Re-export both modules |
| Modify | `packages/sdk-core/package.json` | Add `@types/node` devDep |
| Create | `packages/sdk-core/tsconfig.json` | TypeScript config for the package |
| Modify | `apps/proxy/src/types.ts` | Thin barrel: `export * from '@rind/core'` + `ProxyConfig` + `ForwardFn` |
| Modify | `apps/proxy/src/transport/llm/types.ts` | Thin barrel: re-export LLM types from `@rind/core` |
| Modify | `apps/proxy/src/event-bus.ts` | Thin barrel: re-export from `@rind/core` |

No other files change — proxy internals keep their existing `'./types.js'` import paths.

---

## Task 1: Add tsconfig.json and @types/node to packages/sdk-core

**Files:**
- Create: `packages/sdk-core/tsconfig.json`
- Modify: `packages/sdk-core/package.json`

- [ ] **Step 1: Create tsconfig.json**

```json
// packages/sdk-core/tsconfig.json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "noEmit": false,
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 2: Add @types/node devDependency**

Edit `packages/sdk-core/package.json` — the event-bus uses `node:events`:

```json
{
  "name": "@rind/core",
  "version": "0.0.1",
  "type": "module",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "scripts": {
    "build": "tsup src/index.ts --format esm --dts",
    "dev": "tsup src/index.ts --format esm --dts --watch",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "tsup": "^8.0.0",
    "typescript": "^5.4.0",
    "vitest": "^2.0.0"
  }
}
```

- [ ] **Step 3: Install the new devDep**

```bash
cd /Users/atinderpalsingh/projects/aegis-bundle/rind
pnpm install
```

Expected: Lock file updates, `@types/node` appears in `packages/sdk-core/node_modules`.

---

## Task 2: Create packages/sdk-core/src/types.ts

All shared type definitions move here. This is the content of `apps/proxy/src/types.ts` minus `ProxyConfig` and `ForwardFn`, plus all of `apps/proxy/src/transport/llm/types.ts` (which was previously re-exported through the proxy's types.ts).

**Files:**
- Create: `packages/sdk-core/src/types.ts`

- [ ] **Step 1: Write the file**

```typescript
// @rind/core — shared types for the Rind event/policy/audit system.
// All events are structurally compatible with OpenTelemetry spans for future export.
// ProxyConfig and ForwardFn are proxy-specific and stay in @rind/proxy.

export type PolicyAction = 'ALLOW' | 'DENY' | 'REQUIRE_APPROVAL' | 'RATE_LIMIT';

// ─── Tool call events ────────────────────────────────────────────────────────

export interface ToolCallEvent {
  sessionId: string;
  sessionName?: string;
  agentId: string;
  serverId: string;
  toolName: string;
  input: unknown;
  timestamp: number;
  outcome?: 'allowed' | 'blocked' | 'require-approval' | 'approved' | 'disapproved' | 'approval-timeout' | 'upstream-error' | 'upstream-timeout';
  reason?: string;
  matchedRule?: string;
  matchedRuleType?: 'policy' | 'scan';
  source?: 'builtin' | 'mcp' | 'proxy';
  toolLabel?: string;
  cwd?: string;
  correlationId?: string;
  response?: {
    outputPreview?: string;
    outputTruncated?: boolean;
    outputSizeBytes?: number;
    outputHash?: string;
    threats?: ResponseThreat[];
    timestamp: number;
  };
}

export interface ToolResponseEvent {
  sessionId: string;
  agentId: string;
  serverId: string;
  toolName: string;
  output: unknown;
  durationMs: number;
  threats: ResponseThreat[];
}

export interface ToolErrorEvent {
  sessionId: string;
  serverId: string;
  agentId: string;
  toolName: string;
  errorKind: 'upstream-unreachable' | 'upstream-timeout';
  durationMs: number;
}

// ─── Response-side threat detection ─────────────────────────────────────────

export interface ResponseThreat {
  type: 'PROMPT_INJECTION' | 'CREDENTIAL_LEAK' | 'SUSPICIOUS_REDIRECT' | 'INDIRECT_PROMPT_INJECTION';
  severity: 'critical' | 'high' | 'medium';
  pattern: string;
  sanitized: boolean;
}

// ─── Schema + scan ───────────────────────────────────────────────────────────

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface ServerSchema {
  serverId: string;
  hash: string;
  tools: ToolDefinition[];
  scannedAt: number;
  findings: ScanFinding[];
}

export type ScanFindingSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';
export type ScanFindingCategory =
  | 'AUTH_MISSING'
  | 'TOOL_POISONING'
  | 'OVER_PERMISSIONED'
  | 'SCHEMA_DRIFT'
  | 'SCHEMA_DRIFT_TOOL_ADDED'
  | 'SCHEMA_DRIFT_TOOL_MODIFIED'
  | 'SCHEMA_DRIFT_TOOL_REMOVED'
  | 'CROSS_SERVER_SHADOWING';

export interface ScanFinding {
  category: ScanFindingCategory;
  severity: ScanFindingSeverity;
  toolName?: string;
  detail: string;
}

export interface ScanResult {
  serverId: string;
  scannedAt: number;
  findings: ScanFinding[];
  passed: boolean;
}

// ─── Session ─────────────────────────────────────────────────────────────────

export interface Session {
  sessionId: string;
  agentId: string;
  startedAt: number;
  active: boolean;
  toolCallCount: number;
  estimatedCostUsd: number;
}

// ─── Policy — parameter matching ─────────────────────────────────────────────

export interface ParameterMatcher {
  contains?: string[];
  regex?: string;
  startsWith?: string;
  gt?: number;
  lt?: number;
  gte?: number;
  lte?: number;
  eq?: unknown;
  in?: unknown[];
}

// ─── Loop detection ──────────────────────────────────────────────────────────

export interface LoopCondition {
  type: 'exact' | 'consecutive' | 'subcommand';
  threshold: number;
  window?: number;
}

// ─── Policy ──────────────────────────────────────────────────────────────────

export interface PolicyRule {
  name: string;
  agent: string;
  enabled?: boolean;
  match: {
    tool?: string[];
    toolPattern?: string;
    timeWindow?: {
      daysOfWeek?: number[];
      hours?: string;
    };
    parameters?: Record<string, ParameterMatcher>;
    subcommand?: string[];
    llmModel?: string[];
    llmProvider?: string[];
  };
  action: PolicyAction;
  approval?: {
    timeout?: string;
    onTimeout?: 'DENY' | 'ALLOW';
  };
  costEstimate?: number;
  limits?: {
    maxCallsPerSession?: number;
    maxCallsPerHour?: number;
    maxCostPerSession?: number;
    maxCostPerHour?: number;
  };
  rateLimit?: {
    limit: number;
    window: string;
    scope: 'per_agent' | 'per_tool' | 'global';
  };
  failMode?: 'closed' | 'open';
  priority?: number;
  loop?: LoopCondition;
}

export interface PolicyConfig {
  policies: PolicyRule[];
}

// ─── Policy packs ─────────────────────────────────────────────────────────────

export type PolicyRuleSource = 'manual' | 'yaml' | `pack:${string}` | 'ai-assisted';

export interface PolicyRuleMeta {
  source: PolicyRuleSource;
  createdAt: string;
  modifiedFromPack?: boolean;
}

export interface PolicyRuleWithMeta extends PolicyRule {
  _meta?: PolicyRuleMeta;
}

export interface PackCustomization {
  ruleIndex: number;
  field: string;
  label: string;
  type: 'number' | 'string' | 'enum' | 'boolean';
  options?: string[];
  default: unknown;
}

export type PackCategory = 'data-protection' | 'infrastructure' | 'compliance' | 'communication';
export type PackSeverity = 'strict' | 'moderate' | 'permissive';

export interface PolicyPack {
  id: string;
  version: string;
  name: string;
  description: string;
  category: PackCategory;
  tags: string[];
  severity: PackSeverity;
  rules: PolicyRule[];
  customizable: PackCustomization[];
  requiredTools?: string[];
}

export interface PackState {
  packId: string;
  enabled: boolean;
  enabledAt?: string;
  customizations?: Record<string, unknown>;
}

export interface PolicyConfigV2 {
  policies: PolicyRuleWithMeta[];
  enabledPacks: PackState[];
}

// ─── Audit trail ─────────────────────────────────────────────────────────────

export interface AuditEntry {
  timestamp: string;
  eventType:
    | 'tool:call'
    | 'tool:blocked'
    | 'tool:response'
    | 'tool:threat'
    | 'tool:error'
    | 'scan:complete'
    | 'session:created'
    | 'session:killed'
    | 'policy:mutation'
    | 'llm:request'
    | 'llm:response'
    | 'llm:blocked'
    | 'llm:error';
  sessionId: string;
  agentId: string;
  serverId: string;
  action: string;
  policyRule?: string;
  toolName?: string;
  reason?: string;
  threats?: ResponseThreat[];
  input?: unknown;
  output?: unknown;
}

// ─── LLM log verbosity ───────────────────────────────────────────────────────

/**
 * Controls how much of the prompt/response is persisted.
 * - metadata: only model, tokens, cost, latency, threats (default in production)
 * - full:     complete prompts + responses (default in development)
 * - preview:  first 200 chars of system prompt + last user msg + first 200 chars of response
 */
export type LlmLogLevel = 'metadata' | 'full' | 'preview';

// ─── LLM threat detection ─────────────────────────────────────────────────────

export type LlmThreatType =
  | 'PII_LEAK'
  | 'CREDENTIAL_IN_PROMPT'
  | 'INJECTION_IN_RESPONSE'
  | 'CREDENTIAL_IN_RESPONSE'
  | 'COST_ANOMALY';

export interface LlmThreat {
  type: LlmThreatType;
  severity: 'critical' | 'high' | 'medium';
  detail: string;
}

// ─── Tool-use correlation ─────────────────────────────────────────────────────

export interface ToolUseRef {
  id: string;
  name: string;
  input: unknown;
}

// ─── LLM call event ──────────────────────────────────────────────────────────

export interface LlmCallEvent {
  id: string;
  sessionId: string;
  agentId: string;
  provider: 'anthropic' | 'openai' | 'google';
  model: string;
  timestamp: number;
  messageCount: number;
  systemPromptLength: number;
  streaming: boolean;
  messages?: unknown;
  responseText?: string;
  inputTokens?: number;
  outputTokens?: number;
  estimatedCostUsd?: number;
  ttfbMs?: number;
  totalDurationMs?: number;
  requestThreats?: LlmThreat[];
  responseThreats?: LlmThreat[];
  outcome: 'forwarded' | 'blocked' | 'error';
  statusCode?: number;
  errorMessage?: string;
  matchedRule?: string;
  toolUses?: ToolUseRef[];
  referencedToolUseIds?: string[];
  parentLlmCallId?: string;
  conversationId?: string;
}

// ─── LLM proxy config ─────────────────────────────────────────────────────────

export interface LlmProxyConfig {
  enabled: boolean;
  logLevel: LlmLogLevel;
  anthropicUpstream: string;
  openaiUpstream: string;
  googleUpstream: string;
  costAnomalyThresholdUsd?: number;
  rateLimitPerAgentPerMinute?: number;
}

export function defaultLlmProxyConfig(env?: string): LlmProxyConfig {
  return {
    enabled: process.env['RIND_LLM_PROXY'] !== 'false', // on by default, opt-out with RIND_LLM_PROXY=false
    logLevel: (env ?? process.env['NODE_ENV']) !== 'production' ? 'full' : 'metadata',
    anthropicUpstream: 'https://api.anthropic.com',
    openaiUpstream: 'https://api.openai.com',
    googleUpstream: 'https://generativelanguage.googleapis.com',
  };
}
```

- [ ] **Step 2: Verify no imports** — `packages/sdk-core/src/types.ts` must have zero imports. It defines all types from scratch.

```bash
grep "^import" /Users/atinderpalsingh/projects/aegis-bundle/rind/packages/sdk-core/src/types.ts
```

Expected: no output (zero imports).

---

## Task 3: Create packages/sdk-core/src/event-bus.ts

**Files:**
- Create: `packages/sdk-core/src/event-bus.ts`

- [ ] **Step 1: Write the file**

```typescript
// @rind/core — typed event bus.
// AD-003: "The event system must be an event bus from day one."
// Phase 1 subscribers: ring buffer, audit writer, pino logger.
// Phase 2: webhook dispatcher, SSE push to dashboard.

import { EventEmitter } from 'node:events';
import type {
  ToolCallEvent,
  ToolResponseEvent,
  ToolErrorEvent,
  ScanResult,
  Session,
  AuditEntry,
  LlmCallEvent,
} from './types.js';

// ─── Event map ───────────────────────────────────────────────────────────────

export interface RindEventMap {
  'tool:call': ToolCallEvent;
  'tool:response': ToolResponseEvent;
  'tool:error': ToolErrorEvent;
  'tool:blocked': { event: ToolCallEvent; action: string; reason?: string };
  'tool:threat': ToolResponseEvent;
  'scan:complete': ScanResult;
  'session:created': Session;
  'session:killed': { sessionId: string; agentId: string };
  'audit': AuditEntry;
  'llm:request': LlmCallEvent;
  'llm:response': LlmCallEvent;
  'llm:blocked': { event: LlmCallEvent; reason: string };
  'llm:cost-anomaly': { event: LlmCallEvent; thresholdUsd: number };
}

type EventHandler<K extends keyof RindEventMap> = (payload: RindEventMap[K]) => void;

// ─── Bus ─────────────────────────────────────────────────────────────────────

export class RindEventBus {
  private emitter = new EventEmitter();
  private onError: (event: string, err: unknown) => void;

  constructor(onError?: (event: string, err: unknown) => void) {
    this.onError = onError ?? (() => undefined);
    this.emitter.setMaxListeners(50);
  }

  emit<K extends keyof RindEventMap>(event: K, payload: RindEventMap[K]): void {
    this.emitter.emit(event, payload);
  }

  /** Subscribe to an event. Returns an unsubscribe function. */
  on<K extends keyof RindEventMap>(event: K, handler: EventHandler<K>): () => void {
    const onErr = this.onError;
    const eventStr = event;

    const wrapper = (payload: RindEventMap[K]): void => {
      try {
        handler(payload);
      } catch (err) {
        onErr(eventStr, err);
      }
    };

    this.emitter.on(event, wrapper as (p: unknown) => void);
    return () => this.emitter.off(event, wrapper as (p: unknown) => void);
  }
}
```

---

## Task 4: Update packages/sdk-core/src/index.ts

**Files:**
- Modify: `packages/sdk-core/src/index.ts`

- [ ] **Step 1: Replace the empty stub with real exports**

```typescript
// @rind/core — public API
export * from './types.js';
export * from './event-bus.js';
```

---

## Task 5: Turn proxy/src/types.ts into a thin barrel

`ProxyConfig` and `ForwardFn` stay here because `ProxyConfig.servers` references `McpServerMap` from the proxy-internal transport layer. Everything else is re-exported from `@rind/core`.

**Files:**
- Modify: `apps/proxy/src/types.ts`

- [ ] **Step 1: Replace the file content**

```typescript
// Proxy-specific types.
// All shared types (events, policy, scan, audit, LLM) live in @rind/core.
// This barrel re-exports them so proxy internals keep their existing import paths.
export * from '@rind/core';

// ─── Proxy-only types ─────────────────────────────────────────────────────────
// These reference proxy-internal transport types and cannot move to @rind/core.

// Injectable forward function — used by the simulation to replace real network calls.
export type ForwardFn = (
  toolName: string,
  input: unknown,
) => Promise<{ output: unknown; durationMs: number }>;

export interface ProxyConfig {
  port: number;
  agentId: string;
  upstreamMcpUrl: string;
  servers?: import('./transport/types.js').McpServerMap;
  policyFile?: string;
  policy?: PolicyConfig;
  logLevel?: 'debug' | 'info' | 'warn' | 'error';
  forwardFn?: ForwardFn;
  auditLogPath?: string;
  ringBufferSize?: number;
  auditIncludeOutput?: boolean;
  upstreamTimeoutMs?: number;
  hookSendGuidance?: boolean;
  llmProxy?: Partial<import('./transport/llm/types.js').LlmProxyConfig>;
}
```

---

## Task 6: Turn proxy/src/transport/llm/types.ts into a barrel

All LLM types are now defined in `@rind/core`. The proxy transport layer re-exports them from there.

**Files:**
- Modify: `apps/proxy/src/transport/llm/types.ts`

- [ ] **Step 1: Replace the file content**

```typescript
// LLM types are defined in @rind/core.
// Re-exported here so transport internals keep their existing import paths.
export {
  type LlmLogLevel,
  type LlmThreatType,
  type LlmThreat,
  type ToolUseRef,
  type LlmCallEvent,
  type LlmProxyConfig,
  defaultLlmProxyConfig,
} from '@rind/core';
```

---

## Task 7: Turn proxy/src/event-bus.ts into a barrel

**Files:**
- Modify: `apps/proxy/src/event-bus.ts`

- [ ] **Step 1: Replace the file content**

```typescript
// RindEventBus and RindEventMap are defined in @rind/core.
// Re-exported here so proxy internals keep their existing import paths.
export { RindEventBus, type RindEventMap } from '@rind/core';
```

---

## Task 8: Build packages/sdk-core, then typecheck the proxy

- [ ] **Step 1: Build @rind/core first**

```bash
cd /Users/atinderpalsingh/projects/aegis-bundle/rind
pnpm --filter @rind/core build
```

Expected: `dist/index.js` and `dist/index.d.ts` emitted with no errors.

- [ ] **Step 2: Typecheck the proxy**

```bash
pnpm --filter @rind/proxy typecheck
```

Expected: Zero errors.

- [ ] **Step 3: Run proxy tests**

```bash
pnpm --filter @rind/proxy test
```

Expected: All tests pass (same count as before this change).

- [ ] **Step 4: Full workspace build**

```bash
cd /Users/atinderpalsingh/projects/aegis-bundle/rind
pnpm build
```

Expected: All packages build cleanly.

- [ ] **Step 5: Commit**

```bash
cd /Users/atinderpalsingh/projects/aegis-bundle/rind
git add packages/sdk-core/ apps/proxy/src/types.ts apps/proxy/src/event-bus.ts apps/proxy/src/transport/llm/types.ts
git commit -m "refactor: extract shared types and event bus to @rind/core

All ToolCallEvent, PolicyRule, AuditEntry, LlmCallEvent, RindEventBus
and related types move from apps/proxy/src/ to packages/sdk-core.
Proxy barrels re-export from @rind/core so internal import paths are
unchanged. No behaviour changes."
```

---

## Self-Review

**Spec coverage:**
- ✅ All shared types moved to `@rind/core`
- ✅ LLM types moved (they were already re-exported through proxy types.ts)
- ✅ `RindEventBus` + `RindEventMap` moved
- ✅ `ProxyConfig` + `ForwardFn` kept in proxy (correct — reference transport-internal `McpServerMap`)
- ✅ Zero internal proxy import paths change (barrel pattern)
- ✅ Build + typecheck + test gates in final task

**Placeholder scan:** No TBDs or "implement later" entries.

**Type consistency:** `PolicyConfig` used in `ProxyConfig.policy` is re-exported from `@rind/core` via the barrel, so it resolves correctly.

**Edge case — `scanner/types.ts`:** This file is a re-export barrel for scan types from `../types.js`. After this change `../types.js` re-exports from `@rind/core`, so `scanner/types.ts` continues to work with no changes needed.

**Edge case — `lib.ts`:** Exports `ProxyConfig`, `ForwardFn`, `PolicyConfig` etc. from `'./types.js'`. After this change `types.ts` still exports all of these (via barrel + local defs), so `lib.ts` needs no changes.
