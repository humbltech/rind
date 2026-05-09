## Coder Self-Review: Add POST /admin/mcp-upstream to fix ECONNREFUSED 127.0.0.1:3100 in HTTP demo mode
**Language:** TypeScript
**Date:** 2026-05-08

### Programmatic Pre-Flight
- [x] `tsc --noEmit` — zero NEW errors; 4 pre-existing in routes/servers.ts, keys.test.ts, servers.test.ts (unchanged, not introduced by this diff)
- [x] Tests pass — 684/684 in apps/proxy

### Root Cause
In HTTP demo mode, the proxy runs on a different machine (rind-proxy.local) than the
sim runner (dev machine). The proxy's `config.upstreamMcpUrl` defaults to
`http://localhost:3100`. When it tries to forward a tool call to the fixture MCP server,
it hits port 3100 on its OWN loopback — where nothing is listening → ECONNREFUSED.

Same problem as the LLM server (fixed earlier with `POST /admin/llm-upstream` +
`rind-sim-llm.local`). This change applies the identical pattern to the MCP upstream.

### Changes in `apps/proxy/src/server.ts`
- Added `POST /admin/mcp-upstream` endpoint (outside the LLM proxy `if` block — always
  mounted). Sets `config.upstreamMcpUrl` in-memory. Non-destructive: the running proxy
  keeps all other config; only the upstream URL changes. Matches structure of
  `/admin/llm-upstream` exactly.

### Shared Quality Gates
- [x] SRP — endpoint has one reason to change: the MCP upstream URL update contract
- [x] DI — mutates the injected `config` object (same pattern as llm-upstream)
- [x] Edge cases: empty/invalid body → 400 with message
- [x] Edge cases: non-string url → 400
- [x] Edge cases: called multiple times → last-write wins (idempotent, correct)
- [x] Edge cases: endpoint always mounted (not inside mcpProxyEnabled guard) so it works
  even when MCP gateway is disabled
- [x] Temporal: in-flight tool calls see the old URL; new calls see the new URL — same
  eventual-consistency guarantee as the LLM upstream endpoint
- [x] Error handling: no I/O, no throws possible; only input validation errors
- [x] Testability: same contract as /admin/llm-upstream which already has tests

### TypeScript-Specific Gates
- [x] No `any`
- [x] No `!` assertions
- [x] No `@ts-ignore`
- [x] Input validated via `typeof url !== 'string'` guard before use
- [x] `strict: true` — tsconfig unchanged

### Issues Found During Self-Review
1. Endpoint is outside the `if (config.llmProxy?.enabled)` block — intentional. The MCP
   upstream is always relevant (used by POST /proxy/tool-call), not just when LLM proxy is
   enabled. Verified by checking that `config.upstreamMcpUrl` is referenced in
   `routes/tool-call.ts`, not in any LLM-gated block.
2. No `/etc/hosts` enforcement in code — prerequisite is documented in the endpoint comment.
   Same approach as the LLM upstream doc comment. User must add the host entry manually.

### Self-Certification
All items above are marked [x] (pass) or N/A with a reason.
I have found no defects I am unwilling to defend to an adversarial reviewer.
Signed: claude-opus-4-7 at 2026-05-08T23:35:00Z
