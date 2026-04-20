# Rind — Architecture Decisions

> Captures architectural direction for Rind before coding begins. Each decision includes the tradeoffs, the chosen approach, and the reasoning. Update this doc when a decision changes.

**Last Updated**: April 18, 2026
**Status**: Pre-code — all decisions provisional until validated with design partners

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

## Open Architectural Questions

| Question | Why It Matters | When to Decide |
|---------|---------------|---------------|
| Event bus technology (Redis Streams vs. BullMQ vs. in-process) | Determines how Slack/webhook integrations are added later | Before Horizon 1 ship |
| Hosted proxy region strategy (single region vs. multi-region from day one) | Latency for global users; GDPR data residency | Before public launch |
| Trace storage (time-series DB vs. Postgres vs. ClickHouse) | Query performance on billions of trace events | Before Horizon 2 |
| MCP proxy latency budget (<5ms target) | Must benchmark with real LangChain workloads | Month 1 prototype |
