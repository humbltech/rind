# Aegis MVP Roadmap

> **Note**: This roadmap was rewritten in April 2026 to reflect the confirmed TypeScript/Node.js stack (AD-006). The previous Python/FastAPI version is superseded. See `architecture/architecture-decisions.md` AD-006 for the decision rationale.

## Overview

**MVP Goal**: A working scanner + SDK that lets developers see what their agents are doing, stop runaway costs, and block destructive actions — all in under 5 minutes of setup.

**Timeline**: 8 weeks (evenings + weekends, solo developer)
**Team**: 1 engineer, ~14-16 hours/week

**Sequence rationale**: Scanner first → design partner conversations → SDK informed by feedback → dashboard. Do not build the SDK before talking to at least 3 real users.

---

## Success Criteria for MVP

By end of Week 8:
- [ ] `npx @aegis/scan` runs against any MCP config and reports security findings
- [ ] `@aegis/langchain` SDK wraps LangChain tools with cost tracking + loop detection
- [ ] First tool call appears in basic dashboard within 5 minutes of install
- [ ] 3 design partners using the SDK and providing feedback
- [ ] SDK and scanner published to npm

---

## Phase 0: Infrastructure (Week 1)

### Monorepo Scaffold + Brand Setup

**Goal**: Working dev environment and public brand presence

#### Monorepo (follow `architecture/project-setup.md` exactly)

```bash
# Inside existing aegis/ repo (docs stay, code is added)
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
- Register domain under parent incorporation (check: `useaegis.dev`, `aegis-security.dev`, `getaegis.dev`)
- Create `hello@[domain]` email via Google Workspace
- Create GitHub org (no personal info in org profile)
- Reserve npm scope (`@aegis` or `@aegis-security`)
- Create Twitter/X brand account
- Set up Tally/Typeform waitlist (4 questions: framework, agents in prod, pain point, email)

**Deliverable**: `pnpm install && pnpm build` runs without errors. Brand domain and GitHub org exist.

---

## Phase 1: MCP Scanner (Weeks 2-3)

### `tools/mcp-scanner` → published as `@aegis/scan`

**Goal**: `npx @aegis/scan ./path/to/mcp-config.json` produces a security report

**Why this first**: Validates the monorepo, ships something real, creates a conversation piece for design partners. No backend, no account needed.

#### Week 2: Core scanner logic

```
tools/mcp-scanner/
├── src/
│   ├── index.ts          # CLI entry point
│   ├── parser.ts         # MCP config file parser (Claude Desktop format)
│   ├── connector.ts      # MCP server connection + tools/list call
│   ├── checks/
│   │   ├── auth.ts       # Missing authentication check
│   │   ├── poisoning.ts  # Tool poisoning pattern detection
│   │   ├── permissions.ts # Over-permissioning check
│   │   └── rugpull.ts    # Hash-based tool definition change detection
│   ├── reporter.ts       # Colored terminal output + JSON mode
│   └── types.ts          # Scanner types
├── package.json
├── tsconfig.json
└── README.md
```

```typescript
// tools/mcp-scanner/src/types.ts
export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info';

export interface ScanFinding {
  id: string;
  severity: Severity;
  title: string;
  description: string;
  server: string;
  tool?: string;
  remediation: string;
}

export interface ScanResult {
  scannedAt: string;
  configPath: string;
  serversScanned: number;
  toolsFound: number;
  findings: ScanFinding[];
  summary: {
    critical: number;
    high: number;
    medium: number;
    low: number;
    info: number;
  };
}
```

Security checks to implement:
1. **Missing auth** — server has no auth config (no `env` with `*_TOKEN`/`*_KEY`, no `headers`)
2. **Tool poisoning** — suspicious patterns in tool descriptions (instructions to ignore rules, base64 strings, override commands)
3. **Over-permissioning** — filesystem tools with no path restrictions, wildcard DB access
4. **Rug pull detection** — hash tool definitions; compare to stored hash; warn if changed (`.aegis-scan-cache.json`)

#### Week 3: Polish + publish

- Colored terminal output (chalk): critical=red, high=orange, medium=yellow, low=blue
- JSON output mode (`--json` flag) for CI/CD integration
- Exit code 1 if any critical/high findings (for CI gates)
- `--fix` flag for auto-remediation suggestions
- README with screenshots and comparison to alternatives
- Publish to npm as `@aegis/scan` (public package under GitHub org)

**Deliverable:**
```bash
npx @aegis/scan ~/.cursor/mcp.json

  Aegis MCP Scanner v0.1.0
  Scanning 4 MCP servers...

  CRITICAL  filesystem  No authentication configured
  HIGH      github      Tool descriptions contain suspicious override instructions
  MEDIUM    supabase    Read + write access; consider read-only for this agent
  INFO      brave-search  No issues found

  4 servers scanned · 3 findings (1 critical, 1 high, 1 medium)
  Run with --json for CI/CD integration
```

---

## Phase 2: Landing Page + Outreach (Week 3, parallel with scanner polish)

### `apps/landing` → deployed to Vercel on new domain

**Goal**: Somewhere to send people. Single page, no pricing, no team.

Content (minimum):
- Hero: "Stop your agent before it breaks production"
- 4 bullets: observability, safety, security, MCP adoption
- Scanner CTA: `npx @aegis/scan` with terminal screenshot
- Waitlist form embed (Tally/Typeform)
- Brand email link

**Deploy**: Vercel on `[domain]` — free tier, no identity exposure.

**Outreach starts here** (see `positioning.md` — Developer Discovery section):
- HN: "Show HN: Free MCP security scanner"
- LangChain Discord + MLOps Slack — use brand handle
- r/LangChain, r/netsec
- 3 incident prevention blog posts on dev.to or GitHub Gist

**Target**: 3-5 design partner conversations started within 2 weeks of scanner launch.

---

## Phase 3: LangChain SDK (Weeks 4-6)

### `packages/sdk-core` + `packages/sdk-langchain`

**Goal**: 2-line LangChain integration that captures traces, tracks costs, and blocks loops

**Start this AFTER first design partner conversations.** Their feedback shapes the SDK design.

#### Week 4: `packages/sdk-core`

Shared types per `architecture/project-setup.md`:
- `AegisSpan` type — traces, tool calls, LLM calls
- `AegisConfig` — SDK configuration
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
import type { AegisConfig } from '@aegis/core';

export class AegisCallbackHandler extends BaseCallbackHandler {
  name = 'AegisCallbackHandler';

  constructor(private config: AegisConfig) {
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
import { AegisCallbackHandler } from '@aegis/langchain';

const aegis = new AegisCallbackHandler({
  apiKey: process.env.AEGIS_API_KEY,
  costLimitUsd: 10.0,
  loopDetection: true,
  blockDestructive: true,
});

const agent = createReactAgent({
  llm: new ChatOpenAI({ callbacks: [aegis] }),
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
aegis/                          # This repo
├── apps/
│   ├── dashboard/              # Next.js 15 (Week 7-8)
│   ├── api/                    # Hono API (Week 6)
│   └── proxy/                  # MCP Proxy (Horizon 2)
│
├── packages/
│   ├── sdk-core/               # @aegis/core shared types (Week 4)
│   ├── sdk-langchain/          # @aegis/langchain (Week 5)
│   ├── policy-engine/          # Policy evaluation (Horizon 2)
│   ├── db/                     # Supabase schema + migrations (Week 6)
│   └── ui/                     # Shared components (Week 7)
│
├── tools/
│   └── mcp-scanner/            # @aegis/scan CLI (Week 2-3)
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

**Python SDK** (`aegis-sdk` on PyPI): Not in scope for MVP. Post-MVP: a thin Python package that wraps the cloud API over HTTP. Python users get the same features; there is no Python proxy server.

---

## 8-Week Milestone Summary

| Week | Milestone | Demo |
|------|-----------|------|
| 1 | Monorepo scaffold + brand infrastructure | `pnpm build` succeeds; domain live |
| 2 | Scanner core logic | `node tools/mcp-scanner/dist/index.js ./mcp.json` |
| 3 | Scanner published + landing page + outreach starts | `npx @aegis/scan` works |
| 4 | `sdk-core` types + first design partner conversations | Types compile |
| 5 | `sdk-langchain` callback handler | Agent traces captured locally |
| 6 | `apps/api` telemetry ingestion | Traces stored in Supabase |
| 7 | Dashboard basic views | Cost + blocked actions visible |
| 8 | Design partners in dashboard | 3 partners using the SDK |

---

## Post-MVP Roadmap (Months 3-6)

| Feature | Priority | Notes |
|---------|----------|-------|
| MCP proxy (proxy-through H1) | P0 | Intercepts MCP traffic — requires hosted infrastructure |
| Policy engine | P0 | YAML policy DSL, evaluator — needed for team tier |
| Multi-tenancy | P0 | Required for SaaS — orgs, projects, RLS |
| Slack/Telegram alerts | P1 | Event bus → subscriber channels (AD-003) |
| SSO (OIDC) | P1 | Enterprise requirement — Okta, Azure AD |
| Python SDK wrapper | P1 | PyPI `aegis-sdk` — HTTP wrapper of cloud API |
| JIT permissions | P2 | AD-004 — requires proxy layer |
| Agent RBAC | P2 | AD-004 — requires proxy + identity store |
| Compliance export | P2 | SOC2, EU AI Act audit trail |

---

*Last Updated: April 2026 — Rewritten for TypeScript/Node.js stack (AD-006)*
