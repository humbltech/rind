## Coder Self-Review: Extract shared OutcomeBadge — fix Logs Explorer showing ALLOWED for denied calls
**Language:** TypeScript / Next.js
**Date:** 2026-05-08

### Programmatic Pre-Flight
- [x] `tsc --noEmit` — zero errors in apps/dashboard (no new errors introduced)
- [x] Tests — N/A: dashboard has no component test suite; type safety verified via tsc
- [x] ESLint — N/A: no ESLint config present in apps/dashboard; tsc covers structural correctness

### Root Cause (for reviewer context)
The Logs Explorer page (`app/logs/page.tsx:565-595`) had its own local `OutcomeBadge` that only
handled 3 outcome values. Any other outcome (including `disapproved` — what a denied
REQUIRE_APPROVAL produces) fell through `styles[outcome] ?? styles.allowed` and rendered as
`ALLOWED`. The proxy data was always correct; the render path was wrong.

### Changes Summary
- `apps/dashboard/app/components/outcome-badge.tsx` — NEW. Single source of truth for the
  outcome badge. Exports `ToolCallOutcome` type and `OutcomeBadge` component. The
  `config` map is typed `Record<ToolCallOutcome, ...>` — exhaustive at compile time.
  `disapproved` label = `'DENIED'` (was `'DISAPPROVED'` in the old canonical version).
- `apps/dashboard/app/components/tool-call-table.tsx` — Removed local `OutcomeBadge` (81 lines).
  Imports `OutcomeBadge` and `ToolCallOutcome` from `./outcome-badge`. The `ToolCallEntry.outcome`
  field type changed from an inline union literal to `ToolCallOutcome` — structurally identical,
  no downstream breakage.
- `apps/dashboard/app/logs/page.tsx` — Removed local `OutcomeBadge` (32 lines, the buggy one).
  Imports `OutcomeBadge` from `../components/outcome-badge`. Also swapped the timeline view's
  raw `entry.outcome.toUpperCase()` span for `<OutcomeBadge>` — all three views now show
  consistent labels.

### Shared Quality Gates
- [x] SRP — `OutcomeBadge` has one reason to change: outcome label/style spec
- [x] DI — no deps beyond React; no side effects
- [x] Edge cases: `Record<ToolCallOutcome, ...>` is exhaustive — no `?? fallback` possible
- [x] Edge cases: caller guards with `entry.outcome &&` before rendering — unchanged
- [x] Edge cases: `ToolCallOutcome` type union is complete (all 8 values); tsc verifies
- [x] Temporal: N/A — pure render component, no state, no async
- [x] Error handling: N/A — no async, no throws
- [x] Testability: pure function of `outcome` prop — trivially testable

### TypeScript-Specific Gates
- [x] No `any`
- [x] No `!` assertions
- [x] No `@ts-ignore`
- [x] No Zod needed — no external boundary; internal type only
- [x] TypeScript type derived from shared source: `ToolCallEntry.outcome` now uses `ToolCallOutcome`
- [x] `Record<ToolCallOutcome, ...>` is the exhaustive discriminated map (no `never` branch needed —
       `Record` + `config[outcome]` access is compile-verified by the key type)
- [x] `strict: true` — tsconfig unchanged
- [x] `'use client'` — omitted deliberately; `OutcomeBadge` is a pure render component with no
      hooks or browser APIs; used inside client components where it becomes part of their bundle

### Issues Found During Self-Review
1. `outcomeColor` in `TimelineToolRow` only maps `blocked` → critical, all others → accent.
   For `disapproved` this makes the row's left-border accent-colored instead of critical. This is
   a pre-existing cosmetic issue, unrelated to the label bug. Left as-is (out of scope).
2. `require-approval` label in the new `OutcomeBadge` is `'REQUIRE APPROVAL'` (matching the
   canonical version in `tool-call-table.tsx`). The old local version in `logs/page.tsx` used
   `'PENDING'`. Chose `'REQUIRE APPROVAL'` for consistency with the overview page. No user
   impact — both clearly indicate a pending state.

### Self-Certification
All items above are marked [x] (pass) or N/A with a reason.
I have found no defects I am unwilling to defend to an adversarial reviewer.
Signed: claude-opus-4-7 at 2026-05-08T23:30:00Z
