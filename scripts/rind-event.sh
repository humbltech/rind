#!/usr/bin/env bash
# Rind — Claude Code observability hook runner (non-blocking)
#
# Handles: PostToolUse, SubagentStart, SubagentStop, and any future
# non-blocking hooks. Fires-and-forgets to POST /hook/event.
#
# Unlike rind-hook.sh (PreToolUse), this script does NOT return a
# policy decision — it just records the event for observability.
# If the proxy is down, the event is silently dropped.
#
# Usage in .claude/settings.json:
#   {
#     "hooks": {
#       "PostToolUse": [
#         { "matcher": "", "hooks": [{ "type": "command", "command": "bash /path/to/rind/scripts/rind-event.sh" }] }
#       ],
#       "SubagentStart": [
#         { "matcher": "", "hooks": [{ "type": "command", "command": "bash /path/to/rind/scripts/rind-event.sh" }] }
#       ],
#       "SubagentStop": [
#         { "matcher": "", "hooks": [{ "type": "command", "command": "bash /path/to/rind/scripts/rind-event.sh" }] }
#       ]
#     }
#   }

RIND_PROXY_URL="${RIND_PROXY_URL:-http://localhost:7777}"

# Read the full hook payload from stdin
payload=$(cat)

# Fire-and-forget to Rind — silently drop if proxy is unavailable
curl -s --max-time 2 \
  -X POST "${RIND_PROXY_URL}/hook/event" \
  -H 'Content-Type: application/json' \
  -d "$payload" >/dev/null 2>&1

# Always exit 0 — observability hooks must never block the agent
exit 0
