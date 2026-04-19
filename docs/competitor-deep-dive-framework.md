# Competitor Deep-Dive Framework

> Run this analysis after every strategic-council session that touches positioning or feature decisions. Can be run as a standalone research task.

**Last Updated**: April 18, 2026

---

## When to Run

- After any strategic-council session that produces new positioning decisions
- Before building any feature that overlaps with a known competitor
- Quarterly for the top 5 closest competitors
- Whenever a competitor ships a new feature, gets acquired, or raises funding

---

## The Analysis Framework (Per Competitor)

For each competitor, answer these 10 questions:

### 1. Product Focus
- Is the competing feature their **primary product** or a **side feature**?
- What percentage of their marketing/docs/hiring focuses on this capability?
- Are they a **point solution** (one thing well) or a **platform** (many things)?

### 2. Technical Depth
- How is the feature implemented at a technical level? (proxy, SDK, agent, SaaS API?)
- How granular is their control? (binary allow/deny? policy DSL? per-agent rules?)
- What deployment model? (SaaS only? self-hosted? hybrid?)
- What latency does their enforcement add?

### 3. Adoption & Popularity
- GitHub stars (if open source)
- npm/PyPI download counts (if SDK)
- G2/Gartner review count and ratings
- Job postings mentioning the tool
- Community size (Discord, Slack, forum)
- Known customers or case studies

### 4. Pricing & Business Model
- Free tier? What are the limits?
- Paid pricing model (per-seat, per-request, per-agent, flat?)
- Enterprise pricing range
- Are they profitable or burning VC money?

### 5. Target Market
- Who do they sell to? (developer, security team, CISO, GRC?)
- What company size? (indie, startup, mid-market, enterprise?)
- What industries?
- What's their sales motion? (self-serve, PLG, enterprise sales?)

### 6. Strengths (What They Do Well)
- What are users praising in reviews?
- What would be hard to replicate?
- What moat do they have? (data, integrations, brand, network effects?)

### 7. Weaknesses (Where They Fall Short)
- What are users complaining about in reviews?
- What features are missing that users request?
- Where is their architecture limited?

### 8. Aegis Positioning Against Them
- What does Aegis do that they don't?
- What do they do that Aegis doesn't (and shouldn't)?
- What do they do that Aegis doesn't (and should consider)?
- What specific messaging differentiates us?

### 9. Threat Level Assessment
| Dimension | Score (1-10) |
|-----------|:---:|
| Feature overlap with Aegis | |
| Market overlap with Aegis | |
| Technical depth in overlapping area | |
| Adoption momentum | |
| Likelihood they expand into our space | |
| **Overall threat score** (weighted avg) | |

### 10. Competitive Intelligence Triggers
- What signals would indicate they're moving into our space?
- Where to monitor (GitHub, blog, job postings, conference talks)?

---

## Priority Competitors (Run Full Analysis)

### Tier 1 — Run quarterly
| Competitor | Primary Layer | Why Tier 1 |
|-----------|--------------|-----------|
| LiteLLM | LLM Routing + Cost | Closest developer tool; if they add tool-call enforcement, direct competitor |
| Entro Security AGA | MCP + Identity | Only competitor with MCP-specific controls |
| LangSmith | Observability | If they add enforcement, biggest threat due to LangChain ecosystem lock |

### Tier 2 — Run semi-annually
| Competitor | Primary Layer | Why Tier 2 |
|-----------|--------------|-----------|
| Portkey | LLM Routing | Similar proxy architecture, developer-focused |
| Microsoft Agent 365 | Identity + Governance | If they go cross-framework, massive threat |
| Prompt Security (SentinelOne) | Prompt + MCP monitoring | MCP monitoring, but acquired into enterprise motion |
| Helicone | Observability + Gateway | Similar frictionless onboarding model |

### Tier 3 — Monitor only
| Competitor | Why Monitor |
|-----------|-----------|
| Lakera (Check Point) | Prompt-layer only, but M&A validates market |
| CalypsoAI (F5) | Enterprise/gov focus, different segment |
| Cloudflare AI Gateway | If they add MCP/tool enforcement |
| Geordie AI | Early stage, watch for feature announcements |
| Credo AI | Different buyer (GRC), but governance convergence possible |

---

## Output Format

After running this analysis, produce:
1. **Updated positioning.md** — revise competitive map if needed
2. **Updated strategic-analysis.md** — add any new risks or assumption changes
3. **Feature impact assessment** — does this change what we should build or prioritize?

---

## Integration with Strategic Council

This competitor deep-dive should run as a **research phase** that feeds into the strategic-council workflow:

```
1. Trigger: New positioning decision or quarterly review
2. Run: Competitor deep-dive (this framework) on Tier 1 competitors
3. Feed findings into: strategic-council Phase 2 (GATHER)
4. Use findings in: Phase 4 (ACH matrix) and Phase 5 (CHALLENGE)
5. Output: Updated positioning.md + strategic-analysis.md
```

In a future product version, this would be an automated agent pipeline:
- Research agents gather data (web search, GitHub, G2, npm stats)
- Analysis agent applies this framework
- Challenger agent stress-tests conclusions
- Orchestrator consolidates into reports
