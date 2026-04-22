# Rind Coverage Matrix — D-040 Phase A6

**Last updated**: April 2026  
**Status**: Phase A complete (Claude Code 100%, MCP all tools)

This document shows exactly what Rind intercepts per AI coding tool per attack surface.
No fuzzy claims. No "partial" without specifics. The gaps are documented as honestly as the coverage.

---

## The Two Attack Surfaces

Every AI coding tool has the same split:

| Surface | What it covers | Risk level |
|---------|---------------|------------|
| **MCP tools** (external) | Database, browser, cloud APIs, GitHub, Stripe — everything configured via MCP JSON | **HIGH** — every verified catastrophic incident happened here |
| **Built-in tools + CLI** | File read/write, terminal/bash execution, web fetch, code search — native tool execution | **MEDIUM-HIGH** — INC-007 (Mexican gov breach), CVE-2025-53773 (Copilot RCE) |

---

## Coverage by Tool

### Claude Code

| Surface | Coverage | How |
|---------|----------|-----|
| MCP tools | **100%** | Stdio wrapper (`rind-proxy wrap`) — every `tools/call` intercepted before reaching server |
| Built-in tools (Bash, Write, Edit, WebFetch, etc.) | **100%** | `PreToolUse` hook — fires before every tool call, Rind evaluates and blocks |
| MCP via HTTP/SSE | **100%** | MCP gateway (`/mcp/:serverId`) — routes all HTTP MCP calls through Rind |

**What `rind-proxy init --claude-code` sets up:**
1. Wraps every stdio MCP server in `.mcp.json` with `rind-proxy wrap`
2. Adds a `PreToolUse` hook in `.claude/settings.json` that calls `POST /hook/evaluate`
3. Generates a starter `rind.policy.yaml` with `cli-protection` enabled

**Known limitation — subagents**: Claude Code `PreToolUse` hooks fire in the parent agent's scope. When Claude Code spawns a subagent (via the `Agent` tool), the parent's hooks do NOT fire for the subagent's tool calls. The subagent must have hooks configured at its own level. Mitigation: configure Rind hooks in subagent settings too; document this in team runbooks.

---

### Gemini CLI

| Surface | Coverage | How |
|---------|----------|-----|
| MCP tools | **100%** | Stdio wrapper (`rind-proxy wrap`) applied to Gemini MCP config |
| Built-in tools | **100%** (expected) | Gemini CLI supports hooks (`preToolCall`, `postToolCall`) — same pattern as Claude Code `PreToolUse`/`PostToolUse`. Rind's `/hook/evaluate` and `/hook/event` endpoints are agent-agnostic. |

**Status**: Not yet tested. Gemini CLI hook protocol is structurally similar to Claude Code hooks (JSON payload on stdin, blocking for pre-tool, non-blocking for post-tool). Integration requires:
1. Mapping Gemini CLI hook payload fields to Rind's `HookRequestSchema` (field names may differ)
2. Adding a `rind-hook-gemini.sh` script (or making the existing script detect the caller)
3. Testing with `gemini` CLI to confirm hook behavior matches expectations

**Estimated effort**: 1-2 days once Gemini CLI hook docs are verified.

---

### Cursor

| Surface | Coverage | How |
|---------|----------|-----|
| MCP tools | **100%** | Stdio wrapper (`rind-proxy wrap`) applied to `.cursor/mcp.json` |
| Built-in tools | **~80%** | Shell guard (`rind guard install`) — `preexec` + PATH wrappers for top-10 dangerous CLIs |
| File I/O (built-in) | **GAP** | Cursor has no pre-execution hook API for file operations |

**Gap detail**: Cursor has no equivalent of Claude Code's `PreToolUse`. File operations (create, edit, delete) by Cursor's built-in tools bypass Rind entirely. VS Code's `onWillCreateFiles` / `onWillDeleteFiles` workspace events only cover VS Code API-routed operations, not direct filesystem calls.

**Available now**: MCP wrapper via `rind-proxy init --cursor` (Phase A).  
**Phase B (contingent on demand)**: Shell guard for CLI commands.

---

### Windsurf

| Surface | Coverage | How |
|---------|----------|-----|
| MCP tools | **100%** | Stdio wrapper applied to `mcp_config.json` |
| Built-in tools | **~80%** | Shell guard — same pattern as Cursor |
| File I/O (built-in) | **GAP** | Same VS Code API limitation as Cursor |

---

### GitHub Copilot Agent

| Surface | Coverage | How |
|---------|----------|-----|
| MCP tools | **100%** | Stdio wrapper applied to `.vscode/mcp.json` |
| Built-in tools | **~80%** | Shell guard |
| File I/O (built-in) | **GAP** | Same VS Code API limitation |

---

### Cline (VS Code extension)

| Surface | Coverage | How |
|---------|----------|-----|
| MCP tools | **100%** | Stdio wrapper applied to `cline_mcp_settings.json` |
| Built-in tools | **~80%** | Shell guard |
| File I/O (built-in) | **GAP** | Same VS Code API limitation |

---

## Summary Table

```
                     Surface 1             Surface 2
                     MCP tools             Built-in + CLI
                     ───────────────────   ──────────────────────────
Claude Code          100% ✓               100% ✓  (PreToolUse hook)

Gemini CLI           100% ✓ (expected)    100% ✓  (preToolCall hook — untested)

Cursor               100% ✓               ~80% ⚠  (shell guard, Phase B)
                                          File I/O: GAP

Windsurf             100% ✓               ~80% ⚠  (shell guard, Phase B)
                                          File I/O: GAP

Copilot Agent        100% ✓               ~80% ⚠  (shell guard, Phase B)
                                          File I/O: GAP

Cline                100% ✓               ~80% ⚠  (shell guard, Phase B)
                                          File I/O: GAP
```

---

## Incident Reference: Why MCP Surface Matters Most

Every catastrophic AI agent incident on record was via an external tool (Surface 1), not a built-in tool:

| Incident | Tool type | Rind coverage |
|----------|-----------|--------------|
| Replit DB deletion (agent deleted prod DB) | MCP/API tool | Blocked by policy |
| $47K agent loop (agent ran up cloud bill) | MCP/API tool | Blocked by rate limit |
| Amazon Kiro outage (agent modified prod infra) | MCP/API tool | Blocked by policy |
| WhatsApp data exfiltration | MCP/API tool | Blocked by data-exfiltration pack |
| Supabase prompt injection | MCP/API tool | Blocked by scan-on-connect |

Built-in tool risks are real but lower-frequency. The MCP surface is where organizations lose money, data, and production uptime.

---

## What "~80% CLI Coverage" Means (Phase B)

Shell guard covers the top dangerous CLIs via:
1. `preexec` function in bash/zsh — fires before every shell command, calls `/hook/evaluate`
2. PATH-priority wrappers for: `aws`, `gh`, `kubectl`, `docker`, `supabase`, `stripe`, `npm`, `git` (for `push --force`), `rm` (for `-rf`), `curl` (for POST with data)

**What shell guard does NOT cover:**
- Subshells that don't inherit `preexec` (e.g., `bash -c "..."` called directly by tool internals)
- Direct `system()` calls from tool implementations that bypass the user's shell
- Python/Node scripts that use `subprocess` or `child_process` directly

**Honest label**: Shell guard *reduces risk* from CLI commands. It is defense-in-depth, not a guarantee. Document this to users — never claim full coverage.

---

## Documented Gaps and Mitigations

| Gap | Affected tools | Mitigation |
|-----|---------------|------------|
| Subagent hooks (Claude Code) | Claude Code only | Configure hooks at subagent level; document in team runbooks |
| File I/O by built-in tools | Cursor, Windsurf, Copilot, Cline | Use git pre-commit hooks for sensitive paths; VS Code file watcher for observability |
| Direct subprocess in tool internals | All VS Code-based tools | Shell guard reduces but does not eliminate; code review for agent-generated scripts |
| `bash -c` subshells | All (when shell guard installed) | `BASH_ENV` hook injection as fallback (experimental) |

---

## Roadmap

| Phase | Scope | Status |
|-------|-------|--------|
| **Phase A** | Claude Code 100% + MCP all tools | **Complete** |
| **Phase B** | Shell guard for Cursor/Windsurf CLI | Contingent on user demand |
| **Phase C** | VS Code observability extension | Optional; observability only, not enforcement |
| **Phase D** | Tool maker partnerships (pre-execution hook APIs) | Strategic; Month 4+ |

**Kill criteria for Phase B**: If shell guard false-positive rate exceeds 20% in beta — do not ship. Document the gap honestly instead.

---

## How to Install

### Claude Code (100% coverage)
```bash
npx @rind/proxy init --claude-code
# Wraps all .mcp.json servers + adds PreToolUse hooks
# Every tool call — built-in AND MCP — goes through Rind
```

### Other tools (MCP coverage now, CLI in Phase B)
```bash
npx @rind/proxy init --cursor    # coming Phase A
npx @rind/proxy init --windsurf  # coming Phase A
```

---

*Questions or corrections: open an issue or check the [architecture decisions](architecture/architecture-decisions.md).*
