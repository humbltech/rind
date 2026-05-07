# PointGuard AI (formerly AppSOC) — Competitor Profile

**URL**: pointguardai.com
**Founded**: ~2022 (as AppSOC) | Rebranded April 2025
**Funding**: Undisclosed (Crunchbase blocked; not publicly announced)
**Stage**: GA. Version 2.0 launched. MCP Security Gateway announced March 2026.
**Team**: CEO Pravin Kothari. Founders from ArcSight, CipherCloud, RiskVision.

---

## What They Do

Application security posture management (ASPM) platform that expanded into AI security and governance. The MCP Security Gateway is a newer addition to a broader product — they are NOT an AI-native startup. Legacy product (PointGuard AppSOC) still handles traditional ASPM.

## Architecture

**Gateway/platform model** — centralized policy enforcement layer:
- **MCP Security Gateway** — sits in agent-to-tool interaction layer, enforces policies on MCP activity
- **Visibility Layer** — discovers agents, MCP servers, connected tools, maps interactions
- **Runtime Guardrails** — analyzes requests/responses in real-time for prompt injection, unsafe actions, policy violations
- **Contextual Policy Enforcement** — policies applied based on agent role, situational context, behavioral history, business context, asset criticality

**Also includes** (non-MCP):
- AI discovery across Databricks, AWS, Azure
- Static and dynamic model scanning
- Automated red teaming
- ASPM (legacy AppSOC product)

## MCP Security Gateway — Technical Claims

From their March 2026 announcement:
- Zero-trust authorization for MCP connections
- Resource-level access controls
- Runtime guardrails (prompt injection, unsafe actions, policy violations)
- Real-time input/output inspection
- Enterprise identity system integration
- Human-in-the-loop approvals
- "Secure-by-design" governed prompt management

**IMPORTANT**: Claims are from press release. No public technical documentation, API docs, or integration guides found. No GitHub presence. No code examples. Cannot verify depth of implementation.

## Pricing

Not publicly disclosed. Enterprise sales model. Customers include Finastra (major fintech) and Texas Mutual Insurance.

## Strengths

- **Established company** — years of ASPM experience, existing enterprise customer base
- **SC Awards 2025 winner** — Best Supply Chain Security Solution (credibility)
- **Enterprise identity integration** — contextual policies based on agent role + business context
- **Broad AI coverage** — discovery, scanning, red teaming, runtime, governance, compliance
- **Compliance frameworks** — ISO 42001, HIPAA, NIST AI RMF alignment
- **Named enterprise customers** — Finastra, Texas Mutual (real deployments, not just marketing)
- **Founder pedigree** — ArcSight (SIEM pioneer), CipherCloud (CASB), RiskVision

## Weaknesses

- **ASPM company that bolted on AI security** — not AI-native; MCP Gateway is a feature, not the product
- **No public technical documentation** for MCP Gateway — all claims from press releases
- **No open source presence** — closed-source, no community
- **No declarative policy DSL** (policies through platform UI)
- **No session kill-switch** (not mentioned)
- **No loop detection** (not mentioned)
- **No time-window policies** (not mentioned)
- **No credential proxy / phantom tokens** (not mentioned)
- **"First AI security platform with fully integrated MCP Gateway"** — marketing claim that several competitors could contest
- **Rebranding risk** — AppSOC → PointGuard AI transition may confuse market / lose brand equity
- **Technical depth unknown** — cannot distinguish real capabilities from roadmap items

## Relationship to Rind

**Moderate threat — watch closely.** PointGuard's MCP Security Gateway claims overlap with Rind, but the depth of implementation is unverifiable. They have enterprise distribution (existing ASPM customers) but may lack execution-layer depth.

**Where PointGuard may be ahead:**
- Enterprise customer base (existing ASPM relationships)
- Compliance certifications (ISO 42001, HIPAA, NIST)
- Broader AI security coverage (discovery, scanning, red teaming + runtime)
- Contextual policy enforcement (business context + behavioral history)

**Where Rind is ahead:**
- Verified, deep execution-layer capabilities (359 tests, 11 incident scenarios)
- Declarative policy DSL (YAML, version-controlled)
- Session kill-switch
- Loop detection / cost-runaway prevention
- Time-window policies
- Schema drift / tool poisoning detection (verified)
- Open source path
- AI-native (built for this from day 1, not bolted on)

**Key question**: Is PointGuard's MCP Gateway a real product or a press release? Until technical docs appear, treat with skepticism.

## Sources

- [PointGuard AI Website](https://www.pointguardai.com/)
- [MCP Security Gateway Announcement](https://www.pointguardai.com/news/pointguard-ai-unveils-mcp-security-gateway-to-secure-autonomous-ai-agents)
- [AppSOC Rebrand Announcement](https://www.einpresswire.com/article/806494428/appsoc-rebrands-as-pointguard-ai-to-lead-in-comprehensive-ai-application-security)
- [SC Awards 2025 Win](https://www.pointguardai.com/news/pointguard-ai-wins-2025-sc-award-for-best-supply-chain-security-solution)
- [TechEdgeAI Profile](https://techedgeai.com/pointguard-ai-securing-the-full-ai-application-lifecycle-techedgeai/)
- [PointGuard AI Security Governance](https://www.pointguardai.com/ai-security-governance)
