# Rind — Project Context

## What This Project Is

**Rind** is the control plane for AI agents — covering observability, safety, security, and MCP adoption in a single proxy. The tagline: *"One proxy. Complete control over your AI agents."*

Rind sits at the execution layer. Every MCP tool call, API action, and agent decision passes through it. This gives four capabilities from one integration: see everything agents do (observability), prevent catastrophic actions before they happen (safety), enforce access policies (security), and make MCP production-ready in minutes (MCP adoption). The core insight: prompt-level tools can be bypassed and observability tools can't stop anything — Rind controls what agents **can do**, not just what they say or what gets logged.

**Current phase**: Phase 1 core complete (61 tests passing). Proxy core: scanner, interceptor, policy engine (priority-sorted, cache-invalidating), session management, response inspector, event bus, ring buffer, audit writer, loop detector, rate limiter. Policy configuration experience (D-036) in progress: Phase 1A complete (CRUD API + policy packs — `packs.ts`, 11 new endpoints), Phase 1B next (dashboard policies page). Decisions D-013–D-039 logged. Phase 2: JWT identity, async approval workflow, cloud-hosted MCP reverse proxy (D-037).

---

## Engineering Standards (Always Apply — No Exceptions)

These standards apply to every line of code written for Rind. They are gates, not guidelines. Code that violates them is not mergeable.

---

### SOLID Principles

**Single Responsibility** — Every module does one thing. `scanner/auth.ts` checks auth. `scanner/poisoning.ts` checks poisoning. The server does not contain business logic. The interceptor does not know about Hono. If a file name doesn't immediately communicate its job, split it.

**Open/Closed** — Design for extension without modification. New scan checks = new file in `scanner/`, registered in `scanner/index.ts`. New inspector pattern = add to the pattern array. New policy rule type = extend the Zod schema. Never fork the engine to add a feature.

**Liskov Substitution** — Interfaces before classes. Anything that touches external systems (upstream MCP server, database, Redis) must be behind an interface. The real implementation and a test double must be interchangeable without changing the calling code.

**Interface Segregation** — No fat interfaces. A logger exposes `info/warn/error`. A session store exposes `get/set/kill`. Callers import only what they use. Never pass an entire `Config` object when only one field is needed.

**Dependency Inversion** — High-level modules depend on abstractions, not concretions. The `interceptor` receives a `PolicyEngine` interface. The `server` receives a `SessionStore` interface. This is what makes the code testable without network calls.

---

### Dependency Injection

Every component with external dependencies receives those dependencies as constructor arguments or function parameters — never from module-level globals or import side effects.

```typescript
// WRONG — hardwired dependency, cannot be swapped in tests
import { policyEngine } from './policy/engine.js';
export async function intercept(event: ToolCallEvent) {
  policyEngine.evaluate(event);
}

// RIGHT — injected, testable with any PolicyEngine implementation
export async function intercept(
  event: ToolCallEvent,
  forward: ForwardFn,
  opts: InterceptorOptions, // { policyEngine, sessionStore, onEvent, ... }
) { ... }
```

**What must be injected**: logger, policy engine, session store, schema store, any I/O (upstream fetch, database client, Redis client, file reader).

**What may be module-level constants**: immutable regex pattern arrays, Zod schema definitions, pure utility functions with no side effects.

---

### Code Readability — The Outermost Layer Reads Like English

The top-level of every file — the outermost orchestration layer — must read like prose. A developer should be able to understand the flow without reading any implementation details.

```typescript
// ✅ GOOD — outermost layer reads like English
export async function intercept(event, forward, opts) {
  if (!isSessionActive(event.sessionId))   return blocked('BLOCKED_SESSION_KILLED');
  if (await loopDetected(event, opts))     return blocked('BLOCKED_LOOP');
  if (!requestIsClean(event))              return blocked('BLOCKED_INJECTION');

  const policy = opts.policyEngine.evaluate(event);
  if (policy.denies())                     return blocked('DENY');
  if (policy.requiresApproval())           return pendingApproval(event, policy);
  if (await rateLimitExceeded(event, policy, opts)) return rateLimited(event, policy);
  if (costLimitExceeded(event, policy))    return blocked('BLOCKED_COST_LIMIT');

  const response = await forward(event);
  const threats = inspectResponse(response);
  if (hasCriticalThreats(threats))         return blocked('BLOCKED_THREAT');

  return allowed(response);
}

// ❌ BAD — implementation details leak into the orchestration layer
export async function intercept(event, forward, opts) {
  const session = sessionStore.get(event.sessionId);
  if (!session || session.killed) {
    return { output: null, interceptorResult: { action: 'BLOCKED_SESSION_KILLED', reason: `Session ${event.sessionId} has been terminated.` } };
  }
  // 200 more lines of inline logic...
}
```

**The rule**: If you can't read the top-level flow in under 10 seconds, extract named functions until you can.

**Function naming**: Functions at the orchestration layer are verbs that answer a yes/no question or describe what they do: `isSessionActive()`, `loopDetected()`, `requestIsClean()`, `hasCriticalThreats()`. Never `check1()`, `doThing()`, `process()`.

**Comments explain WHY, not WHAT**: The code says what happens. Comments say why it must happen this way.

```typescript
// ✅ WHY comment
// Fail closed on loop detection errors — a crashing detector is a potential bypass vector
if (loopDetectorThrew) return blocked('BLOCKED_LOOP');

// ❌ WHAT comment (redundant — the code already says this)
// Block the request if loop detected
if (loopDetectorThrew) return blocked('BLOCKED_LOOP');
```

---

### Function-Level Abstractions — Extract When It Aids Reading

Extract a function when the extraction makes the call site read more clearly AND the function name communicates intent that the implementation does not. Do not extract for DRY alone if the name is no clearer than the code.

**Extract** when:
- The logic is more than 3 lines and has a name that explains its purpose
- The same logic appears in 2+ places
- Inline logic breaks the English-prose flow of the outermost layer

**Do not extract** when:
- The function would be called exactly once and its name is no clearer than the code
- The extraction introduces a parameter list longer than the original inline code
- The extracted function is under 3 lines and naming it adds no clarity

**On latency**: Function call overhead in Node.js is nanoseconds — never inline for performance unless a profiler shows a hot path. Readability wins until benchmarked evidence says otherwise.

---

### File Size — Extract Before It Becomes a Problem

- **Target**: files under 200 lines
- **Hard limit**: files over 400 lines must be split, no exceptions
- **How to split**: extract by responsibility — `scanner/permissions.ts` not `scanner/part2.ts`
- **Shared components**: if 2+ files need the same helper, it goes in a shared location with a clear name, not copy-pasted

When a file is getting long, extract the next logical group of functions before finishing the feature. Do not wait until the file is already too long.

---

### UI Design Language — Brand-First, Alive, Not Hardcoded

> **Before any UI implementation**: run `/strategic-council` **deep mode** for brand/design decisions (D-033). No dashboard code before the design language is decided.

**When implementing UI**:
1. Ask the user to run Claude Code in **design mode** for inspiration from real products (`claude --design` or equivalent) — or use the Playwright browser tools to screenshot real designs for reference
2. Follow the decided brand guidelines exactly — no ad-hoc color decisions
3. Subtle animations, gradients, transitions — the UI should feel alive and cohesive, not like a developer-built admin panel
4. No hardcoded hex values anywhere — all colors via Tailwind theme tokens or CSS variables

**Rind brand (preliminary, pending D-033)**:
- Primary accent: teal `#14b8a6` (confirmed)
- Full brand language: TBD — requires D-033 deep council session

---

### Separation of Concerns

The proxy has four distinct layers. They must not bleed into each other:

| Layer | Responsibility | Must NOT contain |
|-------|---------------|-----------------|
| **Transport** (`server.ts`) | HTTP parsing, routing, serialization | Business logic, pattern matching, policy evaluation |
| **Orchestration** (`interceptor.ts`) | Sequencing checks, deciding what to call | Pattern arrays, regex, database queries |
| **Domain** (`scanner/`, `inspector/`, `policy/`, `session.ts`) | Business rules — what is a threat, what is allowed | HTTP concepts, Hono types, JSON-RPC |
| **Infrastructure** (stores, clients) | Persistence, external calls | Business rules, domain types |

If you find business logic inside a route handler, it belongs in a domain module. Move it.

---

### Testability

Every piece of business logic must be testable in isolation — no HTTP server, no real database, no network calls required.

**Test-in-isolation rule**: If a test needs to start a Hono server to test a scan result, the code is structured wrong. Scan logic, policy logic, and inspection logic are pure functions — input in, result out.

**Test doubles over mocking**: Prefer constructor injection + simple in-memory implementations over `vi.mock()`. A `Map<string, Session>` is a better session store test double than a mocked class.

**Coverage requirements**:
- Every scanner check: detection test + clean-pass test
- Every policy rule type: one test per match dimension (tool name, glob, agent ID, time window)
- Every response threat category: detection test + nested-object edge case
- Every interceptor path: allow, deny, kill-switch, blocked-injection, blocked-threat

**Test files**: `src/__tests__/`, one file per module, independently runnable.

---

### Dependency Vetting

Before adding any npm package, answer all four questions. If any answer is "no" or "unknown", do not add the package without explicit decision.

**The four-question check**:
1. **Maintained?** — Last commit within 6 months, no open critical CVEs, active maintainer
2. **Scoped?** — Does it do one thing well? Prefer focused packages over grab-bags
3. **Download signal?** — >100K weekly downloads or clear institutional backing
4. **Supply chain clean?** — Check npm for number of maintainers and 2FA policy; avoid single-maintainer packages with no 2FA

**Default to stdlib**: If `node:crypto`, `node:fs`, `node:path`, or another built-in covers the need, use it. Do not add a package for convenience.

**Pre-approved packages** (vetted, do not re-question):
- `zod` — validation
- `hono` + `@hono/node-server` — HTTP
- `pino` (+ `pino-pretty` dev-only) — logging
- `yaml` — YAML parsing
- `@modelcontextprotocol/sdk` — MCP protocol
- `vitest` — testing
- `tsup` + `tsx` — build/dev
- `@biomejs/biome` — lint/format

Any package not on this list must be vetted before adding to any `package.json`.

---

### Security-First Coding

Rind is a security product. A security bug here is not a bug — it is a credibility-ending incident.

**All HTTP inputs validated with Zod before use**:
- Never access `body.field` without schema validation — always `schema.parse()` or `schema.safeParse()`
- Tool definitions from MCP servers are attacker-controlled — treat them accordingly

**No dynamic code evaluation**: Do not use `eval`, dynamic `Function` constructors, or `vm.runInContext`. If a feature seems to require it, it requires a redesign.

**Depth-limited traversal on untrusted input**: All recursive input traversal has a depth cap (see `extractStrings` in inspectors — `depth > 5` early return). Regex patterns must not be ReDoS-susceptible — no nested quantifiers on unbounded input.

**Injection prevention**: Database queries are parameterized only. Shell command construction (if ever needed) uses an allowlist — never interpolates user input.

**Secrets never logged**: Even at `debug` level. Session tokens, API keys, credentials do not appear in log output. The response inspector catches credential leaks before they reach the agent.

**Structured errors only**: Never return raw stack traces or internal error details to HTTP callers. Log internally with a correlation ID. Return `{ error: string, correlationId: string }`.

---

### Architecture Adherence

Architecture decisions (AD-001 through AD-009) are in `docs/architecture/architecture-decisions.md`. Before any significant implementation choice, check if an AD already covers it.

**Non-negotiable rules**:
- **AD-006 (TypeScript-only)**: No Python in `apps/` or `packages/`. FastAPI docs are archived.
- **AD-009 (Proxy-first)**: Scanner is a feature of `scan-on-connect`, not a standalone CLI. Do not create `apps/scanner/`.
- **Identity-aware from day 1**: `agentId` on every event, rule, and session — even if v1 UI doesn't surface it.
- **OpenTelemetry-compatible event shapes**: `ToolCallEvent` and `ToolResponseEvent` map to OTel spans. Do not break this structure.
- **Policy data model supports v2 without a rewrite**: Rules carry `agentId`, `timeWindow`, `toolPattern` even if v1 only uses `tool[]`.

---

### Long-Term Design

**Design the data model for 6 months out; build the UI for today.** The engine supports identity-aware policies, time windows, and glob patterns even though the v1 UI only exposes tool-name blocking.

**No magic strings**: Tool names, event types, threat categories, and policy actions are TypeScript union types. Adding a new value forces the compiler to flag every handler that needs updating.

**Structured logs only**: Every log entry is a Pino JSON log. `console.log` is a Biome error. Log fields are consistent so querying works from day 1.

**Graceful degradation**: If the upstream MCP server is unreachable → clear error, not silent empty result. If the policy file is malformed → server refuses to start with a Zod validation error, not silently apply no policies.

**No hidden state**: Schema store and session store are injected dependencies. Current in-memory implementations satisfy the interface; Redis implementations replace them in Phase 2 without changing callers.

---

### Edge Cases That Must Always Be Handled

| Scenario | Handler | Status |
|----------|---------|--------|
| Session killed mid-request | `interceptor.ts` — check before every forward | Done |
| Schema drift: tool description changed (not just added) | `scanner/schema-hash.ts` | Done |
| Prompt injection nested 3 levels deep in JSON response | `inspector/response.ts` — depth-limited `extractStrings` | Done |
| Policy file malformed YAML | `policy/loader.ts` — Zod parse + clear error | Done |
| Upstream MCP server returns non-JSON | `server.ts` — catch fetch/parse errors | Done |
| Loop detection: same agent+tool+input hash N times | `interceptor.ts` — loop detector | Done |
| Agent sends `null` as tool input | `inspectRequest` — `extractStrings` handles null | Done |
| Policy file not found at configured path | `policy/loader.ts` — clear startup error | Done |
| Two simultaneous kill-session requests | Session map mutation is synchronous in Node.js — safe | Done |
| MCP server adds tool with empty description | Scanner handles empty string — no crash | Done |

---

## Project Structure

```
rind/                                   # Repo root
├── CLAUDE.md                           # This file — project instructions for Claude Code
├── README.md                           # Full documentation index
├── apps/
│   └── proxy/                          # MCP proxy server (@rind/proxy)
│       └── src/
│           ├── interceptor.ts          # 9-step pipeline (kill-switch → forward → inspect)
│           ├── server.ts               # Hono HTTP server + event wiring
│           ├── event-bus.ts            # Typed EventEmitter (RindEventBus)
│           ├── ring-buffer.ts          # In-memory circular buffer for tool call log
│           ├── audit-writer.ts         # Async JSONL append for audit trail
│           ├── loop-detector.ts        # Dual loop detection (hash + consecutive cap)
│           ├── rate-limiter.ts         # Sliding window rate limiter
│           ├── session.ts              # Session store + hourly cost/call tracking
│           ├── types.ts                # All shared TypeScript types
│           ├── policy/
│           │   ├── store.ts            # PolicyStore interface + InMemoryPolicyStore (addRule/updateRule/removeRule)
│           │   ├── engine.ts           # PolicyEngine (priority-sorted, cache-invalidating)
│           │   ├── rules.ts            # matchesRule() + parameter matching
│           │   ├── loader.ts           # YAML → Zod → PolicyConfig
│           │   └── packs.ts            # Policy pack registry + expand/recommend/rulesFromPack
│           ├── scanner/                # Scan-on-connect tool definition analysis
│           └── inspector/              # Request + response threat inspection
├── tools/
│   └── simulation/                     # Cassette-based scenario runner
├── docs/
│   ├── vision.md                       # Mission, goals, target market
│   ├── technical-strategy.md           # Feature prioritization, build sequence
│   ├── strategic-analysis.md           # Living decision log (update after every session)
│   ├── architecture/                   # System design, tech stack, data models
│   ├── product-spec.md                 # Complete product spec
│   ├── policy-dsl.md                   # Policy language specification
│   ├── mvp-roadmap.md                  # 12-week development plan
│   ├── pricing-strategy.md             # Pricing tiers and positioning
│   ├── competition.md                  # 40+ competitors across 9 categories
│   └── gtm-strategy.md                 # Go-to-market strategy
└── research/                           # Market research, user pain points
```

---

## Key Strategic Decisions (as of April 2026)

**What to build first**: MCP Proxy + Observability (not OS-level agent)
- MCP proxy: retrofits security onto existing infrastructure, <5ms overhead, enterprises understand it
- Observability first: 30-35% of AI security budget goes to discovery/visibility; "show me what I don't know" is the landing motion
- Cloud sandbox (Firecracker): Phase 2 — 28ms startup with snapshots
- Cross-platform endpoint agent: explicitly deferred (12-18 months, partner with EDR vendors instead)

**Target market**: Platform engineers and security teams at mid-market companies ($50M-$500M) and funded startups (Series B+) deploying AI agents in production. Entry point is the engineer; budget holder is CISO or CTO.

**Positioning**: "The control plane for AI agents — observability, safety, security, and MCP adoption in one proxy"
- NOT a prompt-layer firewall (Lakera, CalypsoAI — prompt-level only, bypassable)
- NOT an observability dashboard (LangSmith, Langfuse — visibility without enforcement)
- NOT a governance platform (Credo AI — policy docs without runtime enforcement)
- NOT ecosystem-locked (Microsoft Agent 365, Datadog — requires existing vendor)
- OWNING: cross-framework execution-layer control plane, MCP-native, positive adoption motion

**Integration priority**:
1. LangChain/LangGraph SDK (47M downloads/month)
2. GitHub Actions (shift-left)
3. OpenTelemetry export
4. Enterprise: Datadog/Splunk, Okta/Azure AD, AWS Bedrock

**Hosted agent platform integration (D-037)**: Rind is a cloud MCP reverse proxy. To protect agents on Claude.ai, OpenAI, or any MCP-native platform, swap one URL: `your-mcp-server.com` → `proxy.rind.sh/k/{key}/your-mcp-server.com`. No SDK, no agent change, no platform change. Phase 2 cloud infrastructure.

**Dashboard architecture (D-038)**: Context-driven composition — one engine, three dimensions: `{ tier, role, teamId }`. Not separate dashboards. Build order: Developer View (Phase 1B) → Security + Admin (Phase 2) → Ops + Compliance (Phase 3). Team-level scoping in enterprise = `teamId` filter on API queries.

**Policy pack state (D-039)**: Three derived states — Disabled / Enabled / Customized. Toggle is binary. "Customized" badge + "N of M rules active" count when rules differ from pack defaults. "Reset to defaults" restores factory state. Packs are authoring tools; rules are runtime reality.

---

## Competitive Positioning (Quick Reference)

> Full map: `docs/positioning.md`

**The five market layers and where Rind plays:**

| Layer | Who Owns It | Rind? |
|-------|-------------|--------|
| Prompt filtering (input/output) | Lakera, CalypsoAI, NeMo | ✗ Don't compete — commoditized, acquired |
| Observability (traces, cost, debugging) | LangSmith, Langfuse, Arize | ~ Entry point only, not the moat |
| AI Governance (process, compliance docs) | Credo AI, Holistic AI, IBM | ✗ Different buyer, different motion |
| Enterprise security extensions | Palo Alto, Wiz, Datadog, Microsoft | ✗ Ecosystem-locked, wrong GTM |
| **Execution-layer control plane** | **Nobody** | **✓ This is Rind** |

**What no competitor does**: Cross-framework, protocol-agnostic enforcement at the tool call / MCP layer — observability + safety + security + MCP adoption in one proxy.

**Three closest competitors to watch**:
- **Entro Security AGA** — MCP visibility + identity focus, security-team buyer, no developer adoption motion
- **Prompt Security** (now SentinelOne) — MCP monitoring, but acquired into enterprise-only motion
- **Microsoft Agent 365** — comprehensive but Microsoft-only, GA May 2026

**Foot-in-the-door assets** (no founder identity required):
1. `npx rind-scan` — free open-source MCP vulnerability scanner (awareness, GitHub stars)
2. Incident prevention blog posts (Replit DB deletion, $47K agent loop) — SEO, inbound
3. LangChain middleware (2-line install) — self-serve, generates "oh shit" moments

---

## Planned Tech Stack

| Layer | Technology |
|-------|-----------|
| Monorepo | pnpm + Turborepo |
| Runtime | Node.js 22, TypeScript 5.4+ |
| API Server | Hono framework |
| MCP Proxy | Hono + @modelcontextprotocol/sdk |
| Dashboard | Next.js 15, React 19, Tailwind, shadcn/ui |
| Database | PostgreSQL via Supabase (RLS for multi-tenancy) |
| Cache | Redis (Upstash) |
| Queue | BullMQ |
| Linting | Biome |
| Testing | Vitest |
| Build | tsup |
| Deployment | Docker, Kubernetes/Helm |

---

## How to Start a Session on Rind

**Always do this at the start of any Rind conversation:**

1. Read `docs/strategic-analysis.md` — check the current state of decisions, assumptions, and open questions
2. If continuing prior work: check which assumptions have been validated or invalidated since last session
3. If starting new work: identify which open question (OQ-001 through OQ-006) the work addresses

**Before starting any new feature or layer** — non-negotiable gate:
- Quick: `/strategic-council` quick mode — for features, approach questions, new implementation layers
- Deep: `/strategic-council` deep mode — for irreversible architecture choices or major pivots
- **Do not write code until the decision is logged in `docs/strategic-analysis.md`**

**After any strategic session**: update `docs/strategic-analysis.md` — add to Decision Log (D-NNN), confidence score, kill criteria, update Assumption Tracker, mark Open Questions as resolved

**The 6 open questions that must be answered before coding begins** (from strategic-analysis.md):
- OQ-001: ~~Is the initial buyer a security team or engineering team?~~ RESOLVED (D-004): multi-team. Entry=engineer, budget=CISO.
- OQ-002: What specific incident triggers a purchase decision?
- OQ-003: Do enterprises want self-hosted or SaaS?
- OQ-004: What is the enterprise's current MCP adoption state?
- OQ-005: Does observability alone close deals, or must policy engine be bundled?
- OQ-006: What is the realistic path to $1M ARR?

---

## Strategic Thinking Workflow

> **MANDATORY PROCESS GATE — No exceptions.**
> Before starting development on ANY new feature, module, or implementation layer, the strategic council MUST run first. The feature must be designed and decided before any code is written. This is not a guideline — it is the development process for Rind.
>
> **What "before implementation" means in practice:**
> - Run `/strategic-council` → log the decision in `docs/strategic-analysis.md` → THEN write code
> - "I'll figure it out as I go" is not acceptable for security-critical infrastructure
> - If a feature touches an existing layer (interceptor, policy engine, session), re-run quick mode to confirm the approach before touching the code

This project uses the evidence-based decision framework. Before committing to any direction:

**For new features or implementation layers** (the primary use — run before any code):
```
/strategic-council quick mode  → logs decision → then implement
```

**For major strategic inflection points** (what to build first, who to target, architecture choices):
```
/strategic-council deep mode
```

**For stress-testing a specific idea or plan**:
```
/challenger
then
/steelman
```

**After any strategic session**: Update `docs/strategic-analysis.md` with decisions, assumptions, and risks. Record: decision name (D-NNN), date, reasoning, confidence score (1-10), kill criteria.

---

## Key Documents to Read First

1. `docs/strategic-analysis.md` — Current decision state (living document, read first)
2. `docs/positioning.md` — Competitive map, 5 market layers, messaging by persona, developer discovery strategy
3. `docs/architecture/architecture-decisions.md` — AD-001 through AD-006: proxy model, SDK/proxy feature split, UX modes, zero trust permissions, personas, tech stack
4. `docs/agent-deployment-patterns.md` — How each persona deploys agents; "wow" installation flows per persona
5. `docs/vision.md` — Mission and goals
6. `docs/technical-strategy.md` — Evidence-based feature prioritization
7. `docs/architecture/README.md` — System design overview
8. `docs/competition.md` — Full 40+ competitor landscape
9. `docs/competitor-deep-dive-framework.md` — Framework for running quarterly competitor analysis

---

## What We Know vs. What We Assume

### Validated
- No competitor covers observability + safety + security + MCP adoption cross-framework
- 88% of orgs have had AI agent security incidents (Gravitee 2026 survey)
- Only 24.4% have full visibility into agent communication
- Prompt-level security fails against 76-98% of novel attacks
- Real incidents (Replit DB deletion, $47K agent loop, Amazon Kiro outage) are all execution-layer failures — not caught by prompt filters

### Untested (High Priority to Validate)
- MCP adoption rate in target companies (validate in first 10 conversations)
- Whether developers self-install a proxy (vs. needing IT approval)
- Conversion rate from free observability discovery to paid enforcement
- Whether "MCP adoption platform" messaging resonates more than "security" messaging

### Risky Assumptions to Watch
- That MCP becomes the dominant agent communication protocol (fallback: protocol-agnostic LangChain SDK)
- That enterprises will accept a proxy in their agent stack (fallback: pure SDK, no proxy)
