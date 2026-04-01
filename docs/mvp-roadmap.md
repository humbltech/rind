# Aegis MVP Roadmap

## Overview

**MVP Goal:** A working policy engine that can intercept tool calls and LLM requests, evaluate policies, and enforce decisions.

**Timeline:** 12 weeks (3 months) to MVP
**Team Assumption:** 1-2 engineers

---

## Success Criteria for MVP

By end of Week 12, we can:
- [ ] Deploy Aegis proxy in front of an existing LangChain agent
- [ ] Define policies in YAML that control tool calls
- [ ] Block/allow tool calls based on policies
- [ ] Issue virtual keys per agent with usage tracking
- [ ] View audit logs in a basic dashboard
- [ ] Demo to 3 potential customers

---

## Phase 1: Foundation (Weeks 1-4)

### Week 1: Project Setup & Core Types

**Goal:** Monorepo setup, core data models, basic proxy skeleton

| Task | Details | Output |
|------|---------|--------|
| Monorepo setup | Python (uv/poetry), pnpm for dashboard | Working dev environment |
| Core types | Policy, Agent, Key, AuditLog models | `aegis/core/models.py` |
| Policy parser | Parse YAML policies into typed objects | `aegis/core/policy_parser.py` |
| Basic proxy | FastAPI proxy that forwards requests | `aegis/proxy/main.py` |
| Docker setup | Dockerfile, docker-compose | `docker-compose.yml` |

**Deliverable:** Can start proxy, forward requests to OpenAI, see logs

```bash
# End of Week 1
docker-compose up
curl http://localhost:8080/v1/chat/completions -d '{"model": "gpt-4o", "messages": [...]}'
# Request forwarded to OpenAI, logged
```

---

### Week 2: Policy Engine Core

**Goal:** Policy evaluation engine that can match and decide

| Task | Details | Output |
|------|---------|--------|
| Policy matcher | Match requests against policy conditions | `aegis/engine/matcher.py` |
| Condition evaluators | Implement match conditions (contains, regex, gt/lt, etc.) | `aegis/engine/conditions.py` |
| Decision engine | Evaluate policies, return decision | `aegis/engine/evaluator.py` |
| Action handlers | ALLOW, DENY, TRANSFORM actions | `aegis/engine/actions.py` |
| Unit tests | Test policy matching logic | `tests/test_engine.py` |

**Deliverable:** Can evaluate policies against mock requests

```python
# End of Week 2
policy = load_policy("block-dangerous-queries.yaml")
request = {"tool": "sql_execute", "parameters": {"query": "DROP TABLE users"}}
decision = engine.evaluate(request, [policy])
assert decision.action == "DENY"
```

---

### Week 3: Tool Call Interception

**Goal:** Intercept tool calls from LangChain agents

| Task | Details | Output |
|------|---------|--------|
| Tool call detection | Detect tool_calls in OpenAI responses | `aegis/proxy/interceptors/tool_calls.py` |
| Pre-execution hook | Intercept before tool executes | Hook mechanism |
| Policy enforcement | Apply policies to tool calls | Integration |
| Response handling | Return policy decision to agent | Error responses |
| LangChain testing | Test with real LangChain agent | `examples/langchain_demo.py` |

**Deliverable:** Block a tool call from a LangChain agent

```python
# End of Week 3
# Policy: block sql_execute with DROP
# Agent tries: sql_execute("DROP TABLE users")
# Result: Tool call blocked, agent receives error
```

---

### Week 4: Virtual Keys & Basic Storage

**Goal:** Issue keys, store policies and audit logs

| Task | Details | Output |
|------|---------|--------|
| PostgreSQL schema | Keys, policies, audit_logs tables | `aegis/db/schema.sql` |
| Key generation | Generate virtual keys | `aegis/core/keys.py` |
| Key-to-policy binding | Associate keys with policies | DB relations |
| Audit logging | Log all decisions to DB | `aegis/core/audit.py` |
| Key authentication | Validate keys on requests | Auth middleware |
| Basic API | CRUD for keys and policies | `aegis/api/` |

**Deliverable:** Issue a key, make requests with it, see audit logs

```bash
# End of Week 4
# Create key
curl -X POST http://localhost:8080/api/keys -d '{"name": "my-agent"}'
# {"key": "aegis_sk_abc123", "id": "key_xyz"}

# Use key
curl http://localhost:8080/v1/chat/completions \
  -H "Authorization: Bearer aegis_sk_abc123" \
  -d '{"model": "gpt-4o", ...}'

# View audit
curl http://localhost:8080/api/audit?key_id=key_xyz
# [{"timestamp": "...", "action": "ALLOW", ...}]
```

---

## Phase 2: Core Features (Weeks 5-8)

### Week 5: LLM Request Policies

**Goal:** Policies for LLM requests (model, tokens, cost)

| Task | Details | Output |
|------|---------|--------|
| LLM request parsing | Extract model, tokens, parameters | Parser |
| Token counting | Estimate tokens before request | `aegis/utils/tokens.py` |
| Cost estimation | Calculate estimated cost | `aegis/utils/cost.py` |
| Model policies | Block/allow by model name | Policy type |
| Cost policies | Enforce per-request cost limits | Policy type |

**Deliverable:** Block requests to expensive models or over cost limit

```yaml
# Policy
- name: "block-expensive-models"
  type: llm_request
  match:
    model:
      in: ["gpt-4", "claude-3-opus"]
  action: DENY
```

---

### Week 6: Prompt Policies & Integrations

**Goal:** Prompt filtering with Lakera/Presidio integration

| Task | Details | Output |
|------|---------|--------|
| Prompt extraction | Extract prompts from requests | Parser |
| Lakera integration | Call Lakera API for injection detection | `aegis/integrations/lakera.py` |
| Presidio integration | PII detection and redaction | `aegis/integrations/presidio.py` |
| Transform action | Modify prompts before forwarding | Transform handler |
| Async evaluation | Non-blocking external calls | Async pattern |

**Deliverable:** Detect prompt injection, redact PII

```yaml
# Prompt injection detection
- name: "block-injection"
  type: prompt
  match:
    provider: "lakera"
    detection:
      prompt_injection: { threshold: 0.8 }
  action: DENY

# PII redaction
- name: "redact-pii"
  type: prompt
  action: TRANSFORM
  transform:
    redact_pii:
      types: ["email", "phone"]
```

---

### Week 7: Rate Limiting & Cost Tracking

**Goal:** Enforce rate limits and track costs

| Task | Details | Output |
|------|---------|--------|
| Redis integration | Rate limit counters | `aegis/utils/redis.py` |
| Rate limiter | Token bucket / sliding window | `aegis/engine/rate_limiter.py` |
| Cost tracking | Track actual costs per key/agent | `aegis/core/cost_tracker.py` |
| Budget enforcement | Block when budget exceeded | Cost policy |
| Usage API | Query usage by key/project | API endpoint |

**Deliverable:** Rate limit agents, track and enforce budgets

```yaml
- name: "agent-rate-limit"
  type: tool_call
  action: RATE_LIMIT
  rate_limit:
    limit: 100
    window: 1m
    scope: per_key

- name: "daily-budget"
  type: cost
  limits:
    daily: 100.00
  action_on_exceed: DENY
```

---

### Week 8: Dashboard MVP

**Goal:** Basic web dashboard for policies and audit

| Task | Details | Output |
|------|---------|--------|
| Next.js setup | App router, Tailwind, shadcn/ui | `dashboard/` |
| Auth | Simple API key or Supabase auth | Auth flow |
| Policy viewer | List and view policies | `/policies` page |
| Policy editor | YAML editor with validation | Monaco editor |
| Audit viewer | Search and filter audit logs | `/audit` page |
| Key management | Create, view, revoke keys | `/keys` page |

**Deliverable:** Web UI to manage policies and view audit logs

---

## Phase 3: Production Ready (Weeks 9-12)

### Week 9: MCP Gateway

**Goal:** Intercept and govern MCP connections

| Task | Details | Output |
|------|---------|--------|
| MCP protocol support | Handle MCP stdio/SSE transport | `aegis/proxy/mcp/` |
| MCP tool interception | Extract tool calls from MCP | Interceptor |
| MCP policies | Server allowlist, tool restrictions | Policy type |
| MCP audit | Log all MCP interactions | Audit |
| Claude integration | Test with Claude Desktop | Demo |

**Deliverable:** Control which MCP servers agents can connect to

```yaml
- name: "mcp-allowlist"
  type: mcp
  match:
    servers_not: ["github-official", "internal-*"]
  action: DENY
```

---

### Week 10: Human-in-the-Loop

**Goal:** Approval workflows for sensitive actions

| Task | Details | Output |
|------|---------|--------|
| Approval queue | Store pending approvals | DB + API |
| Slack integration | Send approval requests to Slack | `aegis/integrations/slack.py` |
| Approval API | Approve/deny via API or Slack | Endpoints |
| Timeout handling | Auto-deny on timeout | Background job |
| Dashboard approvals | Approve in web UI | UI component |

**Deliverable:** Request human approval for sensitive tool calls

```yaml
- name: "approve-payments"
  type: tool_call
  match:
    tools: ["stripe_*"]
    parameters:
      amount: { gt: 10000 }
  action: REQUIRE_APPROVAL
  approval:
    slack_channel: "#agent-approvals"
    timeout: 15m
```

---

### Week 11: Deployment & Reliability

**Goal:** Production-ready deployment options

| Task | Details | Output |
|------|---------|--------|
| Helm chart | Kubernetes deployment | `helm/aegis/` |
| Health checks | Liveness, readiness probes | `/health` endpoints |
| Metrics | Prometheus metrics | `/metrics` |
| Error handling | Graceful degradation | Fallback logic |
| Load testing | Performance benchmarks | Benchmark results |
| Documentation | Deployment guide | `docs/deployment.md` |

**Deliverable:** One-command Kubernetes deployment

```bash
helm install aegis ./helm/aegis \
  --set apiKey=$AEGIS_API_KEY \
  --set postgresql.enabled=true
```

---

### Week 12: Polish & Demo

**Goal:** Demo-ready product for design partners

| Task | Details | Output |
|------|---------|--------|
| Demo environment | Hosted demo instance | demo.aegis.dev |
| Example policies | Library of common policies | `examples/policies/` |
| Quickstart guide | 5-minute getting started | `docs/quickstart.md` |
| Video walkthrough | 3-minute demo video | Video |
| Design partner outreach | Contact 10 potential customers | Meetings |
| Feedback collection | Structured feedback form | Form |

**Deliverable:** Can demo to customers, collect feedback

---

## Technical Architecture Summary

### Repository Structure

```
aegis/
├── aegis/                      # Python package
│   ├── core/                   # Core models, types
│   │   ├── models.py
│   │   ├── policy_parser.py
│   │   ├── keys.py
│   │   └── audit.py
│   ├── engine/                 # Policy engine
│   │   ├── evaluator.py
│   │   ├── matcher.py
│   │   ├── conditions.py
│   │   ├── actions.py
│   │   └── rate_limiter.py
│   ├── proxy/                  # FastAPI proxy
│   │   ├── main.py
│   │   ├── middleware.py
│   │   └── interceptors/
│   │       ├── tool_calls.py
│   │       ├── llm_requests.py
│   │       └── mcp.py
│   ├── integrations/           # External integrations
│   │   ├── litellm.py
│   │   ├── lakera.py
│   │   ├── presidio.py
│   │   └── slack.py
│   ├── api/                    # Management API
│   │   ├── policies.py
│   │   ├── keys.py
│   │   └── audit.py
│   ├── db/                     # Database
│   │   ├── schema.sql
│   │   └── migrations/
│   └── utils/
│       ├── tokens.py
│       └── cost.py
├── dashboard/                  # Next.js dashboard
│   ├── app/
│   ├── components/
│   └── lib/
├── helm/                       # Kubernetes charts
├── examples/                   # Example policies and demos
├── tests/
├── docs/
├── docker-compose.yml
├── Dockerfile
└── pyproject.toml
```

### Tech Stack

| Component | Technology |
|-----------|------------|
| Proxy | Python 3.12, FastAPI, uvicorn |
| Policy Engine | Custom Python |
| Dashboard | Next.js 15, React 19, Tailwind, shadcn/ui |
| Database | PostgreSQL (Supabase compatible) |
| Cache | Redis |
| Auth | API keys (MVP), OAuth later |
| Deployment | Docker, Kubernetes/Helm |

---

## Dependencies & Integrations

### Python Dependencies

```toml
[project]
dependencies = [
    "fastapi>=0.110.0",
    "uvicorn[standard]>=0.27.0",
    "pydantic>=2.6.0",
    "pyyaml>=6.0",
    "httpx>=0.27.0",
    "redis>=5.0.0",
    "asyncpg>=0.29.0",
    "litellm>=1.30.0",           # LLM routing
    "presidio-analyzer>=2.2.0",  # PII detection
    "tiktoken>=0.6.0",           # Token counting
]

[project.optional-dependencies]
lakera = ["lakera-guard>=0.1.0"]
nemo = ["nemoguardrails>=0.8.0"]
```

### External Services (MVP)

| Service | Purpose | Required? |
|---------|---------|-----------|
| PostgreSQL | Policy & audit storage | Yes |
| Redis | Rate limiting, cache | Yes |
| Lakera | Prompt injection (optional) | No |
| Slack | Approvals (optional) | No |

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| LiteLLM doesn't support our use case | Fork early, maintain our own |
| Lakera API too slow | Make async, cache results, fallback |
| Policy engine too slow | Benchmark constantly, optimize hot paths |
| Customers don't understand DSL | Provide UI policy builder, templates |
| MCP protocol changes | Follow spec closely, version support |

---

## Post-MVP Roadmap (Months 4-6)

| Feature | Priority | Notes |
|---------|----------|-------|
| Multi-tenant (orgs/projects) | P0 | Required for SaaS |
| SSO (OIDC) | P1 | Enterprise requirement |
| Policy versioning | P1 | Git-like history |
| Response policies | P1 | Filter LLM outputs |
| Compliance reports | P2 | SOC2, HIPAA templates |
| Self-hosted control plane | P2 | Air-gapped deployments |
| SDK (Python) | P2 | Direct integration option |
| Semantic caching | P3 | Cost optimization |

---

## Weekly Milestones Summary

| Week | Milestone | Demo |
|------|-----------|------|
| 1 | Proxy forwards requests | Forward to OpenAI |
| 2 | Policy engine evaluates | Match policy, return decision |
| 3 | Tool calls intercepted | Block a tool call |
| 4 | Keys and audit | Issue key, view logs |
| 5 | LLM policies | Block expensive models |
| 6 | Prompt policies | Detect injection, redact PII |
| 7 | Rate limits & budgets | Enforce limits |
| 8 | Dashboard | Web UI for management |
| 9 | MCP gateway | Control MCP servers |
| 10 | Approvals | Slack approval workflow |
| 11 | Kubernetes | Helm deployment |
| 12 | Demo ready | Customer demos |

---

## Getting Started (Week 1, Day 1)

```bash
# Create project
mkdir aegis && cd aegis
uv init --python 3.12

# Add dependencies
uv add fastapi uvicorn pydantic pyyaml httpx

# Create structure
mkdir -p aegis/{core,engine,proxy,api,db}
mkdir -p dashboard tests docs examples

# Start coding
touch aegis/core/models.py
touch aegis/proxy/main.py
```

---

*Last Updated: March 2026*
