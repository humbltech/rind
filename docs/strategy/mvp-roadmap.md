# Rind MVP Roadmap

> **Note**: This roadmap was rewritten in April 2026 to reflect the confirmed TypeScript/Node.js stack (AD-006). The previous Python/FastAPI version is superseded. See `architecture/architecture-decisions.md` AD-006 for the decision rationale.
>
> **Pivoted April 19, 2026 (D-009)**: The original Phase 1 was a standalone MCP scanner CLI. This was replaced after discovering 8+ MCP scanners already exist (Snyk Agent Scan: 1,700+ stars, Cisco: 891 stars). The scanner is now a built-in feature of proxy onboarding (scan-on-connect), not a standalone artifact. Phase 1 is now the MCP proxy MVP.
>
> **Signal mining additions (April 2026)**: Four features added to the proxy MVP based on public signal mining across 14 sources (MCP SDK issues, LiteLLM HN post-mortems, Snyk Agent Scan issues, OWASP MCP Top 10). See `research/design-partner-signals/public-signal-mining-2026-04.md`.

## Overview

**MVP Goal**: A working MCP proxy that scans on connect, enforces policies, inspects both requests and responses, and lets developers see + stop what their agents are doing — in under 5 minutes of setup.

**Timeline**: 8 weeks (evenings + weekends, solo developer)
**Team**: 1 engineer, ~14-16 hours/week

**Sequence rationale**: Proxy first (scan-on-connect built in) → design partner conversations → SDK informed by feedback → dashboard. The proxy is the moat. No existing competitor does cross-framework execution-layer enforcement.

---

## Success Criteria for MVP

By end of Week 8:
- [ ] MCP proxy intercepts tool calls, enforces allow/deny policies, logs all activity
- [ ] Proxy inspects both requests AND responses (prompt injection in tool outputs, credential patterns in error messages)
- [ ] Scan-on-connect: when a new MCP server is configured, proxy automatically checks for auth gaps, tool poisoning patterns, rug pull risk
- [ ] Runtime schema drift detection: proxy hashes MCP tool schemas on first connect; alerts if tools are added/changed in subsequent connections
- [ ] Session kill-switch: any active proxy session can be terminated immediately via CLI or dashboard
- [ ] `@rind/langchain` SDK wraps LangChain tools with cost tracking + loop detection
- [ ] Policy data model supports agent identity from day 1 (even if v1 UI only exposes tool-name matching)
- [ ] First tool call appears in basic dashboard within 5 minutes of install
- [ ] 3 design partners using the proxy and providing feedback
- [ ] Proxy and SDK published to npm

---

## Phase 0: Infrastructure (Week 1)

### Monorepo Scaffold + Brand Setup

**Goal**: Working dev environment and public brand presence

#### Monorepo (follow `architecture/project-setup.md` exactly)

```bash
# Inside existing rind/ repo (docs stay, code is added)
pnpm init
# Create pnpm-workspace.yaml, turbo.json, tsconfig.json, biome.json
# per project-setup.md

mkdir -p apps/{dashboard,api,proxy}
mkdir -p packages/{sdk-core,sdk-langchain,policy-engine,db,ui}
mkdir -p tools/mcp-scanner
```

**Key config files** (exact content in `architecture/project-setup.md`):
- `package.json` — root workspace with Turborepo scripts
- `pnpm-workspace.yaml` — workspace package globs
- `turbo.json` — build/test/lint pipeline
- `tsconfig.json` — strict TypeScript base config
- `biome.json` — linting + formatting

#### Brand setup (manual tasks, ~5-6 hours)
- Register domain under parent incorporation (check: `userind.dev`, `rind-security.dev`, `getrind.dev`)
- Create `hello@[domain]` email via Google Workspace
- Create GitHub org (no personal info in org profile)
- Reserve npm scope (`@rind` or `@rind-security`)
- Create Twitter/X brand account
- Set up Tally/Typeform waitlist (4 questions: framework, agents in prod, pain point, email)

**Deliverable**: `pnpm install && pnpm build` runs without errors. Brand domain and GitHub org exist.

---

## Phase 1: MCP Proxy MVP (Weeks 2-4)

### `apps/proxy` → core product, published as `@rind/proxy`

**Goal**: A working MCP proxy that sits between an AI agent and its MCP servers, intercepts every tool call, scans on connect, and enforces basic policies — installable in under 5 minutes.

**Why this first**: The proxy is the moat. Every existing competitor (8+ MCP scanners) finds problems and stops there. Rind fixes them at runtime. Scan-on-connect means scanning is a side effect of using the proxy — not a separate CLI step.

**Precedent**: Helicone shipped proxy-first (single env var change), had week-1 revenue, and built observability + guardrails on top. MCP proxy is simpler than Helicone's LLM proxy because MCP is a structured JSON-RPC protocol with a TypeScript SDK.

#### Week 2: Proxy core + scan-on-connect

```
apps/proxy/
├── src/
│   ├── index.ts              # Entry point — starts proxy server
│   ├── server.ts             # Hono server, MCP protocol handler
│   ├── interceptor.ts        # Request + response interception middleware
│   ├── session.ts            # Session tracking (agent identity, call history)
│   ├── scanner/
│   │   ├── index.ts          # Scan orchestrator (runs on connect)
│   │   ├── auth.ts           # Missing authentication check
│   │   ├── poisoning.ts      # Tool description poison pattern detection
│   │   ├── permissions.ts    # Over-permissioning check
│   │   ├── schema-hash.ts    # Hash tool schemas; detect drift on reconnect
│   │   └── types.ts          # ScanFinding, ScanResult types
│   ├── policy/
│   │   ├── engine.ts         # Policy evaluation (allow/deny/require-approval)
│   │   ├── rules.ts          # Rule types: tool match, agent identity, time window
│   │   └── loader.ts         # Load policy from YAML config
│   ├── inspector/
│   │   ├── request.ts        # Inspect outbound tool call inputs
│   │   └── response.ts       # Inspect inbound tool responses (NEW)
│   └── types.ts              # Shared types
├── package.json
├── tsconfig.json
└── README.md
```

Core types:

```typescript
// apps/proxy/src/types.ts

export type PolicyAction = 'ALLOW' | 'DENY' | 'REQUIRE_APPROVAL' | 'RATE_LIMIT';

export interface ToolCallEvent {
  sessionId: string;
  agentId: string;           // identity-aware from day 1
  serverId: string;
  toolName: string;
  input: unknown;
  timestamp: number;
}

export interface ToolResponseEvent {
  sessionId: string;
  agentId: string;
  serverId: string;
  toolName: string;
  output: unknown;
  durationMs: number;
  threats: ResponseThreat[];  // prompt injection, credential patterns
}

export interface ResponseThreat {
  type: 'PROMPT_INJECTION' | 'CREDENTIAL_LEAK' | 'SUSPICIOUS_REDIRECT';
  severity: 'critical' | 'high' | 'medium';
  pattern: string;
  sanitized: boolean;
}

export interface ServerSchema {
  serverId: string;
  hash: string;              // SHA-256 of sorted tool definitions
  tools: ToolDefinition[];
  scannedAt: number;
  findings: ScanFinding[];
}

export interface Session {
  sessionId: string;
  agentId: string;
  startedAt: number;
  active: boolean;           // false = killed via kill-switch
  toolCallCount: number;
  estimatedCostUsd: number;
}
```

Proxy features for Week 2:

1. **Intercept all tool calls** — proxy wraps `@modelcontextprotocol/sdk` server; every `tools/call` request passes through interceptor
2. **Scan-on-connect** — on first connection to any MCP server, run auth/poisoning/permissions checks; store results and schema hash
3. **Runtime schema drift detection** — on subsequent connections, compare current tool schema hash against stored; alert if new tools added or existing tools changed
4. **Response-side inspection** — scan tool outputs for prompt injection patterns (`SYSTEM:`, `IGNORE PREVIOUS`, base64-encoded instructions) and credential patterns (connection strings, API key formats, private keys)
5. **Session tracking** — every proxy session has a session ID, agent ID, start time, and active flag
6. **Session kill-switch** — `rind session kill <session-id>` immediately sets `active: false`; proxy blocks all subsequent calls in that session

#### Week 3: Policy engine + logging

Policy engine (YAML-driven):

```yaml
# rind.policy.yaml — example
policies:
  - name: "block-destructive"
    agent: "*"                    # applies to all agents
    match:
      tool: ["delete", "drop", "destroy", "remove", "truncate"]
    action: REQUIRE_APPROVAL

  - name: "agent-public-restrictions"
    agent: "agent-public"         # identity-aware
    match:
      tool: ["user.delete", "user.modify", "billing.*"]
    action: DENY

  - name: "after-hours-block"
    agent: "*"
    match:
      timeWindow:
        daysOfWeek: [1, 2, 3, 4, 5]  # Mon-Fri only
        hours: "09:00-18:00"
    action: DENY
```

Policy data model stores `agentId` on every rule — v1 UI only exposes tool-name matching, but the data model supports full identity-aware policy so v2 is not a rewrite.

Logging:

- Every `ToolCallEvent` and `ToolResponseEvent` written to structured JSON log
- Log format compatible with OpenTelemetry spans (future export to Datadog/Splunk)
- Loop detection: same `agentId + toolName + input hash` seen > N times in a session → auto-deny + flag

#### Week 4: Cost tracking + install polish

- Token estimation per LLM call (tiktoken-compatible, model pricing table)
- Running cost total per session, per agent
- `costLimitUsd` session config: block next LLM call if cumulative cost exceeds limit
- `rind proxy start` CLI command — starts proxy, prints connection string
- `rind logs` — tail session logs
- `rind session list` — show active sessions
- `rind session kill <id>` — kill a session
- `rind servers list` — show all connected MCP servers with schema hash + scan status
- README with 5-minute setup walkthrough

**Deliverable — what a developer sees after install:**

```bash
$ rind proxy start
  Rind Proxy v0.1.0
  Listening on localhost:7777

  Configure your agent to use MCP via: http://localhost:7777/mcp

$ # Connect an MCP server — scan-on-connect runs automatically
  [SCAN] filesystem-mcp connected
  [WARN] CRITICAL: No authentication configured
  [WARN] HIGH:     Tool 'fs.write' has no path restrictions
  [OK]   Schema hash stored: sha256:a3f9...

$ # Run an agent — tool calls intercepted in real time
  [CALL] filesystem → fs.read /tmp/data.csv       ALLOW  12ms
  [CALL] filesystem → fs.write /etc/hosts         DENY   policy:block-destructive
  [RESP] filesystem → fs.read                     CLEAN  0 threats

$ rind session list
  SESSION             AGENT           CALLS   COST      STATUS
  sess_abc123         my-agent        47      $0.082    active
  sess_def456         test-agent      3       $0.004    killed

$ rind logs --session sess_abc123
  [12:04:01] CALL  fs.read /tmp/data.csv → ALLOW
  [12:04:02] RESP  fs.read → CLEAN (no threats)
  [12:04:03] CALL  fs.write /etc/hosts → DENY (policy: block-destructive)
```

---

## Phase 2: Landing Page + Outreach (Week 4, parallel with proxy polish)

### `apps/landing` → deployed to Vercel on new domain

**Goal**: Somewhere to send people. Single page, no pricing, no team.

Content (minimum):
- Hero: "Stop your agent before it breaks production"
- 4 bullets: observability, safety, security, MCP adoption
- Proxy CTA: `rind proxy start` terminal screenshot showing scan-on-connect + blocked call
- Waitlist form embed (Tally/Typeform)
- Brand email link

**Deploy**: Vercel on `[domain]` — free tier, no identity exposure.

**Outreach starts here** (see `positioning.md` — Developer Discovery section) — deferred until legal cleared:
- HN: "Show HN: MCP proxy that scans on connect and blocks at runtime"
- LangChain Discord + MLOps Slack — use brand handle
- r/LangChain, r/netsec
- LiteLLM supply chain blog post + MCP security incident posts on dev.to

**Target**: 3-5 private design partner conversations via CISO network before any public outreach.

---

## Phase 3: LangChain SDK (Weeks 4-6)

### `packages/sdk-core` + `packages/sdk-langchain`

**Goal**: 2-line LangChain integration that captures traces, tracks costs, and blocks loops

**Start this AFTER proxy MVP is working locally.** Private design partner feedback (via CISO network) shapes the SDK design.

#### Week 5: `packages/sdk-core`

Shared types per `architecture/project-setup.md`:
- `RindSpan` type — traces, tool calls, LLM calls
- `RindConfig` — SDK configuration
- `PolicyAction` — ALLOW, DENY, REQUIRE_APPROVAL, RATE_LIMIT

```typescript
// packages/sdk-core/src/index.ts
export * from './types/span';
export * from './types/config';
export * from './types/policy';
```

#### Week 5: `packages/sdk-langchain` — callback handler

```typescript
// packages/sdk-langchain/src/handler.ts
import { BaseCallbackHandler } from '@langchain/core/callbacks/base';
import type { RindConfig } from '@rind/core';

export class RindCallbackHandler extends BaseCallbackHandler {
  name = 'RindCallbackHandler';

  constructor(private config: RindConfig) {
    super();
  }

  async handleToolStart(tool: { name: string }, input: string) {
    // Check loop detection: same tool + same input > N times?
    // Check cost budget: would this push over limit?
    // Emit span with tool start
  }

  async handleToolEnd(output: string) {
    // Complete span, record duration
    // Batch export to API
  }

  async handleLLMStart(llm: { name: string }, prompts: string[]) {
    // Estimate token count + cost
    // Check model allow/deny policy
    // Emit LLM span
  }

  async handleLLMEnd(output: LLMResult) {
    // Record actual tokens + cost
    // Update running total
  }
}
```

Policies enforced SDK-side (no proxy needed):
- `costLimitUsd` — block LLM call if accumulated cost exceeds limit
- `loopDetection` — block tool call if same tool+input seen > N times in session
- `blockDestructive` — require approval for tools matching destructive patterns (delete, drop, destroy, remove)
- `allowTools` / `denyTools` — simple string match against tool name

#### Week 6: `apps/api` — telemetry ingestion

Minimal Hono API that receives spans from the SDK:

```typescript
// apps/api/src/index.ts
import { serve } from '@hono/node-server';
import { Hono } from 'hono';

const app = new Hono();

app.get('/health', (c) => c.json({ status: 'ok' }));

// Receive batched spans from SDK
app.post('/v1/traces', async (c) => {
  const { spans, agentId } = await c.req.json();
  // Validate API key
  // Store spans in Supabase
  return c.json({ received: spans.length });
});

serve({ fetch: app.fetch, port: 3001 });
```

Database schema (`packages/db`):
- `organizations` — multi-tenant isolation
- `agents` — per-agent identity + stats
- `traces` — span storage (JSONB)
- `api_keys` — authentication

Full schema in `architecture/project-setup.md`.

**Deliverable:**
```typescript
import { ChatOpenAI } from '@langchain/openai';
import { createReactAgent } from '@langchain/langgraph/prebuilt';
import { RindCallbackHandler } from '@rind/langchain';

const rind = new RindCallbackHandler({
  apiKey: process.env.RIND_API_KEY,
  costLimitUsd: 10.0,
  loopDetection: true,
  blockDestructive: true,
});

const agent = createReactAgent({
  llm: new ChatOpenAI({ callbacks: [rind] }),
  tools,
});
```

---

## Phase 4: Dashboard MVP (Weeks 7-8)

### `apps/dashboard` — Next.js 15

**Goal**: Basic web UI that shows the "oh shit" moment

Pages:
- `/` — Summary: cost this week, blocked actions, anomaly count
- `/traces` — Timeline of agent tool calls
- `/agents` — Agent inventory (discovered from SDK data)
- `/alerts` — Blocked actions, loop detections, budget warnings

**Stack**: Next.js 15 App Router, Supabase auth, shadcn/ui components, Tailwind

**Auth**: Supabase auth (email magic link for free tier — no OAuth complexity in MVP)

**Deploy**: Vercel on `app.[domain]`

**Design partner access**: Invite 3-5 partners to their own organization. Collect structured feedback via Tally form embedded in dashboard.

**Deliverable:**
```
Dashboard shows on first login:
  "Your agent attempted filesystem.delete 7 times today"
  "Agent cost this week: $340 (no budget set)"
  "3 tool calls blocked by safety rules"
```

---

## Repository Structure

Per `architecture/project-setup.md`:

```
rind/                          # This repo
├── apps/
│   ├── dashboard/              # Next.js 15 (Week 7-8)
│   ├── api/                    # Hono API (Week 6)
│   └── proxy/                  # MCP Proxy — @rind/proxy (Weeks 2-4) ← Phase 1
│
├── packages/
│   ├── sdk-core/               # @rind/core shared types (Week 5)
│   ├── sdk-langchain/          # @rind/langchain (Week 6)
│   ├── policy-engine/          # Shared policy evaluator (extracted from proxy, Week 3)
│   ├── db/                     # Supabase schema + migrations (Week 7)
│   └── ui/                     # Shared components (Week 8)
│
├── tools/
│   └── mcp-scanner/            # Thin wrapper — calls proxy scan engine (post-MVP, optional)
│
├── docs/                       # Strategic docs (existing)
├── research/                   # Research (existing)
│
├── package.json
├── pnpm-workspace.yaml
├── turbo.json
├── biome.json
└── tsconfig.json
```

---

## Tech Stack

| Component | Technology | Version |
|-----------|-----------|---------|
| Package manager | pnpm | 9.x |
| Monorepo | Turborepo | 2.x |
| Runtime | Node.js | 22.x LTS |
| Language | TypeScript | 5.4+ |
| Proxy / API | Hono | 4.x |
| Dashboard | Next.js | 15.x |
| UI | React 19, Tailwind, shadcn/ui | — |
| Database | PostgreSQL via Supabase | — |
| Cache | Redis via Upstash | — |
| Queue | BullMQ | 5.x |
| Linting | Biome | 1.9+ |
| Testing | Vitest | 2.x |
| Build | tsup | 8.x |
| Deployment | Vercel (dashboard), Railway/Fly.io (API) | — |

**Python SDK** (`rind-sdk` on PyPI): Not in scope for MVP. Post-MVP: a thin Python package that wraps the cloud API over HTTP. Python users get the same features; there is no Python proxy server.

---

## 8-Week Milestone Summary

| Week | Milestone | Demo |
|------|-----------|------|
| 1 | Monorepo scaffold + brand infrastructure | `pnpm build` succeeds |
| 2 | Proxy core: intercept, scan-on-connect, schema drift, response inspection | `rind proxy start` + tool call blocked in terminal |
| 3 | Policy engine: allow/deny, identity-aware rules, session kill-switch | `rind session kill` stops a running agent |
| 4 | Cost tracking, loop detection, CLI polish, logging | Full terminal demo — call log, cost, blocked action |
| 5 | `sdk-core` types + private design partner access (CISO network) | Types compile; proxy shared with 1-2 internal testers |
| 6 | `sdk-langchain` callback handler | Agent traces captured locally |
| 7 | `apps/api` telemetry ingestion + landing page | Traces stored in Supabase; landing page live |
| 8 | Dashboard basic views + design partners in dashboard | Cost + blocked actions visible; 3 partners using proxy |

---

## Post-MVP Roadmap (Months 3-6)

| Feature | Priority | Notes |
|---------|----------|-------|
| Hosted proxy (cloud-deployed, no local install) | P0 | Required for team tier; env var config like Helicone |
| Multi-tenancy | P0 | Required for SaaS — orgs, projects, RLS |
| Slack/PagerDuty alerts | P0 | Kill-switch + anomaly alerts to existing on-call stack |
| SSO (OIDC) | P1 | Enterprise requirement — Okta, Azure AD |
| Python SDK wrapper | P1 | PyPI `rind-sdk` — HTTP wrapper of cloud API |
| JIT permissions | P2 | AD-004 — requires proxy layer (already in place) |
| Agent RBAC | P2 | AD-004 — identity-aware policy already in data model |
| Compliance export | P2 | SOC2, EU AI Act audit trail — sessions already logged |
| Standalone MCP scanner CLI | P3 | Optional — thin wrapper over proxy scan engine if demand emerges |

---

## Engineering Backlog (Deferred Design Items)

These items were identified during Phase 1 implementation and intentionally deferred. Each needs a full design exercise before touching code.

### B-001 — Rule Chaining / `pass` Action

**Problem:** Today `policy/engine.ts` stops at the first rule that takes action (first-match-wins). A loop rule that matches but hasn't hit its threshold is silently skipped. There is no way for a rule to say "I saw this call — keep evaluating the next rule." Two open questions:

1. **`pass` action** — a rule should be able to explicitly `pass` (continue to next rule) rather than `allow` (stop evaluation). `allow` = stop and permit. `pass` = matched, no decision, continue. This lets you layer rules: a loop observer rule `pass`es while tracking, and a hard `deny` rule below still fires on every call.

2. **What gets logged when multiple rules touch a call** — options:
   - Log only the rule that took final action (current behavior, works for first-match-wins)
   - Log an array of all rules that matched (`matchedRules: string[]`) — needed if `pass` exists
   - Log the "tracking rule" (loop observer) separately from the "deciding rule"

**Constraint:** Any change here must not break existing rule priority semantics. Existing `DENY`/`ALLOW`/`REQUIRE_APPROVAL` rules that don't use `pass` must behave identically.

---

### B-002 — Protocol-Agnostic Approval Queue

**Problem:** The approval queue (wait for human decision before continuing) is currently wired directly into the `/hook/evaluate` route handler in `server.ts`. It works for Claude Code hooks but can't be reused for Slack, WhatsApp, email, or any other notification/response channel.

**Target design:** `ApprovalQueue` becomes a shared service. A thin `NotificationAdapter` interface handles channel-specific delivery (Slack message, WhatsApp, dashboard banner, etc.). The core wait/resolve/timeout logic is channel-agnostic. Route handlers call `approvalQueue.request(event)` and await resolution — they don't know or care which channel the notification went to.

**Why deferred:** Requires stable notification channel abstractions (Slack/WhatsApp API integrations) before the adapter interface can be properly designed.

---

### B-003 — Unified Enforcement Pipeline

**Problem:** `evaluateHook()` in `hooks/claude-code.ts` calls `intercept()` but passes `loopDetector: undefined` and `rateLimiter: undefined`. Loop detection and rate limiting don't run for hook-mode calls. Two gaps:

1. Hook-mode calls are not loop-detected — an agent can loop infinitely through hooks without triggering loop rules.
2. `server.ts` has scattered `ringBuffer.update()` calls in two places (MCP proxy path and hook path) that duplicate the outcome-recording logic. A shared `recordOutcome(event, interceptorResult, ringBuffer, bus)` helper should be the single place this happens.

**Proposed fix (small, low risk):**
- Extract `recordOutcome()` helper — unifies ring buffer updates across both paths.
- Pass `loopDetector` and `rateLimiter` from server.ts down through `evaluateHook()` to `intercept()` — one-line change in hooks/claude-code.ts.

**Why partially deferred:** The `recordOutcome()` extraction is safe to do now (no semantic change, pure refactor). Passing loop/rate state to hooks needs a deliberate test run first — loop rules behave differently in hook mode (no upstream call = no durationMs, different correlationId lifecycle).

---

*Last Updated: April 2026 — Rewritten for TypeScript/Node.js stack (AD-006)*
