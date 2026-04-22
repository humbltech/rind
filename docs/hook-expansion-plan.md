# Hook Expansion Plan — Full Claude Code Integration

> Related: D-040 (Endpoint Agent Integration), `apps/proxy/src/hooks/claude-code.ts`

## Current State

Rind hooks into Claude Code via `POST /hook/evaluate` handling **PreToolUse** only. This gives us tool-level interception (block/allow) but limited observability. Calls from subagents are captured (PreToolUse fires with `agent_id` populated), but we don't see subagent lifecycle, user prompts, or session boundaries.

## All Available Claude Code Hooks

| Hook | Blocking | Key Payload | Priority |
|------|----------|-------------|----------|
| **PreToolUse** | Yes | `tool_name`, `tool_input`, `agent_id`, `agent_type`, `cwd` | **Shipping** |
| **PostToolUse** | Yes | Same + `tool_response` | **Phase 1** |
| **SubagentStart** | No | `agent_type`, `agent_id`, `prompt` | **Phase 1** |
| **SubagentStop** | Yes | `agent_type`, `agent_id`, `stop_reason`, `agent_transcript_path` | **Phase 1** |
| **UserPromptSubmit** | Yes | `prompt` (full user text) | **Phase 2** |
| **PostToolUseFailure** | No | `tool_name`, `error`, `is_interrupt` | **Phase 2** |
| **SessionStart** | No | `session_id`, `source`, `model` | **Phase 2** |
| **CwdChanged** | No | `previous_cwd`, `cwd` | **Phase 2** |
| **FileChanged** | No | `file_path`, `change_type` | **Phase 3** |
| **Stop** | Yes | `stop_reason` | **Phase 3** |
| **PermissionRequest** | Yes | `tool_name`, `permission_suggestions` | **Phase 3** |
| **SessionEnd** | No | `session_id` | **Phase 3** |

## Phased Rollout

### Phase 1: Observability Depth (Next)

**Goal**: Full audit trail — see tool outcomes and subagent trees.

1. **PostToolUse** — Capture tool responses for the audit trail. Enables response-side threat inspection on hook path too.
2. **SubagentStart** — Track when subagents spawn, what task they received, their agent type.
3. **SubagentStop** — Track completion, stop reason, link to subagent transcript.

**Endpoint**: `POST /hook/event` — a general-purpose observability endpoint that accepts any hook event, stores it, and returns `200` (no block/allow decision needed).

**Schema**:
```typescript
// Accepts any Claude Code hook payload
interface HookEventRequest {
  session_id: string;
  hook_event_name: string;     // "PostToolUse" | "SubagentStart" | etc.
  tool_name?: string;          // Present for tool-related hooks
  tool_input?: unknown;
  tool_response?: unknown;     // PostToolUse only
  agent_id?: string;
  agent_type?: string;
  cwd?: string;
  // Hook-specific fields passed through
  [key: string]: unknown;
}
```

### Phase 2: Context & Intent

**Goal**: Understand WHY tool calls happen and WHERE agents are working.

1. **UserPromptSubmit** — Capture the user prompt that triggered a sequence of tool calls. Correlate by session + timestamp to build prompt-to-tool-call chains.
2. **PostToolUseFailure** — Track failures, detect crash loops, alert on repeated errors.
3. **SessionStart** — Session lifecycle for analytics. Know when sessions start/resume/compact.
4. **CwdChanged** — Track which project/directory the agent is working in. Foundation for CWD-based policy scoping.

### Phase 3: Advanced Observability

1. **FileChanged** — Detect modifications to sensitive files (`.env`, credentials).
2. **Stop** — Turn boundary tracking for conversation-level analytics.
3. **PermissionRequest** — See what tools are requesting elevated permissions.
4. **SessionEnd** — Clean session lifecycle tracking.

## CWD-Based Policy Scoping

### The Problem

A user may have multiple Claude Code sessions working in different projects simultaneously. Each project may need different policies:

- `~/projects/frontend/` — allow file writes, block shell commands
- `~/projects/infrastructure/` — block all writes, allow read-only inspection
- `~/projects/data-pipeline/` — allow database queries, block external network

### Design Direction

**Data capture (Phase 2)**: Store `cwd` from every hook event. The CwdChanged hook tells us when the working directory shifts mid-session.

**Policy scoping (future)**: Policies can match on `cwd` using glob patterns:

```yaml
policies:
  - name: infra-readonly
    match:
      cwd:
        glob: "*/infrastructure/*"
      tool: ["Write", "Edit", "Bash"]
    action: DENY
```

**Implementation notes**:
- `cwd` is already in the hook payload — we just need to pass it through to the policy engine
- Add `cwd` field to `ToolCallEvent` type
- Add `cwd` matcher to `matchesRule()` in `policy/rules.ts`
- For the dashboard: group events by CWD to show per-project activity

## Subagent Tracking Architecture

### How Subagent Hooks Fire

```
Parent session
  ├─ UserPromptSubmit("Find and fix the bug")
  ├─ PreToolUse(Agent, {prompt: "Search for error"})     ← parent tool call
  │   └─ SubagentStart(agent_id: "abc", type: "Explore")
  │       ├─ PreToolUse(Grep, {pattern: "Error"})         ← subagent tool call (agent_id: "abc")
  │       ├─ PostToolUse(Grep, ...)
  │       ├─ PreToolUse(Read, {file: "server.ts"})        ← subagent tool call (agent_id: "abc")
  │       └─ PostToolUse(Read, ...)
  │   └─ SubagentStop(agent_id: "abc", stop_reason: "done")
  ├─ PostToolUse(Agent, {result: "Found bug in server.ts:42"})
  └─ PreToolUse(Edit, {file: "server.ts", ...})          ← parent tool call
```

**Key**: Subagent tool calls have `agent_id` and `agent_type` populated. Parent tool calls have `agent_id` as `hook:{session_id}` (our default). This is how we build the agent tree.

### What We Track Per Subagent

| Field | Source | Purpose |
|-------|--------|---------|
| `agent_id` | PreToolUse, SubagentStart | Unique ID, correlate all events |
| `agent_type` | PreToolUse, SubagentStart | "Explore", "Plan", "Bash", custom |
| `prompt` | SubagentStart | Task description — what was delegated |
| `stop_reason` | SubagentStop | How it ended |
| `transcript_path` | SubagentStop | Full conversation log if needed |
| Tool calls | PreToolUse (filtered by agent_id) | What the subagent actually did |

## Agent Identity & Naming

### Current Problem

Agents show as `hook:{session_id}` in the dashboard — not human-readable.

### Solution Layers

1. **Short-term**: Use `agent_type` from hook payload when available (e.g., "Explore", "Plan"). For parent sessions, use a hash of `session_id` truncated to 8 chars.

2. **Medium-term**: Support agent naming in hook configuration. The hook script passes an `RIND_AGENT_NAME` env var:
   ```bash
   RIND_AGENT_NAME="claude-code-main" RIND_PROXY_URL=http://localhost:7777 rind-hook.sh
   ```

3. **Long-term**: API key / token-based identity. Each installation registers with the proxy and gets a human-readable name mapped to its token.

## Hook Configuration

### Current (PreToolUse only)

In `~/.claude/settings.json`:
```json
{
  "hooks": {
    "PreToolUse": [{
      "type": "command",
      "command": "/path/to/rind-hook.sh"
    }]
  }
}
```

### Target (Full observability)

```json
{
  "hooks": {
    "PreToolUse": [{
      "type": "command",
      "command": "/path/to/rind-hook.sh"
    }],
    "PostToolUse": [{
      "type": "command",
      "command": "/path/to/rind-event.sh"
    }],
    "SubagentStart": [{
      "type": "command",
      "command": "/path/to/rind-event.sh"
    }],
    "SubagentStop": [{
      "type": "command",
      "command": "/path/to/rind-event.sh"
    }],
    "UserPromptSubmit": [{
      "type": "command",
      "command": "/path/to/rind-event.sh"
    }],
    "SessionStart": [{
      "type": "command",
      "command": "/path/to/rind-event.sh"
    }],
    "CwdChanged": [{
      "type": "command",
      "command": "/path/to/rind-event.sh"
    }]
  }
}
```

Two scripts: `rind-hook.sh` (PreToolUse — needs block/allow response) and `rind-event.sh` (everything else — fire-and-forget observability).

## Dual Interception Architecture (Hook + MCP Proxy)

### The Problem

When Rind is deployed as both a Claude Code hook AND an MCP proxy, MCP tool calls pass through two enforcement points. Without dedup, the same call is evaluated twice, logged twice, and potentially blocked at both layers with confusing error messages.

### Three Scenarios

| Scenario | Hook | MCP Proxy | Result |
|----------|------|-----------|--------|
| Builtin tool (Bash, Edit, Read, Grep) | Evaluates | Never sees it | Clean — hook is the only enforcer |
| MCP tool routed through proxy | Evaluates | Evaluates + inspects response | **Duplicate policy eval** |
| MCP tool NOT routed through proxy | Evaluates | Never sees it | **No response inspection** |

### Responsibility Split

**Hook = universal policy enforcement + full observability**
- Sees ALL tool calls (builtin + MCP) before they execute
- Makes allow/deny decisions based on policy engine
- Captures context: CWD, session, agent identity, tool input
- Cannot see tool responses (PreToolUse fires before execution)

**MCP Proxy = protocol-level deep inspection**
- Scans tool definitions on connect (schema drift, poisoning, shadowing)
- Inspects tool responses for credential leaks, prompt injection in output
- Validates MCP protocol compliance
- Can enforce per-tool-definition policies (based on schema analysis)

**The hook cannot replace the proxy** because:
1. No response inspection — credential leaks in tool output are invisible to hooks
2. No schema scanning — tool definition analysis requires the MCP protocol handshake
3. No cross-server shadowing detection — requires seeing all servers' tool lists together

**The proxy cannot replace the hook** because:
1. Builtin tools (Bash, Edit, Write) never touch MCP — only the hook sees them
2. MCP tools not routed through the proxy are invisible
3. Hook fires before execution; proxy receives the call after the client sends it

### Dedup Strategy

When both hook and proxy are active for the same MCP tool call:

1. **Hook evaluates first** (PreToolUse fires before the MCP client sends the request)
   - Runs policy evaluation (steps 1-5: kill-switch, loop detection, policy, rate limit)
   - Tags the event with `source: 'mcp'`
   - If DENY → tool call never reaches the proxy

2. **Proxy receives the call** (only if hook allowed it)
   - Skips redundant policy evaluation (hook already decided)
   - Runs response-side inspection only (credential leak, injection in output)
   - Runs schema-level checks (if this is a new/modified tool definition)

**Implementation**: The proxy checks for a `X-Rind-Hook-Evaluated: true` header (or similar signal) to know the hook already made a policy decision. If present, proxy skips policy steps and only runs response inspection.

### MCP Server Protection States (Dashboard)

The dashboard shows MCP servers in three states:

| State | Meaning | Visual | Action |
|-------|---------|--------|--------|
| **Proxied** | Routed through Rind MCP proxy | Green shield | Full protection (policy + response scan + schema scan) |
| **Observed** | Detected via hook only (mcp__* tool calls) | Yellow eye | Policy enforcement only — no response scanning. Recommend proxy routing. |
| **Disconnected** | Previously seen, no recent calls | Gray circle | No current protection |

**Detection logic**:
- Hook sees `mcp__google_drive__list_files` → server `google_drive` is "Observed"
- Proxy has `google_drive` in its server map → server is "Proxied"
- If hook sees an MCP server NOT in the proxy's server map → show warning:
  > "MCP server `google_drive` detected via hook but not routed through Rind proxy. Tool responses are not inspected for credential leaks or injection. [Route through proxy →]"

### Future: Auto-Routing

When the hook detects an unproxied MCP server, Rind could offer to auto-configure routing:
1. Hook captures the MCP server name from the `mcp__<server>__<tool>` pattern
2. `rind-proxy init` reads Claude Code's `.mcp.json` to find the server's connection config
3. Generates a wrapped config that routes through the Rind proxy
4. User approves and the MCP server is now proxied

This closes the loop: hook detects → proxy protects → dashboard confirms.

## Data Model Changes

### ToolCallEvent (extend)

```typescript
interface ToolCallEvent {
  // ... existing fields
  cwd?: string;           // Working directory from hook payload
  agentType?: string;     // "Explore", "Plan", etc. from hook payload
  toolInput?: unknown;    // Full tool input for audit/display (separate from 'input' used for policy matching)
}
```

### New Event Types

```typescript
interface SubagentEvent {
  sessionId: string;
  agentId: string;
  agentType: string;
  prompt?: string;         // SubagentStart only
  stopReason?: string;     // SubagentStop only
  transcriptPath?: string; // SubagentStop only
  timestamp: number;
}

interface PromptEvent {
  sessionId: string;
  prompt: string;
  timestamp: number;
}

interface SessionEvent {
  sessionId: string;
  eventType: 'start' | 'end' | 'cwd_changed';
  cwd?: string;
  previousCwd?: string;
  model?: string;
  source?: string;        // "startup" | "resume" | "clear" | "compact"
  timestamp: number;
}
```

## Future: Structured Tool Sub-Commands

**Status**: Deferred — `toolLabel` provides display-level extraction now. Structured field needed later for filtering/grouping/policy matching.

**Problem**: `toolLabel` is a display string ("Bash: git status"). For filtering ("show me all git operations") or policy rules ("block all curl commands"), we need a structured field.

**Proposed data model addition**:

```typescript
interface ToolCallEvent {
  // ... existing fields
  toolLabel?: string;      // "Bash: git status" — display only (shipping now)
  toolSubCommand?: string; // "git" — structured, for filtering/policy (future)
}
```

**Extraction rules by tool**:

| Tool | SubCommand source | Example |
|------|------------------|---------|
| Bash | First token of `command` | `git`, `curl`, `npm`, `docker` |
| WebFetch | URL domain | `github.com`, `api.stripe.com` |
| WebSearch | — (no sub-command) | — |
| Agent | `subagent_type` | `Explore`, `Plan`, `code-reviewer` |
| Read/Write/Edit | File extension | `.ts`, `.md`, `.json` |
| Grep/Glob | — (no sub-command) | — |

**Use cases**:
- Policy rules: `match: { tool: ["Bash"], subCommand: ["rm", "curl", "docker"] }` — block dangerous Bash sub-commands
- Dashboard filtering: "show all git operations across sessions"
- Analytics: "which CLI tools does this agent use most?"
