# Lasso Security — Competitor Profile

**URL**: lasso.security
**Funding**: Undisclosed | **Stage**: GA platform, OSS mcp-gateway (367 stars), claude-hooks (218 stars)

---

## What They Do

Enterprise AI security platform covering discovery, posture management, red teaming, and runtime enforcement. Brand their approach "Intent Security." Also maintain two open-source projects: an MCP gateway and Claude Code hooks.

## Architecture

Multi-layered platform (NOT a single proxy):
- **AI-BOM** — Discovery/inventory of all agents, models, tools, prompts
- **AI Security Posture Management** — Misconfiguration detection, NIST/OWASP alignment
- **Automated Red Teaming** — 3,000+ attack library, multi-turn agentic attacks
- **Runtime Enforcement** — Inline decision-making, <50ms classification (claimed)
- **AI Detection & Response** — Behavioral anomaly detection

**Open-source mcp-gateway** (Python, MIT, 367 stars):
- Proxy between LLMs and MCP servers
- Intercepts tool calls via `run_tool` interface
- Sanitizes requests/responses (credential masking)
- MCP server reputation scanning (auto-blocks at score threshold 30)
- Tool description poisoning detection
- Plugin system: Basic (masking), Presidio (PII), Lasso (enterprise — prompt injection, custom policies)

**Open-source claude-hooks** (TypeScript, MIT, 218 stars):
- PostToolUse hooks for Claude Code
- Scans tool outputs for indirect prompt injection
- 5 attack categories (instruction override, jailbreak, encoding obfuscation, false authority, HTML smuggling)
- **Warns but does NOT block** — alert only

## Strengths

- Broadest surface area of any competitor (discovery + posture + red teaming + runtime + OSS gateway + hooks)
- Open-source MCP gateway with real traction (367 stars)
- MCP server reputation scanning — shipped before Rind
- Tool description poisoning detection in OSS gateway
- Palo Alto NGFW integration (enterprise credibility)
- Red teaming (3,000+ attacks) — unique differentiator
- Same foot-in-the-door strategy as Rind's planned `npx rind-scan`

## Weaknesses

- MCP gateway is Python-only
- Claude hooks warn only — do NOT block
- No credential injection / phantom tokens (masks, doesn't manage)
- No verified loop detection
- No session management / kill-switch
- No time-window policies
- Enterprise platform and OSS gateway appear to be separate codebases
- Plugin architecture = security is opt-in (Lasso plugin requires API key)

## Where Lasso Is Ahead of Rind

- Open-source presence (367 + 218 stars vs zero)
- MCP server reputation scanning (shipped)
- Enterprise platform with red teaming
- Palo Alto integration
- Broader security lifecycle coverage

## Where Rind Is Ahead of Lasso

- Pre-execution blocking (not warn-only)
- TypeScript/Node.js native (vs Python-only gateway)
- Session kill-switch
- Loop detection
- Time-window policies
- Single integrated proxy (vs 3 separate tools)
- Declarative YAML policy DSL

## Key Threat

Most direct open-source competitor. If they add blocking to claude-hooks and TypeScript support to mcp-gateway, the overlap with Rind increases significantly.

## Sources

- [Lasso mcp-gateway GitHub](https://github.com/lasso-security/mcp-gateway)
- [Lasso claude-hooks GitHub](https://github.com/lasso-security/claude-hooks)
- [Lasso Security website](https://lasso.security)
