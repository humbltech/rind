# Microsoft Agent Governance Toolkit — Competitor Profile

**URL**: github.com/microsoft/agent-governance-toolkit
**License**: MIT (free, open source) | **Stage**: Public Preview (v3.2.2, April 2026)
**Stars**: 272 | **Tests**: 9,500+

---

## What They Do

Open-source, multi-language SDK/middleware for runtime governance of autonomous AI agents. 9 Python packages covering policy, identity, runtime, SRE, compliance, discovery, and more.

## Architecture

In-process SDK that integrates as middleware into agent frameworks. NOT a proxy.

Pipeline: Agent Request → Trust Check → Governance Gate → Reliability Gate → Execute → Output Check → Audit Log

9 packages:
- **Agent OS** — Policy engine (pattern matching + semantic intent classification)
- **Agent Mesh** — Zero-trust identity (DIDs, Ed25519, quantum-safe ML-DSA-65), trust scoring (0-1000)
- **Agent Runtime** — 4-tier privilege rings, saga orchestration, kill switch
- **Agent SRE** — SLOs, error budgets, circuit breakers, chaos engineering
- **Agent Compliance** — OWASP verification, regulatory mapping
- **Agent Discovery** — Shadow AI detection
- **Agent Hypervisor** — Reversibility verification, execution plan validation
- **Agent Marketplace** — Plugin lifecycle with Ed25519 signing
- **Agent Lightning** — RL governance

Policy languages: YAML, OPA/Rego, Cedar.

## Strengths

- Free and open source (MIT) — zero barrier to adoption
- Microsoft backing — institutional credibility, long-term maintenance
- 9,500+ tests, CodeQL, fuzzing — serious engineering quality
- 20+ framework adapters (LangChain, CrewAI, AutoGen, Google ADK, OpenAI Agents SDK, etc.)
- Sub-millisecond policy evaluation
- Semantic intent classification beyond regex
- SRE features unique to this space (SLOs, circuit breakers, chaos engineering)
- Production-validated (case study: 473 denials over 11 days, 0.43s total overhead)
- Multi-language (Python primary, TypeScript, .NET, Rust, Go)

## Weaknesses

- **SDK, not proxy** — requires code changes in every agent. Malicious agent can simply not import the middleware. Cannot enforce on agents that bypass the SDK.
- Public Preview, not GA — "may have breaking changes"
- Python-primary — full feature set only in Python
- 9 packages = significant complexity and learning curve
- No credential management
- 272 GitHub stars (modest for a Microsoft project after 3 weeks)
- Regex patterns (DROP TABLE, rm -rf) are trivially evadable

## Where MS Toolkit Is Ahead of Rind

- Free + MIT + Microsoft brand
- 20+ framework adapters vs Rind's MCP-only
- 9,500 tests vs 359
- Semantic intent classifier (beyond regex)
- DID-based cryptographic agent identity
- SRE features (SLOs, error budgets, circuit breakers)
- Multi-language support

## Where Rind Is Ahead of MS Toolkit

- Proxy model — cannot be bypassed by the governed agent
- No code changes required
- Session kill-switch
- Loop detection
- Time-window policies
- MCP credential management (Phase 2)
- Single focused product vs 9-package complexity

## The Real Threat

Not current capabilities — it's the adoption gravity of free + MIT + Microsoft. If they add a proxy/sidecar mode, they absorb Rind's core value prop. **Monitor their GitHub for proxy-related issues, PRs, or roadmap discussions.**

## Evidence Quality

| Claim | Verification |
|---|---|
| Pre-execution blocking | Verified — production case study (473 denials) |
| Sub-millisecond latency | Verified — benchmarks + production report |
| 20+ framework adapters | Verified — listed in README |
| 9,500+ tests | Verified — stated in README, CI visible |
| Semantic intent classifier | Claimed — described but no detection rates published |

## Sources

- [GitHub Repository](https://github.com/microsoft/agent-governance-toolkit)
- [Microsoft Open Source Blog](https://opensource.microsoft.com/blog/2026/04/02/introducing-the-agent-governance-toolkit-open-source-runtime-security-for-ai-agents/)
- [Architecture Deep Dive](https://techcommunity.microsoft.com/blog/linuxandopensourceblog/agent-governance-toolkit-architecture-deep-dive-policy-engines-trust-and-sre-for/4510105)
- [Production Case Study](https://medium.com/@isiddique/running-11-ai-agents-in-production-how-the-agent-governance-toolkit-secures-our-workflows-10a6399638fc)
