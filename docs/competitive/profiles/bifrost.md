# Bifrost (by Maxim AI) — Competitor Profile

**URL**: getbifrost.ai / github.com/maximhq/bifrost
**License**: Apache 2.0 | **Stars**: 3,300 | **Forks**: 353

---

## What They Do

High-performance LLM API gateway written in Go that also functions as an MCP gateway. Primarily an LLM routing and management layer that added MCP tool execution capabilities. NOT primarily a security product.

## Architecture

Go-based HTTP gateway. Acts as both MCP client and MCP server. Aggregates tools from multiple upstream MCP servers, exposes through single governed endpoint with OpenAI-compatible API. Connects to 20+ LLM providers.

## Key Capability

**11 microsecond overhead at 5,000 RPS** — verified benchmark. But this is routing overhead, not security policy evaluation. Actual governance (guardrails) adds whatever latency the external provider adds.

## Security Model

Security is fully outsourced to external providers:
- AWS Bedrock Guardrails
- Azure Content Safety (indirect prompt injection shield)
- GraySwan Cygnal
- Patronus AI

If you don't configure an external guardrail, you get none.

Default behavior: tool calls are "suggestions only" requiring explicit API call to execute (human-in-the-loop). Agent Mode with auto-approval removes this safety net.

## Strengths

- Raw performance (11us, Go)
- MCP gateway aggregation (multiple upstream servers → single endpoint)
- OpenAI-compatible API (broad framework support)
- Good open source traction (3,300 stars)
- Code Mode reduces token consumption by 50%
- Credential vault integrations (HashiCorp, AWS SM, GCP SM, Azure KV)

## Weaknesses

- Not a security product — LLM gateway with governance bolted on
- No content inspection (can't look inside tool call arguments)
- Tool filtering is binary allow/deny on names, not content-aware
- No schema drift or tool poisoning detection
- Guardrails fully outsourced
- No identity model (virtual keys = API key management, not agent identity)
- Human-in-the-loop doesn't scale for autonomous agents

## Relationship to Rind

**Not a direct competitor.** Bifrost is infrastructure (LLM routing + MCP aggregation). Rind is security (execution-layer enforcement). Could potentially coexist — Bifrost routes, Rind secures.

## Sources

- [Bifrost GitHub](https://github.com/maximhq/bifrost)
- [Bifrost Docs](https://docs.getbifrost.ai/overview)
- [Bifrost MCP Gateway](https://www.getmaxim.ai/bifrost/resources/mcp-gateway)
