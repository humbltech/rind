# Rind TODO

## Review & Implement

---

### MCP Interceptor Layer — Remote MCP Access Logging & Policy Control

**Reference**: Railway changelog (2026-04-17) — https://railway.com/changelog/2026-04-17-remote-mcp

**Context**:
Railway shipped native remote MCP support with interceptor middleware — meaning they sit in the path of every MCP connection and can log, inspect, and control access. This is exactly what Rind's MCP proxy is designed to do, but we need to ensure our implementation matches (or exceeds) what infrastructure providers are now shipping natively.

**What to implement / verify:**

1. **Remote MCP transport interceptors** (HTTP/SSE)
   - Our existing `mcp-proxy.md` covers stdio/SSE/HTTP, but we need a concrete interceptor abstraction that wraps each transport
   - Each interceptor should fire hooks: `onConnect`, `onToolCall`, `onToolResult`, `onDisconnect`
   - See: `rind/proxy/interceptors/mcp.py` (planned in roadmap Week 9)

2. **Per-connection access log**
   - Log: who connected (agent identity), to which MCP server, which tools were listed vs called, timestamps, duration
   - Structured log entry per tool call (not just per session)
   - Already in `AuditEvent` schema in `mcp-proxy.md` — needs to be wired to remote transport

3. **Policy enforcement at connection time**
   - Server allowlist checked before connection is established (not just per tool call)
   - Reject unauthorized MCP servers before any tool listing occurs
   - Map to existing `mcp-allowlist` policy type in `mvp-roadmap.md` Week 9

4. **Session context propagation**
   - Each MCP session should carry a trace ID that links all tool calls within it
   - Enables "what did this agent do in this session" queries in audit UI

5. **Competitor signal**
   - Railway shipping this natively means infra providers will start including basic MCP logging for free
   - Rind needs to differentiate on: policy enforcement (not just logging), cross-provider visibility, compliance exports, and anomaly detection
   - Consider whether to position against this: "Railway logs it, Rind governs it"

**Priority**: High — this is core MVP scope (Week 9 in roadmap)

**Next step**: Review Railway's implementation details from the changelog, then finalize the interceptor interface in `rind/proxy/interceptors/mcp.py` before starting Week 9 work.

---

### Session Lifecycle — `Stop` Hook + Natural Session End

**Context**: Claude Code fires a `Stop` hook event when the agent finishes a task (natural end of a session). RIND currently registers `PreToolUse`, `PostToolUse`, `SubagentStart`, and `SubagentStop` hooks, but not `Stop`. The `session.ts` `kill()` method sets `active = false` but is only used by the kill-switch (forced termination). There is no concept of natural session completion in the store.

**What to implement:**

1. **`Session` type** — add `endedAt?: number` field
2. **`ISessionStore`** — add `end(sessionId: string): boolean` method (sets `active = false`, records `endedAt`)
3. **`hook.ts` `/hook/event` handler** — when `event.eventType === 'Stop'`, call `sessionStore.end(sid)`
4. **`settings-json.ts` / `init.ts`** — add `Stop` to the EVENT_HOOKS array so `rind-proxy init` writes it
5. **Dashboard** — session list shows ended sessions greyed out (not counted as active); session timeline page shows a "Session ended" terminal event
6. **`/status` API** — `sessions.active` count only includes sessions without `endedAt`

**Why deferred**: No consumer currently uses `endedAt` and the dashboard already handles session inactivity gracefully. Adding it properly requires touching the type, store, route, CLI, and dashboard — a full cross-cutting slice worth a dedicated PR.

**Priority**: Medium — improves dashboard accuracy but not blocking for MVP.

---
