# Aegis — Competitive Positioning

> **Living document.** Update when competitors ship new features, when positioning language is validated or invalidated through customer conversations, or after any strategic-council session that touches product framing.

**Last Updated**: April 18, 2026

---

## What Aegis Is

**The control plane for AI agents.**

One proxy. Four capabilities. Every MCP tool call, API action, and agent decision passes through it.

| Dimension | What It Means | Who It's For |
|-----------|--------------|--------------|
| **Observability** | Full traces of agent activity: tool calls, costs, latency, anomalies, inter-agent communication | Platform/ML engineers |
| **Safety** | Prevent catastrophic actions before they happen: delete guards, cost limits, loop detection, human-in-the-loop gates | Platform engineers, CTOs |
| **Security** | Enforce access policies: MCP auth, rate limiting, anomaly alerting, data exfiltration prevention, audit trail | Security teams, CISOs |
| **MCP Adoption** | Production-ready MCP in minutes: drop-in proxy, auto-configured for LangChain/CrewAI, secure by default | Any engineer evaluating MCP |

The proxy is not four separate products. It is one interception point that makes all four possible simultaneously.

---

## The Core Differentiation

**Everyone else either detects (before the agent acts) or monitors (after the agent acts).**

Aegis sits at the execution layer and controls what agents **can do** — in real time, before actions are taken.

```
BEFORE action:    Prompt filters (Lakera, NeMo Guardrails)
                  ↓ agent acts ↓
DURING action:    ← Aegis sits here → enforce / allow / require approval
                  ↓ action completes ↓
AFTER action:     Observability dashboards (LangSmith, Langfuse, Arize)
```

The proof: the Replit DB deletion, Amazon Kiro outage, $47K agent loop — none were caught by prompt filters. All would have been stopped at the execution layer.

---

## The Five Market Layers

### Layer 1: Prompt Filtering
**What it does**: Scans inputs and outputs for injection, jailbreaks, PII, harmful content. Acts before the agent runs.
**Who owns it**: Lakera (→Check Point), CalypsoAI (→F5), Prompt Security (→SentinelOne), NeMo Guardrails (NVIDIA, open source), Guardrails AI (open source)
**Aegis stance**: Do NOT compete here. This layer is commoditized and consolidated into security giants. The bypass rate for novel attacks is 76-98% — it is necessary but insufficient.

### Layer 2: AI Observability
**What it does**: Traces, logs, cost tracking, evaluation, prompt management. After the agent acts.
**Who owns it**: LangSmith, Langfuse (open source), Arize AI/Phoenix, Helicone, Datadog LLM Obs
**Aegis stance**: Use as the entry point, not the moat. Observability is the "foot in the door" — it generates the "oh shit" moment that converts to paid. But observability alone has no moat (LangSmith/Langfuse are free and well-loved). Differentiate by combining observability with enforcement.

### Layer 3: AI Governance
**What it does**: Policy documentation, compliance frameworks (EU AI Act, ISO 42001, NIST), risk assessment processes. Governance as paperwork, not enforcement.
**Who owns it**: Credo AI, Holistic AI, IBM watsonx.governance, OneTrust
**Aegis stance**: Do NOT compete here. Different buyer (GRC teams, not engineers), different motion (months-long implementation), different value (audit evidence vs. runtime control). Aegis generates the audit trail that governance platforms require — complementary, not competitive.

### Layer 4: Enterprise Security Extensions
**What it does**: AI security features bolted onto existing security platforms. Requires the existing vendor relationship.
**Who owns it**: Palo Alto Prisma AI-SPM, Wiz AI-SPM, Varonis Atlas, Check Point, Cisco, Microsoft Agent 365, Cloudflare AI Gateway, Kong AI Gateway
**Aegis stance**: Do NOT compete directly. These are ecosystem extensions — they only win if the enterprise already uses Palo Alto, Wiz, Microsoft, etc. Aegis is cross-framework and cloud-native. The vulnerability: these tools protect the cloud posture around AI, not the agent's runtime behavior.

### Layer 5: Execution-Layer Control Plane
**What it does**: Intercepts agent actions at the execution layer. Controls tool calls, MCP connections, API access. Combines observability + safety + security + adoption.
**Who owns it**: **Nobody** — this is the gap.
**Aegis stance**: Own this entirely.

---

## Competitor-by-Competitor Map

### Closest Competitors (Watch Closely)

#### Entro Security AGA
**What they do**: MCP activity visibility, agent profiling, identity-centric governance. Built on non-human identity (NHI) expertise.
**Strengths**: MCP-specific, good agent profiling, integrates with EDR
**Weaknesses**: Identity-first framing (not execution control), requires existing security tooling, no developer adoption motion, enterprise-only sales
**Where we beat them**: Developer-first, positive adoption motion, safety + observability, doesn't require EDR integration
**Where they beat us**: Deep identity/NHI expertise, existing enterprise relationships
**Watch for**: If they add execution-layer enforcement or developer SDK, competition intensifies

#### Prompt Security (now SentinelOne)
**What they do**: Endpoint-level MCP monitoring, GenAI visibility, data privacy protection
**Strengths**: MCP server monitoring, per-developer pricing, comprehensive coverage
**Weaknesses**: Acquired — will move upmarket and slow down, enterprise-only DNA of SentinelOne, no execution-layer enforcement
**Where we beat them**: Runtime enforcement (not just monitoring), MCP adoption motion, cross-framework
**Watch for**: SentinelOne integrating Prompt Security into their enterprise platform (will stop competing with us directly, but will close that segment)

#### Microsoft Agent 365
**What they do**: Control plane for Microsoft agents — identity, conditional access, audit, Defender integration
**Strengths**: Deep integration with M365 ecosystem, enterprise credibility, compliance-ready
**Weaknesses**: Microsoft-only (useless if you use LangChain, CrewAI, custom frameworks), new (GA May 2026), requires M365 E7 tier
**Where we beat them**: Every non-Microsoft environment
**Where they beat us**: Any Microsoft-only shop. Don't fight this battle.
**Watch for**: If they open the control plane to third-party frameworks

#### LangSmith (LangChain)
**What they do**: Observability, evaluation, prompt management for LLM/agent applications
**Strengths**: Deep LangChain integration, free tier, strong developer love, self-hosted Enterprise option
**Weaknesses**: No enforcement, no safety rules, no MCP security, no policy engine
**Where we beat them**: Execution-layer control — observability is table stakes, enforcement is the moat
**Key point**: LangSmith is not a competitor to be afraid of. They chose not to do security/enforcement. That is the gap.

### Monitored (Lower Threat)

| Competitor | What They Do | Why Lower Threat |
|------------|-------------|------------------|
| Lakera (Check Point) | Prompt injection firewall | Acquired, moving upmarket, prompt-layer only |
| CalypsoAI (F5) | Red-teaming + detection | Acquired, enterprise/gov focus, no MCP |
| Credo AI | Governance documentation | Different buyer, process tool not runtime |
| Wiz AI-SPM | Cloud posture for AI assets | Cloud-layer, not agent runtime, existing Wiz customers only |
| Cloudflare AI Gateway | Edge proxy with guardrails | Cloudflare-ecosystem only, no MCP security |
| Geordie AI | Agent-native security | Early stage, RSAC 2026 Innovation Sandbox |
| Arcjet | Prompt injection at app boundary | Developer-focused, narrow scope |

---

## What We Do NOT Build (and Why)

| Feature | Why We Don't Build It | Who Does It Better |
|---------|----------------------|-------------------|
| Prompt injection detection from scratch | Bypassable, commoditized, LLM-as-a-judge is unreliable | Lakera, NeMo (integrate, don't rebuild) |
| Cross-platform endpoint agent | 12-18 months minimum, enterprise procurement friction | Partner with EDR vendors |
| AI governance documentation | Different buyer (GRC), 8-12 month sales cycles, Credo AI owns it | Credo AI, IBM |
| Agent identity / NHI management | Giants moving here (Okta, Microsoft, Entro) — avoid | Okta, Entro Security |
| Full SIEM/SOAR | Integration target, not the product | Export to Datadog, Splunk |
| LLM routing / load balancing | Not our value — forward to LiteLLM | LiteLLM, Portkey |

---

## Entry Strategy

### Why Developer-First Works
The enterprise deal structure: **engineer installs → security team evaluates → compliance accelerates → CISO approves**.
The developer must be served first or the deal never starts.

### Three Asymmetric Entry Assets

**1. `npx aegis-scan` — Free MCP Vulnerability Scanner**
- Scans any MCP server config in 60 seconds
- Returns: missing auth, tool poisoning patterns, over-permissioning, rug pull risk
- No signup, no account, immediate value
- Outcome: GitHub stars, HN posts, warm leads who already understand the problem
- *Precedent: Lakera Gandalf (1M users), Snyk (vulnerability database as traffic engine)*

**2. Incident Prevention Content**
- "How the Replit DB deletion would have been prevented with one policy rule"
- "The $47K agent loop: what a cost limit would have cost ($0)"
- "Amazon Kiro outage: why REQUIRE_APPROVAL for production infra matters"
- Search-optimized, shareable, no identity required to publish under Aegis brand
- Outcome: inbound from engineers who had similar near-misses

**3. 2-Line LangChain Integration**
```python
from aegis import AegisPolicyMiddleware
agent = create_react_agent(llm, tools, checkpointer=AegisPolicyMiddleware())
```
- Free tier installs generate "oh shit" moments: unauthorized tool calls, unexpected data access
- The free dashboard shows what's happening — the paid tier stops what shouldn't happen
- Outcome: self-qualifying prospects who have already seen their own problem

### The "Oh Shit" Moment
The conversion trigger is not a sales pitch. It is the moment a free-tier user opens the dashboard and sees:
- "Your agent attempted to call `filesystem.delete` 7 times today"
- "Agent cost this week: $340 (budget: $50)"
- "3 MCP servers connected with no authentication"

That moment creates urgency no sales email can match. The product creates its own leads.

---

## Messaging by Persona

### For Platform/ML Engineers
**Pain**: "I have no idea what my agents are doing in production, and I'm scared to find out"
**Message**: "See everything your agents do. Stop what they shouldn't. One proxy, 10-minute setup."

### For Security Teams
**Pain**: "I can't govern AI agents the same way I govern humans. I have no visibility, no kill switch."
**Message**: "Treat your AI agents like first-class security principals. Audit every tool call. Enforce every policy."

### For CTOs / VPs Engineering
**Pain**: "We want to adopt MCP but we don't know how to do it safely in production"
**Message**: "Production-ready MCP in 10 minutes — with observability, safety guardrails, and security built in."

### For Compliance / GRC
**Pain**: "EU AI Act enforcement starts August 2026. I need an audit trail for every agent action."
**Message**: "Complete, tamper-evident audit trail for every tool call, MCP connection, and agent decision. Export to your existing compliance tools."

---

## Developer Discovery Strategy

> How developers find Aegis without founder identity. All assets operate under the Aegis brand.

### The Flywheel

```
[Incident posts / SEO] → [Install aegis-sdk] → ["Oh shit" moment] → [Paid conversion]
         ↑                                                                    |
         └────────────────────── [Word of mouth] ──────────────────────────┘
```

### Discovery Assets (In Build Priority Order)

**1. `npx aegis-scan` — Free MCP Vulnerability Scanner** (H1, Day 1)
- Scans any MCP server config in 60 seconds, no signup
- Returns: missing auth, tool poisoning patterns, over-permissioning, rug pull risk, version pinning
- Distributable: `npx aegis-scan ./mcp-config.json` — paste in any README
- GitHub stars target: 500 in month 1 (via HN, LangChain Discord, Reddit)
- Precedent: Lakera Gandalf (1M users), Snyk CLI (vulnerability database flywheel)

**2. Incident Prevention Content** (H1, Week 2+)
SEO-optimized posts, no identity required, published under Aegis brand:
- **"The LiteLLM supply chain attack: what it means for your agent stack"** — PRIORITY #1 (March 2026 incident, 938 HN points, 171M monthly downloads affected, still active). Frame: Aegis detects unsigned/unverified MCP servers — same risk vector as a compromised PyPI package.
- "How the Replit DB deletion would have been prevented with one policy rule"
- "The $47K agent loop: what a cost limit would have cost ($0)"
- "Amazon Kiro outage: why REQUIRE_APPROVAL for production infra matters"
- "MCP server rug pulls: what they are and how to prevent them"
- "MCP has 217 million monthly downloads. Who's securing it?" — awareness/SEO

**3. 2-Line LangChain Integration** (H1, Day 1)
```python
from aegis import AegisSDK
tools = AegisSDK().wrap(tools)
```
- Free tier reveals unexpected agent behavior → creates urgency → converts to paid
- Published to PyPI (`aegis-sdk`) and npm (`@aegis/sdk`) on day one
- Searchable: "langchain agent guardrails", "langchain cost limit", "mcp security python"

### SEO / Discovery Keywords

| Intent | Keyword | Volume Signal |
|--------|---------|--------------|
| Problem-aware | "langchain agent out of control" | High |
| Problem-aware | "ai agent cost runaway" | High |
| Solution-aware | "mcp security proxy" | Growing |
| Solution-aware | "langchain agent guardrails" | Medium |
| Solution-aware | "ai agent audit trail" | Medium |
| Product-aware | "aegis mcp proxy" | Low (grow to high) |
| Comparison | "langsmith vs aegis" | Low (grow) |

### Package Names (Searchable, Memorable)
- Python: `aegis-sdk` on PyPI
- Node: `@aegis/sdk` on npm
- CLI: `aegis-scan` (npx executable)
- Proxy: `aegis-proxy` (Docker Hub, Helm chart)

### Community Presence (Brand-Only, No Founder Identity)
| Channel | Handle | Strategy |
|---------|--------|---------|
| GitHub | `aegis-dev` org | Open source scanner + SDK; issues as support channel |
| Twitter/X | `@AegisDev` | Incident analysis posts, product updates |
| HN | Posts as "Aegis team" | "Show HN: Free MCP vulnerability scanner" |
| LangChain Discord | `aegis-dev` bot + community member | Answer questions, never spam |
| Reddit r/MachineLearning, r/LocalLLaMA | Posts as `AegisDev` | Incident analysis, not product pitches |

### Landing Page Flow
```
[Hero]: "Stop your agent before it breaks production"
  ↓
[Problem]: 3 real incidents (Replit, $47K loop, Kiro) — all execution-layer failures
  ↓
[Solution]: One proxy. Four capabilities. Demo dashboard screenshot.
  ↓
[CTA]: "Install in 2 lines" → shows code snippet → free tier signup
  ↓
["Oh shit" moment in 5 minutes]: first tool call appears in dashboard
  ↓
[Upgrade prompt]: "You've seen what your agents do. Control it."
```

### Design Partner Outreach (No Identity)
- Typeform: "Request early access" → email-based async qualification
- Questions: What framework? What deployment? What's your biggest agent concern?
- 10 design partners before launch, each gets custom onboarding call (async video or email)
- No cold outreach using personal identity

---

## Competitive Intelligence Triggers

Update this document immediately if any of the following occur:

| Signal | What It Means | Response |
|--------|--------------|----------|
| Entro AGA releases developer SDK | Direct competition begins | Accelerate developer adoption assets |
| LangSmith adds policy enforcement | Biggest observability player enters our space | Compete on MCP depth, safety rules, cross-framework |
| Microsoft opens Agent 365 to non-MS frameworks | Giant enters our market | Niche down to LangChain/CrewAI community; emphasize openness |
| Funded startup enters "MCP adoption platform" framing | Category competition | Ship faster; establish community/open source first |
| Any $50M+ raise in execution-layer enforcement | Market validated; race begins | Accelerate launch; prioritize design partners |
