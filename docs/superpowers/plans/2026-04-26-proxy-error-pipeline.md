# Proxy Error Pipeline & Fixture MCP Server — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Emit structured events and update the ring buffer when the upstream MCP server is unreachable or times out, return MCP-compliant `isError: true` responses to the agent, surface errors correctly in the dashboard, and provide a fixture MCP server for simulation `--http` mode and integration tests.

**Architecture:** All four changes compose cleanly — types first, then the proxy pipeline, then the dashboard reading from the same ring buffer fields, then the fixture server as an independent Hono app. The simulation runner gains a pre/post hook around the `--http` path that spawns and tears down the fixture server.

**Tech Stack:** TypeScript, Hono, Vitest, `@hono/node-server`, pnpm workspaces

---

## File Map

| Action   | Path                                                                    | What changes                                               |
|----------|-------------------------------------------------------------------------|------------------------------------------------------------|
| Modify   | `apps/proxy/src/types.ts`                                               | Add `ToolErrorEvent`; extend `outcome` and `source` unions |
| Modify   | `apps/proxy/src/event-bus.ts`                                           | Add `tool:error` channel to `RindEventMap`                 |
| Modify   | `apps/proxy/src/server.ts`                                              | Error path event emission + ring buffer update + HTTP 200 `isError`; happy-path `source:'mcp'` |
| Create   | `apps/proxy/src/__tests__/proxy-tool-call-errors.test.ts`               | Integration tests for the error path                       |
| Modify   | `apps/dashboard/app/components/tool-call-table.tsx`                     | Extend `ToolCallEntry`; update `OutcomeBadge`, `SourceBadge`; add `—` for empty rule |
| Create   | `apps/proxy/src/fixture/server.ts`                                      | `createFixtureMcpServer` implementation                    |
| Create   | `apps/proxy/src/fixture/index.ts`                                       | Public re-export                                           |
| Create   | `apps/proxy/src/__tests__/fixture-server.test.ts`                       | Unit tests for fixture server                              |
| Modify   | `simulation/src/scenario-runner.ts`                                     | Spawn/stop fixture server in `--http` path                 |

---

## Task 1: Extend types and event bus

**Files:**
- Modify: `apps/proxy/src/types.ts`
- Modify: `apps/proxy/src/event-bus.ts`

- [ ] **Step 1: Extend `ToolCallEvent.outcome` and `ToolCallEvent.source` in `types.ts`**

Find the `outcome?:` line (~line 25) and `source?:` line (~line 28) inside `ToolCallEvent` and widen them:

```typescript
// Before:
outcome?: 'allowed' | 'blocked' | 'require-approval';
// ...
source?: 'builtin' | 'mcp';

// After:
outcome?: 'allowed' | 'blocked' | 'require-approval' | 'upstream-error' | 'upstream-timeout';
// ...
source?: 'builtin' | 'mcp' | 'proxy';
```

- [ ] **Step 2: Add `ToolErrorEvent` to `types.ts`**

Add after the existing `ToolResponseEvent` interface:

```typescript
export interface ToolErrorEvent {
  sessionId: string;
  agentId: string;
  toolName: string;
  /** 'upstream-unreachable' = ECONNREFUSED / fetch failed; 'upstream-timeout' = AbortError */
  errorKind: 'upstream-unreachable' | 'upstream-timeout';
  durationMs: number;
}
```

- [ ] **Step 3: Add `tool:error` channel to `RindEventMap` in `event-bus.ts`**

```typescript
// Add to the import at line 9:
import type { ToolCallEvent, ToolResponseEvent, ToolErrorEvent, ScanResult, Session, AuditEntry } from './types.js';

// Add to RindEventMap (after 'tool:response'):
'tool:error': ToolErrorEvent;
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd /Users/atinderpalsingh/projects/aegis-bundle/rind
pnpm --filter @rind/proxy tsc --noEmit
```

Expected: no errors. If `OutcomeBadge` in the dashboard throws a TS error about unhandled union members — that's expected and will be fixed in Task 3.

- [ ] **Step 5: Commit**

```bash
git add apps/proxy/src/types.ts apps/proxy/src/event-bus.ts
git commit -m "feat(proxy): add ToolErrorEvent type and upstream-error/timeout outcome values"
```

---

## Task 2: Fix the server.ts error path and happy-path source

**Files:**
- Create: `apps/proxy/src/__tests__/proxy-tool-call-errors.test.ts`
- Modify: `apps/proxy/src/server.ts`

- [ ] **Step 1: Write the failing tests**

Create `apps/proxy/src/__tests__/proxy-tool-call-errors.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { createProxyServer } from '../lib.js';

// Helper — POST to /proxy/tool-call with a forwardFn that throws
async function callWithError(throwFn: () => never) {
  const { app } = createProxyServer({
    port: 0,
    agentId: 'test-agent',
    upstreamMcpUrl: 'http://mock-unused',
    forwardFn: async () => throwFn(),
    logLevel: 'error',
  });

  const res = await app.request('/proxy/tool-call', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionId: 'test-session',
      serverId: 'test-server',
      toolName: 'db.execute',
      input: { sql: 'SELECT 1' },
    }),
  });

  const logsRes = await app.request('/logs/tool-calls');
  const events = await logsRes.json() as Array<{ toolName: string; outcome?: string; source?: string }>;
  const entry = events.find((e) => e.toolName === 'db.execute');

  return { res, body: await res.json(), entry };
}

describe('/proxy/tool-call — upstream error handling', () => {
  it('returns HTTP 200 with isError:true when upstream is unreachable', async () => {
    const { res, body } = await callWithError(() => {
      throw new Error('fetch failed: connect ECONNREFUSED 127.0.0.1:3100');
    });

    expect(res.status).toBe(200);
    expect(body.isError).toBe(true);
    expect(body.content).toHaveLength(1);
    expect(body.content[0].type).toBe('text');
    expect(body.content[0].text).toContain('db.execute');
    expect(body.content[0].text).toContain('unavailable');
  });

  it('records outcome:upstream-error and source:proxy in ring buffer', async () => {
    const { entry } = await callWithError(() => {
      throw new Error('fetch failed');
    });

    expect(entry?.outcome).toBe('upstream-error');
    expect(entry?.source).toBe('proxy');
  });

  it('returns isError:true with "timed out" message when upstream times out', async () => {
    const { res, body, entry } = await callWithError(() => {
      const err = new Error('The operation was aborted');
      err.name = 'AbortError';
      throw err;
    });

    expect(res.status).toBe(200);
    expect(body.isError).toBe(true);
    expect(body.content[0].text).toContain('timed out');
    expect(entry?.outcome).toBe('upstream-timeout');
  });
});

describe('/proxy/tool-call — happy path source', () => {
  it('records source:mcp in ring buffer when upstream succeeds', async () => {
    const { app } = createProxyServer({
      port: 0,
      agentId: 'test-agent',
      upstreamMcpUrl: 'http://mock-unused',
      forwardFn: async () => ({ output: { rows: [] }, durationMs: 5 }),
      logLevel: 'error',
    });

    await app.request('/proxy/tool-call', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: 'test-session',
        serverId: 'test-server',
        toolName: 'db.execute',
        input: { sql: 'SELECT 1' },
      }),
    });

    const logsRes = await app.request('/logs/tool-calls');
    const events = await logsRes.json() as Array<{ toolName: string; source?: string }>;
    const entry = events.find((e) => e.toolName === 'db.execute');
    expect(entry?.source).toBe('mcp');
  });
});
```

- [ ] **Step 2: Run tests — confirm they all fail**

```bash
cd /Users/atinderpalsingh/projects/aegis-bundle/rind
pnpm --filter @rind/proxy test proxy-tool-call-errors
```

Expected: all tests fail. The error tests get 502, ring buffer entries have no outcome/source.

- [ ] **Step 3: Add `callStart` before the `intercept()` call in server.ts**

Find the line `let interceptResult: Awaited<ReturnType<typeof intercept>>;` (~line 870) and add `callStart` immediately before it:

```typescript
const callStart = Date.now(); // captures wall time before intercept — used in catch for durationMs
let interceptResult: Awaited<ReturnType<typeof intercept>>;
```

- [ ] **Step 4: Replace the catch block in server.ts (~lines 920-928)**

Find the current catch block:
```typescript
} catch (err) {
  const isTimeout = err instanceof Error && err.name === 'AbortError';
  logger.error({ err, toolName: event.toolName }, isTimeout ? 'Upstream timeout' : 'Upstream error');
  return c.json(
    { error: isTimeout ? 'Upstream MCP server timed out' : 'Upstream MCP server unreachable' },
    isTimeout ? 504 : 502,
  );
}
```

Replace with:
```typescript
} catch (err) {
  const isTimeout = err instanceof Error && err.name === 'AbortError';
  const errorKind = isTimeout ? 'upstream-timeout' : 'upstream-unreachable' as const;
  const durationMs = Date.now() - callStart;

  bus.emit('tool:error', {
    sessionId: event.sessionId,
    agentId: event.agentId,
    toolName: event.toolName,
    errorKind,
    durationMs,
  });

  ringBuffer.update(
    (item) => item.correlationId === event.correlationId,
    (item) => ({
      ...item,
      outcome: isTimeout ? 'upstream-timeout' as const : 'upstream-error' as const,
      source: 'proxy' as const,
      durationMs,
    }),
  );

  logger.error({ err, toolName: event.toolName, errorKind }, 'Upstream error');

  return c.json(
    {
      content: [{ type: 'text', text: isTimeout
        ? `MCP server timed out: ${event.toolName}`
        : `MCP server unavailable: ${event.toolName}` }],
      isError: true,
    },
    200,
  );
}
```

- [ ] **Step 5: Set `source: 'mcp'` in the happy-path `onToolResponseEvent` callback**

Find the `onToolResponseEvent` callback inside the `intercept(...)` call options (around line 893). It currently emits `tool:response`. Add the ring buffer update after the emit:

```typescript
onToolResponseEvent: (e) => {
  bus.emit('tool:response', e);
  // Backfill source on the ring buffer entry — was unset before this fix
  ringBuffer.update(
    (item) => item.correlationId === event.correlationId,
    (item) => ({ ...item, source: item.source ?? ('mcp' as const) }),
  );
  // ... rest of existing code (threat handling etc.) unchanged
},
```

- [ ] **Step 6: Run tests — confirm they all pass**

```bash
pnpm --filter @rind/proxy test proxy-tool-call-errors
```

Expected: all 4 tests pass.

- [ ] **Step 7: Run the full proxy test suite — no regressions**

```bash
pnpm --filter @rind/proxy test
```

Expected: all existing tests still pass.

- [ ] **Step 8: Commit**

```bash
git add apps/proxy/src/server.ts apps/proxy/src/__tests__/proxy-tool-call-errors.test.ts
git commit -m "feat(proxy): emit tool:error event and return isError:true on upstream failures"
```

---

## Task 3: Update dashboard badges and ToolCallEntry

**Files:**
- Modify: `apps/dashboard/app/components/tool-call-table.tsx`

- [ ] **Step 1: Extend `ToolCallEntry` in `tool-call-table.tsx` (lines 19 and 22)**

```typescript
// Line 19 — before:
outcome?: 'allowed' | 'blocked' | 'require-approval';
// After:
outcome?: 'allowed' | 'blocked' | 'require-approval' | 'upstream-error' | 'upstream-timeout';

// Line 22 — before:
source?: 'builtin' | 'mcp';
// After:
source?: 'builtin' | 'mcp' | 'proxy';
```

- [ ] **Step 2: Add new variants to `OutcomeBadge` config Record**

Find the `config` object inside `OutcomeBadge` (around line 156). Add two new entries after `'require-approval'`:

```typescript
'upstream-error': {
  label: 'UPSTREAM ERROR',
  style: {
    color: 'var(--rind-medium)',
    background: 'color-mix(in srgb, var(--rind-medium) 10%, transparent)',
    borderColor: 'color-mix(in srgb, var(--rind-medium) 24%, transparent)',
  },
},
'upstream-timeout': {
  label: 'TIMED OUT',
  style: {
    color: 'var(--rind-medium)',
    background: 'color-mix(in srgb, var(--rind-medium) 10%, transparent)',
    borderColor: 'color-mix(in srgb, var(--rind-medium) 24%, transparent)',
  },
},
```

`--rind-medium` is the amber/warning token already used by `require-approval` — reuse it for upstream errors so the visual language is consistent (warning, not critical).

- [ ] **Step 3: Update `SourceBadge` to handle `'proxy'` source**

Find `SourceBadge` (around line 204). Replace the entire function:

```typescript
function SourceBadge({ source }: { source?: 'builtin' | 'mcp' | 'proxy' }) {
  if (!source) return null;

  const config: Record<'builtin' | 'mcp' | 'proxy', { label: string; style: React.CSSProperties }> = {
    mcp: {
      label: 'MCP',
      style: {
        color: 'var(--rind-accent)',
        background: 'color-mix(in srgb, var(--rind-accent) 10%, transparent)',
        borderColor: 'color-mix(in srgb, var(--rind-accent) 24%, transparent)',
      },
    },
    builtin: {
      label: 'BUILTIN',
      style: {
        color: 'var(--rind-foreground-muted)',
        background: 'var(--rind-overlay)',
        borderColor: 'var(--rind-border-subtle)',
      },
    },
    proxy: {
      label: 'PROXY',
      style: {
        color: 'var(--rind-foreground-muted)',
        background: 'var(--rind-overlay)',
        borderColor: 'var(--rind-border-subtle)',
      },
    },
  };

  const { label, style } = config[source];
  return (
    <span
      className="font-mono text-[10px] tracking-[0.04em] px-2 py-0.5 rounded border"
      style={style}
    >
      {label}
    </span>
  );
}
```

- [ ] **Step 4: Add `—` for missing `matchedRule`**

Find where `matchedRule` is rendered in the table row (search for `entry.matchedRule` or `matchedRule` in the file). Replace bare reference with a fallback:

```typescript
// Before (whatever the current render is):
{entry.matchedRule}

// After:
{entry.matchedRule ?? '—'}
```

If `matchedRule` is inside a conditional that hides the cell entirely when undefined, remove the conditional and always render the cell with the `—` fallback so the column stays aligned.

- [ ] **Step 5: Verify TypeScript compiles cleanly**

```bash
pnpm --filter @rind/dashboard tsc --noEmit
```

Expected: no errors. The `Record<NonNullable<ToolCallEntry['outcome']>, ...>` exhaustiveness check in `OutcomeBadge` will now enforce that all five outcome values are handled.

- [ ] **Step 6: Visual check — start the dashboard and proxy**

```bash
# Terminal 1
pnpm --filter @rind/proxy dev

# Terminal 2 — start dashboard
pnpm --filter @rind/dashboard dev
```

Then trigger an upstream error by POSTing to the proxy with no MCP server running:

```bash
curl -s -X POST http://localhost:4000/proxy/tool-call \
  -H 'Content-Type: application/json' \
  -d '{"sessionId":"test","serverId":"db","toolName":"db.execute","input":{"sql":"SELECT 1"}}' | jq
```

Expected curl response:
```json
{ "content": [{ "type": "text", "text": "MCP server unavailable: db.execute" }], "isError": true }
```

Open the dashboard logs page — the `db.execute` row should show `PROXY` source badge and `UPSTREAM ERROR` outcome badge instead of blanks.

- [ ] **Step 7: Commit**

```bash
git add apps/dashboard/app/components/tool-call-table.tsx
git commit -m "feat(dashboard): show UPSTREAM ERROR and PROXY badges for upstream failures"
```

---

## Task 4: Create the fixture MCP server

**Files:**
- Create: `apps/proxy/src/fixture/server.ts`
- Create: `apps/proxy/src/fixture/index.ts`
- Create: `apps/proxy/src/__tests__/fixture-server.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `apps/proxy/src/__tests__/fixture-server.test.ts`:

```typescript
import { describe, it, expect, afterEach } from 'vitest';
import { createFixtureMcpServer } from '../fixture/index.js';

let stopFn: (() => Promise<void>) | undefined;

afterEach(async () => {
  if (stopFn) { await stopFn(); stopFn = undefined; }
});

describe('createFixtureMcpServer', () => {
  it('starts and responds to a known tool', async () => {
    const fixture = createFixtureMcpServer({
      handlers: {
        'db.execute': async (input) => ({ rows: [], input }),
      },
    });

    const { url, stop } = await fixture.start();
    stopFn = stop;

    const res = await fetch(`${url}/tool-call`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ toolName: 'db.execute', input: { sql: 'SELECT 1' } }),
    });

    expect(res.status).toBe(200);
    const body = await res.json() as { output: { rows: unknown[]; input: unknown } };
    expect(body.output.rows).toEqual([]);
    expect(body.output.input).toEqual({ sql: 'SELECT 1' });
  });

  it('returns an error body (not 4xx/5xx) for an unknown tool', async () => {
    const fixture = createFixtureMcpServer({ handlers: {} });
    const { url, stop } = await fixture.start();
    stopFn = stop;

    const res = await fetch(`${url}/tool-call`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ toolName: 'unknown.tool', input: {} }),
    });

    expect(res.status).toBe(200);
    const body = await res.json() as { output: null; error: string };
    expect(body.output).toBeNull();
    expect(body.error).toContain('unknown.tool');
  });

  it('starts on a custom port', async () => {
    const fixture = createFixtureMcpServer({
      port: 19877,
      handlers: { 'ping': async () => 'pong' },
    });
    const { port, url, stop } = await fixture.start();
    stopFn = stop;

    expect(port).toBe(19877);
    expect(url).toBe('http://localhost:19877');

    const res = await fetch(`${url}/tool-call`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ toolName: 'ping', input: {} }),
    });
    const body = await res.json() as { output: string };
    expect(body.output).toBe('pong');
  });

  it('stops cleanly and rejects subsequent requests', async () => {
    const fixture = createFixtureMcpServer({
      port: 19878,
      handlers: { 'ping': async () => 'pong' },
    });
    const { url, stop } = await fixture.start();
    await stop();

    await expect(
      fetch(`${url}/tool-call`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run tests — confirm they all fail**

```bash
pnpm --filter @rind/proxy test fixture-server
```

Expected: all tests fail (module not found).

- [ ] **Step 3: Implement `apps/proxy/src/fixture/server.ts`**

```typescript
// Lightweight fixture MCP server for integration tests and simulation --http mode.
// Implements the same /tool-call contract as a real upstream MCP server.
// Cassette wrapping is the caller's responsibility — pass pre-wrapped handlers.

import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import type { Server } from 'node:http';

export interface ToolHandlerMap {
  [toolName: string]: (input: unknown) => Promise<unknown>;
}

export interface FixtureMcpServerOptions {
  port?: number;  // default: 3100
  handlers: ToolHandlerMap;
}

export interface FixtureMcpServer {
  start(): Promise<{ port: number; url: string; stop: () => Promise<void> }>;
}

export function createFixtureMcpServer(opts: FixtureMcpServerOptions): FixtureMcpServer {
  return {
    start: () =>
      new Promise((resolve, reject) => {
        const app = new Hono();

        app.post('/tool-call', async (c) => {
          const { toolName, input } = await c.req.json<{ toolName: string; input: unknown }>();
          const handler = opts.handlers[toolName];
          if (!handler) {
            return c.json({ output: null, error: `Unknown tool: ${toolName}` });
          }
          try {
            const output = await handler(input);
            return c.json({ output });
          } catch (err) {
            return c.json({ output: null, error: String(err) });
          }
        });

        const port = opts.port ?? 3100;
        let httpServer: Server;

        const server = serve({ fetch: app.fetch, port }, (info) => {
          httpServer = server as unknown as Server;
          const stop = (): Promise<void> =>
            new Promise((res, rej) => httpServer.close((err) => (err ? rej(err) : res())));
          resolve({ port: info.port, url: `http://localhost:${info.port}`, stop });
        });

        (server as unknown as Server).on('error', reject);
      }),
  };
}
```

- [ ] **Step 4: Create `apps/proxy/src/fixture/index.ts`**

```typescript
export { createFixtureMcpServer } from './server.js';
export type { FixtureMcpServerOptions, FixtureMcpServer, ToolHandlerMap } from './server.js';
```

- [ ] **Step 5: Run tests — confirm they all pass**

```bash
pnpm --filter @rind/proxy test fixture-server
```

Expected: all 4 tests pass.

- [ ] **Step 6: Run full proxy test suite — no regressions**

```bash
pnpm --filter @rind/proxy test
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add apps/proxy/src/fixture/ apps/proxy/src/__tests__/fixture-server.test.ts
git commit -m "feat(proxy): add createFixtureMcpServer for integration tests and simulation"
```

---

## Task 5: Wire fixture server into simulation `--http` mode

**Files:**
- Modify: `simulation/src/scenario-runner.ts`

- [ ] **Step 1: Add the import for `createFixtureMcpServer`**

At the top of `simulation/src/scenario-runner.ts`, add:

```typescript
import { createFixtureMcpServer } from '../../apps/proxy/src/fixture/index.js';
```

Or if the simulation has a tsconfig path alias or imports from a built package, adjust accordingly. Check existing imports in the file for the pattern used to import from `apps/proxy`.

- [ ] **Step 2: Add `fixturePort` option to the runner function signature**

Find the function signature (the line with `proxyUrl?: string`). Add `fixturePort` alongside it:

```typescript
proxyUrl?: string,
fixturePort = 3100,   // must match MCP_UPSTREAM_URL port on the running proxy
```

- [ ] **Step 3: Wrap the `--http` path with fixture server lifecycle**

Find the `if (proxyUrl) {` block (around line 143). Wrap it so the fixture server starts before the scenario steps and stops after:

```typescript
if (proxyUrl) {
  // Spin up a fixture MCP server so the running proxy has an upstream to forward to.
  // Cassette wrapping is applied here — same logic as in-process mode.
  const cassetteForwardFn = createForwardFn(scenario.slug, mode, scenario.toolHandlers);
  const fixtureHandlers = Object.fromEntries(
    Object.keys(scenario.toolHandlers).map((toolName) => [
      toolName,
      async (input: unknown) => {
        const { output } = await cassetteForwardFn(toolName, input);
        return output;
      },
    ]),
  );

  const fixture = createFixtureMcpServer({ port: fixturePort, handlers: fixtureHandlers });
  const { url: fixtureUrl, stop: stopFixture } = await fixture.start();

  // (existing) Set up HTTP transport to the real proxy
  const base = proxyUrl.replace(/\/$/, '');
  transport = (endpoint, init) => fetch(`${base}${endpoint}`, init);

  // (existing) Merge scenario rules into live proxy — unchanged
  // ...

  try {
    // Scenario steps run here — proxy forwards tool calls to fixture at fixtureUrl
    // (steps are further down in the function; this try/finally wraps the whole http block)
    void fixtureUrl; // fixture is reachable at this URL; proxy connects to it via MCP_UPSTREAM_URL
  } finally {
    await stopFixture();
  }
```

**Important:** The `try/finally` needs to wrap the part of the function that runs the scenario steps (the loop over `scenario.steps`), not just the transport setup. Restructure the `if (proxyUrl)` block so the `finally` covers step execution. The exact restructuring depends on where steps are run relative to this block — read the surrounding code before editing.

- [ ] **Step 4: Add `--fixture-port` flag to the CLI entry point**

Find where `proxyUrl` is parsed from `process.argv` in the simulation CLI. Add adjacent parsing for `--fixture-port`:

```typescript
const fixturePortArg = process.argv.indexOf('--fixture-port');
const fixturePort = fixturePortArg !== -1 ? Number(process.argv[fixturePortArg + 1]) : 3100;
```

Pass it through to the runner call.

- [ ] **Step 5: Smoke test — run a scenario against a real proxy**

Start the proxy in one terminal (ensure `MCP_UPSTREAM_URL=http://localhost:3100` or default):

```bash
cd apps/proxy && pnpm dev
```

In another terminal, run any existing scenario in `--http` mode:

```bash
cd simulation
pnpm sim replit-db-deletion --http http://localhost:4000
```

Expected:
- Fixture server starts on port 3100
- Proxy forwards `db.execute` to fixture, gets a response
- Scenario steps complete (pass/fail based on policy)
- Dashboard shows `db.execute` rows with `source: MCP` and `outcome: allowed/blocked` — not blanks
- Fixture server stops cleanly after the scenario

- [ ] **Step 6: Commit**

```bash
git add simulation/src/scenario-runner.ts
git commit -m "feat(simulation): spawn fixture MCP server automatically in --http mode"
```

---

## Self-Review

**Spec coverage check:**

| Spec requirement | Task |
|---|---|
| `ToolErrorEvent` type | Task 1 |
| Extend `outcome` union with `upstream-error`, `upstream-timeout` | Task 1 |
| Extend `source` union with `proxy` | Task 1 |
| `tool:error` event bus channel | Task 1 |
| Emit `tool:error` in catch block | Task 2 |
| Update ring buffer in catch block | Task 2 |
| Return HTTP 200 `isError:true` | Task 2 |
| Set `source:'mcp'` in happy path | Task 2 |
| `callStart` before `intercept()` | Task 2 |
| Dashboard `OutcomeBadge` new variants | Task 3 |
| Dashboard `SourceBadge` `proxy` variant | Task 3 |
| `—` for empty `matchedRule` | Task 3 |
| `createFixtureMcpServer` API | Task 4 |
| Fixture server `POST /tool-call` handler | Task 4 |
| Unknown tool returns error body, not 4xx | Task 4 |
| Simulation `--http` spawns fixture | Task 5 |
| `--fixture-port` CLI flag | Task 5 |
| Cassette mode respected in `--http` | Task 5 |

All requirements covered.
