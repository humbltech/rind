# Aegis Documentation Index

**Last Updated:** April 2026

---

## Quick Links

| Document | Purpose |
|----------|---------|
| [Product Spec](./product-spec.md) | Core product vision, architecture, pricing |
| [Technical Strategy](./technical-strategy.md) | Build vs. integrate decisions, roadmap |
| [Policy DSL](./policy-dsl.md) | Complete policy language reference |

---

## Documentation Structure

```
aegis/docs/
├── README.md                          ← You are here
├── product-spec.md                    ← Core product specification
├── technical-strategy.md              ← Technical decisions & roadmap
├── policy-dsl.md                      ← Policy language reference
├── gtm-strategy.md                    ← Go-to-market strategy
├── design-partner-strategy.md         ← Design partner approach
├── user-pain-points.md                ← Customer research
├── ideas.md                           ← Feature ideas backlog
│
├── architecture/
│   ├── README.md                      ← Architecture overview
│   ├── human-in-the-loop.md          ← HITL approval workflow spec
│   ├── tool-discovery-policy-generation.md ← Auto-discovery & AI policies
│   ├── sdk-langchain.md               ← LangChain integration
│   └── data-models.md                 ← Database schema
│
└── simulation/
    ├── simulation-strategy.md         ← Simulation approach
    ├── simulation-scenarios.md        ← Test scenarios
    └── simulation-technical-specs.md  ← Simulation tech details

aegis/research/
├── competitive-analysis-lakera-2026.md    ← Lakera deep dive (new)
├── market-targeting-rsac-2026.md          ← Market analysis (new)
├── case-studies-incident-prevention.md    ← Real incidents & prevention (new)
├── enterprise-ai-agent-deployment-patterns.md ← Enterprise research
└── community-research.md                   ← Community feedback
```

---

## Key Documents by Topic

### Market & Strategy

| Document | Key Content |
|----------|-------------|
| [Market Targeting](../research/market-targeting-rsac-2026.md) | Why mid-market, not SMB. ICP definitions. |
| [Competitive Analysis](../research/competitive-analysis-lakera-2026.md) | Lakera features, Check Point acquisition impact |
| [Case Studies](../research/case-studies-incident-prevention.md) | Real incidents, how Aegis prevents them |
| [GTM Strategy](./gtm-strategy.md) | Go-to-market approach |

### Product & Architecture

| Document | Key Content |
|----------|-------------|
| [Product Spec](./product-spec.md) | Vision, architecture, pricing, MVP scope |
| [Human-in-the-Loop](./architecture/human-in-the-loop.md) | HITL approval workflow design |
| [Tool Discovery](./architecture/tool-discovery-policy-generation.md) | Auto-discovery, AI policy generation, packs |
| [Policy DSL](./policy-dsl.md) | Complete policy language spec |

### Technical

| Document | Key Content |
|----------|-------------|
| [Technical Strategy](./technical-strategy.md) | Build vs. integrate, 90-day plan |
| [SDK - LangChain](./architecture/sdk-langchain.md) | LangChain integration spec |
| [Data Models](./architecture/data-models.md) | Database schema |

---

## Recent Updates (April 2026)

### New Documents

1. **[competitive-analysis-lakera-2026.md](../research/competitive-analysis-lakera-2026.md)**
   - Lakera technical specs (98% detection, <50ms latency)
   - Check Point acquisition analysis ($300M)
   - Feature gap analysis (where Aegis differentiates)
   - Pricing comparison

2. **[market-targeting-rsac-2026.md](../research/market-targeting-rsac-2026.md)**
   - RSAC 2026 key findings (Zscaler ThreatLabz)
   - Why SMB is risky, mid-market is the sweet spot
   - ICP definitions for both target segments
   - Budget benchmarks ($1,200-2,500/employee/year)

3. **[case-studies-incident-prevention.md](../research/case-studies-incident-prevention.md)**
   - Replit production database deletion
   - Amazon Kiro 13-hour outage
   - EchoLeak zero-click data exfiltration
   - $47K agent infinite loop
   - ROI calculator (18x return)

4. **[human-in-the-loop.md](./architecture/human-in-the-loop.md)**
   - Complete HITL architecture
   - Slack/email notification design
   - Database schema for approvals
   - Timeout handling
   - Security considerations

5. **[tool-discovery-policy-generation.md](./architecture/tool-discovery-policy-generation.md)**
   - Tool discovery from LangChain, MCP, OpenAI
   - Tool catalog structure
   - AI policy generation pipeline
   - Policy packs (SQL, filesystem, etc.)
   - Human review workflow

### Updated Documents

1. **[product-spec.md](./product-spec.md)**
   - Added RSAC 2026 market context
   - Added catastrophic action prevention as P0
   - Updated pricing for mid-market focus
   - Added self-hosted model support architecture
   - Added real incident references

2. **[policy-dsl.md](./policy-dsl.md)**
   - Added policy packs reference
   - Added tool catalog section
   - Updated version to 1.1

---

## Core Concepts

### Policy Layers (Hybrid Approach)

```
LAYER 3: Simple Toggles (90% of users)
         "Enable production database protection" [ON/OFF]

LAYER 2: Pre-built Packs (power users)
         SQL Pack, Filesystem Pack, Payment Pack, etc.

LAYER 1: Custom DSL (advanced users)
         Full policy language for unique requirements
```

### Tool Discovery Flow

```
Agent Connects → Discover Tools → Classify (Catalog or AI)
                                        │
                        ┌───────────────┴───────────────┐
                        │                               │
                  Catalog Match                   AI Generated
                        │                               │
                        ▼                               ▼
                 Auto-apply policy            Human review required
```

### Risk Tiers

| Tier | Risk | Control | Examples |
|------|------|---------|----------|
| 0 | Low | ALLOW | Read operations, list, get |
| 1 | Medium | ALLOW + Audit | Write, create, update |
| 2 | High | REQUIRE_APPROVAL | Delete, bulk operations |
| 3 | Critical | DENY or REQUIRE_APPROVAL (2 approvers) | DROP, shell exec |

---

## Key Differentiators

### Aegis vs. Lakera

| Capability | Lakera | Aegis |
|------------|--------|-------|
| Prompt injection | ✅ Yes | ✅ Integrate |
| Tool call control | ❌ No | ✅ **Yes** |
| Human-in-the-loop | ❌ No | ✅ **Yes** |
| MCP security | ❌ No | ✅ **Yes** |
| Cost controls | ❌ No | ✅ **Yes** |
| Auto-discovery | ❌ No | ✅ **Yes** |
| AI policy generation | ❌ No | ✅ **Yes** |

---

## Getting Started

1. **Understand the product**: Read [Product Spec](./product-spec.md)
2. **See the market opportunity**: Read [Market Targeting](../research/market-targeting-rsac-2026.md)
3. **Understand competition**: Read [Competitive Analysis](../research/competitive-analysis-lakera-2026.md)
4. **See real-world value**: Read [Case Studies](../research/case-studies-incident-prevention.md)
5. **Dive into architecture**: Read [HITL](./architecture/human-in-the-loop.md) and [Tool Discovery](./architecture/tool-discovery-policy-generation.md)
