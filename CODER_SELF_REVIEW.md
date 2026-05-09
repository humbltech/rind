# CODER_SELF_REVIEW.md

## Task

Fix: dashboard outcome badge stays frozen at "REQUIRE APPROVAL" after a
dashboard deny/approve decision. The user sees the stale state until they do a
hard browser refresh.

## Root cause

Both `page.tsx` and `logs/page.tsx` used timestamp-based incremental polling:

```
getToolCalls({ since: lastToolTs.current + 1 })
```

When a ring-buffer entry is **updated in place** (outcome: require-approval →
disapproved/approved/approval-timeout), its `timestamp` field does not change.
So `since=T+1` never returns the updated entry. React state stays frozen at the
stale outcome until a full page reload triggers `initialLoad`.

## Change

Replaced the two-function (initialLoad + incrementalPoll) pattern in both
polling hooks with a single `poll()` that always fetches the full recent window
(`limit: 200` on Overview, `limit: 500` on Logs) and replaces the entire state.

Removed: `lastToolTs`, `lastLlmTs` refs; `since` query parameter usage;
`INITIAL_LIMIT` constant; two-function split.

## Claims

| Claim | Evidence |
|---|---|
| TypeScript compiles clean | `tsc --noEmit` passes (0 errors) |
| No tests broken | 684/684 proxy tests pass (dashboard has no test suite) |
| `useRef` / `useCallback` imports still valid | grep confirms both remain used in other hooks/components |
| `isConnected` false-on-error path preserved | `catch` block sets `setIsConnected(false)` in both pages |
| `initialized` guard preserved | prevents interval from firing before first poll completes |
| Cleanup correct | `return () => { active = false; clearInterval(intervalId); }` unchanged |

## Known trade-offs

- **State replacement on every poll**: React diffs the new array against the
  previous one. Only changed rows get DOM updates. Expanded row state (local
  `useState` in `TableRow`) resets if the row's key changes (timestamp+idx).
  This was already true when new events prepended and shifted indices; the
  change doesn't make it worse.
- **No incremental growth for Logs page**: Previously the Logs page accumulated
  events across polls. Now it is capped at 500 on every poll. Ring buffer itself
  is capped at 10,000; the 500 limit was already a snapshot, not a growing set.
- **Bandwidth**: 500 events × ~500 bytes ≈ 250 KB per 2-second poll on Logs.
  Acceptable for a local dev dashboard; not a concern for the target use case.

## What I did NOT do

- Did not add `updatedAt` to `ToolCallEvent` (would fix the root cause more
  surgically but requires touching the proxy type, server, and client — larger
  blast radius than the fix warrants).
- Did not add a test: dashboard has no test suite and the fix is a pure data
  flow change with no logic branches.
