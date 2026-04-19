# Aegis — Strategic Analysis (Living Document)

> This document is updated after every strategic-council session. It is the institutional memory for strategic reasoning — tracking what was decided, why, what was assumed, and what changed our thinking.

**Last Updated**: April 18, 2026

---

## Decision Log

Each entry: Decision → Date → Reasoning → Confidence → Outcome (updated over time)

### D-001: Build MCP Proxy + Observability First (Not OS-Level Agent)
**Date**: March 2026
**Decision**: Phase 1 = observability SDK + MCP proxy. Defer cross-platform endpoint agent.
**Reasoning**:
- Cross-platform endpoint agent requires 12-18 months and 3 separate OS implementations
- Enterprises are resistant to installing kernel-level agents (procurement friction)
- Cloud-first deployment (MCP proxy + API gateway) ships in weeks, not months
- Observability alone captures 30-35% of AI security budget
- MCP proxy retrofits security onto existing infrastructure with <5ms overhead

**Confidence**: 8/10
**Status**: Active — pre-code
**Kill Criteria**: If MCP fails to become the dominant protocol by Q4 2026, revisit

---

### D-002: Target Enterprise Before SMB
**Date**: March 2026
**Decision**: Primary ICP = enterprise security teams (1000+ employees, regulated industries)
**Reasoning**:
- Security incidents drive urgency; enterprises have experienced them at higher rates
- Enterprise willingness to pay is significantly higher for security tools
- Compliance requirements (SOC2, HIPAA, GDPR) create mandatory audit trail demand
- SMB market exists but has lower urgency and lower ACV

**Confidence**: 6/10 — less validated than D-001
**Status**: Active — untested
**Untested Assumption**: That enterprise security teams will buy before they have a public incident

---

### D-003: Position as "The Control Plane for AI Agents" (Revised April 2026)
**Date**: March 2026 | **Revised**: April 2026
**Decision**: Aegis is a control plane covering four dimensions — observability, safety, security, and MCP adoption — not a single-dimension security or observability tool.
**Original decision**: "Security-first observability" — too narrow. Revised after competitive analysis revealed broader unoccupied space.
**Reasoning**:
- No competitor covers all four dimensions cross-framework (see positioning.md)
- "Security-first" requires a fear trigger (incident or compliance deadline) to close — limits addressable market
- "MCP adoption platform" enables a positive entry motion: "adopt MCP in production safely" instead of "protect against threats"
- The proxy architecture is the same regardless of framing — it generates observability, enables safety rules, enforces security, and makes MCP easy to deploy
- Broader framing expands buyer from CISO-only to: platform engineers (observability/safety), security teams (enforcement), CTOs (MCP adoption), compliance (audit trail)

**Four dimensions and their buyers**:
| Dimension | Value | Buyer |
|-----------|-------|-------|
| Observability | See all agent activity, tool calls, costs, anomalies | Platform/ML engineer |
| Safety | Prevent catastrophic actions, cost overruns, infinite loops | Platform engineer, CTO |
| Security | Enforce policies, MCP auth, anomaly detection, audit trail | Security team, CISO |
| MCP Adoption | Production-ready MCP in 10 minutes, secure by default | Any engineer evaluating MCP |

**Confidence**: 7/10
**Status**: Active
**Kill Criteria**: If a well-funded player ships a cross-framework control plane covering all four dimensions before we have design partners

---

## Assumption Tracker

| ID | Assumption | Status | Evidence | How to Validate | Next Check |
|----|-----------|--------|---------|----------------|-----------|
| A-001 | MCP becomes dominant agent protocol | UNTESTED | Strong momentum, Anthropic backing | Track adoption rate quarterly | Q3 2026 |
| A-002 | Enterprises will adopt proxy over native SDK | UNTESTED | Enterprises understand proxies (precedent: Zscaler) | 5 design partner interviews | Before coding |
| A-003 | Security buyers have budget before an incident | RISKY | Only 14.4% have full security approval | Interview 10 enterprise security leads | Before coding |
| A-004 | LangChain/LangGraph remain dominant (47M downloads/month) | PLAUSIBLE | Current download data confirmed | Monitor monthly downloads | Q3 2026 |
| A-005 | <5ms proxy overhead is acceptable in production | UNTESTED | MintMCP Gateway claim, not independently verified | Benchmark prototype | Month 2 |
| A-006 | Observability alone generates sufficient ARR for Series A | RISKY | No comparable pure-observability AI company at scale yet | Model unit economics with 10 design partners | Before public launch |
| A-007 | Enterprise buyers are security teams, not engineering | REVISED | Strategic council (D-004): entry point is engineering, budget holder is CISO. Multi-team buying journey. | Validate in first 10 design partner conversations | Before coding |
| A-008 | Platform engineers will voluntarily adopt a security proxy | UNTESTED | Snyk/Dependabot precedent, but retention is the test | Ship free tier, measure 30-day retention | Month 2 |
| A-009 | Free-tier "oh shit" moment drives conversion to paid | UNTESTED | Logical but unproven — observability must reveal actionable gaps | Track: did any free user discover something unexpected? | After 5 installs |
| A-010 | Proxy + enforcement together (not deferred) is shippable in Month 1 | UNTESTED | MCP proxy is technically straightforward; combined scope is larger | Build prototype, time it | Month 1 |
| A-011 | Indie developers will self-install a safety tool before they get burned | UNTESTED | Developers adopt tools that prevent pain, not just solve pain they've had | HN launch, measure week-1 signups | Month 1 |
| A-012 | "Oh shit" moment happens within first 5 installs | UNTESTED | Logical if agents are calling unexpected tools, but frequency unknown | Do 5 controlled installs, observe dashboard | Month 2 |
| A-013 | Indie → startup tier conversion ≥5% | UNTESTED | Freemium conversion benchmarks 2-15% depending on how limiting the free tier is | Measure cohort 30 days after signup | Month 3 |
| A-014 | LiteLLM is not a substitute — devs recognize tool-call vs. LLM-call distinction | UNTESTED | LiteLLM only intercepts LLM API, not tool execution — but devs may not know this | Ask in first 10 design partner conversations | Month 2 |
| A-015 | Cloud-hosted proxy has low enough friction (env var change sufficient) | UNTESTED | Helicone succeeds with this model; should work | Time from signup to first intercepted tool call | Month 1 |
| A-016 | BSL license does not create enterprise legal objections | UNTESTED | BSL used by CockroachDB, MariaDB successfully | Check with first 3 enterprise prospects | Month 6 |

---

### D-005: ICP Sequence — Indie Developers First, Then Startups, Then Enterprise
**Date**: April 2026
**Decision**: Target Segment A (indie/solo developers) as first customer cohort. Segment A is distribution and feedback, not primary revenue. Revenue materializes as Segment A converts to Segment B (startups), then C (growth-stage).
**Reasoning**:
- Indie devs are building agents NOW — no MCP adoption delay risk
- Self-serve, no identity required, no procurement
- "Picks and shovels" moment: millions of developers building agent apps in 2026
- Indie → startup → enterprise funnel is proven (Snyk, Datadog, Cloudflare)
- Segment A generates the "oh shit" moments that create Segment B urgency
**ICP profile (Segment A)**: Solo developer, building a consumer or SaaS product with LangChain/OpenAI Assistants, worried about agent cost overruns and unexpected behavior.
**Kill criteria**: If indie devs don't convert to paid tier at ≥5% after month 3, revisit ICP.

---

### D-006: Product Identity = "The Safety Layer for AI Agents"
**Date**: April 2026
**Decision**: Lead with "safety" messaging, not "security" or "observability" or "control plane." The single hook: "Stop your agent from going off the rails."
**Reasoning**:
- "Safety" resonates with indie devs (personal: $500 bills, deleted data) AND enterprises (incidents, compliance)
- "Security" requires fear trigger (incident or audit) to close
- "Observability" is LangSmith's word and is too passive
- "Control plane" is too corporate for indie dev entry
- Safety is the hook; observability and enforcement are the proof and the depth
**Three safety features that are the hook**: cost limits + loop detection + destructive action blocking
**Kill criteria**: If "safety" messaging doesn't resonate in first 10 conversations, test "never be surprised by your agent" framing instead.

---

### D-007: Open Core Architecture — SDK Open, Proxy Proprietary
**Date**: April 2026
**Decision**: Open source the instrumentation SDK and MCP scanner CLI. Keep the proxy engine, policy evaluator, and dashboard proprietary.
**Reasoning**:
- Open source SDK: drives adoption, forces clean architecture, no competitive risk (instrumentation is plumbing)
- Open source MCP scanner: HN/GitHub awareness driver, no revenue implications
- Proprietary proxy: this is the moat — policy evaluation logic, enforcement engine
- License model: Apache 2.0 for SDK, BSL (Business Source License with 4-year cutover) for proxy
- BSL prevents AWS/LiteLLM from forking and competing; community can still use it; commercial use requires license
- Precedent: CockroachDB, MariaDB, Couchbase all use BSL successfully
**Kill criteria**: If BSL creates adoption resistance from enterprise (legal teams reject non-OSI licenses), consider AGPL instead.

---

### D-008: Technical Architecture — Cloud-Hosted Proxy + SDK First
**Date**: April 2026
**Decision**: Primary deployment is cloud-hosted SaaS proxy (env var change). Docker/self-hosted for enterprise. SDK wraps proxy for framework integrations.
**Reasoning**:
- Proxy friction is the top adoption risk for indie developers
- Cloud-hosted proxy = "change AEGIS_PROXY_URL env var" — same friction as Helicone
- Self-hosted keeps enterprise option alive without blocking indie adoption
- SDK (2-line init) abstracts all infrastructure from framework users
- Language stack: TypeScript/Node.js (per CLAUDE.md), not Python (note: mvp-roadmap.md uses Python — requires decision before coding begins)
**Outstanding**: Resolve Python vs. TypeScript before Month 1. TypeScript preferred (CLAUDE.md) but Python may reach LangChain devs faster.

---

### D-004: First Customer = Developer Entry, Multi-Team Value
**Date**: April 2026
**Decision**: First customer entry point is platform/ML engineers at mid-to-large companies (200+ employees) deploying AI agents. Product designed for developer adoption but dashboard/reporting serves security and compliance teams. MCP proxy + SDK shipped together from day one (not observability first, enforcement later).
**Reasoning**:
- Solo founder cannot sustain 6-7 month enterprise procurement with 25 stakeholders
- Developer-first PLG has proven precedent (Snyk: $0 to unicorn via developer adoption)
- Enterprise buying journey is multi-team: engineer deploys → security evaluates → compliance accelerates → CISO approves budget
- MCP proxy is both observability AND enforcement — shipping them together is the differentiation (LangSmith/Langfuse only do observability)
- Deferring enforcement to months 4-6 would leave Aegis competing as a commodity observability tool
- EU AI Act (Aug 2, 2026) creates compliance urgency that accelerates security team buy-in

**Enterprise Buyer Map**:
| Team | Role in Deal | What They Need from Aegis |
|------|-------------|---------------------------|
| Platform/ML Eng | Entry point (installs) | SDK integration, proxy deploy, trace debugging |
| Security Team | Evaluator + champion | Threat detection, anomaly alerts, enforcement rules |
| IT | Beneficiary | Agent inventory, shadow AI discovery |
| Compliance/GRC | Accelerant (urgency) | Audit trails, EU AI Act evidence, compliance reports |
| CISO | Budget holder | Risk reduction narrative, unified dashboard |

**Purchase Trigger**: The "oh shit" moment — free tier reveals unauthorized tool calls, unexpected data access, or agent behaviors the team didn't know about. Observability creates urgency, enforcement closes the deal.

**Minimum Product to Close**:
1. MCP proxy with auth, logging, allow/deny rules
2. LangChain/LangGraph SDK (2 lines of code)
3. Dashboard: agent activity, tool calls, anomalies (serves security + compliance)
4. Anomaly alerting
5. Audit trail export (serves compliance)
6. One-command deploy (npx or Docker)

**Confidence**: 7/10
**Status**: Active — pre-validation
**Kill Criteria**:
- 0 of first 10 prospects use MCP in production → pivot to protocol-agnostic SDK
- 5+ design partners integrate but 0 convert after 60 days → add compliance features immediately
- Well-funded competitor ships MCP security + observability → accelerate or niche down

---

## Open Questions

Questions that need answers before major decisions.

| # | Question | Why It Matters | How to Answer | Priority |
|---|---------|---------------|--------------|---------|
| OQ-001 | Is the initial buyer security team or engineering team? | Determines GTM motion, pricing, product features | ANSWERED (D-004): multi-team. Entry=engineer, budget=CISO. Product must serve both. | RESOLVED |
| OQ-002 | What specific incident triggers a purchase decision? | Determines urgency narrative and sales cycle | PARTIALLY ANSWERED: "oh shit moment" from observability revealing unauthorized behavior. Validate with: talk to security leads post-incident | HIGH |
| OQ-003 | Do enterprises want to self-host or accept SaaS? | Affects architecture (VPC deploy complexity), pricing | Ask in design partner conversations | HIGH |
| OQ-004 | What is the current MCP adoption state? | If MCP not yet adopted by target devs, proxy serves LangChain tool calls first (fallback exists) | Survey in first 10 conversations | HIGH |
| OQ-005 | Does observability alone close deals, or does safety/enforcement need to be bundled? | Almost certainly bundled — observability alone = LangSmith. Confirm. | First 5 design partner conversations | MEDIUM |
| OQ-006 | What is the realistic path to $1M ARR? | Segment A→B→C funnel needs real conversion data | Model after first 50 free signups | MEDIUM |
| OQ-007 | Is "safety" the right hook, or is another word better? | Determines entire top-of-funnel messaging | A/B test on landing page: "safety" vs. "guardrails" vs. "never be surprised" | Month 1 |
| OQ-008 | Python vs. TypeScript for the proxy? | Roadmap says Python; CLAUDE.md says TypeScript. Must decide before writing a line of code. | Decision needed before Month 1 begins | CRITICAL |
| OQ-009 | Does LiteLLM overlap meaningfully for target developers? | If devs already use LiteLLM and see Aegis as duplicative, adoption stalls | Ask in first 10 conversations: "do you use LiteLLM or Portkey?" | Month 2 |

---

## Risk Register

Active risks being monitored with early warning signals.

| ID | Risk | Severity (1-10) | Likelihood (1-10) | Early Warning Signal | Mitigation | Owner |
|----|-----|-----------------|-------------------|---------------------|-----------|-------|
| R-001 | MCP adoption too early — no enterprises using MCP when we launch | 9 | 4 | No MCP mentions in enterprise security conferences by Q3 2026 | Build LangChain SDK first, MCP proxy as Phase 2 | — |
| R-002 | Enterprises won't install a proxy on their critical agent infrastructure | 8 | 5 | Design partners reject proxy architecture in first 5 conversations | Pivot to pure SDK (no proxy required) | — |
| R-003 | Well-funded competitor enters MCP security + observability | 7 | 5 | AnthropicSecurity/OpenAI Security or large SIEM player announces product | Accelerate launch, focus on depth not breadth | — |
| R-004 | Observability unit economics don't support the business | 8 | 4 | CAC > 12-month LTV in first 10 customers | Add policy engine to base tier earlier than planned | — |
| R-005 | LangChain loses market share before we gain significant users | 6 | 3 | Monthly downloads fall below 30M for 3 consecutive months | Prioritize CrewAI and AutoGen integrations | — |
| R-006 | MCP adoption too early — engineers integrating Aegis aren't using MCP servers yet | 8 | 6 | 0 of first 10 conversations show MCP in production | Fallback: LangChain callback-based monitoring (protocol-agnostic proxy) | — |
| R-007 | Developer adoption doesn't convert: free tier users never upgrade | 7 | 5 | Free users at month 2 with 0 paid conversions | Redesign free tier limits; the hook must be safety (cost limits, loop detection) not observability | — |
| R-008 | LiteLLM ships MCP security / tool call enforcement before Aegis has customers | 7 | 4 | LiteLLM GitHub: merged PR adding tool-call interception | Accelerate MCP depth + agent RBAC — features LiteLLM won't prioritize | — |
| R-009 | Proxy setup friction kills indie developer adoption | 8 | 5 | <10% of signups complete first tool-call interception within 24 hours | Invest in hosted SaaS proxy onboarding; env var change must be the entire setup | — |
| R-010 | "Safety" messaging doesn't resonate; developers don't adopt before getting burned | 6 | 4 | Low signup conversion from landing page traffic | Test alternative: "never get a surprise $500 bill from your agent" | — |

---

## Lessons Learned

What changed our thinking and why.

| Date | What We Thought | What We Learned | How It Changed Approach |
|------|----------------|-----------------|------------------------|
| March 2026 | OS-level enforcement is the moat | Cross-platform endpoint agent is 12-18 months minimum; enterprises resist kernel-level agents | Pivoted to MCP proxy + cloud sandbox. OS-level deferred to Phase 3. |
| March 2026 | Multi-agent debate produces diverse perspectives | Research shows single-model personas are largely performative; structured frameworks (pre-mortem, ACH, dialectical inquiry) have stronger evidence | Adopted framework-based decision methodology instead of persona roleplay |
| April 2026 | Enterprise buyer = one person/team | Strategic council revealed multi-team buying journey: engineer deploys, security evaluates, compliance accelerates, CISO approves. Product must serve all four. | Redesigned MVP scope: proxy + enforcement + compliance audit trail (not just developer-facing observability) |
| April 2026 | Observability first, enforcement later (sequential) | Shipping enforcement 4-6 months after launch means competing as a commodity dashboard. MCP proxy is both observability AND enforcement simultaneously — they are the same feature. | MVP ships proxy + enforcement + SDK together, not staged |
| April 2026 | Enterprise is the first customer | Full ICP analysis shows indie/solo developers are the fastest, lowest-friction entry point. They become the funnel into startups and enterprise. Revenue from enterprise follows developer adoption. | Segment A (indie devs) → B (startups) → C (growth) → D (enterprise) sequencing |
| April 2026 | "Control plane" is the product identity | "Safety layer" resonates with both indie devs and enterprise buyers. "Control plane" is too corporate for developer-led adoption. One hook beats eight features. | Lead with safety hook: cost limits + loop detection + destructive action blocking |
| April 2026 | Security is the primary dimension | Broader framing covers observability + safety + security + MCP adoption. Entry dimension is SAFETY (positive, not fear-based), which works for both developer and enterprise buyers. | Reframe positioning; safety is the door, security and compliance are the rooms inside |

---

## Review Schedule

| Decision / Assumption | Review Trigger | Review Date |
|----------------------|---------------|------------|
| D-002 (Enterprise vs SMB target) | After 10 design partner conversations | Before coding begins |
| D-004 (First customer profile) | After 10 design partner conversations | 6 weeks from now (~June 2026) |
| A-001 (MCP dominance) | Quarterly | Q3 2026 |
| A-003 (Pre-incident budget) | After first 5 sales conversations | Before pricing finalizes |
| A-008 (Developer adoption) | After 5 free tier installs with 30 days data | Month 2 |
| A-009 (Free→paid conversion) | After 30 days of free tier live | Month 2 |
| OQ-002 (What triggers purchase) | After 5 conversations with post-incident security leads | Before public launch |
| OQ-003 through OQ-006 | All resolved before first code is written | Before Month 1 |
| Full strategy review | Monthly | 1st of each month |
