# Competitive Coverage Matrix — AI Agent Execution-Layer Security

**Last updated**: April 25, 2026
**Research method**: Primary sources (product websites, GitHub repos, docs, RSAC materials, press releases). Claims marked as Claimed/Unknown lack primary source verification.
**Challenger review**: Complete. Two rectification rounds. Noma Security and PointGuard AI added. Expansion threats and watch list appended.

---

## Coverage Levels

- **Full** — Verified capability with primary source evidence
- **Partial** — Capability exists but limited in scope or deployment mode
- **Claimed** — Marketing claims without technical verification
- **None** — Confirmed absent from product
- **Unknown** — Insufficient information to assess

---

## The Matrix — Tier 1 (Direct Execution-Layer Competitors)

| Use Case | Rind | Noma Security | Operant AI | Straiker | MS Toolkit | PointGuard AI |
|---|---|---|---|---|---|---|
| 1. DB deletion blocking | **Full** | Partial | Partial | Partial | **Full** | Claimed |
| 2. Loop / cost detection | **Full** | Partial | Partial | Partial | **Full** | Unknown |
| 3. Credential leak in response | **Full** | **Full** | **Full** | **Full** (vendor-claimed 98.1%) | Unknown | Claimed |
| 4. Prompt injection (nested) | **Full** | **Full** | **Full** | **Full** (vendor-claimed 98.1%) | **Full** | Claimed |
| 5. Schema drift / tool poisoning | **Full** | Partial | **Full** | Claimed | Partial | Unknown |
| 6. Cross-framework support | Partial | **Full** | **Full** | **Full** | **Full** | Partial |
| 7. Identity-aware per-agent policies | Partial | **Full** | **Full** | Claimed | **Full** | Claimed |
| 8. Real-time pre-execution blocking | **Full** | Claimed | **Full** | Partial | **Full** | Claimed |
| 9. MCP credential management | None | Partial | Partial | None | None | None |
| 10. Session kill-switch | **Full** | Unknown | Unknown | Unknown | **Full** | Unknown |
| 11. Time-window policies | **Full** | Unknown | Unknown | Unknown | Unknown | Unknown |
| 12. Audit trail / observability | **Full** | **Full** | **Full** | **Full** | **Full** | Claimed |

## The Matrix — Tier 2 & 3 (Partial Overlap / Different Layer)

| Use Case | Rind | Lasso | Check Point / Lakera | Aembit | Bifrost | Geordie AI | API Stronghold |
|---|---|---|---|---|---|---|---|
| 1. DB deletion blocking | **Full** | Partial | Claimed | None | None | None | None |
| 2. Loop / cost detection | **Full** | Claimed | Claimed | None | Partial | Partial | None |
| 3. Credential leak in response | **Full** | **Full** | **Full** | None | None | Unknown | Partial |
| 4. Prompt injection (nested) | **Full** | **Full** | **Full** | None | Partial | Partial | None |
| 5. Schema drift / tool poisoning | **Full** | **Full** | None | None | None | Unknown | None |
| 6. Cross-framework support | Partial | **Full** | **Full** | Partial | **Full** | **Full** | Partial |
| 7. Identity-aware per-agent policies | Partial | Unknown | Partial | **Full** | Partial | Partial | Partial |
| 8. Real-time pre-execution blocking | **Full** | Partial | Claimed | Partial | Partial | None | None |
| 9. MCP credential management | None | Partial | None | **Full** | Partial | None | Partial |
| 10. Session kill-switch | **Full** | Unknown | None | **Full** | Unknown | Unknown | Partial |
| 11. Time-window policies | **Full** | Unknown | None | Claimed | None | Unknown | Partial |
| 12. Audit trail / observability | **Full** | **Full** | **Full** | **Full** | **Full** | **Full** | Partial |

---

## Score Summary (Full = 2, Partial/Claimed = 1, None/Unknown = 0)

| Competitor | Score (out of 24) | Architecture | Funding | Stage |
|---|---|---|---|---|
| **Rind** | **21** | MCP proxy (inline) | Pre-seed | 359 tests, 11 scenarios, working proxy |
| **MS Toolkit** | **18** | SDK middleware | N/A (Microsoft) | Public Preview, MIT open source, 7 packages |
| **Noma Security** | **18** | Multi-modal (API/SDK/gateway/hooks) | **$132M** | GA, 80+ integrations, AWS partnership, 1,300% ARR growth |
| **Operant AI** | **17** | Runtime platform + MCP Gateway | Undisclosed | GA, 5 Gartner reports |
| **Straiker** | **15** | Multi-modal (SDK/gateway/eBPF) | $21M | GA, 6-7 figure deals. Detection rates vendor-claimed, not independently verified. |
| **Lasso Security** | **14** | Enterprise platform + OSS gateway | Undisclosed | GA platform, OSS gateway 367 stars |
| **PointGuard AI** | **9** | Gateway/platform (MCP Gateway) | Undisclosed | GA (ASPM), MCP Gateway announced March 2026. Most claims unverifiable. Founded as AppSOC. |
| **Aembit** | **13** | IAM / credential proxy | Undisclosed | GA (gateway in Beta) |
| **Check Point/Lakera** | **11** | Detection API (claims inline) | Acquired $300M | Post-acquisition. Original = detection-only. MCP "inspection" claimed, not verified. |
| **Bifrost** | **10** | LLM gateway (Go) | Undisclosed | OSS, 3,300 stars |
| **Geordie AI** | **9** | Behavioral platform | $6.5M seed | Early, RSAC Innovation Sandbox winner |
| **API Stronghold** | **5** | Credential vault | Undisclosed | Early stage |

*Note: Score is a rough capability count, not a market position ranking. Enterprise traction, funding, and distribution matter as much as feature coverage. Noma's score understates their threat — they have $100M and 80+ integrations.*

---

## Competitor Profiles (Quick Reference)

### Tier 1 — Direct Competitors (execution-layer enforcement)

**Noma Security** — **MOST DANGEROUS OVERALL.** $132M funded (Series A + B in under a year). 1,300% ARR growth claimed. Broadest platform: AISPM + red teaming + runtime protection. 80+ integrations (Copilot Studio, AgentForce, ServiceNow, AWS Bedrock, LangChain, CrewAI). Cursor Agent Hooks integration. Agentic Risk Map for blast radius visualization. MCP discovery and governance. But: no declarative policy DSL, no session kill-switch, no loop detection, no time-window policies, enterprise-only pricing, thin technical docs. Runtime is one module of many — breadth over depth risk. [Full profile](competitor-profiles/noma-security.md)

**Operant AI** — Closest direct competitor. Real MCP Gateway with runtime enforcement. Shadow Escape discovery gives MCP credibility. Okta NHI integration. 5 Gartner reports. K8s-native origin limits non-K8s reach. No declarative policy DSL. No session kill-switch or time-window policies. [Full profile](competitor-profiles/operant-ai.md)

**Straiker** — Most dangerous commercially. $21M funded, 40 employees, 6-7 figure enterprise deals. ML-based detection (300ms). Pre-execution blocking is NOT the default — only in gateway deployment mode. SDK/API mode is detection-first. 98.1% detection rate is vendor-claimed, not independently verified. No credential management. Black-box ML makes auditing hard. [Full profile](competitor-profiles/straiker.md)

**MS Agent Governance Toolkit** — Biggest long-term disruption risk. Free, MIT, Microsoft brand, 20+ framework adapters, 7 packages (~9,500 tests). But SDK-only (bypassable by malicious agents), Public Preview, Python-primary. No credential management. If they add proxy mode, they absorb significant market. [Full profile](competitor-profiles/ms-toolkit.md)

**PointGuard AI** — ASPM company (formerly AppSOC) that added MCP Security Gateway in March 2026. Founder pedigree (ArcSight, CipherCloud). Enterprise customers (Finastra). But MCP Gateway claims largely unverifiable — no public docs, no code, no GitHub. Watch for product maturation. [Full profile](competitor-profiles/pointguard-ai.md)

### Tier 2 — Partial Overlap

**Lasso Security** — Broadest surface area (enterprise platform + OSS mcp-gateway + claude-hooks). Tool poisoning detection, MCP server reputation scoring. Python-only gateway, claude-hooks warn only (don't block), no session management. Most direct open-source competitor. [Full profile](competitor-profiles/lasso-security.md)

**Check Point / Lakera** — Best-in-class prompt injection detection (85M training prompts, 100+ languages). Original Lakera Guard is detection-only (flags, app decides). Check Point marketing claims inline blocking + MCP inspection — NO technical docs to verify. The MCP "inspection" claim should be treated as Claimed, not Partial. Distribution threat via Check Point enterprise sales force. [Full profile](competitor-profiles/check-point-lakera.md)

**Aembit** — Best-in-class MCP credential management. Blended Identity (agent + human) is genuinely innovative. ZERO action governance. Controls who accesses what, not what they do with access. Complementary — integration opportunity. [Full profile](competitor-profiles/aembit.md)

### Tier 3 — Different Layer / Minimal Overlap

**Geordie AI** — RSAC Innovation Sandbox winner. Agent discovery + behavioral steering via "Beam" (context injection). No execution-layer enforcement — cannot hard-block anything. No MCP awareness. Complementary. [Full profile](competitor-profiles/geordie-ai.md)

**Bifrost** — LLM gateway, not a security product. 11us routing overhead in Go. Outsources all security to external providers. No content inspection. [Full profile](competitor-profiles/bifrost.md)

**API Stronghold** — Credential vault with phantom tokens. Not an execution-layer product. No action governance. [Full profile](competitor-profiles/api-stronghold.md)

---

## Expansion Threats — Large Companies That Could Enter

These are not current competitors but have adjacent products and the resources to add execution-layer capabilities overnight.

| Company | Adjacent Product | Threat Vector | Timeline Risk |
|---|---|---|---|
| **Cloudflare** | AI Gateway (caching, rate limiting, observability for LLM calls) | Add policy engine + MCP support to existing gateway | High — they ship fast, massive distribution |
| **Kong** | AI Gateway (multi-LLM management, prompt engineering) | Add MCP interception to API gateway | Medium — enterprise API gateway installed base |
| **Wiz** | Cloud + AI security (AI-SPM, pipeline scanning) | Add runtime agent enforcement to existing AI security | High — $12B+ valuation, aggressive expansion |
| **Datadog** | LLM Observability (traces, cost, evals for LLM apps) | Add enforcement/blocking to existing LLM observability | Medium — observability-to-enforcement is a big leap |
| **Palo Alto Networks** | Prisma Cloud AI Security (AI-SPM, model scanning) | Add agent runtime protection | Medium — slow to move but massive distribution |

**Key insight**: The execution-layer security market is adjacent to LLM gateways, AI observability, and cloud security. Any of these companies could add MCP-aware enforcement as a feature of their existing platform. Speed to market and depth of execution are the only moats.

---

## Watch List — Emerging Players

| Company | Why Watch | Current State |
|---|---|---|
| **Token Security** | NHI (non-human identity) security. If they add agent-specific features, overlaps with Rind's identity layer. | Established NHI vendor, no agent-specific product yet |
| **Oasis Security** | NHI governance and lifecycle management. Same adjacency as Token Security. | NHI-focused, watching for agent expansion |
| **Cisco AI Defense** | MCP Scanner (open source), guardrails via Cisco AI Defense API. Could bundle runtime enforcement. | Scanner only today, but Cisco has distribution |
| **Snyk** | agent-scan (OSS MCP scanner). Could expand from scanning to enforcement. | Scanner only, 1,200+ stars |

---

## Where Rind Is Genuinely Ahead

These are honest differentiators that survive the expanded competitor analysis:

1. **Declarative policy engine (YAML DSL)** — Agent ID, time windows, tool globs, parameter regex. Version-controlled, auditable, CI/CD-friendly. **No competitor has this verified.** MS Toolkit supports OPA/Rego but is SDK-based. Noma and PointGuard use platform UI only.

2. **Session kill-switch** — Implemented and tested. Only Aembit and MS Toolkit document this among competitors. Neither Noma, Operant, nor Straiker has it verified.

3. **Loop detection** — Built into the interception pipeline with ring buffer. Cost-runaway prevention is a specific, tested capability. Competitors have "rate limiting" or "anomaly detection" at best.

4. **Time-window policies** — In the policy data model and working. No competitor has verified this capability.

5. **Single focused product** — One proxy, one pipeline, one policy engine. vs Noma's 3 modules, Operant's 3 products, Straiker's 3 products, PointGuard's 5+ modules. Less confusion, faster iteration, deeper execution.

6. **Incident-driven scenario library** — 11 recreated real-world incidents with cassette replay. This is unique as both a testing asset and a sales demo tool.

7. **Latency** — <5ms policy evaluation vs 130-300ms (Straiker ML). True inline proxy vs API call-out (Noma, Lakera).

---

## Where Competitors Are Ahead of Rind — Honest Assessment

### Critical Gaps (address before enterprise sales)

| Gap | Who's Ahead | Severity | Rind Plan |
|---|---|---|---|
| **Funding / resources** | Noma ($132M), Straiker ($21M), Check Point (acquired $300M) | Critical | Pre-seed. This is the existential gap. |
| **Cross-framework support** | Noma (80+ integrations), Straiker, Operant, MS Toolkit | High | MCP-first, hooks for Claude/Gemini. SDK adapters planned. |
| **Enterprise traction** | Straiker (6-7 figure deals), Operant (5 Gartner reports), Noma (AWS partnership) | High | Pre-revenue. Need first customers. |
| **Identity-aware policies (IdP)** | Operant (Okta), MS Toolkit (DID), Aembit (Blended Identity) | High | agentId on every event but no IdP integration yet. Phase 2. |
| **Agent discovery** | Noma (Agentic Risk Map), Geordie AI, Operant | High | Not in scope. Different product layer. Consider partnership. |
| **Open-source presence** | Lasso (367+218 stars), MS Toolkit (272 stars), Bifrost (3,300) | Medium | No public repo yet. `npx rind-scan` planned. |
| **MCP credential management** | Aembit (best-in-class) | Medium | Phase 2 roadmap. Consider Aembit integration. |

### Monitor (not urgent but important)

| Gap | Who's Ahead | Notes |
|---|---|---|
| ML-based semantic detection | Straiker (MoE models, vendor-claimed 98.1%) | Regex can be evaded. But black-box ML is hard to audit. |
| Red teaming / adversarial testing | Straiker (Ascend AI), Noma, Lasso (3K+ attacks) | Different product category. Not Rind's lane. |
| SaaS agent coverage | Noma (Copilot Studio, AgentForce, ServiceNow) | Enterprise need but requires agentless connectors. Different architecture. |
| IDE/coding agent hooks | Noma (Cursor, Windsurf) | Novel but Cursor-specific. Rind's Claude Code hooks are similar. |
| Compliance certifications | Straiker (SOC2, ISO, HIPAA, PCI), Noma (SOC2, HIPAA, ISO 27001) | Process gap, not product gap. Need before enterprise sales. |
| SRE features (SLOs, circuit breakers) | MS Toolkit | Novel but unproven. Monitor demand. |

---

## Strategic Implications (Updated Post-Challenger)

1. **The execution layer is contested, not empty.** At least 5 competitors (Noma, Operant, Straiker, MS Toolkit, PointGuard) have some form of execution-layer enforcement. The "nobody does this" thesis from early research is definitively dead. Rind's differentiation is the *combination* of capabilities, not any single one.

2. **Noma is the most dangerous competitor by funding and breadth.** $132M, 1,300% ARR growth, 80+ integrations, AWS partnership. Their runtime module directly overlaps with Rind. However, runtime is one of three modules — they may not go as deep as a focused execution-layer product. Watch their MCP-specific capabilities closely.

3. **MS Toolkit remains the long-term disruption risk.** Free + MIT + Microsoft. If they add a proxy/sidecar mode, they absorb significant market value. Watch their GitHub for proxy-related issues/PRs.

4. **Rind's real moat is operational depth, not technology.** The declarative policy DSL, session kill-switch, loop detection, time-window policies, and incident scenario library are real differentiators. But they are features, not barriers to entry. The moat comes from usage time: teams that build policies and workflows around Rind's DSL won't switch easily.

5. **The "focused product" positioning is both strength and weakness.** Strength: deeper execution, faster iteration, clearer messaging. Weakness: enterprise buyers may prefer one platform (Noma, PointGuard) over assembling best-of-breed. Counter: developer-led adoption starts with focused tools, not platforms.

6. **Credential management remains everyone's gap except Aembit.** Integration with Aembit (or building a credential layer) is strategic. The combination of action governance (Rind) + credential management (Aembit) is more complete than any single competitor.

7. **Expansion threats are real.** Cloudflare, Wiz, and Cisco could enter this market with features of their existing products. Speed to market, community adoption, and deep technical moats are the only defenses against platform players.

---

## Unresolved Research Items

These gaps could not be fully resolved after two rectification rounds:

| Item | What We Tried | Status |
|---|---|---|
| Noma Security pricing specifics | Searched pricing pages, AWS Marketplace, Crunchbase | Enterprise-only, usage-based. No public tiers. |
| PointGuard AI funding amount | Crunchbase (403 blocked), press releases | Not publicly disclosed. |
| PointGuard MCP Gateway technical depth | Searched docs, GitHub, product pages | Press release claims only. No technical verification possible. |
| Noma's actual runtime blocking mechanism | Reviewed liteLLM integration, blog posts | API call-out pattern confirmed (liteLLM), but gateway mode unclear. |
| Operant AI pricing | Product pages, announcements | Not publicly disclosed. |
| Check Point inline blocking implementation | Post-acquisition product pages | No technical docs available. Marketing claims only. |
