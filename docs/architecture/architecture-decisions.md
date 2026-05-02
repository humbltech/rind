# Rind — Architecture Decisions

> Captures architectural direction for Rind before coding begins. Each decision includes the tradeoffs, the chosen approach, and the reasoning. Update this doc when a decision changes.

**Last Updated**: May 2, 2026
**Status**: AD-001–006 provisional (pre-code). AD-007–008 confirmed (post-implementation).

---

## AD-001: MCP Interception Model — Proxy-Through vs. Be-The-MCP

### The Decision
How does Rind intercept and control MCP traffic?

### Two Options

**Option A: Proxy-Through**
Rind sits between the agent and MCP servers, forwarding calls transparently. The agent still knows about and connects to real MCP servers; Rind intercepts in the middle.

```
Agent → Rind Proxy → Real MCP Server
```

| Aspect | Assessment |
|--------|-----------|
| Setup friction | Low — change one endpoint URL |
| Control depth | Moderate — see all calls, can block/allow |
| Identity model | Session-based (who's proxying?) |
| Zero trust support | Partial — can enforce at transport level |
| Enterprise fit | Good — enterprises understand proxies |

**Option B: Be-The-MCP (Recommended for Horizon 2+)**
Agents connect to Rind as if Rind IS their MCP server. Rind holds the real MCP server credentials, evaluates agent identity and authorization, then forwards selectively to real MCP servers on behalf of the agent.

```
Agent → Rind (acting as MCP server) → [Authorized real MCP servers]
```

| Aspect | Assessment |
|--------|-----------|
| Setup friction | Higher — agents must re-configure to point at Rind |
| Control depth | Full — Rind decides which tools are even visible to which agent |
| Identity model | Per-agent identity at the MCP protocol level |
| Zero trust support | Full — continuous validation, least-privilege tool exposure |
| Enterprise fit | Excellent — matches Zscaler / API gateway mental model |

### Decision
**Horizon 1 (MVP)**: Option A (proxy-through). Lower friction for indie/startup adoption. Get to "oh shit" moment fast.

**Horizon 2 (Growth)**: Migrate to Option B as the default for team and enterprise tiers. Option A remains supported for SDK-only users.

**Why this sequence**: Option A ships faster and validates demand. Option B is the defensible moat — it's how you get full zero trust without requiring agents to be modified. The two are architecturally compatible: the proxy-through layer can be retained and enhanced to become the "be-the-MCP" server.

### Impact on Architecture
- The proxy must be designed as a MCP server from day one (not just a TCP forwarder), even if Horizon 1 just passes calls through
- Agent identity must be tracked from the first request, even if only used for logging in Horizon 1
- The policy engine sits at the MCP layer, not the HTTP layer

---

## AD-002: Feature Deployment Requirements — SDK-Only vs. Proxy-Required

### The Decision
Some features can be delivered via SDK alone (no infrastructure required). Others require the proxy to intercept network traffic. The rule: **features that don't need a proxy must NOT require proxy setup.**

### Feature Map

| Feature | SDK Only? | Needs Proxy? | Reason |
|---------|:---------:|:------------:|--------|
| Observability traces | ✓ | ✗ | SDK hooks into LangChain callbacks |
| Cost tracking | ✓ | ✗ | SDK counts tokens at framework level |
| Budget alerts | ✓ | ✗ | SDK enforces before LLM call |
| Hard cost limits | ✓ | ✗ | SDK blocks call when limit reached |
| Loop detection | ✓ | ✗ | SDK counts repeated tool invocations |
| Basic tool allow/deny | ✓ | ✗ | SDK wraps tool executor |
| REQUIRE_APPROVAL gates | ✓ | ✗ | SDK pauses execution, waits for webhook |
| Anomaly detection | ✓ (send events) | ✗ | SDK streams events to cloud; analysis is server-side |
| MCP server allow/deny | ✗ | ✓ | Must intercept MCP transport |
| MCP tool-level auth | ✗ | ✓ | Must operate at MCP protocol layer |
| Agent RBAC | ✗ | ✓ | Needs centralized identity store |
| JIT permissions | ✗ | ✓ | Requires server-side session management |
| Egress domain allowlists | ✗ | ✓ | Must intercept outbound network calls |
| Data exfiltration prevention | ✗ | ✓ | Must inspect MCP response payloads |
| Multi-agent governance | ✗ | ✓ | Must track agent-to-agent MCP calls |

### Installation Paths

```
Path 1 — SDK Only (Horizon 1, indie/startup):
  npm install @rind/langchain
  2-line init → observability + cost limits + safety rules
  No infrastructure, no proxy, no Docker

Path 2 — SDK + Cloud Proxy (Horizon 1-2, startup/growth):
  npm install @rind/langchain
  Set RIND_PROXY_URL=https://proxy.rind.dev/<key>
  All Path 1 features + MCP security + server allowlists
  Still no Docker; uses our hosted infrastructure

Path 3 — Self-Hosted Proxy (Horizon 2-3, enterprise):
  helm install rind rind/rind-proxy
  Full feature set + data stays on-premises
  Requires infrastructure team
```

### UX Principle
The onboarding flow must branch at step one:
- "I want observability + safety → 2 lines of code, done"
- "I also want MCP security → set one env var, done"
- "I need self-hosted → follow enterprise setup guide"

Never show proxy setup steps to users who don't need proxy features.

---

## AD-003: Dashboard UX Architecture — Developer Mode vs. Security Mode

### The Decision
One product, multiple interfaces based on persona. Not one-size-fits-all, not infinite customization — a handful of well-designed personas.

### Personas and Their Primary Interface

| Persona | Primary Need | Interface Style | Default View |
|---------|-------------|-----------------|--------------|
| **Indie developer** | "What happened? Am I about to get a big bill?" | Simplified, chat-forward | Safety summary + cost widget |
| **Startup team** | "What are our agents doing? Any surprises?" | Collaborative, alert-focused | Agent activity feed + anomaly alerts |
| **Security team** | "Policy status, incidents, audit trail" | Traditional dashboard, dense | Policy enforcement status + incident log |
| **Ops/SRE** | "Uptime, latency, errors, on-call triggers" | Operational, metrics-heavy | Performance metrics + alert history |
| **Compliance** | "Audit evidence, policy documentation, reports" | Report-oriented | Compliance status + export tools |

### Two Core UI Modes

**Developer Mode** (default for SDK-only and Starter tier users):
- Natural language query bar: "Show me what my agents did today"
- Summary cards: cost this week, blocked actions, anomaly count
- Simple timeline of agent activity
- One-click approval for pending REQUIRE_APPROVAL gates
- Mobile-friendly — indie devs check this on their phone

**Security Mode** (default for Team tier and above):
- Traditional metrics dashboard with time range selectors
- Policy editor: visual rule builder + YAML editor
- Audit log with search and filter
- Compliance evidence export
- Multi-agent topology view (which agents call which MCP servers)

### Shared Data Layer
Both modes query the same API. The difference is entirely presentation. This means:
- A security user can switch to Developer mode for a simpler view
- An indie developer can access raw audit logs if needed
- Feature flags control what's visible per tier, not what's in the data layer

### Agentic Interface (Horizon 2)
Chat-style queries over agent data: "Which agent cost the most last week?" "Show me all blocked tool calls in the last 24 hours." This is not a chatbot — it's a structured query interface that translates natural language to API queries. Built on top of the same data layer.

### Integration Touchpoints (Alert Channels)
Alerts and approval workflows must reach users where they work, not just in the dashboard:

| Channel | Use Case | Priority |
|---------|---------|---------|
| **Slack** | Inline approve/deny for tool calls, daily summaries, anomaly alerts | Horizon 2 |
| **Telegram** | Same as Slack for teams using Telegram | Horizon 2 |
| **Email** | Digest alerts, compliance reports, weekly summaries | Horizon 1 |
| **Webhooks** | Generic integration (PagerDuty, OpsGenie, custom) | Horizon 2 |
| **PagerDuty/OpsGenie** | Critical security event escalation | Horizon 3 |

**Architecture requirement**: The event system must be an event bus from day one. Alerts are events; delivery channels are subscribers. Adding Slack in Horizon 2 means adding a Slack subscriber, not rebuilding the alert system.

---

## AD-004: Permission Model — Zero Trust for Agents

### The Decision
Rind implements Zero Trust authorization for AI agents, not traditional RBAC. The model: **never trust, always verify, least privilege by default.**

### Core Concepts

**Agent Identity**
Every agent has an identity profile:
```yaml
agent:
  id: "agent-prod-crm-updater-001"
  role: "crm-updater"
  capabilities: ["crm.read", "crm.write", "email.send"]
  environment: "production"
  owner: "sales-automation-team"
```

**Capability Profiles (not permission lists)**
Instead of granting access to specific MCP servers and tools upfront, agents are assigned capability profiles that define what they're *allowed to request*. Actual access is evaluated at runtime.

**Continuous Validation**
Every tool call is evaluated against:
1. Does this agent have the capability for this action?
2. Is the current context appropriate? (environment, time of day, recent activity)
3. Has this agent shown anomalous behavior in this session?
4. Does this action require human approval given its potential impact?

**Just-In-Time (JIT) Permissions**
For high-risk operations, capabilities are granted temporarily:
```
Agent requests: database.schema.modify
Rind evaluates: requires elevated access
Rind grants: temporary token valid for 15 minutes
Agent executes within window
Token auto-expires
```

**Impact Classification**
Every tool action is classified by blast radius:
- `READ` — observe only, auto-approve
- `WRITE` — modifies state, approve with policy
- `DESTRUCTIVE` — irreversible, require human approval by default
- `ESCALATED` — accesses privileged systems, JIT + human approval

### Permission Levels

| Level | How Granted | Duration | Example |
|-------|------------|---------|---------|
| Standing | Profile assignment | Indefinite | CRM read access for sales agent |
| Session | Login/init | Until session ends | Elevated privileges for an approval workflow |
| JIT | Explicit request | 5-60 minutes | Database schema changes |
| Emergency | Manual override | 1 use | Break-glass access during incident |

### What This Is NOT
- Not a static "user has role X which grants permissions Y, Z" mapping
- Not evaluated once at startup and cached for the session
- Not bypassable by the agent constructing clever prompts
- Not dependent on the agent's self-reported identity

### Horizon Map
| Feature | Horizon |
|---------|---------|
| Agent identity profiles | H1 (basic) |
| Capability-based tool allow/deny | H1 |
| Impact classification (READ/WRITE/DESTRUCTIVE) | H1 |
| Session-scoped permissions | H2 |
| JIT permissions | H2 |
| Continuous contextual validation | H2 |
| Emergency break-glass | H3 |

---

## AD-005: Multi-Persona UX Architecture

### The Decision
Design distinct interfaces for each persona segment, prioritized by build order based on target market stage.

### Persona Stack

**Horizon 1 Target: Indie Developer**
```
Interface:   Simple web dashboard + SDK
Entry:       npm/pip install → 2-line init
Key views:   Cost this week | Safety events | Agent timeline
Key actions: Review pending approvals | Set cost limit | View traces
Mobile:      Yes — approve tool calls from phone
Tier:        Free + Starter ($99/mo)
```

**Horizon 1 Target: Startup Team**
```
Interface:   Collaborative dashboard, team-aware
Entry:       Invite teammates, shared policy workspace
Key views:   Team agent activity | Policy status | Cost by agent
Key actions: Create policies | Set team budgets | Invite members
Mobile:      Partial — alerts + approvals
Tier:        Team ($399/mo)
```

**Horizon 2 Target: Security Team**
```
Interface:   Traditional security dashboard
Entry:       Integration with SSO, import existing agent inventory
Key views:   Policy enforcement | Incident timeline | Audit log
Key actions: Write enforcement policies | Investigate incidents | Export evidence
Mobile:      No — security work is desktop
Tier:        Business ($999/mo)
```

**Horizon 2 Target: Ops/SRE**
```
Interface:   Metrics dashboard, alert-heavy
Entry:       OpenTelemetry export → existing observability stack
Key views:   Agent latency | Error rates | Tool call volumes | Anomaly trends
Key actions: Configure alert thresholds | PagerDuty integration | Runbooks
Mobile:      Yes — on-call requires mobile
Tier:        Business ($999/mo)
```

**Horizon 3 Target: Compliance**
```
Interface:   Report-oriented, evidence-focused
Entry:       Connect to audit tools, configure retention policies
Key views:   Policy documentation | Audit trail | Compliance status
Key actions: Generate EU AI Act evidence | Export SOC2 artifacts | Schedule reports
Mobile:      No
Tier:        Enterprise (custom)
```

### Build Order
1. Indie developer interface (Horizon 1, MVP)
2. Startup team collaboration features (Horizon 1, month 2)
3. Security team dashboard (Horizon 2, month 4)
4. Ops/SRE metrics view (Horizon 2, month 5)
5. Compliance reporting (Horizon 3, month 9)

---

## AD-006: Technology Stack Decision

### The Decision
Resolve the Python vs. TypeScript discrepancy between `mvp-roadmap.md` (Python/FastAPI) and `CLAUDE.md` (TypeScript/Node.js).

### Analysis

| Dimension | Python | TypeScript |
|-----------|--------|-----------|
| LangChain SDK integration | Native (LangChain is Python-first) | Via LangChain.js (maintained but secondary) |
| MCP SDK | `@modelcontextprotocol/sdk` in TypeScript (official); Python MCP available | TypeScript has the reference implementation |
| Developer trust with indie devs | Python-first ML community | TypeScript for web/fullstack devs |
| Dashboard (Next.js) | Would require separate TypeScript service | Full-stack TS monorepo |
| Existing team skill | Unknown | Specified in CLAUDE.md as preferred |
| Monorepo tooling | pnpm + Turborepo | pnpm + Turborepo |

### Decision
**TypeScript/Node.js for the proxy and dashboard.** Python SDK as a separate package for Python-first users.

Reasoning:
- MCP's reference SDK is TypeScript — building the proxy in TS means using the canonical implementation
- Full-stack TypeScript monorepo (proxy + dashboard + SDK) is simpler than a polyglot stack
- LangChain.js is maintained and growing; LangChain Python can be supported via a thin Python wrapper that calls the TypeScript proxy
- The existing `mvp-roadmap.md` Python plan should be treated as superseded by this decision

**Required**: Create a Python SDK package (`rind-sdk` on PyPI) that wraps the cloud proxy API. Python users get the same features via HTTP; they don't need a Python proxy server.

**OQ-008 resolved**: TypeScript for proxy + dashboard. Python SDK via API wrapper.

---

## AD-007: Human Approval Flow — Connection Hold vs. Async Resume

**Date**: May 2, 2026
**Status**: DECIDED

### The Question

When a tool call hits a `REQUIRE_APPROVAL` policy, Rind must pause execution until a human decides. Two approaches exist: hold the agent's connection open until the decision arrives, or immediately return a "pending" response and have the agent retry later.

### Why Async Resume Doesn't Work for MCP

MCP JSON-RPC is a synchronous request-response protocol. The agent sends a tool call request and blocks, waiting for a result. It has no concept of "come back later." The same is true for Claude Code PreToolUse hooks — Claude Code calls the hook endpoint and waits for a response before deciding whether to execute the tool.

If Rind returns a `202 Accepted` with a polling URL, the MCP client does not know what to do with it. Different clients handle it differently:

| Client | Behaviour on unexpected 202 |
|--------|----------------------------|
| Claude Code (hook) | Treats it as the tool result, moves on |
| Most MCP SDK clients | Raises a protocol error |
| Custom agents | Depends entirely on implementation |

There is no standard retry or polling mechanism in MCP 1.0. An async resume response would break compatibility with every existing MCP client.

**Async resume is only viable when you control both ends of the connection** — i.e., in Rind's own SDK integrations (LangChain middleware, custom agent frameworks). It does not work for the proxy or hook endpoints.

### Decision

**Hold the connection for all proxy and hook endpoints. Implement async resume only in the SDK layer.**

```
MCP / hook path (all third-party agents):
  Agent → POST /proxy/tool-call
         [connection held open]
         Human decides
         ← Response returned
  Agent never knows a hold occurred — just saw latency

SDK path (Rind-owned agent integrations):
  Agent task → Rind SDK
  SDK detects REQUIRE_APPROVAL → suspends agent task
  SDK polls /approvals/{id} in background
  Human decides → SDK resumes agent task
```

This is not a simplification by choice — it is the only protocol-compatible approach for the proxy layer.

### Why "Connection Holding" Is Not a Performance Problem

The concern is intuitive but based on a thread-per-connection model that Node.js does not use.

| Model | 1 open connection = | 10,000 pending approvals |
|-------|--------------------|-----------------------------|
| Thread-per-connection (Java, Rails) | 1–8MB blocked thread | 10–80 GB RAM |
| Async I/O (Node.js, Hono) | ~8KB socket + callback | ~80 MB RAM |

In Node.js, an open connection waiting for approval is a socket file descriptor and a resolve callback sitting in the event queue. The event loop is entirely free to process other requests. Connection holding has negligible cost at the scale Rind operates at in Phase 1 and Phase 2.

### What Changes in Phase 2

The current in-process polling loop (checking an in-memory `ApprovalQueue` every 200ms) must be replaced for horizontal scaling. See AD-008.

---

## AD-008: Approval Flow at Scale — WebSocket Upgrade + Redis State

**Date**: May 2, 2026
**Status**: DECIDED (implement in Phase 2, not Phase 1)

### The Problem That Appears at Scale

The current connection hold works correctly within a single process. Two new problems emerge at scale:

**Problem 1 — Load balancer timeouts**
Most load balancers (nginx, AWS ALB, Cloudflare) have default connection timeouts of 30–60 seconds. Human approval can take minutes. A long-poll HTTP request gets killed by infrastructure before the human responds.

**Problem 2 — Instance affinity**
If the pending approval is held in memory on Server A, and the human submits the decision to Server B (via load balancer round-robin), the decision cannot reach the waiting connection. Server A never learns about it.

### Solution: WebSocket Upgrade + Redis State

These two problems are solved independently and can be shipped separately.

**Solve load balancer timeouts with WebSocket:**

```
Agent → POST /proxy/tool-call
      → Policy eval: REQUIRE_APPROVAL
      → 101 Switching Protocols
Agent ↔ WebSocket (persistent, load balancers don't timeout WebSockets)
Human approves dashboard
      → Server pushes { decision, output } over WebSocket
Agent receives decision, closes connection
```

WebSockets are designed for persistent connections. All major load balancers handle them without timeout. The agent side requires no changes — the HTTP→WS upgrade is transparent to the caller at the MCP protocol level.

**Solve instance affinity with Redis:**

```
Server A holds WebSocket, writes to Redis:
  rind:{tenant}:approval:{id} → { toolName, input, status: 'pending', expiresAt }
  TTL = approval timeout (default 120s)

Human submits approval to Server B:
  Server B writes: rind:{tenant}:approval:{id}.status = 'approved'
  Server B publishes: rind:{tenant}:approval:channel → { id, decision }

Server A subscribes to Redis Pub/Sub channel:
  Receives the published decision
  Resolves the WebSocket connection
  Connection closes normally
```

Memory cost per pending approval: ~500 bytes in Redis.
At 10,000 concurrent approvals (extreme scale): ~5MB Redis, negligible.

### Multi-Tenant Isolation

Tenant namespacing is built into the key structure: `rind:{tenant_id}:approval:{id}`. No tenant can read or resolve another tenant's approvals. This is enforced at the Redis key level, not the application level — a misconfigured application layer still cannot cross tenant boundaries.

### Enterprise Self-Hosted Option

Enterprises that cannot accept shared infrastructure get a BYOC (Bring Your Own Cloud) deployment:
- Same codebase, same Redis protocol
- Customer provides their own Redis (any Redis-compatible: Upstash, Elasticache, self-hosted Valkey)
- Rind connects via `RIND_REDIS_URL` env var
- No code changes required — the infra is the only difference

"Cloud effect" (shared fixed costs, operational leverage) is preserved on Rind's side because the SaaS tier uses shared infrastructure. The enterprise tier offloads operational cost to the customer's infra team.

### Implementation Sequence (Phase 2)

```
Step 1: Redis-backed ApprovalStore (replaces in-memory ApprovalQueue)
        — fixes instance affinity, enables horizontal scaling
        — no protocol change, agents see no difference

Step 2: WebSocket upgrade for approval holds
        — fixes load balancer timeouts for long approval windows
        — transparent to MCP clients

Step 3: SSE stream for dashboard (GET /approvals/stream)
        — one connection per active dashboard session (not per approval)
        — replaces dashboard polling with push
```

Step 1 is the only change required before scaling beyond a single instance. Steps 2 and 3 can wait until timeout problems are observed in production.

### What Stays Unchanged

The agent, the MCP client, the policy engine, and the tool-call route contract all stay the same. This is infrastructure plumbing beneath an unchanged API surface.

---

## Open Architectural Questions

| Question | Why It Matters | When to Decide |
|---------|---------------|---------------|
| Event bus technology (Redis Streams vs. BullMQ vs. in-process) | **RESOLVED** (AD-008): Redis Pub/Sub for approval state; in-process RindEventBus retained for same-process subscribers (ring buffer, audit writer). BullMQ deferred until job queue is needed. | — |
| Hosted proxy region strategy (single region vs. multi-region from day one) | Latency for global users; GDPR data residency | Before public launch |
| Trace storage (time-series DB vs. Postgres vs. ClickHouse) | Query performance on billions of trace events | Before Horizon 2 |
| MCP proxy latency budget (<5ms target) | Must benchmark with real LangChain workloads | Month 1 prototype |
