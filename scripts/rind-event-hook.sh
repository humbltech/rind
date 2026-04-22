#!/usr/bin/env bash
# Rind — Claude Code event hook runner (PostToolUse, SubagentStart/Stop)
#
# Claude Code invokes this after tool execution and subagent lifecycle events.
# This script forwards the event payload to the running Rind proxy at
# POST /hook/event for observability. Non-blocking: always exits 0.
#
# Usage in .claude/settings.json:
#   {
#     "hooks": {
#       "PostToolUse": [
#         {
#           "matcher": "",
#           "hooks": [{ "type": "command", "command": "bash /path/to/rind/scripts/rind-event-hook.sh" }]
#         }
#       ]
#     }
#   }

RIND_PROXY_URL="${RIND_PROXY_URL:-http://localhost:7777}"

# Read the full hook payload from stdin
payload=$(cat)

# Forward to Rind — fire and forget, never block Claude Code
curl -s --max-time 2 \
  -X POST "${RIND_PROXY_URL}/hook/event" \
  -H 'Content-Type: application/json' \
  -d "$payload" > /dev/null 2>&1 || true

exit 0
