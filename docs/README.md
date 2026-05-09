# Rind Documentation Index

**Last Updated:** May 2026

---

## Start Here

| Document | Purpose |
|----------|---------|
| [Strategic Analysis](./strategic-analysis.md) | Living decision log — read this first |
| [Product Vision](./product/vision.md) | Mission, goals, target market |
| [Product Spec](./product/product-spec.md) | Core product architecture and scope |
| [Competitive Positioning](./competitive/positioning.md) | Market layers, messaging by persona |

---

## Documentation Structure

```
docs/
├── strategic-analysis.md          ← Living decision log (primary reference)
│
├── strategy/                      ← Strategic planning
│   ├── technical-strategy.md      ← Build vs. integrate decisions, roadmap
│   ├── gtm-strategy.md            ← Go-to-market approach
│   ├── wedge-strategy.md          ← 28+ wedges evaluated
│   ├── mvp-roadmap.md             ← 12-week development plan
│   ├── pricing-strategy.md        ← Pricing tiers and positioning
│   ├── design-partner-strategy.md ← Design partner approach
│   ├── strategic-summary.md       ← High-level summary
│   ├── strategy.md                ← Strategy overview
│   └── demo-script.md             ← Demo talking points
│
├── product/                       ← Product definition
│   ├── vision.md                  ← Mission, goals, target market
│   ├── product-spec.md            ← Complete product specification
│   ├── policy-dsl.md              ← Policy language reference
│   ├── use-case-scenarios.md      ← Use cases by persona
│   ├── hook-expansion-plan.md     ← Claude Code hook integration plan
│   ├── ui-guidelines.md           ← Design language and UI standards
│   ├── agent-deployment-patterns.md ← How agents are deployed, "wow" install flows
│   ├── enterprise-deployment-guide.md ← CISO/IT: install, MDM, network enforcement, FAQ
│   └── coverage-matrix.md         ← D-040 Phase A coverage tracking
│
├── competitive/                   ← All competitive intelligence
│   ├── positioning.md             ← Market layers, messaging by persona
│   ├── competition.md             ← 40+ competitor landscape
│   ├── competitive-coverage-matrix.md ← Feature comparison across vendors
│   ├── defensibility-analysis.md  ← Moat analysis
│   ├── emerging-players.md        ← New entrants to watch
│   ├── targeted-opportunities.md  ← Gaps and attack vectors
│   ├── competitor-deep-dive-framework.md ← Framework for quarterly analysis
│   ├── community-intelligence-report.md ← Community signal mining
│   ├── community-research.md      ← Community feedback
│   ├── profiles/                  ← Individual competitor deep dives
│   │   ├── aembit.md
│   │   ├── api-stronghold.md
│   │   ├── bifrost.md
│   │   ├── check-point-lakera.md
│   │   ├── geordie-ai.md
│   │   ├── lasso-security.md
│   │   ├── ms-toolkit.md
│   │   ├── noma-security.md
│   │   ├── operant-ai.md
│   │   ├── pointguard-ai.md
│   │   └── straiker.md
│   └── _snapshots/                ← Dated competitive snapshots
│       ├── competitive-landscape-april-21.md
│       ├── competitor-deep-dive.md
│       └── competitive-analysis-lakera-2026.md
│
├── architecture/                  ← System design and ADRs
│   ├── architecture-decisions.md  ← AD-001 through AD-009
│   └── _archived/
│
├── simulation/                    ← Simulation docs
│   ├── simulation-quickstart.md
│   ├── simulation-scenarios.md
│   ├── simulation-strategy.md
│   ├── simulation-technical-specs.md
│   ├── simulation-how-to-run.md
│   ├── simulation-standalone.md
│   └── simulation-companies.md
│
├── research/                      ← Market research and signals
│   ├── agent-incidents/           ← Real incident research
│   ├── competitors/               ← Raw competitive data (stats, HN)
│   ├── design-partner-signals/    ← Public signal mining
│   ├── content/                   ← Content drafts
│   ├── market-research.md
│   ├── user-pain-points.md
│   ├── enterprise-ai-agent-deployment-patterns.md
│   ├── case-studies-incident-prevention.md
│   ├── market-targeting-rsac-2026.md
│   └── simulation-archive/        ← Archived pre-April-2026 simulation data
│
├── private/                       ← Sensitive business docs
│
└── _plans/                        ← Dated session plans and design specs
    ├── plans/
    └── specs/
```

---

## Key Documents by Topic

### Strategy

| Document | Key Content |
|----------|-------------|
| [Strategic Analysis](./strategic-analysis.md) | All decisions D-001 through D-047, open questions |
| [Technical Strategy](./strategy/technical-strategy.md) | Build vs. integrate decisions, 90-day plan |
| [GTM Strategy](./strategy/gtm-strategy.md) | Go-to-market motion, channels |
| [Wedge Strategy](./strategy/wedge-strategy.md) | MCP routing wedge, 28+ options evaluated |
| [MVP Roadmap](./strategy/mvp-roadmap.md) | 12-week plan |

### Product

| Document | Key Content |
|----------|-------------|
| [Product Spec](./product/product-spec.md) | Vision, architecture, pricing, MVP scope |
| [Policy DSL](./product/policy-dsl.md) | Complete policy language spec |
| [Hook Expansion Plan](./product/hook-expansion-plan.md) | D-040 endpoint agent integration |
| [Enterprise Deployment Guide](./product/enterprise-deployment-guide.md) | One-command install, MDM enforcement, network blocking, CISO FAQ |

### Competitive

| Document | Key Content |
|----------|-------------|
| [Positioning](./competitive/positioning.md) | 6 market layers, differentiation, messaging |
| [Competition](./competitive/competition.md) | Full 40+ competitor landscape |
| [Coverage Matrix](./competitive/competitive-coverage-matrix.md) | Feature-by-feature vendor comparison |
| [Competitor Profiles](./competitive/profiles/) | Individual deep dives (11 vendors) |

### Research

| Document | Key Content |
|----------|-------------|
| [Case Studies](./research/case-studies-incident-prevention.md) | Replit DB, Kiro outage, EchoLeak, $47K loop |
| [Market Targeting](./research/market-targeting-rsac-2026.md) | ICP, RSAC 2026 findings |
| [Design Partner Signals](./research/design-partner-signals/) | Public signal mining |
| [Agent Incidents](./research/agent-incidents/) | Incident research 2026 |
