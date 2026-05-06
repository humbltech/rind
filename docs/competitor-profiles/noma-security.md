# Noma Security — Competitor Profile

**URL**: noma.security
**Founded**: 2023 (Tel Aviv, emerged from stealth 2024) | **Funding**: $132M total ($32M Series A 2024 + $100M Series B 2025)
**Stage**: Growth. Full platform GA. 80+ integrations. AWS Security Hub partnership. Claims 1,300% ARR growth.
**Team**: CEO Niv Braun. Series B led by Evolution Equity Partners, with Ballistic Ventures and Glilot Capital.

---

## What They Do

Comprehensive AI security platform covering the full lifecycle: posture management (AISPM), automated red teaming, and **runtime protection** for LLMs, RAG systems, and AI agents. The runtime layer is the part that overlaps with Rind.

## Architecture — Deep Analysis (Verified May 2026)

**CORE FINDING: Noma is a verdict-as-a-service API, NOT a proxy.** All integration paths use a call-out model where the host application (LiteLLM, Cursor, SDK) calls `api.noma.security` for a verdict, then enforces locally. Traffic never flows THROUGH Noma. Verified from LiteLLM open source code (`litellm/proxy/guardrails/guardrail_hooks/noma/noma_v2.py`).

### How the Call-Out Model Works

```
┌─────────┐     ┌──────────────┐     ┌──────────────────┐
│  Agent   │────▶│ Integration  │────▶│  LLM / MCP Tool  │
│          │     │ (LiteLLM,    │     │                  │
│          │     │  Cursor, SDK)│     │                  │
└─────────┘     └──────┬───────┘     └──────────────────┘
                       │ side-call
                       ▼
                ┌──────────────┐
                │ api.noma.    │
                │ security     │
                │ (verdict)    │
                └──────────────┘

vs. Rind's inline proxy model:

┌─────────┐     ┌──────────────┐     ┌──────────────────┐
│  Agent   │────▶│  Rind Proxy  │────▶│  LLM / MCP Tool  │
│          │     │ (in path,    │     │                  │
│          │     │  enforces)   │     │                  │
└─────────┘     └──────────────┘     └──────────────────┘
```

### Integration Paths (Step-by-Step)

**Path A — LiteLLM (primary, code-verified):**
1. Set env vars: `NOMA_API_KEY`, `NOMA_APPLICATION_ID`, `NOMA_API_BASE` (defaults to `https://api.noma.security/`)
2. Add to liteLLM `config.yaml` as a guardrail provider
3. LiteLLM proxy calls `POST {api_base}/litellm/guardrail` before/after each LLM call
4. Noma returns `{ action: "BLOCKED" | "GUARDRAIL_INTERVENED" | "NONE" }`
5. LiteLLM enforces locally: raises exception on BLOCKED, modifies inputs on INTERVENED
6. Hook modes: `pre_call`, `post_call`, `during_call`, `pre_mcp_call`, `during_mcp_call`

**Path B — Cursor Hooks:**
1. Configure hook in `.cursor/hooks.json` pointing to a Noma script
2. Cursor sends tool-call JSON on stdin to hook script
3. Hook script forwards data to `api.noma.security`
4. Script returns `{"permission": "allow"}` or `{"permission": "deny"}` on stdout
5. Cursor enforces locally

**Path C — Python/JS SDK:**
1. Import Noma SDK, register as callback/middleware in LangChain/CrewAI
2. SDK wraps framework calls and calls `api.noma.security` at execution points
3. Same call-out pattern as above (SDK source not public — inferred from architecture)

**Path D — SaaS platforms (Copilot Studio, Salesforce, ServiceNow):**
1. Noma connects via platform's native "external guardrails" API
2. Platform calls out to Noma at decision points — Noma does not initiate
3. Described as "agentless" — no agent-side code needed

### Bypass Analysis (CRITICAL FOR COMPETITIVE POSITIONING)

| Integration | Bypassable? | How | Confidence |
|---|---|---|---|
| LiteLLM guardrail | **YES** | Remove from YAML config; call LLM directly bypassing proxy | HIGH |
| Cursor hooks | **YES** | Delete/modify hook config; use different IDE; hook fails open by default | HIGH |
| Python/JS SDK | **YES** | Don't import SDK; call tools directly; prompt injection drifts agent away from SDK path | HIGH |
| SaaS platforms | **Harder** | Platform controls the call-out; agent can't skip it | MEDIUM |
| Unregistered agents | **Invisible** | Any agent not using a Noma-integrated system is completely unprotected | HIGH |

**Key vulnerability**: Noma can only see what the integration partner shows it. An agent that reaches the LLM or MCP server without going through the integration point bypasses Noma entirely. **Noma cannot block what it never sees.**

### Failure Modes

| Scenario | LiteLLM | Cursor |
|---|---|---|
| Noma API unreachable | **Fail closed** (default, configurable) | **Fail open** (default) |
| Noma API slow | Blocks on httpx timeout | Unknown timeout behavior |
| Monitor mode | Never blocks, logs async | N/A |

Code from LiteLLM source:
```python
if self.block_failures:
    raise  # fail closed
return inputs  # fail open
```

`block_failures` defaults to `True` via env var `NOMA_BLOCK_FAILURES`.

### "Centralized Gateway" — What It Actually Is

Despite marketing language, this is NOT an inline proxy or deployable gateway. It refers to Noma's cloud API (`api.noma.security`) as a single policy decision point. All integrations call out to this same API. The "centralization" is in policy management, not in traffic flow. There is zero evidence of a deployable proxy component.

### Agentic Risk Map

Separate from runtime enforcement. Uses API connectors (80+ platforms) to scan cloud environments, discover AI models/agents/MCP servers, map connections and blast radius. This is passive/out-of-band inventory scanning — genuinely valuable but orthogonal to runtime protection.

## MCP-Specific Capabilities

From their MCP Server Security page:
- **Discovery**: "Instantly discover all MCP deployments and agent connections" — sanctioned and unsanctioned
- **Risk Analysis**: Visualize access relationships, identify risky/excessive/destructive capabilities
- **Posture**: Analyze blast radius, detect malicious supply chain servers, prevent credential leakage
- **Runtime Guardrails**: Restrict connections, block destructive actions, enforce least privilege
- **Governance**: Regulatory/audit compliance for agentic MCP workflows

## Cursor Agent Hooks Integration

Noma leverages Cursor's deterministic hook points for:
1. **Prompt Injection Detection** — intercepts full user/agent prompt, system context, conversation state
2. **Command Validation** — inspects exact command string, working directory, environment context
3. **Tool Governance** — enforces authorized, low-risk tools only
4. **Data Protection** — blocks access to sensitive files, prevents PII/secret exfiltration
5. **Destructive Guardrails** — halts shell executions or tool calls that could alter/destroy production

## Pricing

Enterprise SaaS. Usage-based pricing varying by:
- Volume of protected endpoints
- Range of security features enabled
- Support level

95% of customers choose all-in-one integrated license. No public pricing tiers. Available on AWS Marketplace.

**Deployment**: SaaS + on-premises. SOC 2 Type II, HIPAA, ISO 27001 certified.

## Strengths

- **Most well-funded direct competitor** ($132M) — can outspend everyone in engineering and sales. 1,300% ARR growth claimed.
- **Broadest platform** — AISPM + Red Teaming + Runtime in one product (Rind only covers runtime)
- **80+ integrations** — Copilot Studio, AgentForce, ServiceNow, AWS Bedrock, LangChain, CrewAI
- **Cursor hooks integration** — first to market on local coding agent security
- **Agentic Risk Map** — agent discovery and blast radius visualization (no one else has this)
- **Enterprise credibility** — AWS Security Hub partnership, SOC 2/HIPAA/ISO compliance
- **liteLLM native integration** — pre/during/post call modes including MCP-specific hooks
- **SaaS agent coverage** — agentless deployment for enterprise SaaS platforms

## Weaknesses

- **No declarative policy DSL** — VERIFIED (May 2026, HIGH confidence). Policies configured through platform UI only, not version-controlled YAML. No Git-trackable policy files, no policy-as-code workflow. This means no audit trail of policy changes, no PR review for policy updates, no rollback capability.
- **No open source presence** — closed-source SaaS, no community contribution path
- **Breadth over depth** — covers AISPM, red teaming, AND runtime; runtime may not be as deep as a focused product
- **Kill switch — CLAIMED but unclear mechanism** — VERIFIED (May 2026, MEDIUM confidence). Noma mentions "automated blocking" but this appears to be ML-confidence-based auto-block, not operator-controlled real-time session termination. No evidence of a manual "terminate this agent session NOW" button or API endpoint.
- **No time-window policies** — VERIFIED (May 2026, HIGH confidence). No evidence of temporal rules (e.g., "block writes after 6pm"). All policies appear to be static.
- **No loop detection** — VERIFIED (May 2026, HIGH confidence). Detects "unexpected tool invocations" but not cost-runaway loops specifically. No mention of consecutive-call detection or hash-based loop identification.
- **Enterprise pricing only** — no self-serve, no free tier, no developer entry point
- **Technical details thin** — lots of marketing claims, very few code examples or architecture diagrams publicly available
- **API call-out architecture, NOT true inline proxy** — VERIFIED (May 2026, HIGH confidence). Agent/platform calls `api.noma.security` for guardrail verdicts. Traffic does NOT flow through Noma — it flows alongside it. This means: (1) bypassable if integration layer is skipped/misconfigured, (2) additional network hop latency, (3) no ability to inspect/modify responses in-flight.
- **Cursor hooks are Cursor-only** — not a general-purpose interception mechanism

## Relationship to Rind

**MOST DANGEROUS DIRECT COMPETITOR.** Noma's runtime protection layer directly overlaps with Rind's core value proposition. Their MCP-specific capabilities (discovery, guardrails, governance) cover similar ground.

**Where Noma is ahead:**
- Funding ($132M vs unfunded)
- Platform breadth (AISPM + red teaming + runtime)
- Enterprise integrations (80+ platforms)
- Agent discovery / blast radius mapping (Agentic Risk Map — genuinely unique)
- Cursor hooks integration (first to market)
- Compliance certifications (SOC 2, HIPAA, ISO 27001)
- SaaS platform coverage (Copilot Studio, Salesforce, ServiceNow — agentless)
- AI/ML detection models for novel attacks

**Where Rind is ahead:**
- **True inline proxy** — traffic flows THROUGH Rind, cannot be bypassed without network reconfig. Noma is a call-out sidecar that depends on integration partners to enforce.
- **Non-bypassable enforcement** — Noma can be skipped by removing a config line, not importing an SDK, or using an unintegrated agent. Rind proxy in the network path = no alternative route.
- **Per-agent tool filtering** — intercepts `tools/list` to control what each agent can even see. Noma evaluates AFTER tool selection, can't filter the catalog.
- **Policy-as-code** — Git-tracked YAML with PR review, rollback, audit trail. Noma is UI-only.
- **Session kill-switch** — Operator-controlled real-time session termination. Noma's "automated blocking" is ML-driven, not operator-initiated.
- **Loop detection** — Dual detection (hash + consecutive cap) for cost-runaway prevention. Noma has nothing comparable.
- **Time-window policies** — Temporal rules ("block writes after 6pm"). Noma is static only.
- **In-process policy engine** — Sub-millisecond evaluation, no external network dependency. Noma adds a synchronous API round-trip on every check.
- **Consistent failure mode** — Rind controls the connection = definitive fail-closed. Noma's failure mode varies by integration (LiteLLM: fail-closed default; Cursor: fail-open default).
- **Open source path** (community, transparency)
- **Focused depth** on execution-layer control
- **Incident-driven scenario library** (19 recreated real incidents)

### The Architectural Argument (CrowdStrike vs. Antivirus)

Noma is architecturally a **security sidecar** — like antivirus that asks "should I allow this?" If the question is never asked, the action proceeds.

Rind is architecturally a **security gateway** — like EDR/CrowdStrike that sits in the execution path. The action cannot proceed without going through it.

CrowdStrike won because inline beats call-out for security-critical workloads. The same structural advantage applies here.

**Noma's "Centralized Gateway" is marketing language for a centralized API.** It is not a gateway that traffic flows through. This distinction matters enormously for security posture.

### The Honest Assessment

Noma has $132M, 80+ integrations, enterprise sales team, and broader platform coverage. These are real advantages in enterprise deals.

Rind's advantages are architectural and structural — the kind that compound over time:
1. Non-bypassable enforcement (proxy vs sidecar)
2. Policy-as-code (GitOps vs UI clicks)
3. Execution-layer depth (loop detection, kill switch, time windows, tool filtering)
4. In-process evaluation (sub-ms vs network round-trip)
5. Developer-first adoption (free tier, env var install, minutes to value)

The question is not "depth vs breadth" — it's "who serves the 95% of companies that will never buy a $100K enterprise platform?" Noma serves Fortune 500 CISOs. Rind serves every engineer deploying agents who needs security today.

## Sources

- [Noma Security Platform](https://noma.security/platform/)
- [Noma Runtime Protection](https://noma.security/platform/runtime-protection/)
- [Noma AI Agent Security](https://noma.security/solutions/ai-agent-security/)
- [Noma MCP Server Security](https://noma.security/solutions/mcp-server-security/)
- [Noma Cursor Hooks Blog](https://noma.security/blog/securing-the-agentic-frontier-noma-unveils-the-first-real-time-agent-runtime-security-for-cursor/)
- [Noma Copilot Studio Blog](https://noma.security/blog/runtime-guardrails-for-microsoft-copilot-studio-agents/)
- [Noma Agentic Risk Map Blog](https://noma.security/blog/agentic-risk-map-ai-agent-visibility-control/)
- [Noma Agentic Risk Map PR](https://www.prnewswire.com/news-releases/noma-security-launches-industry-first-agentic-risk-map-as-part-of-comprehensive-ai-agent-security-solution-302590849.html)
- [LiteLLM Noma Guardrail Docs](https://docs.litellm.ai/docs/proxy/guardrails/noma_security)
- [LiteLLM MCP Guardrails Docs](https://docs.litellm.ai/docs/mcp_guardrail)
- [LiteLLM Noma v2 Source Code (GitHub)](https://github.com/BerriAI/litellm/blob/main/litellm/proxy/guardrails/guardrail_hooks/noma/noma_v2.py) — **primary architectural evidence**
- [LiteLLM Noma MCP PR #18668](https://github.com/BerriAI/litellm/pull/18668)
- [Cursor Hooks Documentation](https://cursor.com/docs/hooks)
- [Cursor Hooks for Security Partners](https://cursor.com/blog/hooks-partners)
- [AppSecSanta Review](https://appsecsanta.com/noma-security)
- [AWS Security Hub Integration](https://www.prnewswire.com/news-releases/noma-ai-security-integrates-with-new-extended-plan-for-aws-security-hub-302699823.html)
- [Noma $100M Raise](https://www.bankinfosecurity.com/noma-raised-100m-to-expand-agentic-ai-security-platform-a-29107)
