# Competitive Deep Dive — April 2026
**Sources**: GitHub API, npm/PyPI stats, HN Algolia API
**Date**: 2026-04-18

---

## Raw Data Files
- `github-stats.md` — Stars, commits, feature requests, bugs
- `pkg-stats.md` — Download volumes
- `hn-mentions.md` — HN community signal

---

## Headline Findings

### 1. MCP adoption is not nascent — it's already massive
- `@modelcontextprotocol/sdk` (npm): **32.8M weekly downloads**
- `mcp` (PyPI): **217M monthly downloads**
- `langsmith` (PyPI): 75M monthly; `litellm`: 172M monthly

The "will MCP win?" question is answered. It already has. OQ-004 is partially resolved: the infrastructure is everywhere. Security and control tooling is the gap.

### 2. ⚠️ CORRECTION (April 19, 2026): MCP scanner space is competitive, not empty

**Our initial research queried the wrong GitHub URL.** We queried `snyk-labs/mcp-scan` (404). The tool is at `snyk/agent-scan` (originally `invariantlabs-ai/mcp-scan`). Live web search April 19 confirms a crowded scanner landscape:

| Tool | Stars | Type | Key Differentiator |
|------|-------|------|-------------------|
| **Snyk Agent Scan** | **1,700+** | CLI (Python) | 15+ risk types, auto-discovers configs across Claude/Cursor/Windsurf/Gemini/Amp/Amazon Q. **Thoughtworks Radar** (Vol 34, April 2026). Enterprise background mode. v0.4.13. |
| **Cisco MCP Scanner** | **891** | CLI (Python) | YARA rules + LLM-as-judge + Cisco AI Defense API. Apache 2.0. |
| **Golf Scanner** | TBD | CLI (Go) | Single binary, zero telemetry, 20 checks, 7 IDEs. |
| **Ant Group MCPScan** | TBD | CLI | Semgrep + LLM metadata scan. Apache 2.0. |
| **mcpwn** | TBD | CLI | SSRF, data exfiltration, prompt injection, tool poisoning. |
| **MCPWatch** | TBD | CLI | OWASP MCP Top 10, A–F letter grade. |
| **Enkrypt AI MCP Scan** | N/A | Web SaaS | CI/CD integration, static analysis. |
| **MCPScan.ai** | N/A | Web SaaS | LLM classifier for tool poisoning. |

Also in play: **Operant AI** (discovered "Shadow Escape" zero-click MCP exploit), **Lasso Security** (real-time threat detection).

**"The space is open" conclusion was wrong.** Scanner strategy requires a `/strategic-council` decision before building. See strategic-analysis.md R-011.

### 3. LiteLLM supply chain attack — the incident Rind was built for
On **2026-03-24**, LiteLLM versions 1.82.7 and 1.82.8 on PyPI contained a credential stealer. HN response:
- "Tell HN: Litellm 1.82.7 and 1.82.8 on PyPI are compromised" — **938 points, 500 comments**
- "Malicious litellm_init.pth in litellm 1.82.8 PyPI package" — **739 points**
- "My minute-by-minute response to the LiteLLM malware attack" — **441 points, 157 comments**
- Mercor company breached via compromised LiteLLM — **151 points**

LiteLLM has **171M monthly downloads**. This is now the canonical "AI infrastructure supply chain attack" story. It happened 3 weeks ago. The community is still talking about it. **This is Rind's first blog post.**

### 4. Middleware support is the #1 MCP TypeScript SDK feature request
Issue #1238: "Feature Request: Middleware support for McpServer" — 2 reactions, **7 comments** (most engaged feature request). The MCP community explicitly wants a middleware/interception layer on the SDK. Rind's proxy architecture IS this middleware.

### 5. MCP TypeScript SDK is more active than Python SDK
- TypeScript SDK: 68 commits in 30 days, 12,217 stars
- Python SDK: 18 commits in 30 days, 22,687 stars

Python SDK has more legacy stars but TypeScript SDK has >3x the recent development velocity. Confirms Rind's TypeScript-first stack choice.

### 6. LangSmith dissatisfaction is real
- Open-source alternative ("RAG Logger") got **95 HN points** in Dec 2024
- Multiple open-source Rust alternative attempts
- Top bugs: Bedrock token miscalculation (cost tracking unreliable), pricing errors
- Feature requests: all 0-1 reactions — community isn't engaged on GitHub

LangSmith has weak community loyalty. Developers want alternatives for observability. Rind's free tier observability is positioned to capture this.

### 7. NIST regulatory tailwind
"NIST Seeking Public Comment on AI Agent Security" — 49 HN points, Feb 2026. Regulatory attention is real and accelerating. Compliance-driven purchases will follow (validates enterprise buyer thesis).

---

## Competitive Position Updates

### LiteLLM
| Dimension | Finding |
|-----------|---------|
| Position | LLM API proxy (normalizes 100+ providers), cost tracking, guardrails |
| Stars | 43,826 |
| Issue backlog | 2,574 open issues — massive, struggling to keep up |
| Velocity | 100 commits/30d (capped — likely more) |
| Top asks | FIPS compliance, Helm Gateway, SSO for Standard Plan |
| Weakness | Supply chain attack (March 2026), no MCP-specific security, no agent tool-call enforcement |
| **Rind overlap** | Both proxy LLM calls — but LiteLLM is an LLM gateway, Rind is an agent tool-call control plane. Different layer. |

### LangSmith
| Dimension | Finding |
|-----------|---------|
| Position | Observability, evaluation, testing for LLM apps |
| Stars | 853 (SDK only — dashboard is closed-source) |
| Community | Weak — feature requests have 0-1 reactions |
| Velocity | 88 commits/30d — active |
| Top bugs | Token cost miscalculation (Bedrock), pricing errors |
| Weakness | No enforcement capability, no MCP-specific tooling, locked to LangChain ecosystem |
| **Rind overlap** | Rind's free tier competes on observability — but Rind enforces, LangSmith only observes |

### MCP TypeScript SDK (competitor context)
| Dimension | Finding |
|-----------|---------|
| Position | Official Anthropic SDK for MCP clients/servers |
| Downloads | 32.8M/week — foundational infrastructure |
| Top request | Middleware support (#1238) — **Rind addresses this** |
| Top bug | Session reconstruction from persisted state — proxy concern |
| Auth bugs | Race condition in token refresh, 401 signaling gaps — **Rind hardens these** |
| **Rind overlap** | Not a competitor — it's the surface Rind proxies. Their pain = our market. |

### Snyk mcp-scan
| Dimension | Finding |
|-----------|---------|
| Status | **404 — does not exist publicly** |
| HN mentions | Zero |
| **Rind implication** | No direct competitor in open-source MCP scanning |

---

## Strategic Implications

### For the Scanner (Activity 4)
- No public MCP scanner exists with meaningful traction
- MCP TS SDK community explicitly wants middleware/interception
- Scanner differentiators vs. nothing: auth gap detection, tool poisoning patterns, rug pull detection, severity ratings, CI JSON output
- "Show HN: Free MCP security scanner" has a clear runway — no competition

### For Positioning
- Lead with the **LiteLLM incident**: "LiteLLM was compromised. 171M monthly downloads. Credentials stolen. Your agent supply chain has the same exposure." This is recent, real, emotionally resonant.
- "Observability without enforcement" is the LangSmith gap to attack
- NIST regulatory pressure validates security buyer conversation

### For Blog Content
1. **"The LiteLLM supply chain attack: what it means for your agent stack"** — publish immediately, while HN is still active
2. **"How the Replit DB deletion would have been prevented"** — evergreen
3. **"MCP has 217 million monthly downloads. Who's securing it?"** — awareness play

### For OQ answers
- **OQ-004** (MCP adoption): RESOLVED. 32.8M weekly npm + 217M monthly PyPI. MCP is everywhere. Skip adoption education, lead with security.
- **OQ-002** (incident trigger): The LiteLLM breach IS the trigger. "Supply chain compromise of a widely-used AI package" is the category. Rind's scanner detects unsigned/unverified MCP servers — same risk vector.

---

## What to Do With This

1. **Write the LiteLLM blog post NOW** — the story is 3 weeks old and still on HN's radar. Position Rind as the control plane that would have prevented/detected this.
2. **Confirm snyk-labs/mcp-scan doesn't exist** — check if it was renamed to `snyk/mcp-scan` or similar. If truly dead, remove from competition.md.
3. **Update positioning.md** — add LiteLLM supply chain angle; update Snyk mcp-scan status.
4. **Scanner spec confirmed** — no competition means scope can be Rind-specific (auth gaps, tool poisoning, rug pull, unsigned servers).
