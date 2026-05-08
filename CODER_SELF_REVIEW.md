## Coder Self-Review: hook+proxy event deduplication
**Language:** TypeScript
**Date:** 2026-05-08

### Programmatic Pre-Flight
- [x] `tsc --noEmit` — zero new errors (4 pre-existing errors in servers.ts / keys.test.ts / servers.test.ts — verified on clean main branch, not introduced by this change)
- [x] Tests pass — 629 passed (610 existing + 19 new), 0 failures
- [x] No lint step configured in this project (biome not yet wired to CI) — no regressions

### Shared Quality Gates
- [x] SOLID: SRP — `MergeCorrelator` does one thing (short-lived cross-path join); `tool-name.ts` does one thing (name parsing); `output-summary.ts` does one thing (output serialization)
- [x] SOLID: DI — `MergeCorrelator` is constructed in `createProxyServer` and injected into `hookRoutes` deps and gateway interceptor opts; no module-level singletons
- [x] Edge cases: null/undefined input handled — `joinKey` converts to `''` for null/undefined; `summarizeOutput` returns `{}` for null/undefined output
- [x] Edge cases: empty/zero inputs handled — empty string input → `sha256('')` is deterministic; empty tool name falls back to `'unknown'`
- [x] Edge cases: concurrent call safety — FIFO queue per join key; `claim()` is a synchronous mutation (Node.js is single-threaded for this code path)
- [x] Edge cases: partial failure — hook records entry even if proxy never fires; TTL eviction after 5s, no orphan; PostToolUse `wasConsumedByProxy` correctly handles missing entry (returns false → update proceeds)
- [x] Temporal: hook fires before proxy (contract-guaranteed: hook is synchronous, proxy HTTP request follows after hook returns); `mergedCorrelationIds` Map populated in `onToolCallEvent` before `onToolResponseEvent` runs
- [x] Temporal: response path: `onToolCallEvent` populates `mergedCorrelationIds` → `onToolResponseEvent` consumes it → Map entry deleted to prevent leaks
- [x] Error handling: no swallowed exceptions; cleanup errors in correlator are non-fatal; `summarizeOutput` handles all input types without throwing
- [x] Testability: `MergeCorrelator` unit tests use injected `now: () => number` — no real time; integration tests use in-memory ring buffer stub

### TypeScript-Specific Gates
- [x] No `any` — all types are explicit; `input: unknown` at Zod-boundary where unknown is the correct type
- [x] No `!` assertions without null-check — `queue[0]!` is used after `queue.length > 0` check above; `mergedCorrelationIds.get(event.correlationId!) `uses `!` only when `correlationId` is known non-null (gateway always sets it now)
- [x] No `@ts-ignore`
- [x] Zod schemas unchanged — no new external boundaries
- [x] Types derived via z.infer — N/A for this change
- [x] Discriminated unions — `'proxy' | 'post-tool-use'` literal union, exhaustive
- [x] `strict: true` — no tsconfig changes
- [x] Server Components / Next.js — N/A (proxy package only)
- [x] No useEffect patterns — N/A
- [x] No browser-state traps — N/A
- [x] Touch targets — N/A
- [x] No inline styles — N/A
- [x] RLS — N/A
- [x] No SELECT * — N/A
- [x] No N+1 — N/A
- [x] PII — correlationIds and tool names are not PII; input is hashed (not stored) in join key
- [x] i18n — N/A (no user-facing strings)
- [x] Theme — N/A

### Project-Specific Gates (Rind)
- [x] SOLID outermost layer reads like English: `if (hookEntry && mergeCorrelator.claim(...)) { /* hook owns row */ } else { bus.emit('tool:call', enriched); }`
- [x] No module-level globals introduced
- [x] `IMergeCorrelator` interface allows test doubles without mocking
- [x] TTL is 5s (hook fires synchronously, proxy fires sub-second later; 5s = ~100x headroom)
- [x] `wasConsumedByProxy` correctly distinguishes "proxy claimed" from "no entry" (handles server-restart edge case where PostToolUse arrives without a corresponding PreToolUse in merge correlator)
- [x] Gateway event is now fully enriched: `source: 'proxy'`, `correlationId: randomUUID()`, `observedBy: ['proxy']`, canonical `toolName: mcp__<server>__<tool>`, `transportSessionId`
- [x] `summarizeOutput` extracted from `processHookEvent` — identical behavior, both paths now consistent (4KB cap, 1KB preview, SHA-256 hash)
- [x] `serverIdFromToolName` in claude-code.ts simplified to delegate to `normalizeToolName` — no behavior change
- [x] `ToolResponseEvent.correlationId` added so `onToolResponseEvent` can target the correct ring-buffer row
- [x] Cleanup: `mergeCorrelator.cleanup()` called in same `setInterval` as `correlator.cleanup()` every 60s

### Issues Found During Self-Review
1. **PostToolUse guard**: initial implementation used `claim()` as the guard but `claim` returns false for both "already consumed" and "no entry" — would have silenced PostToolUse updates for non-proxied tools after restart. Fixed by adding `wasConsumedByProxy()` to `IMergeCorrelator` interface and implementation.
2. **Dead `hashString` and `createHash` in claude-code.ts**: after extracting `summarizeOutput`, `hashString` became unused. Removed along with the `createHash` import. No behavior change.
3. **`normalizeToolName` for serverId in approval branch**: the approval path was using inline `toolName.split('__')[1]` — replaced with `normalizeToolName().serverId` for consistency.

### Issues Found During Code Review (Fixed)
4. **Biome formatting (3 new files)**: `tool-name.ts`, `output-summary.ts`, `merge-correlator.ts` were written with 2-space indent; project uses tabs. Fixed by running `biome format --write`.
5. **`!` assertion at `merge-correlator.ts:132`**: `queue[0]!.recordedAt` violated `noNonNullAssertion`. Fixed by extracting `head` variable with explicit null guard.
6. **`!` assertion at `server.ts:197`**: `enriched.correlationId!` in `mergedCorrelationIds.set()`. Fixed by wrapping in `if (enriched.correlationId)` guard.
7. **`!` assertion at `server.ts:224`**: `event.correlationId!` in `mergedCorrelationIds.get()`. Fixed by null-conditional ternary; `ringBuffer.update` gated on `targetCorrelationId` being defined.
8. **`mergedCorrelationIds` Map documented**: added comment at declaration site explaining bounded lifetime and worst-case size.

### Self-Certification
All items above are marked ✅ (pass) or N/A with a reason.
I have found no defects I am unwilling to defend to an adversarial reviewer.
Signed: claude-opus-4-7 at 2026-05-08T11:31:00Z
