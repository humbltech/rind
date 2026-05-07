# Proxy Error Pipeline & Fixture MCP Server — Design Spec

**Date:** 2026-04-26  
**Status:** Approved  
**Scope:** Error event emission, MCP-compliant error responses, dashboard error visibility, fixture MCP server for tests and simulation

---

## Problem

Three related gaps in the current proxy:

1. **Event gap** — when the upstream MCP server is unreachable or times out, the catch block in `server.ts:920-928` returns HTTP 502/504 but emits **no bus events and does not update the ring buffer**. The `tool:call` event is written but never completed, leaving `outcome`, `source`, and `rule` blank in the dashboard.

2. **Wrong error contract** — returning HTTP 502/504 to the agent is a transport-level error. The agent's hook throws rather than receiving a meaningful tool result. The MCP spec defines tool execution errors as `isError: true` in the content body with HTTP 200 — the agent can then reason about the failure in its next turn.

3. **No fixture server** — tests and simulation use an injected `forwardFn` (in-process). The `--http` simulation mode (real proxy, real HTTP) has no upstream to forward to, so the proxy immediately 502s, making demos non-functional.

---

## Out of Scope

**Multi-server routing (D-040)** is deferred to a separate spec. The current single `upstreamMcpUrl` passthrough is kept. The fixture server binds to port 3100 (the default) — no tool registry needed yet.

**Routing feasibility note (captured for future spec):** When the MCP proxy path is used, the upstream URL can be encoded in the proxy path itself (`http://proxy.com/<token>/mcp.com/path`). At `listTools` time the proxy prefixes tool names with server ID (`mydb__db.execute`); at `callTool`/PreToolUse time the prefix identifies the upstream. For raw PreToolUse hooks without the MCP proxy, bare tool names remain an open problem.

---

## Design

### 1. Types

Two new outcome values and one new source value added to existing union types. One new event type.

```typescript
// apps/proxy/src/types.ts

// Extend existing outcome union
type ToolOutcome =
  | 'allowed'
  | 'blocked'
  | 'require-approval'
  | 'upstream-error'    // ECONNREFUSED / fetch failed
  | 'upstream-timeout'; // AbortError

// Extend existing source union
type ToolSource =
  | 'mcp'      // tool executed successfully on upstream
  | 'builtin'  // handled by proxy built-in
  | 'proxy';   // error or decision originated in proxy layer

// New event type
export interface ToolErrorEvent {
  sessionId: string;
  agentId: string;
  toolName: string;
  errorKind: 'upstream-unreachable' | 'upstream-timeout';
  durationMs: number;
}
```

The event bus gains a `tool:error` channel carrying `ToolErrorEvent`.

---

### 2. Proxy Error Pipeline (`server.ts`)

**Change 1 — error catch block** (`server.ts:920-928`):

`start` is local to the `forwardFn` closure and not in scope in the outer catch. A `callStart` timestamp must be captured just before the `intercept(...)` call:

```typescript
const callStart = Date.now(); // add immediately before the intercept() call
// ...
catch (err) {
  const isTimeout = err instanceof Error && err.name === 'AbortError';
  const errorKind = isTimeout ? 'upstream-timeout' : 'upstream-unreachable';
  const durationMs = Date.now() - callStart;

  // Emit event — currently missing
  bus.emit('tool:error', {
    sessionId: event.sessionId,
    agentId: event.agentId,
    toolName: event.toolName,
    errorKind,
    durationMs,
  });

  // Update ring buffer entry — currently missing
  ringBuffer.update(event.correlationId, {
    outcome: isTimeout ? 'upstream-timeout' : 'upstream-error',
    source: 'proxy',
    durationMs,
  });

  logger.error({ err, toolName: event.toolName, errorKind }, 'Upstream error');

  // MCP-compliant response: HTTP 200 with isError: true
  // Was: c.json({ error: '...' }, 502)
  return c.json({
    content: [{
      type: 'text',
      text: isTimeout
        ? `MCP server timed out: ${event.toolName}`
        : `MCP server unavailable: ${event.toolName}`,
    }],
    isError: true,
  }, 200);
}
```

**Change 2 — happy path source** (in `onToolResponseEvent` callback, ~line 894):

```typescript
// Set source on successful upstream response — currently unset
ringBuffer.update(event.correlationId, { source: 'mcp', durationMs });
```

**Result:** Every tool call now has a complete ring buffer entry regardless of path. Log entries for upstream errors include `errorKind`, `toolName`, `sessionId`, `agentId`.

---

### 3. Dashboard

**`OutcomeBadge`** — two new variants:

| outcome           | color  | label            |
|-------------------|--------|------------------|
| `upstream-error`  | orange | `UPSTREAM ERROR` |
| `upstream-timeout`| orange | `TIMED OUT`      |

**`SourceBadge`** — one new variant:

| source  | color | label   |
|---------|-------|---------|
| `proxy` | slate | `PROXY` |

**`tool-call-table.tsx`** — no structural changes needed. Once the ring buffer entry has `outcome` and `source` populated, the existing `/logs/tool-calls` response includes them automatically.

For error calls the row renders:
```
tool: db.execute  |  source: PROXY  |  outcome: UPSTREAM ERROR  |  rule: —
```

`rule` displays `—` (em dash) when `matchedRule` is undefined — intentionally empty rather than a blank cell.

---

### 4. Fixture MCP Server

**Location:** `apps/proxy/src/fixture/server.ts`  
**Exported from:** `apps/proxy/src/fixture/index.ts`

#### API

```typescript
export interface ToolHandlerMap {
  [toolName: string]: (input: unknown) => Promise<unknown>;
}

export interface FixtureMcpServerOptions {
  port?: number;         // default: 3100
  handlers: ToolHandlerMap;
  cassetteDir?: string;  // if set, wraps handlers with cassette logic
  mode?: 'live' | 'replay' | 'record'; // default: 'live'
}

export interface FixtureMcpServer {
  start(): Promise<{ port: number; url: string }>;
  stop(): Promise<void>;
}

export function createFixtureMcpServer(opts: FixtureMcpServerOptions): FixtureMcpServer;
```

#### Implementation

- Lightweight Hono server with one route: `POST /tool-call`
- Accepts `{ toolName: string, input: unknown }`
- Routes to `handlers[toolName](input)` → returns `{ output: result }`
- Unknown tool → returns `{ output: null, error: "Unknown tool: <name>" }` (not a crash)
- When `cassetteDir` is set, wraps each handler call with the existing cassette system (same `replay`/`record`/`live` logic used by the in-process simulation)
- `start()` binds to `port`, resolves with `{ port, url }` once listening
- `stop()` closes the server and resolves when all connections are drained

#### Simulation runner (`--http` mode)

```typescript
// simulation/src/scenario-runner.ts — added to --http path
const fixture = createFixtureMcpServer({
  port: opts.fixturePort ?? 3100,
  handlers: scenario.toolHandlers,
  cassetteDir: cassettePath,
  mode: cassetteMode,           // respects --mode flag: replay | record | live
});
const { url } = await fixture.start();
// Proxy at proxyUrl already defaults MCP_UPSTREAM_URL=http://localhost:3100
// Run scenario steps against real proxy...
await fixture.stop();
```

New CLI flag: `--fixture-port <n>` (default 3100). Must match the running proxy's `MCP_UPSTREAM_URL` port.

#### Unit tests

```typescript
// Example: full HTTP path test without real MCP server
const fixture = createFixtureMcpServer({
  handlers: {
    'db.execute': async (input) => ({ rows: [], affected: 0 }),
  },
});
const { url } = await fixture.start();
// create proxy pointed at url, make requests, assert ring buffer entries
await fixture.stop();
```

This replaces the `forwardFn` injection pattern for integration-level tests that need to exercise the real fetch path.

---

## What Is Not Changed

- `upstreamMcpUrl` default and single-server routing — unchanged
- Ring buffer merge logic — `update()` already exists and handles backfill
- `/logs/tool-calls` endpoint — no changes needed
- Policy evaluation path — unchanged
- Audit log format — `tool:error` events are added to the audit trail via the existing bus→audit-writer subscription

---

## Future Work (separate specs)

- **D-040 Multi-server routing** — tool registry, URL-encoded upstream path, tool name prefixing
- **Circuit breaker** — fail fast after N consecutive upstream errors, re-probe after cooldown
- **Auto-detection** — servers register tools on startup via `POST /proxy/servers/register`, dashboard reflects live registry
