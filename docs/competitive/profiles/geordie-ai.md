# Geordie AI — Competitor Profile

**URL**: geordie.ai
**Founded**: Early 2025 | **Funding**: $6.5M seed (General Catalyst, Salesforce Ventures)
**Stage**: Early. Won RSAC 2026 Innovation Sandbox + Black Hat Europe 2025 Startup Spotlight.
**Team**: Founders from Darktrace and Snyk (Hanah-Marie Darley, Henry Comfort, Benji Weber)

---

## What They Do

Agent-native governance and behavioral security platform. Discovers agents across the enterprise, monitors behavior, and uses proprietary "Beam" engine to guide agent decisions in real-time through context injection.

## Architecture

NOT a proxy. NOT an MCP gateway. Operates at the behavioral layer.

Multi-vantage-point collection via:
- **SSO** (identity providers)
- **Endpoints** (developer machines, coding environments)
- **APIs** (cloud platforms, code repositories)

**Beam** works by "context engineering" — continuously assessing an agent's risk posture, then injecting contextual security policies and guidance back to the agent. Behavioral steering, not protocol-level blocking.

## Key Distinction

Geordie explicitly differentiates from "protocol-layer tool mediation" (proxies/gateways). They govern at the behavioral layer — modifying the agent's context so it avoids risky actions rather than blocking actions at the wire.

**Fundamental limitation**: This depends on the agent following the guidance. A compromised or adversarial agent can ignore Beam's context injections. Same weakness as prompt-level security.

## Strengths

- RSAC Innovation Sandbox winner — massive enterprise credibility
- Agent discovery across entire enterprise (shadow agents in code, cloud, SaaS, endpoints) — no one else does this
- Framework and protocol agnostic (works with non-MCP agents)
- Darktrace DNA — founding team knows behavioral AI security and CISO sales
- Multi-agent workflow visibility

## Weaknesses

- Cannot hard-block anything — behavioral steering only
- No MCP awareness at all (not mentioned once in materials)
- No execution-layer enforcement
- Technical details extremely thin — zero code examples, API docs, or architecture diagrams
- Early stage ($6.5M seed)
- Governance, not security — attacker exploiting a tool call won't be stopped by context

## Relationship to Rind

**Complementary, not competitive.** Geordie discovers and governs at the behavioral layer. Rind enforces at the execution layer. A "Geordie discovers → Rind enforces" story could be powerful. Different buyers within the same enterprise (governance team vs security engineering team).

## Sources

- [Geordie AI Product](https://www.geordie.ai/product)
- [Geordie How It Works](https://www.geordie.ai/how-it-works)
- [RSAC Innovation Sandbox Win](https://www.rsaconference.com/library/press-release/2026-isb-winner)
- [General Catalyst Investment](https://www.generalcatalyst.com/stories/seeding-the-future-with-geordie)
