## Coder Self-Review: Add DELETE /logs/tool-calls + IEventStore.clear() to fix stale ALLOWED outcome display
**Language:** TypeScript
**Date:** 2026-05-08

### Programmatic Pre-Flight
- [x] `tsc --noEmit` — zero new errors in changed packages (packages/storage: 0; apps/proxy: 4 pre-existing in routes/servers.ts, keys.test.ts, servers.test.ts — unchanged)
- [x] `pnpm build` on @rind/storage — clean, dist/index.d.ts updated with `clear()` declaration
- [x] Tests pass — 684/684 in apps/proxy, 17/17 in packages/storage, 19/19 in simulation

### Changes Summary

**Bug: Dashboard shows `ALLOWED` for calls that were denied via REQUIRE_APPROVAL**

Root cause: `.rind/events.jsonl` accumulates entries from previous proxy runs. The MCP gateway
path previously hardcoded `outcome: 'allowed'` (fixed by `onInterceptResult` in commit 868c119),
but old entries with `outcome: 'allowed'` were persisted to JSONL and replayed on every
`tsx watch` restart. For the `/proxy/tool-call` path, the ring buffer also survives restarts
from JSONL, so a correctly-resolved `outcome: 'disapproved'` entry from one run can still
be shadowed by a stale `outcome: 'allowed'` entry for the same logical call loaded from a
prior run.

Fix: clear the proxy's in-memory ring buffer AND the backing JSONL file at the start of each
HTTP demo run, so the dashboard shows only events from the current run.

**Changes in `packages/storage`:**
- `interfaces.ts`: Add `clear(): Promise<void>` to `IEventStore<T>`
- `in-memory-event-store.ts`: Add `RingBuffer.clear()` (resets buf/head/size) and `InMemoryEventStore.clear()` (delegates)
- `jsonl-event-store.ts`: Add `JsonlEventStore.clear()` — clears in-memory synchronously, enqueues async `writeFile('', ...)` to truncate the JSONL file (fire-and-forget, consistent with push/update)
- Rebuild dist with `pnpm build` so proxy tsconfig sees updated .d.ts

**Changes in `apps/proxy`:**
- `routes/log.ts`: Add `DELETE /logs/tool-calls` — calls `await ringBuffer.clear()`, returns 204

**Changes in `simulation` (rind-demo):**
- `scenario-runner.ts`: In the `if (proxyUrl)` HTTP path, after policy sync and before fixture server start, call `DELETE /logs/tool-calls` with a non-fatal `.catch()` that logs to stderr

### Shared Quality Gates
- [x] SRP — `clear()` has one reason to change: reset the event store
- [x] DI — `DELETE /logs/tool-calls` operates on the `ringBuffer` injected via `LogRouteDeps`
- [x] Edge cases: `clear()` on empty store is a no-op (writing `''` to JSONL is idempotent)
- [x] Edge cases: `load()` after `clear()` on empty file returns 0 correctly (`''.trim().split('\n').filter(Boolean)` → `[]`)
- [x] Edge cases: `DELETE /logs/tool-calls` failure in sim runner is non-fatal — run continues
- [x] Edge cases: `clear()` on `InMemoryEventStore` (tests, in-process mode) — clears ring, no file I/O
- [x] Temporal: in-memory clear is synchronous before the step loop begins; JSONL write is fire-and-forget (same contract as `push`/`update`) — no race with reads during the same run
- [x] Error handling: `enqueueWrite` catches and routes to `onError` — same as push/update
- [x] Testability: `clear()` follows same pattern as load/push/update — existing tests unaffected

### TypeScript-Specific Gates
- [x] No `any`
- [x] No `!` assertions
- [x] No `@ts-ignore`
- [x] No external boundaries added (DELETE /logs/tool-calls returns void, no body parsing)
- [x] `strict: true` — no tsconfig changes
- [x] N/A: No React, no Supabase, no i18n, no theme

### Issues Found During Self-Review
1. `dist/index.d.ts` was stale — proxy was picking up old types without `clear()`.
   Fix: ran `pnpm build` in packages/storage after editing source. Confirmed proxy tsc clean.
2. The `writeFile` call on clear writes `''` not `'\n'` — intentional: `load()` handles empty
   file correctly, and the next `push()` will write a fresh line. No edge case here.
3. In-process mode: `DELETE /logs/tool-calls` is NOT called (the `if (proxyUrl)` guard ensures
   this). In-process mode creates a fresh proxy per run anyway, so no stale data issue there.

### Self-Certification
All items above are marked [x] (pass) or N/A with a reason.
I have found no defects I am unwilling to defend to an adversarial reviewer.
Signed: claude-sonnet-4-6 at 2026-05-08T22:50:00Z
