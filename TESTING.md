# RIND Testing Guide

Step-by-step instructions for setting up RIND locally, running simulations, and manually verifying each protection type.

---

## Prerequisites

```bash
# From the repo root
pnpm install
pnpm build
```

---

## 1. Start the proxy + dashboard

Open two terminals:

```bash
# Terminal 1 — proxy (port 7777)
cd apps/proxy
pnpm dev

# Terminal 2 — dashboard (port 3000)
cd apps/dashboard
pnpm dev
```

Dashboard: http://localhost:3000  
Proxy API: http://localhost:7777

---

## 2. Init: tool call interception only

Hooks route every `PreToolUse` event through the proxy for policy evaluation.

### Project-local (recommended for testing)

Writes to `.claude/settings.json` in the current directory — only fires when Claude Code is opened in this project.

```bash
cd /your/project
rind-proxy init --local --no-llm-proxy
```

What gets written to `.claude/settings.json`:
```json
{
  "hooks": {
    "PreToolUse":    [{ "hooks": [{ "type": "command", "command": "curl -s -X POST http://localhost:7777/hook/evaluate ..." }] }],
    "PostToolUse":   [{ "hooks": [{ "type": "command", "command": "curl -s -X POST http://localhost:7777/hook/event ..." }] }],
    "SubagentStart": [{ "hooks": [{ "type": "command", "command": "curl -s -X POST http://localhost:7777/hook/event ..." }] }],
    "SubagentStop":  [{ "hooks": [{ "type": "command", "command": "curl -s -X POST http://localhost:7777/hook/event ..." }] }]
  }
}
```

`PreToolUse` is the only **blocking** hook — the proxy can DENY or pause for approval before the tool runs. The others are fire-and-forget observability events.

Verify:
```bash
# Dry-run to preview without writing
rind-proxy init --local --no-llm-proxy --dry-run
```

### Global (all projects)

```bash
rind-proxy init --global --no-llm-proxy
```

### PreToolUse only (enforcement without observability)

Add only the blocking hook — no PostToolUse/SubagentStart/SubagentStop events sent to the proxy.
Useful when you want policy enforcement but don't need the session timeline or tool call logs.

```bash
rind-proxy init --local --no-llm-proxy --pre-tool-only
```

---

## 3. Init: LLM call interception

Redirects `ANTHROPIC_BASE_URL` / `OPENAI_BASE_URL` so Claude Code's API calls pass through the proxy.

### Project-local LLM interception

```bash
cd /your/project
rind-proxy init --local
```

What gets added to `.claude/settings.json`:
```json
{
  "env": {
    "ANTHROPIC_BASE_URL": "http://localhost:7777/llm/anthropic",
    "OPENAI_BASE_URL":    "http://localhost:7777/llm/openai"
  }
}
```

Claude Code's Anthropic API calls now hit `/llm/anthropic/v1/messages` on the proxy.

### Both tool + LLM (full interception)

```bash
rind-proxy init --local   # enables both by default
```

### LLM only, no hooks

```bash
rind-proxy init --local --no-hooks   # skips PreToolUse/PostToolUse
```

---

## 4. Wrap MCP servers (optional)

If you have `.mcp.json` with stdio servers, wrap them so the proxy can intercept their tool calls too:

```bash
rind-proxy init --local --mcp-json .mcp.json
```

This rewrites each stdio entry to route through `rind-proxy wrap --`.

---

## 5. Uninit: remove all hooks + env vars

```bash
# Remove from current project
rind-proxy uninit --local

# Remove from global settings
rind-proxy uninit --global

# Preview without writing
rind-proxy uninit --local --dry-run
```

Removes:
- All `PreToolUse`, `PostToolUse`, `SubagentStart`, `SubagentStop` hooks pointing to RIND
- `ANTHROPIC_BASE_URL` and `OPENAI_BASE_URL` if they contain `/llm/`
- Unwraps `.mcp.json` entries back to their original command/args

---

## 6. Run simulations

All simulations are run from the `simulation/` directory using `pnpm sim`.

```bash
cd simulation

# List all available scenarios
pnpm sim list

# Run a scenario in demo mode (chat-style output, streamed)
pnpm sim replit-db-deletion

# Run without Rind to see what damage happens unprotected
pnpm sim replit-db-deletion --no-proxy

# Run against a live proxy
pnpm sim replit-db-deletion --http http://localhost:7777

# Enable a policy pack before running, then auto-disable it after
pnpm sim llm-pii-pseudonymized --http http://localhost:7777 --enable-policy llm-pii-pseudonymize-v1

# Enable a pack and keep it enabled after (so you can inspect it in the UI)
pnpm sim llm-pii-pseudonymized --http http://localhost:7777 --enable-policy llm-pii-pseudonymize-v1 --no-cleanup

# Step through scenario one event at a time (press Enter)
pnpm sim replit-db-deletion --interactive
```

---

## 7. Recommended scenarios by rule type

### Tool call rules (DENY / REQUIRE_APPROVAL)

| Rule type | Recommended scenario | Pack to enable | What to observe |
|-----------|---------------------|----------------|-----------------|
| Block SQL destruction | `replit-db-deletion` | `sql-protection` | `DROP TABLE` call gets `BLOCKED` in logs |
| Block dangerous shell | `copilot-rce` | `cli-protection` | `rm -rf`, curl exfil blocked |
| Block filesystem writes | `perplexity-drive-deletion` | `filesystem-protection` | Write to `/etc` blocked |
| Require approval for shell | any Bash-heavy scenario | `shell-protection` | Approval prompt appears in dashboard |
| Block MCP tool pattern | `tool-poisoning` | — | MCP tool blocked via `toolPattern` rule |
| Block cross-server calls | `whatsapp-cross-server-shadow` | — | Cross-server tool call blocked |
| Loop detection | `cost-runaway-loop` | — | Session flagged after repeated identical calls |

### LLM content rules (DENY / PSEUDONYMIZE / REDACT)

| Rule type | Recommended scenario | Pack to enable | What to observe |
|-----------|---------------------|----------------|-----------------|
| Block secrets in prompt | `llm-passthrough-and-audit` (with key in prompt) | `llm-secret-scan-v1` | 403 before forwarding; `outcome: blocked` in `/logs/llm-calls` |
| Pseudonymize PII in prompt | `llm-pii-pseudonymized` | `llm-pii-pseudonymize-v1` | Email/phone replaced with `<EMAIL_1>` in forwarded body |
| Block prompt injection | `llm-prompt-injection-blocked` | `llm-injection-guard-v1` | Injection detected; 403 returned |
| Redact PII in response | `llm-response-pii-redacted` | `llm-response-pii-redact-v1` | `[REDACTED]` in response body |
| Block forbidden model | `llm-blocked-by-model-policy` | `llm-model-restrict-v1` | `claude-opus-*` request blocked |
| Cost anomaly | `llm-cost-anomaly` | — | Token spike visible in dashboard LLM tab |

### Exfiltration / data leakage

| Scenario | Pack | What to observe |
|----------|------|-----------------|
| `echoleak-exfiltration` | `exfil-protection` | HTTP call with base64 body blocked |
| `supabase-ticket-injection` | `sql-protection` | SQL injection via API blocked |
| `openclaw-rug-pull` | — | Supply-chain attack visible in scan findings |

### Observability only (no blocking needed)

| Scenario | What to observe |
|----------|-----------------|
| `llm-passthrough-and-audit` | LLM calls appear in `/logs/llm-calls` with token counts and cost |
| `session-killswitch` | Session timeline shows delegation loop; session appears on Overview |
| `kiro-infra-outage` | Tool errors visible in event log |

---

## 8. Manual verification checklist

After `rind-proxy init --local` in a project:

**Tool call interception**
- [ ] Open Claude Code in the project directory
- [ ] Ask Claude to run `ls` → appears in dashboard Overview under Recent tool calls
- [ ] Create a DENY rule for `Bash` in the Policies page
- [ ] Ask Claude to run any bash command → gets blocked, shows `BLOCKED` in logs
- [ ] Create a `REQUIRE_APPROVAL` rule → approval banner appears in dashboard
- [ ] Approve or deny it → session timeline shows outcome

**LLM interception**
- [ ] Ask Claude anything → LLM call appears in Logs tab → Timeline tab
- [ ] Enable `llm-secret-scan-v1` pack in dashboard Policies → Packs
- [ ] Ask Claude to "use this key: sk-AAAAABBBBBBCCCCDDDDEEEEFFFFGGGGHHHH" → 403 blocked
- [ ] Enable `llm-pii-pseudonymize-v1` → ask Claude something mentioning an email → forwarded body has `<EMAIL_1>`, response is rehydrated

**Session timeline**
- [ ] Run a few tool calls and LLM calls
- [ ] Click a session on the Overview page → opens `/sessions/<id>`
- [ ] See chronological flow of events with outcomes, time deltas, and prompt previews

**Uninit**
- [ ] Run `rind-proxy uninit --local --dry-run` → preview removals
- [ ] Run `rind-proxy uninit --local` → verify `.claude/settings.json` no longer has RIND hooks or env vars
- [ ] Restart Claude Code → tool calls no longer appear in dashboard

---

## 9. Policy pack quick reference

Enable/disable packs via the Policies → Packs tab in the dashboard, or via API:

```bash
# Enable a pack
curl -X POST http://localhost:7777/packs/sql-protection/enable

# Disable a pack
curl -X DELETE http://localhost:7777/packs/sql-protection

# List packs + enabled state
curl http://localhost:7777/packs
```

| Pack ID | Protects against |
|---------|-----------------|
| `sql-protection` | DROP, TRUNCATE, DELETE, ALTER via SQL tools |
| `shell-protection` | All Bash/shell execution — requires approval |
| `filesystem-protection` | Writes to `/etc`, `/usr`, `/bin`, `/sys`, `/proc` |
| `exfil-protection` | HTTP calls with large base64-encoded payloads |
| `cli-protection` | `rm -rf`, force-push, npm publish, curl exfil, cloud delete |
| `llm-secret-scan-v1` | API keys / tokens in LLM prompts |
| `llm-pii-pseudonymize-v1` | PII in prompts (email, phone, SIN, credit card) |
| `llm-injection-guard-v1` | Prompt injection in outbound LLM requests |
| `llm-response-pii-redact-v1` | PII in LLM responses |
| `llm-model-restrict-v1` | High-cost model usage (claude-opus-* by default) |
