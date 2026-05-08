#!/usr/bin/env bash
# Start Rind dev services across dedicated tmux sessions.
#
# Sessions:
#   rind-proxy      — proxy server (port 7777) + dashboard (port 3000)
#   rind-cloud      — Claude Code in the rind repo
#   rind-demo       — demo server + MCP GraphQL server
#   rind-demo-cloud — Claude Code in the rind-demo repo
#
# Usage:
#   bash scripts/dev.sh              # start all sessions (skips already-running ones)
#   bash scripts/dev.sh --kill       # kill all rind-* sessions
#   bash scripts/dev.sh --kill rind-proxy   # kill a specific session
#
# Environment overrides:
#   RIND_DEMO_REPO=/path/to/rind-demo   (default: sibling of rind repo)
#   PROXY_PORT=7777                     (default: 7777)
#   RIND_POLICY_FILE=/path/to/policy    (optional)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RIND_REPO="$(cd "${SCRIPT_DIR}/.." && pwd)"
ALL_SESSIONS=("rind-proxy" "rind-cloud" "rind-demo" "rind-demo-cloud")

# ── Resolve rind-demo repo ────────────────────────────────────────────────────
if [ -z "${RIND_DEMO_REPO:-}" ]; then
  CANDIDATE="$(cd "${RIND_REPO}/.." && pwd)/rind-demo"
  [ -d "$CANDIDATE" ] && RIND_DEMO_REPO="$CANDIDATE" || RIND_DEMO_REPO=""
fi

# ── Kill / restart flags ──────────────────────────────────────────────────────
if [ "${1:-}" = "--kill" ]; then
  if [ -n "${2:-}" ]; then
    tmux kill-session -t "$2" 2>/dev/null && echo "Killed '$2'." || echo "No session '$2' found."
  else
    for s in "${ALL_SESSIONS[@]}"; do
      tmux kill-session -t "$s" 2>/dev/null && echo "Killed '$s'." || true
    done
    echo "All rind sessions stopped."
  fi
  exit 0
fi

if [ "${1:-}" = "--restart" ]; then
  TARGET="${2:-}"
  if [ -z "$TARGET" ]; then
    echo "Usage: dev.sh --restart <session>"
    echo "  Sessions: ${ALL_SESSIONS[*]}"
    exit 1
  fi
  tmux kill-session -t "$TARGET" 2>/dev/null && echo "Killed '$TARGET'." || echo "Session '$TARGET' was not running."
  exec bash "$0"
fi

# ── Guards ────────────────────────────────────────────────────────────────────
if ! command -v tmux &>/dev/null; then
  echo "ERROR: tmux not installed.  sudo apt install tmux"
  exit 1
fi

if ! command -v claude &>/dev/null; then
  echo "WARNING: 'claude' not in PATH — cloud sessions will open a shell instead."
  CLAUDE_CMD="bash"
else
  CLAUDE_CMD="claude"
fi

# ── Helpers ───────────────────────────────────────────────────────────────────
session_running() { tmux has-session -t "$1" 2>/dev/null; }

free_port() { fuser -k "$1/tcp" 2>/dev/null || true; }

new_session() {
  local session="$1" window="$2" cmd="$3"
  tmux new-session -d -s "$session" -n "$window" -x 220 -y 50 \
    "bash -c \"$cmd; echo '[$window exited — press enter]'; read\""
}

add_window() {
  local session="$1" window="$2" cmd="$3"
  tmux new-window -t "$session" -n "$window" \
    "bash -c \"$cmd; echo '[$window exited — press enter]'; read\""
}

# ── rind-proxy  (proxy server + dashboard) ────────────────────────────────────
if session_running "rind-proxy"; then
  echo "[rind-proxy] already running — skipping."
else
  free_port "${PROXY_PORT:-7777}"
  free_port 3040

  PROXY_CMD="cd '${RIND_REPO}'"
  [ -n "${RIND_POLICY_FILE:-}" ] && PROXY_CMD+=" && export RIND_POLICY_FILE='${RIND_POLICY_FILE}'"
  PROXY_CMD+=" && pnpm --filter @rind/proxy dev"

  DASHBOARD_CMD="sleep 3 && cd '${RIND_REPO}' && pnpm --filter @rind/dashboard dev"

  new_session "rind-proxy" "proxy"     "${PROXY_CMD}"
  add_window  "rind-proxy" "dashboard" "${DASHBOARD_CMD}"
  tmux select-window -t "rind-proxy:proxy"
  echo "[rind-proxy] started."
fi

# ── rind-cloud  (Claude Code — rind repo) ─────────────────────────────────────
if session_running "rind-cloud"; then
  echo "[rind-cloud] already running — skipping."
else
  new_session "rind-cloud" "claude" "cd '${RIND_REPO}' && ${CLAUDE_CMD}"
  echo "[rind-cloud] started."
fi

# ── rind-demo  (demo server + MCP GraphQL) ────────────────────────────────────
if [ -z "${RIND_DEMO_REPO:-}" ] || [ ! -d "${RIND_DEMO_REPO}" ]; then
  echo "[rind-demo] skipped — repo not found (set RIND_DEMO_REPO= to override)."
elif session_running "rind-demo"; then
  echo "[rind-demo] already running — skipping."
else
  free_port 8082
  free_port 8083

  DEMO_DIR="${RIND_DEMO_REPO}/demo/pocketos"
  DEMO_SERVER_CMD="cd '${DEMO_DIR}/fake-railway-mcp' && npm install --silent && npm start"
  MCP_GRAPHQL_CMD="cd '${DEMO_DIR}/fake-railway-graphql' && npm install --silent && npm start"

  new_session "rind-demo" "demo-server" "${DEMO_SERVER_CMD}"
  add_window  "rind-demo" "mcp-graphql" "${MCP_GRAPHQL_CMD}"
  tmux select-window -t "rind-demo:demo-server"
  echo "[rind-demo] started."
fi

# ── rind-demo-cloud  (Claude Code — rind-demo repo) ───────────────────────────
if [ -z "${RIND_DEMO_REPO:-}" ] || [ ! -d "${RIND_DEMO_REPO}" ]; then
  echo "[rind-demo-cloud] skipped — repo not found."
elif session_running "rind-demo-cloud"; then
  echo "[rind-demo-cloud] already running — skipping."
else
  new_session "rind-demo-cloud" "claude" "cd '${RIND_DEMO_REPO}' && ${CLAUDE_CMD}"
  echo "[rind-demo-cloud] started."
fi

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo "=== Rind sessions ==="
echo "    rind-proxy      → proxy :${PROXY_PORT:-7777}  |  dashboard :3040"
echo "    rind-cloud      → Claude Code  ($(basename "${RIND_REPO}"))"
if [ -n "${RIND_DEMO_REPO:-}" ] && [ -d "${RIND_DEMO_REPO}" ]; then
  echo "    rind-demo       → demo server  |  MCP GraphQL"
  echo "    rind-demo-cloud → Claude Code  ($(basename "${RIND_DEMO_REPO}"))"
fi
echo ""
echo "Attach:    tmux attach -t <session>"
echo "Kill one:  pnpm session --kill <session>"
echo "Kill all:  pnpm session:kill"
