#!/usr/bin/env bash
# Rind — Claude Code PreToolUse hook runner
#
# Claude Code invokes this before every tool execution. This script forwards
# the hook payload to the running Rind proxy at POST /hook/evaluate and
# outputs the allow/deny decision.
#
# Fail behaviour: if the proxy isn't running, the hook exits 0 (allows the
# tool call) so that Claude Code continues working even without Rind running.
# Change RIND_FAIL_OPEN=false to fail closed (deny all when proxy is down).
#
# Usage in .claude/settings.json:
#   {
#     "hooks": {
#       "PreToolUse": [
#         {
#           "matcher": "",
#           "hooks": [{ "type": "command", "command": "bash /path/to/rind/scripts/rind-hook.sh" }]
#         }
#       ]
#     }
#   }

RIND_PROXY_URL="${RIND_PROXY_URL:-http://localhost:7777}"
RIND_FAIL_OPEN="${RIND_FAIL_OPEN:-true}"
# Max time to wait for the proxy response. Must be long enough for approval
# holds (REQUIRE_APPROVAL blocks until approved/denied/timed out). Claude Code
# hooks have a 600s hard limit, so 550s maximizes the approval window while
# leaving 50s before Claude Code kills the hook. Override with RIND_MAX_TIME.
RIND_MAX_TIME="${RIND_MAX_TIME:-550}"

# Read the full hook payload from stdin
payload=$(cat)

# Forward to Rind and capture response.
# --connect-timeout 2: fail fast if proxy isn't running at all
# --max-time $RIND_MAX_TIME: allow time for approval holds
response=$(curl -s --connect-timeout 2 --max-time "$RIND_MAX_TIME" \
  -X POST "${RIND_PROXY_URL}/hook/evaluate" \
  -H 'Content-Type: application/json' \
  -d "$payload" 2>/dev/null)

curl_exit=$?

# If curl failed (proxy not running, timeout, etc.)
if [ $curl_exit -ne 0 ] || [ -z "$response" ]; then
  if [ "$RIND_FAIL_OPEN" = "true" ]; then
    # Fail open — allow the tool call, log to stderr so it's visible in Claude Code logs
    echo '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"allow","additionalContext":"Rind proxy not running — failing open"}}' >&1
  else
    # Fail closed — block the tool call
    echo '{"continue":false,"stopReason":"Rind proxy not running","hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"Rind proxy not running"}}' >&1
  fi
  exit 0
fi

# Output Rind's response to stdout for Claude Code to parse
echo "$response"
