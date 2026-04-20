# Rind Gateway Architecture

**Last Updated:** April 2026
**Status:** Architectural Decision Record (ADR)
**Authors:** Rind Team

---

## Executive Summary

Rind is a **security gateway** that sits between AI agents and the resources they interact with (LLMs, tools, APIs, databases). Unlike LLM gateways (LiteLLM, OpenRouter) that only route LLM traffic, Rind provides comprehensive security across the entire agent execution lifecycle.

**Key Insight:** The most dangerous actions happen at the **tool execution layer**, not the LLM layer. An LLM deciding to delete data is harmless—the actual DELETE query executing is what causes damage.

---

## The Problem: Where Do Threats Exist?

AI agents have multiple attack surfaces:

```
┌─────────────────────────────────────────────────────────────────┐
│                        USER INPUT                                │
│                                                                  │
│  Threats:                                                        │
│  • Prompt injection ("ignore previous instructions...")          │
│  • Jailbreak attempts ("you are now DAN...")                    │
│  • Social engineering                                            │
└───────────────────────────────┬─────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                         AI AGENT                                 │
│                                                                  │
│  Threats:                                                        │
│  • Confused deputy (tricked into malicious actions)             │
│  • Infinite loops (cost explosion)                               │
│  • Data leakage in context                                       │
└───────────────────────────────┬─────────────────────────────────┘
                                │
              ┌─────────────────┴─────────────────┐
              ▼                                   ▼
┌──────────────────────────┐      ┌──────────────────────────────┐
│        LLM LAYER         │      │       TOOL LAYER             │
│                          │      │                              │
│  Threats:                │      │  Threats:                    │
│  • PII in prompts        │      │  • Destructive operations    │
│  • Cost overruns         │      │  • Data exfiltration         │
│  • Data in training      │      │  • Privilege escalation      │
│                          │      │  • Cross-tenant access       │
│  Risk: MEDIUM            │      │  Risk: CRITICAL              │
└──────────────────────────┘      └──────────────────────────────┘
```

### The Critical Insight

**LLM gateways (LiteLLM, OpenRouter, etc.) only protect the LLM layer.**

They cannot see or control:
- What tools the agent calls
- What parameters are passed to tools
- What data is returned from tools
- Whether an action is destructive

**Rind must operate at the tool execution layer to prevent catastrophic actions.**

---

## Hook Points: Where Rind Intercepts

There are 6 points in the agent lifecycle where security controls can be applied:

```
┌─────────────────────────────────────────────────────────────────┐
│                        USER INPUT                                │
└───────────────────────────────┬─────────────────────────────────┘
                                │
                    ╔═══════════▼═══════════╗
                    ║  HOOK 1: INPUT        ║
                    ║  ─────────────────    ║
                    ║  • Prompt injection   ║
                    ║  • Jailbreak patterns ║
                    ║  • Input validation   ║
                    ╚═══════════╤═══════════╝
                                │
┌───────────────────────────────▼─────────────────────────────────┐
│                         AI AGENT                                 │
└───────────────────────────────┬─────────────────────────────────┘
                                │
              ┌─────────────────┴─────────────────┐
              │                                   │
    ╔═════════▼═════════╗             ╔══════════▼══════════╗
    ║  HOOK 2: PRE-LLM  ║             ║  HOOK 4: TOOL CALL  ║
    ║  ───────────────  ║             ║  ─────────────────  ║
    ║  • PII redaction  ║             ║  • Policy check     ║
    ║  • Cost limits    ║             ║  • HITL approval    ║
    ║  • Rate limiting  ║             ║  • Block dangerous  ║
    ╚═════════╤═════════╝             ╚══════════╤══════════╝
              │                                   │
              ▼                                   ▼
    ┌───────────────────┐             ┌───────────────────┐
    │    LLM PROVIDER   │             │   TOOL EXECUTION  │
    │  (OpenAI, Claude) │             │  (DB, API, Files) │
    └─────────┬─────────┘             └─────────┬─────────┘
              │                                   │
    ╔═════════▼═════════╗             ╔══════════▼══════════╗
    ║  HOOK 3: POST-LLM ║             ║  HOOK 5: TOOL RESP  ║
    ║  ───────────────  ║             ║  ─────────────────  ║
    ║  • Token counting ║             ║  • Data filtering   ║
    ║  • Response check ║             ║  • PII redaction    ║
    ║  • Cost tracking  ║             ║  • Audit logging    ║
    ╚═════════╤═════════╝             ╚══════════╤══════════╝
              │                                   │
              └─────────────────┬─────────────────┘
                                │
                    ╔═══════════▼═══════════╗
                    ║  HOOK 6: OUTPUT       ║
                    ║  ─────────────────    ║
                    ║  • Final filtering    ║
                    ║  • Sensitive data     ║
                    ║  • Response logging   ║
                    ╚═══════════╤═══════════╝
                                │
                                ▼
                        USER RESPONSE
```

### Hook Priority Matrix

| Hook | What It Protects | Risk Level | Priority |
|------|------------------|------------|----------|
| **Hook 4: Tool Call** | Catastrophic actions (DELETE, DROP) | CRITICAL | **P0** |
| **Hook 1: Input** | Prompt injection, jailbreaks | HIGH | **P1** |
| **Hook 2: Pre-LLM** | PII leakage, cost overruns | MEDIUM | P2 |
| **Hook 3: Post-LLM** | Cost tracking, response filtering | MEDIUM | P2 |
| **Hook 5: Tool Response** | Data exfiltration | HIGH | P1 |
| **Hook 6: Output** | Final data filtering | MEDIUM | P2 |

### Why Hook 4 (Tool Call) is P0

Real-world incidents that caused damage:

| Incident | What Happened | Hook That Would Prevent |
|----------|---------------|-------------------------|
| Replit DB Deletion | Agent ran `DROP TABLE` | **Hook 4: Tool Call** |
| Amazon Kiro Outage | Agent deleted prod infra | **Hook 4: Tool Call** |
| $47K Cost Loop | Agents called each other infinitely | **Hook 4: Tool Call** |
| EchoLeak | Data sent to external URL | **Hook 4: Tool Call** |

All critical incidents happened at the **tool execution layer**, not the LLM layer.

---

## Integration Patterns

Customers deploy AI agents in different ways. Rind must support multiple integration patterns:

### Pattern 1: SDK Integration

For customers using Python frameworks (LangChain, CrewAI, etc.):

```python
from rind import RindGuard

# Wrap the agent - Rind intercepts all hooks
guard = RindGuard(policies="./policies.yaml")

@guard.protect
def sql_execute(query: str):
    return db.execute(query)

# Or wrap entire agent
protected_agent = guard.wrap(my_langchain_agent)
```

**Hooks covered:** 1, 2, 3, 4, 5, 6 (all)
**Pros:** Full control, all hooks
**Cons:** Requires code changes
**Best for:** New projects, teams who own the agent code

### Pattern 2: LLM Proxy

For customers who want to protect LLM interactions without code changes:

```
Agent → Rind LLM Proxy → OpenAI/Anthropic
            │
            └── OpenAI-compatible API
                /v1/chat/completions
```

**Hooks covered:** 2, 3 (LLM layer only)
**Pros:** No code changes, drop-in replacement
**Cons:** Cannot see tool execution
**Best for:** Prompt injection protection, cost controls

### Pattern 3: Tool Proxy

For customers who want to protect tool execution:

```
Agent Tool Call → Rind Tool Proxy → Actual Tool
                       │
                       └── REST API or gRPC
```

**Hooks covered:** 4, 5 (tool layer)
**Pros:** Protects against catastrophic actions
**Cons:** Requires routing tools through proxy
**Best for:** High-risk tools (DB, file system, cloud APIs)

### Pattern 4: MCP Proxy

For MCP-based agents (Claude Desktop, Cursor, etc.):

```
Claude Desktop → Rind MCP Proxy → Actual MCP Server
                      │
                      └── MCP Protocol (stdio/SSE)
```

**Hooks covered:** 4, 5 (tool layer via MCP)
**Pros:** Works with any MCP client
**Cons:** MCP-specific
**Best for:** Claude Desktop, MCP-based agents

### Pattern 5: Rind Gateway (Recommended)

Single deployment that provides all proxy types:

```
┌─────────────────────────────────────────────────────────────────┐
│                       RIND GATEWAY                              │
│                                                                  │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │                    ENDPOINTS                             │   │
│   │                                                          │   │
│   │   /v1/chat/completions  →  LLM Proxy (OpenAI compat)    │   │
│   │   /v1/tools/*           →  Tool Proxy (REST)            │   │
│   │   /mcp/*                →  MCP Proxy                     │   │
│   │   /ws                   →  WebSocket (real-time)        │   │
│   └─────────────────────────────────────────────────────────┘   │
│                              │                                   │
│   ┌──────────────────────────▼──────────────────────────────┐   │
│   │                   SHARED SERVICES                        │   │
│   │                                                          │   │
│   │   ┌──────────────┐ ┌──────────────┐ ┌──────────────┐   │   │
│   │   │Policy Engine │ │ Audit Logger │ │ HITL Manager │   │   │
│   │   └──────────────┘ └──────────────┘ └──────────────┘   │   │
│   │                                                          │   │
│   │   ┌──────────────┐ ┌──────────────┐ ┌──────────────┐   │   │
│   │   │ Cost Tracker │ │ Rate Limiter │ │ Alert System │   │   │
│   │   └──────────────┘ └──────────────┘ └──────────────┘   │   │
│   └─────────────────────────────────────────────────────────┘   │
│                              │                                   │
│   ┌──────────────────────────▼──────────────────────────────┐   │
│   │                     DASHBOARD                            │   │
│   │   • Real-time monitoring                                 │   │
│   │   • Policy management                                    │   │
│   │   • Approval workflows                                   │   │
│   │   • Audit log viewer                                     │   │
│   └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

**Hooks covered:** All (depending on which endpoints customer uses)
**Pros:** Single deployment, all capabilities, shared services
**Cons:** Requires routing traffic through gateway
**Best for:** Enterprise, multiple agents, centralized security

---

## Architectural Decision: Single Gateway, Multiple Protocols

### Decision

Rind will be deployed as a **single gateway** that exposes multiple protocol endpoints, rather than separate products for each integration pattern.

### Reasoning

1. **Unified Policy Engine**
   - Same policies apply across LLM proxy, tool proxy, and MCP proxy
   - No need to duplicate policy configuration
   - Consistent behavior regardless of integration method

2. **Shared Audit Trail**
   - Single source of truth for all agent activity
   - Correlate LLM calls with tool calls
   - Complete picture for compliance and debugging

3. **Simplified Operations**
   - One thing to deploy, monitor, and scale
   - Single dashboard for all agents
   - Unified alerting and notifications

4. **Customer Flexibility**
   - Start with one integration (e.g., tool proxy)
   - Add others later (e.g., LLM proxy) without new deployment
   - Mix and match based on needs

5. **Market Positioning**
   - Differentiated from LLM-only gateways (LiteLLM, Helicone)
   - Differentiated from prompt-only security (Lakera)
   - Complete solution for AI agent security

### Alternatives Considered

| Alternative | Why Rejected |
|-------------|--------------|
| Separate products (LLM proxy, Tool proxy) | Fragmented experience, duplicate services |
| SDK-only | Not all customers can modify code |
| LLM proxy only | Misses critical tool-layer threats |
| Tool proxy only | Misses prompt injection protection |

---

## Deployment Architecture

### Self-Hosted (Enterprise)

```
┌─────────────────────────────────────────────────────────────────┐
│                    Customer Infrastructure                       │
│                                                                  │
│   ┌─────────────┐     ┌─────────────┐     ┌─────────────┐      │
│   │   Agent 1   │     │   Agent 2   │     │   Agent N   │      │
│   └──────┬──────┘     └──────┬──────┘     └──────┬──────┘      │
│          │                   │                   │              │
│          └───────────────────┼───────────────────┘              │
│                              │                                   │
│                    ┌─────────▼─────────┐                        │
│                    │   RIND GATEWAY   │                        │
│                    │   (Self-hosted)   │                        │
│                    └─────────┬─────────┘                        │
│                              │                                   │
│          ┌───────────────────┼───────────────────┐              │
│          │                   │                   │              │
│   ┌──────▼──────┐     ┌──────▼──────┐     ┌──────▼──────┐      │
│   │    LLMs     │     │   Tools     │     │  Databases  │      │
│   └─────────────┘     └─────────────┘     └─────────────┘      │
└─────────────────────────────────────────────────────────────────┘
```

### Cloud-Hosted (SaaS)

```
┌─────────────────────────────────────────────────────────────────┐
│                    Customer Infrastructure                       │
│                                                                  │
│   ┌─────────────┐     ┌─────────────┐     ┌─────────────┐      │
│   │   Agent 1   │     │   Agent 2   │     │   Agent N   │      │
│   └──────┬──────┘     └──────┬──────┘     └──────┬──────┘      │
│          │                   │                   │              │
└──────────┼───────────────────┼───────────────────┼──────────────┘
           │                   │                   │
           └───────────────────┼───────────────────┘
                               │
                    ┌──────────▼──────────┐
                    │    RIND CLOUD      │
                    │  (api.rind.dev)    │
                    └──────────┬──────────┘
                               │
           ┌───────────────────┼───────────────────┐
           │                   │                   │
    ┌──────▼──────┐     ┌──────▼──────┐     ┌──────▼──────┐
    │   OpenAI    │     │  Anthropic  │     │   Groq      │
    └─────────────┘     └─────────────┘     └─────────────┘
```

---

## Comparison with Existing Solutions

| Capability | LiteLLM | Helicone | Lakera | **Rind** |
|------------|---------|----------|--------|-----------|
| LLM routing | ✅ | ✅ | ❌ | ✅ |
| Cost tracking | ✅ | ✅ | ❌ | ✅ |
| Prompt injection | ❌ | ❌ | ✅ | ✅ |
| Tool call control | ❌ | ❌ | ❌ | ✅ |
| HITL approvals | ❌ | ❌ | ❌ | ✅ |
| MCP security | ❌ | ❌ | ❌ | ✅ |
| Policy DSL | ❌ | ❌ | ❌ | ✅ |
| Catastrophic prevention | ❌ | ❌ | ❌ | ✅ |

**Rind is the only solution that protects the tool execution layer.**

---

## Summary

1. **Threats exist at multiple layers** - input, LLM, tools, output
2. **Most critical threats are at the tool layer** - where actual damage happens
3. **Rind Gateway provides unified protection** - single deployment, multiple protocols
4. **Customers choose their integration** - SDK, LLM proxy, tool proxy, MCP proxy
5. **Shared services benefit all integrations** - policies, audit, HITL, dashboard

This architecture positions Rind as the comprehensive security solution for AI agents, differentiated from LLM-only gateways and prompt-only security tools.
