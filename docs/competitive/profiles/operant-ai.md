# Operant AI — Competitor Profile

**URL**: operant.ai
**Funding**: Undisclosed | **Stage**: GA, SOC 2 Type II, 5 Gartner reports
**Key credibility**: Discovered Shadow Escape zero-click MCP exploit (Oct 2025)

---

## What They Do

Runtime security platform with three products:
1. **AI Gatekeeper** — Original product. Runtime AI protection, Kubernetes-native.
2. **MCP Gateway** — Dedicated MCP security: discovery, detection, defense with trust zones.
3. **Agent Protector** (Feb 2026) — Shadow agent discovery + secure dev enclaves + observability + behavioral threat detection + zero trust enforcement.

## Architecture

"3D Runtime Defense": Discovery → Detection → Defense. Operates inside the AI runtime, deployed inline. Kubernetes-native originally, expanding to hybrid/private cloud. MCP Gateway implements trust zones with real-time blocking.

Identity-aware enforcement via Okta Integration Network for NHI (non-human identity) management.

## MCP Capabilities

- Dedicated MCP Gateway product
- Trust zones with real-time blocking for MCP tool calls
- Tool poisoning detection with continuous trust scoring
- Registry of MCP clients, tools, and servers
- Shadow Escape research demonstrates deep MCP attack surface understanding

## Strengths

- Deepest MCP security expertise (Shadow Escape discovery)
- 5 Gartner reports — extraordinary for a startup
- Real runtime enforcement with active blocking
- Okta NHI integration — only competitor with verified IdP integration for agents
- Broadest product surface (K8s security + MCP Gateway + Agent Protector)
- Freemium model for developer adoption
- SOC 2 Type II compliant

## Weaknesses

- Product sprawl risk (3 products with overlapping capabilities)
- K8s-native origin limits non-K8s reach
- No declarative policy DSL — platform-configured trust zones
- No session kill-switch documented
- No time-window policies
- No credential injection / phantom tokens (handles identity, not credentials)
- Technical architecture details are thin — no public docs on how enforcement works
- Open source repo is offensive tooling (7 stars), not defensive product

## Where Operant Is Ahead of Rind

- MCP attack research credibility (Shadow Escape)
- Gartner recognition (5 reports)
- Okta identity integration (verified)
- K8s runtime security heritage
- Broader product coverage
- SOC 2 Type II certification
- Production customers

## Where Rind Is Ahead of Operant

- Declarative YAML policy DSL (transparent, auditable)
- Session kill-switch (implemented, tested)
- Loop detection (built into pipeline)
- Time-window policies
- Single focused product vs 3-product sprawl
- Open architecture (359 tests, 11 scenarios visible)

## Key Positioning Against Operant

"Operant builds platforms. Rind builds a proxy. Our policy engine is a YAML file you version-control and audit. Their enforcement is configured in a platform UI you don't own. For security teams that need to explain exactly why an action was blocked, transparency matters."

## Evidence Quality

| Claim | Verification |
|---|---|
| Shadow Escape exploit | Verified — full technical writeup |
| Real-time MCP blocking | Verified — multiple product pages |
| 5 Gartner reports | Verified — specific report names listed |
| Okta NHI integration | Verified — dedicated blog post |
| Tool poisoning detection | Claimed — mechanism not described |
| SOC 2 Type II | Verified — stated on homepage |

## Sources

- [Operant AI Homepage](https://www.operant.ai/)
- [Operant MCP Gateway](https://www.operant.ai/solutions/mcp-gateway)
- [Operant Shadow Escape](https://www.operant.ai/art-kubed/shadow-escape)
- [Operant Agent Protector Launch](https://www.globenewswire.com/news-release/2026/02/05/3233044/)
- [Operant Okta Integration](https://www.operant.ai/art-kubed/zero-trust-for-ai-agents-operants-mcp-gateway-comes-to-the-okta-integration-network)
