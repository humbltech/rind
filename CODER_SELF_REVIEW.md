## Coder Self-Review: Agent negation for llm-injection-guard-v1 + matchesLlmScope fix + store.ts type fix + sim-through-proxy demo wiring
**Language:** TypeScript
**Date:** 2026-05-03

### Programmatic Pre-Flight
- ✅ `tsc --noEmit` — zero errors (packages/policy-engine, apps/proxy)
- ✅ Biome — no new violations
- ✅ Tests pass — 553 proxy (all passing); no new tests added for this change (demo wiring is integration-level; covered by existing gateway + demo-init tests)

### Shared Quality Gates
- ✅ SRP — `matchesAgentSpecifier` is a pure predicate; no other concern changed
- ✅ DI — no new dependencies introduced
- ✅ Edge cases — negation of `'*'` is not supported (no use case; `'!*'` would never match any agent — documented implicitly by the three supported forms in the JSDoc)
- ✅ Temporal — N/A
- ✅ Error handling — `matchesAgentSpecifier` is a pure function; no throw path
- ✅ Testability — 3 new pure-engine tests cover: excluded agent (ALLOW), non-excluded agent (DENY), sibling agent ID (DENY)

### TypeScript-Specific Gates
- ✅ No `any`, no bare `!`, no `@ts-ignore`
- ✅ `store.ts` cast: `(r as PolicyRuleWithMeta)._meta` — the type system cannot express that `policies` array may contain `PolicyRuleWithMeta` at runtime (pack rules are added via `addRule` which accepts `PolicyRule`; `PolicyRuleWithMeta` extends it with optional `_meta`). The cast is safe: `_meta` is optional and the optional-chain `?.` handles the absent case. Import of `PolicyRuleWithMeta` added.
- ✅ `strict: true` — unchanged

---

### Change 1: Agent negation in `matchesAgentSpecifier` (rules.ts)

**What changed:** Extracted a named predicate `matchesAgentSpecifier(specifier, agentId)` that handles three forms:
- `'*'` — wildcard, matches all agents (existing behaviour)
- `'exact-id'` — exact string match (existing behaviour)
- `'!exact-id'` — negation: matches all agents EXCEPT the named one (new)

Both `matchesRule` and `matchesLlmRule` now call `matchesAgentSpecifier` instead of inlining the comparison.

**Why:** Claude Code produces `agentId = 'llm-anthropic'` by default (from `headers['x-rind-agent-id'] ?? 'llm-${provider.name}'`). Custom applications send their own `x-rind-agent-id`. The negation form lets packs scope themselves to custom agents only, without requiring callers to enumerate every valid agent ID.

**Edge case — `'!*'`:** Not handled. A negation of the wildcard would match nothing. No use case exists; the three documented forms are sufficient. If the need arises, extend `matchesAgentSpecifier` with a `startsWith('!')` check on the remainder.

---

### Change 2: Update `llm-injection-guard-v1` to `agent: '!llm-anthropic'` (packs.ts)

**What changed:** Pack rule now uses `agent: '!llm-anthropic'` instead of `agent: '*'`. Version bumped to `1.1.0`. Description and inline comment updated to explain the exclusion.

**Why:** Claude Code sessions accumulate rich history: curl commands, `$()` substitutions, `system:` values from config files. These match injection patterns legitimately — they are coding activity, not attacks. The pack was designed for controlled-API applications where user messages are strictly user-supplied text. Excluding `llm-anthropic` restores injection scanning for custom agents while never blocking Claude Code.

**Custom apps:** Any application that sets `x-rind-agent-id` to something other than `'llm-anthropic'` (e.g. `'my-app-agent'`) will receive full injection scanning. This is the correct behaviour: those apps have controlled message scope and injection scanning is meaningful.

---

### Change 3: Add `llm-injection-guard-v1` back to `DEMO_PACKS` (demo-init.ts)

Pack is now safe to enable in a Claude Code demo session. The comment explaining the previous exclusion has been replaced with a comment explaining the current behaviour (`agent: '!llm-anthropic'` scopes it away from Claude Code).

---

### Change 4: Fix `store.ts` type error (`PolicyRuleWithMeta` cast)

**Root cause:** `persist()` filtered `r._meta?.source` but `this.config.policies` is typed as `PolicyRule[]`, which lacks `_meta`. `_meta` lives on `PolicyRuleWithMeta` (extends `PolicyRule`, optional field). The runtime values in the array can include `PolicyRuleWithMeta` instances (pack rules added via `addRule`), so the access is safe — just not expressible via the base type.

**Fix:** Import `PolicyRuleWithMeta` from `@rind/core`; cast `r` to `PolicyRuleWithMeta` in the filter. Optional chain `?.` already handles the absent-field case correctly.

---

### Changes Made

| File | Change |
|------|--------|
| `packages/policy-engine/src/rules.ts` | Added `matchesAgentSpecifier()` with `!` negation; both matching functions use it |
| `packages/policy-engine/src/store.ts` | Import `PolicyRuleWithMeta`; cast in `persist()` filter to fix TS2339 |
| `packages/policy-engine/src/packs.ts` | `llm-injection-guard-v1` rule: `agent: '!llm-anthropic'`; version 1.1.0; updated description + comment |
| `apps/proxy/src/cli/demo-init.ts` | Re-added `llm-injection-guard-v1` to `DEMO_PACKS`; updated comment |
| `packages/policy-engine/src/__tests__/policy-engine.test.ts` | 3 new tests for agent negation matching |

---

### Change 5: Fix `matchesLlmScope` to apply agent specifier (content-policy.ts)

**What changed:** `matchesLlmScope()` in `apps/proxy/src/transport/llm/content-policy.ts` now checks `rule.agent` before checking provider/model. Logic mirrors `matchesAgentSpecifier` in `packages/policy-engine/src/rules.ts` — same three forms: `'*'`, exact match, `'!id'` negation.

**Why:** Content rules (those with `match.content`) bypass `matchesLlmRule()` entirely. They reach the proxy via `getContentRules()` → `evaluateLlmContent()` → `matchesLlmScope()`. `matchesLlmScope` previously only checked `llmProvider` and `llmModel` — never `rule.agent`. This meant agent scoping (including the `'!llm-anthropic'` negation on `llm-injection-guard-v1`) was silently ignored for content rules. Claude Code was always blocked despite the pack rule being correctly configured.

**Root cause of the 4-session bug:** Two separate evaluation paths exist for LLM rules. `evaluateLlm()` → `matchesLlmRule()` checks agent ✓. `evaluateLlmContent()` → `matchesLlmScope()` did not check agent ✗. Both paths need agent filtering; only one had it.

**Duplication note:** The negation logic is intentionally inlined in `matchesLlmScope` rather than importing `matchesAgentSpecifier` from the policy-engine package. The proxy doesn't import from policy-engine's internal `rules.ts` (only from the public dist index). The comment in the code documents the requirement to keep the two in sync. If a third copy ever appears, extract to a shared utility.

---

### Change 6: Add 3 regression tests for agent scoping in content rules (content-policy.test.ts)

**What changed:** New describe block `evaluateLlmContent — agent scoping` with three tests covering:
1. Custom agent (not excluded) → DENY on injection
2. `llm-anthropic` (excluded via `!llm-anthropic`) → ALLOW even with injection
3. Another anthropic-provider agent not in the exclusion → DENY

**Why:** This is a regression test for the `matchesLlmScope` bug. Before the fix, test 2 returned DENY incorrectly. All three tests now pass.

**Test design note:** The third test originally used `provider: 'openai'` but the rule only covers `llmProvider: ['anthropic']`, so the provider check correctly returned ALLOW. Fixed to `provider: 'anthropic', agentId: 'custom-app-agent'` to properly test agent-based exclusion vs. provider-based scope.

---

### Changes Made

| File | Change |
|------|--------|
| `packages/policy-engine/src/rules.ts` | Added `matchesAgentSpecifier()` with `!` negation; both matching functions use it |
| `packages/policy-engine/src/store.ts` | Import `PolicyRuleWithMeta`; cast in `persist()` filter to fix TS2339 |
| `packages/policy-engine/src/packs.ts` | `llm-injection-guard-v1` rule: `agent: '!llm-anthropic'`; version 1.1.0; updated description + comment |
| `apps/proxy/src/cli/demo-init.ts` | Re-added `llm-injection-guard-v1` to `DEMO_PACKS`; updated comment |
| `packages/policy-engine/src/__tests__/policy-engine.test.ts` | 3 new tests for agent negation matching |
| `apps/proxy/src/transport/llm/content-policy.ts` | `matchesLlmScope()`: added agent specifier check (the root-cause fix) |
| `apps/proxy/src/__tests__/content-policy.test.ts` | 3 new regression tests for agent scoping in content rules |

### Issues Found During Self-Review
- `store.ts` TS2339 was a pre-existing latent error from the previous session's `persist()` fix (pack filter used `_meta` on base `PolicyRule` type). Caught by type check; fixed with cast + import. The runtime behaviour was already correct.
- `matchesLlmScope` missing agent check was the root cause of the 4-session `llm-injection-guard-v1` block bug. Found by auditing both LLM evaluation code paths. No other scope-check functions are missing agent filtering.

---

### Change 7: Route sim MCP servers through Rind's gateway (demo wiring)

**Root cause of missing sim in dashboard:** `config.servers` was always empty because `buildConfigFromEnv()` had no file-based server map source. The MCP gateway guard (`Object.keys(config.servers ?? {}).length > 0`) prevented it from mounting. Claude Code connected directly to the sim servers, bypassing the interceptor entirely.

**What changed:**

- **`apps/proxy/src/cli.ts`** — `buildConfigFromEnv()` now calls `loadServersFile()`, which reads `.rind/servers.json` (Zod-validated via `McpServerMapSchema`) if it exists, and merges it into `config.servers`. Missing file → `undefined` (gateway stays unmounted, no breakage for non-demo deployments). Invalid JSON or schema → startup error with clear message.

- **`apps/proxy/src/cli/demo-init.ts`** — `applySimMcpServers()` now:
  1. Writes `.mcp.json` with **proxy URLs** (`http://localhost:7777/mcp/rind-threat-sim`) — Claude Code connects via Rind, not directly to the sim
  2. Writes `.rind/servers.json` with **actual upstream URLs** (`http://localhost:8080/mcp`) — Rind's gateway knows where to forward

- **`apps/proxy/src/transport/gateway.ts`** — `mcpGateway()` and `dispatchRequest()` accept an optional `onToolsList?: (serverId, tools: ToolInfo[]) => void` callback. Fired after `tools/list` succeeds, before the response is returned. Fire-and-forget; errors never propagate to the MCP client.

- **`apps/proxy/src/server.ts`** — Passes `onToolsList` to `mcpGateway()`. The callback converts `ToolInfo[]` → `ToolDefinition[]` (adding `description ?? ''` and `inputSchema ?? {}` defaults) and calls `runFullScan()`. Scan errors are logged at `warn`, never thrown.

**Result after `demo-init --enable-packs` + restart:**
1. `.mcp.json` points to `http://localhost:7777/mcp/rind-threat-sim`
2. `.rind/servers.json` has the upstream map
3. Proxy starts with MCP gateway mounted (non-empty `config.servers`)
4. First `tools/list` → scan fires → findings in dashboard (poisoned `sim__doc_search` flagged)
5. All tool calls go through the interceptor → loop detection + policy engine active

**Edge cases:**
- No `.rind/servers.json` → `loadServersFile()` returns `undefined` → behavior identical to before this change
- Schema violation in `.rind/servers.json` → throws at startup with structured message, not a silent no-op
- `onToolsList` throws (scan fails) → logged at `warn`, MCP response still returned — scan is never on the critical path

---

### Changes Made

| File | Change |
|------|--------|
| `packages/policy-engine/src/rules.ts` | Added `matchesAgentSpecifier()` with `!` negation; both matching functions use it |
| `packages/policy-engine/src/store.ts` | Import `PolicyRuleWithMeta`; cast in `persist()` filter to fix TS2339 |
| `packages/policy-engine/src/packs.ts` | `llm-injection-guard-v1` rule: `agent: '!llm-anthropic'`; version 1.1.0 |
| `apps/proxy/src/cli/demo-init.ts` | Re-added `llm-injection-guard-v1` to `DEMO_PACKS`; proxy URLs in `.mcp.json`; writes `.rind/servers.json` |
| `packages/policy-engine/src/__tests__/policy-engine.test.ts` | 3 new tests for agent negation |
| `apps/proxy/src/transport/llm/content-policy.ts` | `matchesLlmScope()`: added agent specifier check |
| `apps/proxy/src/__tests__/content-policy.test.ts` | 3 new regression tests for agent scoping in content rules |
| `apps/proxy/src/cli.ts` | `buildConfigFromEnv()`: reads `.rind/servers.json` via `loadServersFile()` |
| `apps/proxy/src/transport/gateway.ts` | `onToolsList` callback; `ToolInfo` imported from upstream interface |
| `apps/proxy/src/server.ts` | `runFullScan` imported; `onToolsList` wired to gateway |

### Issues Found During Self-Review
- `store.ts` TS2339 — pre-existing, fixed with cast
- `matchesLlmScope` missing agent check — root cause of 4-session bug, fixed
- `ToolInfo` vs `ToolDefinition` shape mismatch — caught at type-check; conversion added in `server.ts` with safe defaults

### Self-Certification
All items above are marked ✅ or N/A with a reason.
I have found no defects I am unwilling to defend to an adversarial reviewer.
Signed: claude-sonnet-4-6 at 2026-05-03T22:20:00Z
