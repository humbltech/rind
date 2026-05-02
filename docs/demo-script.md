# Rind Demo Script

**Format:** 2 terminals + browser. Takes ~15 minutes end-to-end.

---

## Setup (do this before the demo)

```bash
# Terminal 1 — proxy
pnpm build
pnpm rind-proxy          # starts on :7777

# Terminal 2 — dashboard
pnpm --filter dashboard dev   # opens on :3000

# Browser — open these tabs before starting
http://localhost:3000          # Overview
http://localhost:3000/logs     # Logs (LLM tab)
http://localhost:3000/policies # Policies
```

Verify proxy is up: `curl http://localhost:7777/status`

---

## Act 1 — The incident that started it all (Replit DB deletion)

> *"This is the real incident from 2024. Agent gets asked to clean up test data. No guardrails. Drops the users table."*

**Run without Rind:**
```bash
pnpm sim replit-db-deletion --no-proxy
```
Watch the agent call `db.execute("DROP TABLE users CASCADE")`. Nothing stops it.

**Run with Rind:**
```bash
pnpm sim replit-db-deletion --http http://localhost:7777 --enable-policy sql-protection --interactive
```
- `--interactive` pauses between steps — use it to narrate each turn
- Dashboard → Logs → Tools tab shows the blocked `db.execute` call in real time
- Click the row: see the full input (`DROP TABLE users CASCADE`), outcome BLOCKED, matched rule

**Show in dashboard:**
1. Overview page — blocked count increments, threat indicator fires
2. Logs → LLM tab → expand the thread: USER prompt → ASSISTANT "I'll clean up..." → TOOL `db.execute` → **RIND: ⛔ BLOCKED** → returned to LLM message → ASSISTANT "I was unable to execute..."
3. Sessions page → click the session: same flow, full narrative

---

## Act 2 — Human in the loop (Kiro infra outage)

> *"Amazon's Kiro agent deleted production infrastructure. The fix isn't always blocking — sometimes you want a human to approve first."*

```bash
pnpm sim kiro-infra-outage --http http://localhost:7777 --interactive
```

- Agent lists cloud resources (allowed), then attempts `infra.delete_resource` on prod DB
- Dashboard → Overview: **approval banner appears** with a countdown timer
- Click **Approve** or **Deny** in the banner — decision feeds back to the agent in real time
- Show: this is the same policy engine, different action — REQUIRE_APPROVAL instead of DENY

---

## Act 3 — Loop detection ($47K agent loop)

> *"Real startup burned $47K in a weekend on an agent that looped itself. Rind catches it at the third identical call."*

```bash
pnpm sim cost-runaway-loop --http http://localhost:7777 --interactive
```

- Agent delegates to a sub-agent 3x with identical input
- On the 3rd call: BLOCKED with `BLOCKED_LOOP`
- Logs → LLM tab: shows cost accumulating per turn, then stops
- Stats strip on the session page shows total cost + blocked count

---

## Act 4 — Supply chain attack (Tool poisoning)

> *"You install an MCP server from npm. You don't read 400 lines of tool descriptions. The attacker did."*

```bash
pnpm sim tool-poisoning --http http://localhost:7777 --interactive
```

- Rind scans tool definitions on connect — fires before a single tool call happens
- Dashboard → Policies tab → Scan Findings section: shows TOOL_POISONING + SCHEMA_DRIFT detections
- This is the scan-on-connect feature: static analysis at install time, not runtime

---

## Closing talking points

| What you just saw | The insight |
|-------------------|-------------|
| Replit scenario | Prompt-level tools can't stop this. Rind sits at the execution layer. |
| Kiro approval | Not everything should be blocked — Rind gives you the dial. |
| Cost loop | Visibility alone doesn't stop the $47K weekend. Enforcement does. |
| Tool poisoning | The attack surface is the MCP registry, not just the prompt. |

**The one-liner:** *"One proxy. Every tool call goes through it. You see everything, you control everything."*

---

## Useful flags

| Flag | Use |
|------|-----|
| `--no-proxy` | Show what happens without Rind (before/after comparison) |
| `--interactive` | Pause between steps — lets you narrate live |
| `--instant` | Skip streaming delays for faster runs |
| `--enable-policy <pack>` | Activate a pack for this scenario |
| `--no-cleanup` | Leave the pack enabled after scenario ends |

## Policy pack IDs

| Pack | Protects against |
|------|-----------------|
| `sql-protection` | Destructive SQL (DROP, DELETE, TRUNCATE) |
| `cli-protection` | Shell commands, file deletions, infra changes |
| `data-protection` | PII access, credential exfiltration |
| `llm-safety` | Model bans, cost limits, prompt injection |
| `communication` | Email/Slack sends, external API posts |
