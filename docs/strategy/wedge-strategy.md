# Rind GTM Wedge Strategy

> **Status**: Strategic council complete — D-047 logged
> **Created**: 2026-05-04
> **Last Updated**: 2026-05-04
> **Decision**: D-047 — Conditional Accept. MCP routing yes (build). LLM routing no (integrate LiteLLM). Routing is a capability, not the identity.

## Context

Colleagues needed basic routing (LLM + MCP) and reached for LiteLLM. This surfaced a strategic question: should Rind be the router — with security bundled by default — as the primary go-to-market wedge?

The current GTM is: free observability → credential proxy → action governance. This document evaluates whether routing should replace, supplement, or integrate with that funnel, alongside all other potential wedges.

---

## Core Strategic Insight

**"Good Enough Default" Strategy**: Rind doesn't need to be the best router. It needs to be the easiest default choice for teams that need "basic routing + basic security" without assembling multiple tools. Like Vercel — not the best CDN or the best serverless platform, but good enough at both that it's the default for Next.js projects.

**Key constraint**: As a bootstrapped company, every free feature must either (a) drive adoption that directly converts to paid, (b) have low marginal cost, or (c) create lock-in for paid features. If a feature doesn't meet at least 2 of these, it should be paid.

---

## Current Proxy Capabilities

Rind is ~60-70% of an MCP router today:
- Multi-server MCP registry with lazy connection pooling (`UpstreamPool`)
- Server-addressed routing via `/mcp/:serverId`
- Protocol-agnostic upstream interface (stdio + HTTP)
- LLM API proxying (`/llm/:provider/*`) with policy enforcement, PII pseudonymization, cost tracking
- 9-step interceptor pipeline (scan, policy, loop detection, cost limits, response inspection)

### Missing for Full Router
| Capability | Status | Effort |
|---|---|---|
| Unified MCP tool catalog | Not built | Medium |
| Tool-name-based routing | Not built | Medium |
| Dynamic server registration | Not built | Small |
| Smart LLM model routing | Basic proxying only | Medium-Large |
| SSE/Streamable HTTP | Not built | Medium |
| Health checking / circuit breaking | Not built | Small-Medium |
| Auth layer (API keys, OAuth) | Not built | Medium |

---

## Routing Options Evaluated

### Option A: Routing Replaces Current Wedge
Rind = "the router for AI agents, with security built in." Largest TAM but head-to-head with LiteLLM (47M downloads/month). Risk of confused positioning.

### Option B: Routing as Parallel Funnel
Two doors: security-first OR routing-first. Two acquisition channels but split messaging for early-stage product.

### Option C: Integration Play
Wrap LiteLLM, don't compete. Smallest effort but "wrapper" products struggle to justify pricing. Doesn't solve user's "one tool" desire.

### Option D: MCP Router Only (Blue Ocean)
Own MCP routing exclusively. LiteLLM handles LLMs, Rind handles tool calls. Uncontested but smaller TAM.

### Recommended: Hybrid C+D with "Good Enough" LLM Routing
- **Excellent** at MCP routing (core, nobody else does this)
- **Good enough** at LLM routing (basic model selection, fallback — not 100+ providers)
- **Excellent** at security (the moat, bundled by default)
- For advanced LLM routing, integrate with LiteLLM/Portkey behind Rind

---

## Full Wedge Inventory

### Product Wedges (28+ evaluated, prioritized into 4 tiers)

#### TIER 1 — Core Product (Build First)

| # | Wedge | Free/Paid | Notes |
|---|-------|-----------|-------|
| W-07 | **MCP Routing** | Freemium (≤3 servers free) | Nobody does MCP routing well. Entry point. |
| W-10 | **Basic LLM Routing** | Freemium (≤2 providers free) | Good enough + security is differentiated. |
| — | **Security Scanning** | Free baseline, paid advanced | Basic scanning bundled. Policy engine paid. |
| N-05 | **Agent Cost Intelligence** | Free awareness → paid monitoring | Already partially built in interceptor. |
| W-09 | **Claude Code Hooks** | Freemium (basic free, policy paid) | Already done. First-mover advantage. |

#### TIER 2 — Strengthen & Differentiate (After Core)

| # | Wedge | Free/Paid | Notes |
|---|-------|-----------|-------|
| N-08 | **Agent Replay / Full Capture** | Paid | Proxy-exclusive. Requires full capture. |
| N-12 | **MCP Playground / Sandbox** | Freemium | Build after MCP architecture is solid. |
| N-01 | **MCP Auth-as-a-Service** | Paid ($$/integration) | Massive lock-in. Handles OAuth for all MCP servers. |
| W-11 | **Managed MCP Integrations** | Paid (per integration or bundled) | Context7-like. "Zapier for AI agents." |
| N-13 | **MCP Server Builder** | Freemium | Research what specific value to add beyond proxy. |
| N-04 | **Policy Marketplace** | Paid (per-pack or bundled) | Curated industry-specific policy packs. |

#### TIER 3 — Scale & Ecosystem (Need Users/Data)

| # | Wedge | Free/Paid | Notes |
|---|-------|-----------|-------|
| N-10/11 | **Cross-Agent Correlation + Behavioral Baselines** | Paid | Needs real usage data from design partners. Merge as one capability. |
| N-14 | **White-Label / OEM** | Revenue share | 3-5 platform partnerships vs. 1000 individual customers. |
| N-16 | **Agent Bug Bounty** | Platform fee | Research mechanics. Only if platform features support it naturally. |
| N-20 | **Security Score Badges** | Free (viral marketing) | Need to define what to score and how. |
| N-18 | **Model Provider Partnerships** | — | Worth trying but don't depend on it. |

#### TIER 4 — Revisit Later

| # | Wedge | Status | Reason |
|---|-------|--------|--------|
| N-03/17 | EU AI Act Compliance | Deferred | Small team can't keep up with laws. Focus on core first. |
| N-09 | Agent Dry Run | Rejected | Agents are non-deterministic. Simulated responses unreliable. |
| N-15 | Risk-Based Pricing | Rejected | Non-deterministic = unpredictable bills. Users prefer deterministic pricing. |
| N-19 | Reverse Freemium | Dependent | Only works if product already has traction. |
| N-02 | Agent Certification | Deferred | Interesting but requires established authority first. |

---

### Content & Authority Wedges (Parallel Track — IP-Dependent)

| # | Wedge | Status | Notes |
|---|-------|--------|-------|
| W-01 | **Agent Fail** (incident database) | Building content, not publishing (IP review pending) | Highest leverage authority play. 14+ incidents researched. |
| W-02 | **Blog Content** | LiteLLM post ready. 5+ more planned. | First content to publish when IP-clear. |
| W-03 | **Conference Talks** | Submit CFPs summer 2026 | DEF CON AI Village, BSides, local meetups. |
| W-04 | **YouTube** | Plan: "Agent Fail" video series | Complements blog content. |
| W-05 | **Community Presence** | Not started | LangChain Discord, r/netsec, MLOps Slack. |
| W-06 | **"State of AI Agent Security" Report** | Deferred (high effort) | Massive credibility but time-intensive. |

---

## Free vs. Paid Framework

### The Bootstrap Rule
Every free feature must meet ≥2 of:
1. Drives adoption that directly converts to paid
2. Low marginal cost (doesn't scale costs with users)
3. Creates lock-in for paid features

### Tier Boundaries

| Feature | Free Tier | Paid Tier |
|---------|-----------|-----------|
| MCP routing | ≤3 servers | Unlimited |
| LLM routing | ≤2 providers | Unlimited + fallback + cost routing |
| Security scanning | Basic (injection, credential leak) | Custom patterns, response inspection, policy engine |
| Dashboard | 24h history | 30d+ history |
| Cost tracking | Summary view | Per-agent, per-tool breakdown + alerts + budgets |
| Hooks | Basic allow/deny | Policy-based evaluation |
| Agents | 5 | 25/100/500/unlimited by tier |
| Policy evals | 10K/month | 100K/1M/10M/unlimited by tier |

---

## Proposed New Funnel

```
OLD: Observability → Credential Proxy → Governance

NEW: Routing (free, convenient)
     → Observability (discovered in dashboard)
     → Policy ("oh, I should block that")
     → Governance (paid)
```

**Conversion trigger changes from:**
- Fear: "Your agent is doing dangerous things" (requires security awareness)
- **To convenience**: "One proxy for all your AI traffic" (everyone needs this) → then fear

---

## Novel Wedges Deep Dive

### MCP Auth-as-a-Service (N-01)
**Problem**: MCP OAuth is painful. 10 servers = 10 OAuth configs.
**Play**: User connects once to Rind, Rind manages all upstream OAuth tokens.
**Lock-in**: Moving off Rind = reconfiguring auth for every server.
**Revenue**: Per-integration or bundled in Team+ tiers.

### Agent Replay (N-08)
**Problem**: Agent failed at 3am. What happened?
**Play**: Full execution recording (every tool call, input, response). Replay step by step.
**Unique**: Only possible because Rind sits in the execution path.
**Revenue**: Paid feature.
**Prerequisite**: Full capture mode (record everything, not just policy decisions).

### MCP Playground (N-12)
**Problem**: No safe way to explore MCP servers before connecting.
**Play**: Web-based sandbox to try tools, test calls, see responses — through Rind's security.
**Revenue**: Free (awareness) or freemium.
**Prerequisite**: Solid MCP architecture.

### Policy Marketplace (N-04)
**Problem**: Writing security policies is hard. Most teams don't know what to block.
**Play**: Curated packs ("Healthcare Agent Security", "GitHub Agent Safety").
**Revenue**: Premium packs or bundled in Business/Enterprise tiers.

### White-Label / OEM (N-14)
**Problem**: Agent frameworks (CrewAI, LangGraph, AutoGen) all need security.
**Play**: Embed Rind's engine. "Powered by Rind."
**Revenue**: Per-eval from platforms.
**Potential**: 3-5 partnerships could reach $1M ARR faster than 1000 individual customers.

---

## Product Architecture (All Wedges)

```
+-----------------------------------------------------------+
|                    RIND CONTROL PLANE                      |
+---------------+---------------+--------------+------------+
|  MCP Router   |  LLM Router   |  Auth Layer  |  Hooks     |
|  (freemium)   |  (freemium)   |  (paid)      |  (freemium)|
+---------------+---------------+--------------+------------+
|              SECURITY & POLICY ENGINE                      |
|  Scanning | Policy Eval | Loop Detect | Cost Limits        |
|  (free basic)     (paid advanced)                          |
+-----------------------------------------------------------+
|              OBSERVABILITY & COMPLIANCE                     |
|  Dashboard | Audit Trail | Cost Intelligence | Replay      |
|  (freemium)        (paid)                                  |
+-----------------------------------------------------------+
|              MARKETPLACE & TEMPLATES                        |
|  Policy Packs | Managed Integrations | Agent Templates      |
|  (paid)            (paid per-integration)                   |
+-----------------------------------------------------------+
```

---

## Research Needed

| Question | Method | Priority |
|----------|--------|----------|
| Do developers search for "MCP router" / "MCP gateway"? | Google Trends, keyword research | HIGH |
| Context7 / Smithery / mcp.run pricing models? | Web research, competitor analysis | HIGH |
| Is MCP OAuth painful enough to pay for? | MCP ecosystem research | MEDIUM |
| What is "good enough" LLM routing? Table stakes features? | LiteLLM/Portkey feature comparison | MEDIUM |
| Existing agent certification standards? | Industry research | LOW |

---

## Strategic Decisions Required

| Decision | Options | Dependencies |
|----------|---------|-------------|
| D-04X: Routing as GTM wedge | Accept / Reject / Modify | Strategic council |
| D-04Y: Free vs. Paid framework | Accept / Modify | Pricing research |
| D-04Z: Novel wedge prioritization | Confirm tiers | Market research |
| Update D-041: Capability build order | Add routing to Phase 1 | D-04X approval |
| Update positioning.md | Revise "What We Do NOT Build" | D-04X approval |

---

## How Wedges Feed Each Other

```
Content & Authority ──────────┐
  Agent Fail (authority)       |
  Blogs (SEO)                  |
  Talks (credibility)          |
  YouTube (reach)              |
  Community (trust)            |
                               v
                      AUDIENCE
                               |
                               v
                    PRODUCT LAUNCH
  MCP routing (free, easy)  ─── "just works"
  Claude Code hooks         ─── "2 minutes to install"
  Basic LLM routing         ─── "one proxy for everything"
                               |
                               v
                    DISCOVERY (dashboard)
                               |
                               v
                  "OH SHIT" MOMENT
                               |
                               v
                  PAID CONVERSION
  Policy engine, governance, cost limits
                               |
                               v
                    STICKINESS
  Managed integrations, Auth-as-a-Service
  Agent Replay, Policy Marketplace
                               |
                               v
                    EXPANSION
  White-Label/OEM, Enterprise features
```
