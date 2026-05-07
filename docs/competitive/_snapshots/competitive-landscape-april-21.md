# Competitive Landscape — Deep Dive (April 21, 2026)

> This document captures the findings from the "Why is nobody doing this?" research sprint. It corrects several assumptions from the March-April 2026 competitive analysis and identifies direct competitors that were previously missed or underinvestigated.

## Critical Finding: Layer 5 Is NOT Empty

The central claim in `positioning.md` — "Nobody occupies Layer 5 (Execution-Layer Control Plane)" — is **incorrect as of April 2026**. Multiple companies are shipping runtime enforcement at the tool-call/MCP layer.

---

## Direct Competitors (Previously Missed or Underinvestigated)

### Operant AI — CLOSEST ARCHITECTURAL ANALOG

| Dimension | Details |
|-----------|---------|
| **Product** | AI Gatekeeper (runtime protection) + MCP Gateway (MCP-specific enforcement) |
| **Architecture** | Kubernetes-native agent via Helm chart. Sits between AI applications and MCP servers. |
| **MCP enforcement** | Yes — real-time blocking, trust scoring, auto-redaction of PII, least-privilege execution controls |
| **Shipping since** | MCP Gateway: June 2025. Agent Protector: February 2026. |
| **Funding** | ~$13.5M (Seed $3M Apr 2023, Series A ~$10M Sep 2024) |
| **Team** | ~42 employees. Founders: Vrajesh Bhavsar (CEO), Priyanka Tembey (CTO) |
| **Recognition** | Featured in 5 Gartner reports (AI TRiSM, API Protection, MCP Gateways, K8s Runtime) |
| **Discovery** | Shadow Escape zero-click MCP exploit disclosure (Oct 2025) |
| **Limitations** | **K8s-only** — requires Kubernetes deployment. No developer self-serve. Enterprise-only GTM. No public pricing. |
| **Threat level** | **HIGH** — closest to Rind's architecture. Head start on MCP enforcement. |

**Key difference from Rind**: Operant is K8s-native (Helm chart deployment), not a standalone proxy. This limits reach to teams already running Kubernetes. Their broader positioning is "cloud runtime security" — AI/MCP is one feature among many.

---

### Straiker — TELEMETRY-FIRST WITH RUNTIME CLAIMS

| Dimension | Details |
|-----------|---------|
| **Product** | Discover AI (inventory), Ascend AI (red-teaming), Defend AI (runtime guardrails) |
| **Architecture** | Multi-mode: SDK traces (OTLP), eBPF sensor, proxy log ingestion, browser extension, gateway, MCP server component |
| **MCP enforcement** | Has MCP server component ("drop the server into your runtime and update your system prompt with our directives"). NOT an inline proxy — requires agent to call Straiker's MCP server. |
| **Shipping since** | Launch: March 2025 |
| **Funding** | $21M from Lightspeed and Bain Capital Ventures |
| **Team** | ~40 employees. Founders: Ankur Shah (ex-SVP Prisma Cloud, Palo Alto), Sreenath Kurupati (ex-VP AI, Akamai) |
| **Customers** | Fortune 50 telecom, Fortune 500 e-commerce, frontier AI labs. 8x growth in 6 months. Multiple 6-7 figure deals. |
| **Performance** | <300ms agentic threats, <130ms classic threats |
| **Limitations** | Telemetry-first architecture (collect → analyze → act), not inline enforcement. MCP server component requires app-level changes (update system prompts). Not transparent to agents. |
| **Threat level** | **MEDIUM-HIGH** — strong enterprise traction and pedigree. Fundamentally different architecture (not inline proxy). |

**Key difference from Rind**: Straiker's MCP approach adds a Straiker MCP server to the agent runtime — the agent must know about Straiker. Rind's proxy is transparent. Straiker's 300ms latency vs Rind's <5ms target reflects this — they're doing ML analysis on collected signals, not making inline pass/fail decisions.

---

### Lasso Security — BROADER BUT SHALLOWER AT MCP LAYER

| Dimension | Details |
|-----------|---------|
| **Product** | AI Security Platform + open-source MCP Gateway |
| **Architecture** | Python MCP proxy (OSS) + commercial cloud platform (AI-SPM, shadow AI discovery, compliance) |
| **MCP enforcement** | Yes via MCP Gateway — sits inline, plugin-based guardrails (Presidio for PII, sanitization). Basic enforcement compared to Rind's depth. |
| **Shipping since** | MCP Gateway: April 2025 |
| **Funding** | ~$21M across 3 rounds. Samsung Next, ClearSky Security, CyberArk Ventures. |
| **Team** | ~50 employees. Founded 2023, Tel Aviv. |
| **GitHub** | 365 stars, 28 forks (MCP gateway) |
| **Limitations** | MCP gateway is one feature of broader platform. Enforcement is plugin-based and thin (PII + sanitization, no schema drift, loop detection, or deep response inspection). Python-based. |
| **Threat level** | **MEDIUM** — overlapping but shallower. If they invest heavily in deepening MCP Gateway, could become serious. |

**Key difference from Rind**: Lasso's MCP gateway is a loss leader for their enterprise AI-SPM platform. It's broader (shadow AI, compliance, posture management) but shallower at the MCP/tool-call layer. Rind is narrower but deeper.

---

### Microsoft Agent Governance Toolkit — MASSIVE DISTRIBUTION THREAT

| Dimension | Details |
|-----------|---------|
| **Product** | Open-source (MIT) toolkit: Agent OS policy engine + 7 independent packages |
| **Architecture** | SDK-based (not proxy). Stateless policy engine. Supports YAML + OPA Rego + Cedar policies. |
| **Enforcement** | Yes — policy evaluation on tool calls. <0.1ms p99 latency. |
| **Released** | April 2, 2026 (19 days old as of this writing) |
| **Frameworks** | LangChain, CrewAI, Google ADK, LlamaIndex, LangGraph, PydanticAI |
| **Languages** | Python, TypeScript, .NET, Rust, Go |
| **Limitations** | SDK-based (in-process, theoretically bypassable). Microsoft aspires to move to a foundation. No hosted service. No MCP-specific features. |
| **Threat level** | **HIGH** — free, MIT-licensed, massive distribution. First toolkit claiming all 10 OWASP agentic AI risks. |

**Key difference from Rind**: SDK-based enforcement runs in-process and can theoretically be bypassed by the agent or compromised code. Proxy-based enforcement (Rind) cannot be bypassed — it's in the network path. However, Microsoft's multi-framework, multi-language support and MIT license give it enormous adoption potential.

---

### Datadog AI Guard — INCUMBENT DISTRIBUTION

| Dimension | Details |
|-----------|---------|
| **Product** | AI Guard with Prompt Protection + Tool Protection |
| **Architecture** | SDK-based (dd-trace integration). Monitor-only → blocking mode. |
| **Enforcement** | Yes — examines "the full chain of activity from system prompt to user messages to previous actions" |
| **Released** | February 2026 (Preview) |
| **Limitations** | Requires Datadog. SDK-based (in-process). Python/Ruby/JS/Java only. |
| **Threat level** | **HIGH** — 26,800+ existing customer base. Frictionless upsell for existing Datadog users. |

---

### Cisco AI Defense — ENTERPRISE MOTION

| Dimension | Details |
|-----------|---------|
| **Product** | Agent Runtime SDK with monitor/enforce modes |
| **Architecture** | SDK-based. Supports AWS Bedrock, Google Vertex, Azure AI Foundry, LangChain. |
| **Released** | RSAC March 2026 |
| **Limitations** | Enterprise-only. SDK-based. |
| **Threat level** | **MEDIUM** — enterprise-only motion, no developer self-serve. |

---

## Confirmed NOT Direct Competitors

### Geordie AI — GOVERNANCE + OBSERVABILITY, NOT INLINE ENFORCEMENT

RSAC 2026 Innovation Sandbox winner. $12M funding. Darktrace/Snyk pedigree.

**Architecture**: NOT a proxy. NOT an SDK. Uses SSO/identity integration, endpoint monitoring, API connections. Deploys "lightweight collection components" for behavioral event capture.

**Enforcement mechanism**: "Context engineering" via Beam — feeds policy-derived context back into agent reasoning to steer decisions. Can block, but primary mechanism is guidance, not interception.

**MCP-specific**: No public evidence of MCP-specific integration. Protocol-agnostic.

**Verdict**: Layer 2+3 (observability + governance), not Layer 5. Could be a partner (Geordie discovers + monitors, Rind enforces).

### Bifrost (by Maxim AI) — LLM API ROUTER, NOT SECURITY

Open-source Go LLM gateway. Routes requests to 20+ LLM providers. The "11 microsecond governance" is access controls and rate limiting — not security enforcement. Same category as Portkey/LiteLLM.

**Verdict**: Not a competitor. Different category entirely.

---

## Revised Competitive Map

| Company | Architecture | MCP-Native? | Inline Enforcement? | Developer Self-Serve? | Latency |
|---------|-------------|-------------|---------------------|----------------------|---------|
| **Rind** | Standalone proxy | Yes (core) | Yes (network path) | Yes (target) | <5ms target |
| **Operant AI** | K8s agent (Helm) | Yes (MCP Gateway) | Yes | No | Not published |
| **Straiker** | Multi-mode (SDK, eBPF, MCP server) | Partial (MCP server add-on) | Unclear (telemetry-first) | No | <300ms |
| **Lasso Security** | Python proxy (OSS) + SaaS | Yes (MCP Gateway) | Yes (basic) | Partial (OSS) | Not published |
| **Microsoft AGT** | SDK (in-process) | No | Yes (bypassable) | Yes (MIT, free) | <0.1ms |
| **Datadog AI Guard** | SDK (dd-trace) | No | Yes (bypassable) | No (requires Datadog) | Not published |
| **Cisco AI Defense** | SDK | No | Yes (bypassable) | No | Not published |

---

## What This Changes

1. **"Nobody occupies Layer 5"** → FALSE. At least 3 companies ship execution-layer enforcement (Operant, Lasso, Straiker). 3 more ship SDK-based enforcement (Microsoft, Datadog, Cisco).
2. **Rind's positioning must shift** from "we're the only ones" to "we do it differently and better" — specifically: cross-platform proxy (not K8s-only), developer-first (not enterprise-only), transparent to agents (not SDK-based/bypassable), deepest MCP protocol understanding.
3. **The market is validated** — 6+ companies entering in Q1 2026 confirms the need exists. This is good news for Rind's thesis.
4. **First-mover advantage** is about accumulated usage data and workflow embedding, not technology. The proxy itself is commoditized.

---

## Sources

All findings verified via web search on April 21, 2026. Key sources:
- Operant AI: operant.ai, Gartner recognition announcements, CrunchBase, Shadow Escape disclosure
- Straiker: straiker.ai product pages, blog posts, MCP server announcement, $21M launch PR
- Lasso Security: lasso.security, GitHub (mcp-gateway), CrunchBase, AWS Marketplace listing
- Microsoft AGT: GitHub release (April 2, 2026), documentation
- Datadog AI Guard: Datadog blog (February 2026)
- Geordie AI: geordie.ai, RSAC 2026 PR, Beam launch announcement, General Catalyst profile
- Cisco AI Defense: RSAC March 2026 announcement
