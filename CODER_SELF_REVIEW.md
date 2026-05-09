## Coder Self-Review: Fix replit-db-deletion "no tool call recorded" + MCP gateway outcome bug
**Language:** TypeScript
**Date:** 2026-05-08

### Programmatic Pre-Flight
- [x] `tsc --noEmit` — zero new errors (4 pre-existing errors in unrelated files: routes/servers.ts, keys.test.ts, servers.test.ts)
- [x] Tests pass — 684/684 across 41 test files including all 16 gateway tests

### Changes Summary

**Bug 1 (primary): replit-db-deletion "no tool call recorded" in HTTP demo mode**
Root cause: The proxy runs under `tsx watch` (hot-reload on file save). Any save between
`maybeStartSimLlmServer` configuring `POST /admin/llm-upstream` and the actual agent-turn
LLM call resets `anthropicUpstream` to `https://api.anthropic.com`. With no API key, the
LLM call fails or returns `stop_reason: end_turn` (no tool_use) → `/proxy/tool-call` is
never called → no tool call event in the ring buffer / dashboard.

Secondary cause: the silent `.catch(() => {})` on `POST /admin/scenario` hid failures
from the sim server that would have explained why turns weren't loaded.

Fix in `simulation/src/scenario-runner.ts`:
1. Before each agent-turn LLM loop, call `POST /admin/llm-upstream` via `transport`
   (idempotent, guards against proxy restarts)
2. Remove silent catch on `POST /admin/scenario` — surface errors to stderr with
   actionable guidance

**Bug 2 (secondary): MCP gateway hardcodes outcome:'allowed' for blocked calls**
Root cause: `onToolCallEvent` in `server.ts` hardcodes `outcome: 'allowed'` regardless
of policy result. The `/proxy/tool-call` route calls `recordProxyOutcome` after
`intercept()` returns to fix this up, but the MCP gateway path had no equivalent.

Fix in `transport/gateway.ts` + `server.ts`:
1. Add optional `onInterceptResult` callback to `dispatchToolCall`, `dispatchRequest`,
   and `mcpGateway` factory — threaded as an optional param (backward compat, all
   existing tests pass without it)
2. `dispatchToolCall` fires the callback after `intercept()` returns
3. `server.ts` wires it to `recordProxyOutcome(targetId, interceptorResult, ringBuffer)`
   using the same `mergedCorrelationIds` translation logic as `onToolResponseEvent`

### Shared Quality Gates
- [x] SRP — each function/component has one reason to change
- [x] DI — no concrete deps instantiated inside business logic
- [x] Edge cases: null correlationId guarded (`if (event.correlationId)`)
- [x] Edge cases: `onInterceptResult` is optional; absent = old behavior
- [x] Edge cases: `transport('/admin/llm-upstream')` failure is caught silently (non-fatal)
- [x] Edge cases: `fetch('/admin/scenario')` failure written to stderr, not thrown (step continues)
- [x] Temporal: `onInterceptResult` fires after `intercept()` resolves — correct ordering
- [x] Temporal: `recordProxyOutcome` updates in-memory ring buffer synchronously
- [x] Error handling: no swallowed exceptions for scenarios; stderr output for warnings
- [x] Testability: `onInterceptResult` is optional — all existing 16 gateway tests pass

### TypeScript-Specific Gates
- [x] No `any` — `InterceptorResult` imported explicitly from `interceptor.ts`
- [x] No `!` assertions
- [x] No `@ts-ignore`
- [x] Types derived from existing exports — `InterceptorResult` already exported
- [x] `strict: true` — no tsconfig changes
- [x] N/A: No React components, no Supabase, no i18n, no theme

### Issues Found During Self-Review
1. `scenRes !== null` check needed before `!scenRes.ok` since `fetch().catch()` returns
   `null` on error — handled correctly.
2. In-process mode: `simLlmUrl` is `undefined` when `proxyUrl` is absent, so the
   `if (simLlmUrl)` guard correctly skips both calls in in-process mode.
3. `mergedCorrelationIds` is correctly in scope for the `onInterceptResult` closure
   in `server.ts` — defined in the same `if (config.mcpProxyEnabled !== false)` block.
4. For blocked MCP calls (DENY), `onToolCallEvent` initially pushes `outcome:'allowed'`
   then `onInterceptResult` immediately calls `recordProxyOutcome` which updates it to
   `outcome:'blocked'`. Both are synchronous in-memory — correct state by the time the
   HTTP response returns to the MCP client.

### Self-Certification
All items above are marked [x] (pass) or N/A with a reason.
I have found no defects I am unwilling to defend to an adversarial reviewer.
Signed: claude-sonnet-4-6 at 2026-05-08T21:17:00Z
