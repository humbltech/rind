# Archived Architecture Docs

These documents were written before AD-006 (TypeScript/Node.js stack decision, April 2026).
They contain Python/FastAPI implementation code and are superseded.

The concepts remain valid — HITL approval, policy generation, tool discovery — but the
implementation details will be rewritten in TypeScript when those phases are reached.

| File | Why Archived | Superseded By |
|------|-------------|---------------|
| `human-in-the-loop-python-fastapi.md` | FastAPI/Python implementation; pre-AD-006 | TypeScript proxy `apps/proxy/` when built |
| `tool-discovery-policy-generation-python.md` | Python throughout; pre-AD-006 | `packages/policy-engine/` when built |

**Do not delete** — the design logic is still valuable reference when rewriting in TypeScript.
