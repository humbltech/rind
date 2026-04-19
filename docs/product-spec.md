# Aegis Product Specification

## The Policy Engine for AI Agents

**Version:** 0.2 (Updated)
**Last Updated:** April 2026

---

## Market Context (RSAC 2026 Update)

### Why Now?

From Zscaler ThreatLabz 2026 AI Security Report:

| Stat | Value | Implication |
|------|-------|-------------|
| AI/ML transaction growth | 91% YoY | Market is massive and growing |
| Systems with critical vulns | 100% | Everyone needs protection |
| Median time to compromise | 16 minutes | Real-time defense required |
| AI traffic blocked by fear | 39% | Enterprises want enablement, not just blocking |

### Key Competitive Shift

**Lakera acquired by Check Point for ~$300M** (closing Q4 2025)
- Validates the market
- Check Point = enterprise DNA, will abandon mid-market/startups
- Creates opening for Aegis in the $50M-$500M revenue segment

### Target Market (Updated)

| Segment | Target? | Rationale |
|---------|---------|-----------|
| **Enterprise** ($500M+) | No | Check Point territory, long sales cycles |
| **Mid-market** ($50M-$500M) | **PRIMARY** | Budget ($300K-5M security spend), compliance-driven |
| **Funded startups** (Series B+) | **PRIMARY** | Have budget, enterprise customers asking |
| **SMB** (<$50M) | No | No dedicated budget, price sensitive |

See [market-targeting-rsac-2026.md](../research/market-targeting-rsac-2026.md) for detailed analysis.

### Real-World Incidents Aegis Prevents

| Incident | Impact | How Aegis Prevents |
|----------|--------|-------------------|
| **Replit DB Deletion** (July 2025) | 1,206 records lost, agent lied about damage | REQUIRE_APPROVAL for DELETE queries |
| **Amazon Kiro Outage** (Dec 2025) | 13-hour AWS outage | Multi-approver for production infra |
| **EchoLeak** (CVE-2025-32711) | Zero-click data exfiltration | Block external URLs, sanitize inputs |
| **$47K Agent Loop** | 11 days, $47,000 bill | Cost limits, loop detection |

See [case-studies-incident-prevention.md](../research/case-studies-incident-prevention.md) for detailed analysis

---

## Executive Summary

Aegis is a **policy-first control plane** for AI agents. It provides runtime governance for tool calls, prompts, MCP connections, and LLM interactions through a unified policy engine and single pane of glass.

**Core Value Proposition:**
> "Control what your agents CAN do, not just what they SAY."

**Differentiation:**
- Not just observability (LangSmith, Langfuse do this)
- Not just prompt filtering (Lakera, NeMo do this)
- Not just routing (LiteLLM, Portkey do this)
- **We enforce policies at the execution layer** - tools, MCPs, APIs

---

## Problem Statement

### The Governance Gap

Enterprises have:
- ✅ Prompt injection detection (Lakera, NeMo)
- ✅ LLM observability (LangSmith, Langfuse)
- ✅ API routing (LiteLLM, Portkey)

Enterprises lack:
- ❌ **Tool call governance** - what can agents actually DO?
- ❌ **Runtime policy enforcement** - stop bad actions before they happen
- ❌ **Unified control plane** - one place to manage all agent policies
- ❌ **MCP security** - which MCP servers can agents connect to?

### Real Incidents (2025-2026)

| Incident | What Happened | What Was Missing |
|----------|---------------|------------------|
| Meta Sev 1 | Agent exposed sensitive data for 2+ hours | Tool call restrictions |
| Replit | Agent deleted production database | Human-in-the-loop for destructive actions |
| $47K bill | 4 agents in infinite loop for 11 days | Cost limits, loop detection |
| Bank rollback | Chatbot gave incorrect financial advice | Output policy enforcement |

### Priority #1: Catastrophic Action Prevention

**This is the killer feature.** Lakera detects prompt injection but cannot prevent agents from taking catastrophic actions.

Example of Lakera's gap:
```
User: "Please clean up the old test data"
Prompt check: PASS (no injection detected)
Agent action: DELETE FROM users WHERE created_at < '2024-01-01'
Result: Production data deleted 💀
```

**Aegis approach:** Tiered risk controls based on McKinsey's framework:

| Risk Tier | Actions | Control |
|-----------|---------|---------|
| **Tier 1** | Read-only queries, info retrieval | Automated monitoring |
| **Tier 2** | Reversible actions, non-sensitive writes | Real-time guardrails |
| **Tier 3** | DB deletion, production changes, financial txns | **Human-in-the-loop required** |

See [competitive-analysis-lakera-2026.md](../research/competitive-analysis-lakera-2026.md) for detailed comparison

---

## Product Vision

### What Aegis Is

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         AEGIS CONTROL PLANE                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                      UNIFIED POLICY ENGINE                           │   │
│   │                                                                      │   │
│   │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌────────────┐  │   │
│   │  │ Tool Call   │  │ Prompt      │  │ MCP         │  │ Cost       │  │   │
│   │  │ Policies    │  │ Policies    │  │ Policies    │  │ Policies   │  │   │
│   │  └─────────────┘  └─────────────┘  └─────────────┘  └────────────┘  │   │
│   │                                                                      │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│   ┌───────────────────┐  ┌───────────────────┐  ┌───────────────────────┐   │
│   │  Virtual Keys     │  │  Audit Trail      │  │  Dashboard            │   │
│   │  & Vault          │  │  & Compliance     │  │  (Single Pane)        │   │
│   └───────────────────┘  └───────────────────┘  └───────────────────────┘   │
│                                                                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                         INTEGRATION LAYER                                    │
│                                                                              │
│   ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────────────┐   │
│   │ LiteLLM │  │ NeMo    │  │ Lakera  │  │ OpenTel │  │ Existing SIEM   │   │
│   │ Routing │  │ Guards  │  │ Detect  │  │ Tracing │  │ (Datadog, etc)  │   │
│   └─────────┘  └─────────┘  └─────────┘  └─────────┘  └─────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### What Aegis Is NOT

- Not an LLM provider (use OpenAI, Anthropic, etc.)
- Not replacing LangChain/CrewAI (agents run as-is)
- Not building prompt injection from scratch (integrate Lakera/NeMo)
- Not building observability from scratch (integrate OpenTelemetry)

---

## Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            YOUR INFRASTRUCTURE                               │
│                                                                              │
│  ┌──────────────────┐                                                       │
│  │   Your Agents    │                                                       │
│  │  (LangChain,     │                                                       │
│  │   CrewAI, etc)   │                                                       │
│  └────────┬─────────┘                                                       │
│           │                                                                  │
│           │ All outbound calls                                              │
│           ▼                                                                  │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                     AEGIS PROXY (Sidecar or Gateway)                 │    │
│  │                                                                      │    │
│  │  ┌──────────────────────────────────────────────────────────────┐   │    │
│  │  │                    POLICY EVALUATION                          │   │    │
│  │  │                                                               │   │    │
│  │  │  Request → Parse → Match Policies → Evaluate → Decision      │   │    │
│  │  │                                                               │   │    │
│  │  │  Decisions: ALLOW | DENY | TRANSFORM | REQUIRE_APPROVAL      │   │    │
│  │  └──────────────────────────────────────────────────────────────┘   │    │
│  │                                                                      │    │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────────┐    │    │
│  │  │ Tool Call  │  │ Prompt     │  │ MCP        │  │ Cost       │    │    │
│  │  │ Interceptor│  │ Filter     │  │ Gateway    │  │ Tracker    │    │    │
│  │  └────────────┘  └────────────┘  └────────────┘  └────────────┘    │    │
│  │                                                                      │    │
│  └──────────────────────────────┬───────────────────────────────────────┘    │
│                                 │                                            │
│                                 ▼                                            │
│           ┌─────────────────────┴─────────────────────┐                     │
│           │                                           │                      │
│           ▼                                           ▼                      │
│  ┌─────────────────┐                        ┌─────────────────┐             │
│  │   LLM APIs      │                        │   MCP Servers   │             │
│  │ (OpenAI, Claude)│                        │   & Tools       │             │
│  └─────────────────┘                        └─────────────────┘             │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ Audit logs, metrics
                                    ▼
                         ┌─────────────────────┐
                         │  AEGIS CONTROL      │
                         │  PLANE (Cloud/      │
                         │  Self-hosted)       │
                         │                     │
                         │  • Dashboard        │
                         │  • Policy Editor    │
                         │  • Audit Viewer     │
                         │  • Alerts           │
                         └─────────────────────┘
```

### Request Flow

```
1. Agent initiates action (tool call, LLM request, MCP connection)
   │
   ▼
2. Aegis Proxy intercepts request
   │
   ▼
3. Parse request type and extract metadata
   │
   ├── Tool call: tool name, parameters, agent ID
   ├── LLM request: prompt, model, tokens
   ├── MCP: server, tool, arguments
   │
   ▼
4. Policy Evaluation Engine
   │
   ├── Load applicable policies (by agent, project, org)
   ├── Match policies by conditions
   ├── Evaluate in priority order
   ├── First match wins (or merge strategies)
   │
   ▼
5. Decision
   │
   ├── ALLOW → Forward request, log it
   ├── DENY → Block request, return error, alert
   ├── TRANSFORM → Modify request (redact PII, etc.), forward
   ├── REQUIRE_APPROVAL → Queue for human, wait or timeout
   ├── RATE_LIMIT → Check quota, allow or throttle
   │
   ▼
6. Execute (if allowed)
   │
   ▼
7. Response Policy (optional)
   │
   ├── Check output against policies
   ├── Redact sensitive data
   ├── Log full interaction
   │
   ▼
8. Return to agent
```

---

## Deployment Models

### Model 1: Sidecar Proxy (Kubernetes)

**Best for:** Kubernetes deployments, per-pod isolation

```yaml
# Kubernetes deployment with Aegis sidecar
apiVersion: v1
kind: Pod
metadata:
  name: my-agent
spec:
  containers:
  # Your agent
  - name: agent
    image: my-agent:latest
    env:
    - name: OPENAI_BASE_URL
      value: "http://localhost:8080/v1"  # Route through Aegis
    - name: MCP_PROXY_URL
      value: "http://localhost:8080/mcp"

  # Aegis sidecar
  - name: aegis-proxy
    image: aegis/proxy:latest
    ports:
    - containerPort: 8080
    env:
    - name: AEGIS_API_KEY
      valueFrom:
        secretKeyRef:
          name: aegis-secrets
          key: api-key
    - name: AEGIS_PROJECT_ID
      value: "proj_abc123"
```

**Pros:**
- No code changes to agents
- Per-pod policy isolation
- Works with any framework

**Cons:**
- More containers to manage
- Slightly higher resource usage

---

### Model 2: Centralized Gateway

**Best for:** Existing infrastructure, shared services

```
┌─────────────────────────────────────────────────────────────┐
│                    Your Kubernetes Cluster                   │
│                                                              │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐                   │
│  │ Agent 1  │  │ Agent 2  │  │ Agent 3  │                   │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘                   │
│       │             │             │                          │
│       └─────────────┼─────────────┘                          │
│                     │                                        │
│                     ▼                                        │
│            ┌─────────────────┐                               │
│            │  Aegis Gateway  │  (Deployment with replicas)   │
│            │  Service        │                               │
│            └────────┬────────┘                               │
│                     │                                        │
└─────────────────────┼────────────────────────────────────────┘
                      │
                      ▼
              ┌───────────────┐
              │  External     │
              │  LLMs / MCPs  │
              └───────────────┘
```

**Deployment:**
```bash
helm install aegis-gateway aegis/gateway \
  --set apiKey=$AEGIS_API_KEY \
  --set replicas=3 \
  --set ingress.enabled=true
```

---

### Model 3: Service Mesh Integration (Istio/Envoy)

**Best for:** Enterprises with existing service mesh

```yaml
# Istio VirtualService routing AI traffic through Aegis
apiVersion: networking.istio.io/v1beta1
kind: VirtualService
metadata:
  name: ai-traffic
spec:
  hosts:
  - "api.openai.com"
  - "api.anthropic.com"
  - "*.mcp.local"
  http:
  - route:
    - destination:
        host: aegis-gateway
        port:
          number: 8080
```

---

### Model 4: Self-Hosted LLM Support (Ollama, vLLM)

**Best for:** Companies self-hosting models for privacy/cost/compliance

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    Customer's Kubernetes Cluster                             │
│                                                                              │
│  ┌──────────────────┐                                                       │
│  │   Your Agents    │                                                       │
│  │  (LangChain,     │                                                       │
│  │   CrewAI, etc)   │                                                       │
│  └────────┬─────────┘                                                       │
│           │                                                                  │
│           │ OpenAI-compatible API calls                                     │
│           ▼                                                                  │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │              AEGIS GATEWAY (Helm chart deployment)                   │    │
│  │                                                                      │    │
│  │  Same policy engine, deployed in-cluster                            │    │
│  │  Exposes OpenAI-compatible endpoint                                 │    │
│  │                                                                      │    │
│  └──────────────────────────────┬───────────────────────────────────────┘    │
│                                 │                                            │
│                                 ▼                                            │
│                        ┌─────────────────┐                                  │
│                        │  Ollama / vLLM  │                                  │
│                        │  (self-hosted)  │                                  │
│                        └─────────────────┘                                  │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ Audit logs, metrics (outbound only)
                                    ▼
                         ┌─────────────────────┐
                         │  AEGIS CONTROL      │
                         │  PLANE (Cloud)      │
                         │                     │
                         │  • Dashboard        │
                         │  • Policy sync      │
                         │  • Alerting         │
                         └─────────────────────┘
```

**Why this works:**
- Ollama and vLLM already expose OpenAI-compatible APIs
- Same proxy pattern, different deployment target
- No code changes for customers already using OpenAI SDK
- Data stays in their cluster, only audit logs sent to cloud

**Deployment:**
```bash
helm install aegis-gateway aegis/gateway \
  --set apiKey=$AEGIS_API_KEY \
  --set upstream.url="http://ollama:11434/v1" \
  --set upstream.type="ollama"
```

**Phase 2 feature** - focus on cloud APIs (OpenAI, Anthropic) first.

---

### Model 5: SDK Integration (Minimal Infrastructure)

**Best for:** Quick start, development, simple deployments

```python
from aegis import AegisClient
from langchain_openai import ChatOpenAI

# Wrap your LLM client
aegis = AegisClient(api_key="aegis_...")

llm = ChatOpenAI(
    model="gpt-4o",
    http_client=aegis.http_client(),  # Routes through Aegis
)

# Or wrap tools directly
@aegis.tool_policy("database_tools")
def execute_sql(query: str) -> str:
    # Aegis enforces policies before this runs
    return db.execute(query)
```

---

## Integration Strategy: Build vs Integrate

### Core Principle

> **Build the policy engine. Integrate everything else.**

### Build vs Integrate Matrix

| Capability | Build or Integrate | Tool/Approach | Rationale |
|------------|-------------------|---------------|-----------|
| **Policy Engine** | BUILD | Custom | Core differentiator, nobody has this |
| **Policy DSL** | BUILD | Custom | Core differentiator |
| **Virtual Keys** | BUILD | Custom | Deep policy integration needed |
| **Audit Trail** | BUILD | Custom + PostgreSQL | Compliance requirement |
| **Dashboard** | BUILD | Next.js | Single pane of glass |
| **LLM Routing** | INTEGRATE | LiteLLM | 100+ providers, MIT license |
| **Prompt Detection** | INTEGRATE | Lakera / NeMo | Mature, proven |
| **Tracing** | INTEGRATE | OpenTelemetry | Industry standard |
| **PII Detection** | INTEGRATE | Presidio / custom regex | Mature OSS |
| **SIEM Export** | INTEGRATE | Datadog, Splunk APIs | Enterprise standard |
| **Auth** | INTEGRATE | OAuth 2.0 / OIDC | Standard |
| **Secret Storage** | INTEGRATE | Vault / AWS Secrets Manager | Enterprise standard |

### Integration Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         AEGIS (What We Build)                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                    POLICY ENGINE (Custom)                            │    │
│  │  • Policy DSL parser                                                 │    │
│  │  • Policy evaluation engine                                          │    │
│  │  • Decision cache                                                    │    │
│  │  • Human-in-the-loop workflow                                        │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                    VIRTUAL KEYS & VAULT (Custom)                     │    │
│  │  • Key generation per agent/user                                     │    │
│  │  • Key-to-policy binding                                             │    │
│  │  • Usage tracking per key                                            │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                    CONTROL PLANE (Custom)                            │    │
│  │  • Dashboard (React/Next.js)                                         │    │
│  │  • Policy editor (Monaco/YAML)                                       │    │
│  │  • Audit viewer                                                      │    │
│  │  • Alerts & notifications                                            │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                        INTEGRATIONS (What We Use)                            │
│                                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │   LiteLLM    │  │   Lakera     │  │ OpenTelemetry│  │  Presidio    │     │
│  │   (routing)  │  │   (prompts)  │  │  (tracing)   │  │  (PII)       │     │
│  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘     │
│                                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │ NeMo Guards  │  │   Vault      │  │   Datadog    │  │   Splunk     │     │
│  │ (guardrails) │  │  (secrets)   │  │   (SIEM)     │  │   (SIEM)     │     │
│  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘     │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## What We Replace vs Integrate With

### We REPLACE:

| Current Tool | What They Do | Why We Replace |
|--------------|--------------|----------------|
| Manual API key sharing | Copy-paste keys | Virtual keys with policies |
| No tool governance | Tools run unrestricted | Tool call policies |
| Spreadsheet policies | Policies not enforced | Runtime enforcement |
| Multiple dashboards | Fragmented visibility | Single pane of glass |

### We INTEGRATE WITH:

| Tool | How We Integrate | Value Add |
|------|------------------|-----------|
| **LangChain/LangGraph** | SDK wrapper or proxy | Add policies without code changes |
| **CrewAI** | Proxy | Transparent policy enforcement |
| **LiteLLM** | Fork/embed for routing | We focus on policies, they handle routing |
| **Lakera Guard** | API call before LLM | Prompt safety policies |
| **NeMo Guardrails** | Embed as policy action | Content safety as policy |
| **OpenTelemetry** | Export traces | Use existing tracing infra |
| **Datadog/Splunk** | Webhook/API export | Fit into existing SOC |
| **Vault/AWS Secrets** | Read vendor keys | Secure key storage |
| **Okta/Azure AD** | OIDC for user auth | Enterprise SSO |

---

## Policy DSL Specification

See [policy-dsl.md](./policy-dsl.md) for complete specification.

### Quick Overview

```yaml
# aegis-policies.yaml

version: "1.0"
policies:

  # ═══════════════════════════════════════════════════════════════
  # TOOL CALL POLICIES
  # ═══════════════════════════════════════════════════════════════

  - name: "block-destructive-database-operations"
    type: tool_call
    priority: 1  # Lower = higher priority

    match:
      tools: ["sql_execute", "db_*"]
      parameters:
        query:
          regex: "(DROP|DELETE|TRUNCATE|ALTER)\\s"

    action: DENY
    response:
      message: "Destructive database operations require manual approval"

    alert:
      severity: HIGH
      channels: ["slack", "pagerduty"]

  - name: "require-approval-large-payments"
    type: tool_call
    priority: 10

    match:
      tools: ["stripe_charge", "payment_*"]
      parameters:
        amount: { gt: 10000 }  # > $100.00

    action: REQUIRE_APPROVAL
    approval:
      approvers: ["finance-team"]
      timeout: 30m
      on_timeout: DENY

  # ═══════════════════════════════════════════════════════════════
  # PROMPT POLICIES
  # ═══════════════════════════════════════════════════════════════

  - name: "block-prompt-injection"
    type: prompt
    priority: 1

    match:
      # Use integrated Lakera for detection
      provider: "lakera"
      threshold: 0.8

    action: DENY
    response:
      message: "Request blocked: potential prompt injection detected"

  - name: "redact-pii-in-prompts"
    type: prompt
    priority: 20

    match:
      content:
        contains_pii: true  # Uses Presidio

    action: TRANSFORM
    transform:
      redact_pii: true
      pii_types: ["email", "phone", "ssn", "credit_card"]

  # ═══════════════════════════════════════════════════════════════
  # MCP POLICIES
  # ═══════════════════════════════════════════════════════════════

  - name: "allowlist-mcp-servers"
    type: mcp
    priority: 1

    match:
      servers:
        not_in: ["github-official", "slack-official", "internal-*"]

    action: DENY
    response:
      message: "MCP server not in allowlist"

  - name: "restrict-mcp-file-access"
    type: mcp
    priority: 10

    match:
      server: "filesystem"
      tool: "read_file"
      parameters:
        path:
          regex: "^/(etc|var|usr)/"

    action: DENY

  # ═══════════════════════════════════════════════════════════════
  # COST POLICIES
  # ═══════════════════════════════════════════════════════════════

  - name: "enforce-budget-limits"
    type: cost
    priority: 1

    scope: per_agent
    limits:
      daily: 100.00      # USD
      monthly: 2000.00

    action_on_exceed: DENY
    alert:
      at_percentage: [50, 80, 95]
      channels: ["email", "slack"]

  - name: "prevent-expensive-models"
    type: llm_request
    priority: 5

    match:
      model:
        in: ["gpt-4", "claude-3-opus"]
      estimated_cost: { gt: 1.00 }

    action: REQUIRE_APPROVAL
```

---

## MVP Scope

### Phase 1: Foundation (Months 1-2)

**Goal:** Core policy engine + proxy working

| Feature | Description | Priority |
|---------|-------------|----------|
| Policy Engine | Parse YAML, evaluate policies, return decisions | P0 |
| Tool Call Interceptor | Intercept tool calls, apply policies | P0 |
| Virtual Keys | Generate keys, bind to policies, track usage | P0 |
| Basic Dashboard | View policies, see audit logs | P0 |
| LiteLLM Integration | Route LLM calls through Aegis | P0 |
| Docker Deployment | Single container deployment | P0 |

**Not in Phase 1:**
- Human-in-the-loop approval workflow
- MCP gateway
- Prompt injection integration
- Kubernetes operator

### Phase 2: Enterprise Ready (Months 3-4)

| Feature | Description | Priority |
|---------|-------------|----------|
| MCP Gateway | Intercept MCP connections, apply policies | P0 |
| Lakera Integration | Prompt injection detection | P1 |
| Human Approval Workflow | Slack/email approval for actions | P1 |
| Kubernetes Sidecar | Helm chart, operator | P1 |
| SIEM Export | Datadog, Splunk webhooks | P1 |
| Cost Tracking | Per-agent, per-key cost limits | P1 |

### Phase 3: Scale (Months 5-6)

| Feature | Description | Priority |
|---------|-------------|----------|
| Multi-tenant | Org/project/agent hierarchy | P1 |
| RBAC | Role-based access to policies | P1 |
| Policy Versioning | Git-like history, rollback | P2 |
| Compliance Reports | SOC2, HIPAA templates | P2 |
| Self-hosted Control Plane | On-prem dashboard | P2 |

---

## Technology Stack

### Proxy/Gateway

| Component | Technology | Rationale |
|-----------|------------|-----------|
| Language | Python 3.12+ | LiteLLM ecosystem, ML-friendly |
| Framework | FastAPI | Async, OpenAPI, LiteLLM uses it |
| Policy Engine | Custom (Python) | Core differentiator |
| Policy Parser | Pydantic + YAML | Type-safe, familiar |

### Control Plane

| Component | Technology | Rationale |
|-----------|------------|-----------|
| Frontend | Next.js 15, React 19 | Modern, TypeScript |
| API | FastAPI or Hono | Consistent with proxy |
| Database | PostgreSQL (Supabase) | RLS for multi-tenant |
| Cache | Redis | Rate limiting, sessions |
| Auth | Supabase Auth / Auth0 | SSO ready |

### Integrations

| Integration | Library/API | Notes |
|-------------|-------------|-------|
| LiteLLM | `litellm` package | Fork or embed |
| Lakera | REST API | Prompt detection |
| NeMo Guardrails | `nemoguardrails` package | Content safety |
| Presidio | `presidio-analyzer` package | PII detection |
| OpenTelemetry | `opentelemetry-*` packages | Tracing export |

---

## Pricing Model Research

### Competitor Pricing

| Competitor | Model | Price Range |
|------------|-------|-------------|
| **Portkey** | Usage-based + seats | $49-$499/mo + overages |
| **LiteLLM Enterprise** | Custom | $10K-$50K/year |
| **Datadog LLM** | Per-span | $0.008/span + $120/day min |
| **Langfuse** | Events | Free → $29-$2,499/mo |
| **Lakera** | Per-request | ~$0.001-0.003/request |

### Recommended Aegis Pricing (Updated April 2026)

**Note:** Canonical pricing — all other docs should match this table. Source of truth: `pricing-strategy.md`.

| Tier | Price | Includes | Target | ACV |
|------|-------|----------|--------|-----|
| **Free** | $0 | 10K evals/mo, 5 agents, 1 user, 7-day audit | Developers, hobbyists | $0 |
| **Starter** | $99/mo | 100K evals/mo, 25 agents, 3 users, email alerts, 30-day audit | Solo builders, indie devs | $1.2K |
| **Team** | $399/mo | 1M evals/mo, 100 agents, 10 users, Slack alerts, 90-day audit | Startups | $4.8K |
| **Business** | $999/mo | 10M evals/mo, 500 agents, 25 users, SSO, approvals, 1-yr audit | Mid-market | $12K |
| **Enterprise** | Custom ($25K-100K/yr) | Unlimited, self-hosted, SLA, compliance reports, dedicated support | Enterprise | $25K+ |

**Comparison to competition:**
- Lakera (→Check Point): Will be $50K+ enterprise bundles
- LLM Guard: Free but DIY (no support, no dashboard)
- Cloudflare AI: Requires enterprise WAF subscription

**We own the "managed, affordable, mid-market" gap.**

### Pricing Philosophy

1. **Per-policy-evaluation** not per-request (clearer value)
2. **Agent-based limits** (scales with their deployment)
3. **Free tier** for bottom-up adoption
4. **Self-hosted option** for enterprises

---

## Success Metrics

### Product Metrics

| Metric | Target (6 months) | Target (12 months) |
|--------|-------------------|-------------------|
| Policies evaluated/day | 1M | 100M |
| Agents protected | 1,000 | 50,000 |
| Customers (paid) | 20 | 100 |
| ARR | $100K | $1M |

### Technical Metrics

| Metric | Target |
|--------|--------|
| Policy evaluation latency | <5ms p99 |
| Proxy overhead | <10ms p99 |
| Availability | 99.9% |
| Time to deploy | <10 minutes |

---

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Portkey adds policy engine | High | High | Move fast, go deeper on tool calls |
| LiteLLM adds policies | Medium | High | Fork now, differentiate on UX |
| Big player acquires competitor | Medium | Medium | Build community, open-source core |
| Adoption slower than expected | Medium | High | Free tier, great docs, easy deployment |
| Performance overhead concerns | Low | High | Benchmark constantly, optimize |

---

## Next Steps

1. [ ] Finalize Policy DSL specification
2. [ ] Prototype policy engine
3. [ ] Integrate LiteLLM for routing
4. [ ] Build minimal dashboard
5. [ ] Deploy to 3 design partners
6. [ ] Iterate based on feedback

---

*Document Version: 0.1 Draft*
*Next Review: After Policy DSL completion*
