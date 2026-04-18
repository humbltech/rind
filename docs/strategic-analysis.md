# Aegis — Strategic Analysis (Living Document)

> This document is updated after every strategic-council session. It is the institutional memory for strategic reasoning — tracking what was decided, why, what was assumed, and what changed our thinking.

**Last Updated**: April 2026

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

### D-003: Position as "Security-First Observability" Not "Governance Platform"
**Date**: March 2026
**Decision**: Primary positioning = security + observability combined. Not governance (Credo AI's territory).
**Reasoning**:
- LangSmith/Langfuse own debugging/observability without security
- Lakera owns prompt injection point solution
- Credo AI/Holistic AI own governance
- Nobody combines MCP security + observability — this is the gap

**Confidence**: 7/10
**Status**: Active
**Kill Criteria**: If a well-funded player enters MCP security + observability combined before we have traction

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
| A-007 | Enterprise buyers are security teams, not engineering | UNTESTED | Security tools historically bought by security | Validate in design partner conversations | Before coding |

---

## Open Questions

Questions that need answers before major decisions.

| # | Question | Why It Matters | How to Answer | Priority |
|---|---------|---------------|--------------|---------|
| OQ-001 | Is the initial buyer security team or engineering team? | Determines GTM motion, pricing, product features | Interview 10-15 enterprise targets | HIGH |
| OQ-002 | What specific incident triggers a purchase decision? | Determines urgency narrative and sales cycle | Talk to security leads who have had incidents | HIGH |
| OQ-003 | Do enterprises want to self-host or accept SaaS? | Affects architecture (VPC deploy complexity), pricing | Ask in design partner conversations | HIGH |
| OQ-004 | What is the enterprise's current MCP adoption state? | If MCP is not yet adopted, proxy has no traffic to intercept | Survey target enterprises | HIGH |
| OQ-005 | Does observability alone close deals, or does policy engine need to be bundled? | Determines MVP scope and pricing | 5 design partner conversations | MEDIUM |
| OQ-006 | What is the realistic path to $1M ARR? | Determines if this business is viable | Model scenarios with pricing and conversion rates | MEDIUM |

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

---

## Lessons Learned

What changed our thinking and why.

| Date | What We Thought | What We Learned | How It Changed Approach |
|------|----------------|-----------------|------------------------|
| March 2026 | OS-level enforcement is the moat | Cross-platform endpoint agent is 12-18 months minimum; enterprises resist kernel-level agents | Pivoted to MCP proxy + cloud sandbox. OS-level deferred to Phase 3. |
| March 2026 | Multi-agent debate produces diverse perspectives | Research shows single-model personas are largely performative; structured frameworks (pre-mortem, ACH, dialectical inquiry) have stronger evidence | Adopted framework-based decision methodology instead of persona roleplay |

---

## Review Schedule

| Decision / Assumption | Review Trigger | Review Date |
|----------------------|---------------|------------|
| D-002 (Enterprise vs SMB target) | After 10 design partner conversations | Before coding begins |
| A-001 (MCP dominance) | Quarterly | Q3 2026 |
| A-003 (Pre-incident budget) | After first 5 sales conversations | Before pricing finalizes |
| OQ-001 through OQ-007 | All resolved before first code is written | Before Month 1 |
| Full strategy review | Monthly | 1st of each month |
