# Rind Data Models

## Overview

This document defines the core data models for the Rind platform, including database schemas, API contracts, and relationships.

---

## Entity Relationship Diagram

```
┌─────────────────┐       ┌─────────────────┐       ┌─────────────────┐
│  Organization   │──────<│     Project     │──────<│      Agent      │
└─────────────────┘  1:N  └─────────────────┘  1:N  └─────────────────┘
        │                         │                         │
        │                         │                         │
        │ 1:N                     │ 1:N                     │ 1:N
        ▼                         ▼                         ▼
┌─────────────────┐       ┌─────────────────┐       ┌─────────────────┐
│      User       │       │     Policy      │       │      Trace      │
└─────────────────┘       └─────────────────┘       └─────────────────┘
                                                            │
                                                            │ 1:N
                                                            ▼
                                                    ┌─────────────────┐
                                                    │      Span       │
                                                    └─────────────────┘

┌─────────────────┐       ┌─────────────────┐
│   MCP Server    │──────<│      Tool       │
└─────────────────┘  1:N  └─────────────────┘
        │
        │ N:M
        ▼
┌─────────────────┐
│    Tool Pin     │
└─────────────────┘
```

---

## Core Entities

### Organization

Multi-tenant root entity.

```sql
CREATE TABLE organizations (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            TEXT NOT NULL,
    slug            TEXT UNIQUE NOT NULL,  -- For URLs

    -- Subscription
    tier            TEXT NOT NULL DEFAULT 'community',  -- community, team, business, enterprise
    billing_email   TEXT,
    stripe_customer_id TEXT,

    -- Limits
    agent_limit     INTEGER NOT NULL DEFAULT 5,
    event_limit     BIGINT NOT NULL DEFAULT 100000,  -- Per month

    -- Settings
    settings        JSONB NOT NULL DEFAULT '{}',

    -- Audit
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS: All queries filter by organization
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;

CREATE POLICY org_isolation ON organizations
    USING (id = current_setting('app.organization_id')::UUID);
```

### User

```sql
CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id),

    -- Identity
    email           TEXT NOT NULL,
    name            TEXT,
    avatar_url      TEXT,

    -- Auth
    auth_provider   TEXT NOT NULL,  -- 'google', 'github', 'email'
    auth_provider_id TEXT,

    -- Role
    role            TEXT NOT NULL DEFAULT 'member',  -- owner, admin, member, viewer

    -- Status
    last_login_at   TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE(organization_id, email)
);

CREATE INDEX idx_users_org ON users(organization_id);
```

### Project

Logical grouping of agents (e.g., "Production", "Staging", "Customer Support Bot").

```sql
CREATE TABLE projects (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id),

    name            TEXT NOT NULL,
    slug            TEXT NOT NULL,
    description     TEXT,

    -- Environment
    environment     TEXT NOT NULL DEFAULT 'development',  -- development, staging, production

    -- Settings
    settings        JSONB NOT NULL DEFAULT '{}',

    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE(organization_id, slug)
);

CREATE INDEX idx_projects_org ON projects(organization_id);
```

### Agent

Represents an AI agent being monitored.

```sql
CREATE TABLE agents (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id      UUID NOT NULL REFERENCES projects(id),
    organization_id UUID NOT NULL REFERENCES organizations(id),

    -- Identity
    name            TEXT NOT NULL,
    description     TEXT,

    -- Classification
    framework       TEXT,  -- 'langchain', 'langgraph', 'crewai', 'custom'
    agent_type      TEXT,  -- 'react', 'tool-calling', 'multi-agent', etc.

    -- Configuration
    config          JSONB NOT NULL DEFAULT '{}',

    -- Status
    status          TEXT NOT NULL DEFAULT 'active',  -- active, paused, disabled
    last_seen_at    TIMESTAMPTZ,

    -- Stats (denormalized for dashboard)
    total_traces    BIGINT NOT NULL DEFAULT 0,
    total_tokens    BIGINT NOT NULL DEFAULT 0,
    total_cost_usd  DECIMAL(10, 4) NOT NULL DEFAULT 0,
    error_count     BIGINT NOT NULL DEFAULT 0,

    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_agents_project ON agents(project_id);
CREATE INDEX idx_agents_org ON agents(organization_id);
CREATE INDEX idx_agents_status ON agents(status) WHERE status = 'active';
```

### API Key

Authentication for SDK and proxy.

```sql
CREATE TABLE api_keys (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id),
    project_id      UUID REFERENCES projects(id),  -- NULL = org-wide

    -- Key (hashed)
    key_prefix      TEXT NOT NULL,  -- First 8 chars for identification
    key_hash        TEXT NOT NULL,  -- Argon2id hash

    name            TEXT NOT NULL,
    description     TEXT,

    -- Permissions
    scopes          TEXT[] NOT NULL DEFAULT '{}',  -- 'traces:write', 'policies:read', etc.

    -- Limits
    rate_limit      INTEGER,  -- Requests per minute

    -- Status
    last_used_at    TIMESTAMPTZ,
    expires_at      TIMESTAMPTZ,
    revoked_at      TIMESTAMPTZ,

    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by      UUID REFERENCES users(id)
);

CREATE INDEX idx_api_keys_org ON api_keys(organization_id);
CREATE INDEX idx_api_keys_prefix ON api_keys(key_prefix);
```

---

## Observability Entities

### Trace

A complete execution of an agent (root-level).

```sql
CREATE TABLE traces (
    id              UUID PRIMARY KEY,  -- Client-generated trace ID
    organization_id UUID NOT NULL REFERENCES organizations(id),
    project_id      UUID NOT NULL REFERENCES projects(id),
    agent_id        UUID REFERENCES agents(id),

    -- Timing
    start_time      TIMESTAMPTZ NOT NULL,
    end_time        TIMESTAMPTZ,
    duration_ms     INTEGER,

    -- Input/Output (optional, privacy-controlled)
    input           JSONB,
    output          JSONB,

    -- Status
    status          TEXT NOT NULL DEFAULT 'running',  -- running, success, error
    error_message   TEXT,
    error_type      TEXT,

    -- Aggregates (computed from spans)
    span_count      INTEGER NOT NULL DEFAULT 0,
    llm_calls       INTEGER NOT NULL DEFAULT 0,
    tool_calls      INTEGER NOT NULL DEFAULT 0,

    -- Tokens & Cost
    prompt_tokens   INTEGER NOT NULL DEFAULT 0,
    completion_tokens INTEGER NOT NULL DEFAULT 0,
    total_tokens    INTEGER NOT NULL DEFAULT 0,
    cost_usd        DECIMAL(10, 6) NOT NULL DEFAULT 0,

    -- Context
    metadata        JSONB NOT NULL DEFAULT '{}',
    tags            TEXT[] NOT NULL DEFAULT '{}',

    -- SDK info
    sdk_name        TEXT,
    sdk_version     TEXT,

    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Partitioned by time for performance
CREATE INDEX idx_traces_org_time ON traces(organization_id, start_time DESC);
CREATE INDEX idx_traces_project ON traces(project_id, start_time DESC);
CREATE INDEX idx_traces_agent ON traces(agent_id, start_time DESC);
CREATE INDEX idx_traces_status ON traces(status) WHERE status = 'error';
CREATE INDEX idx_traces_tags ON traces USING GIN(tags);
```

### Span

Individual operation within a trace.

```sql
CREATE TABLE spans (
    id              UUID PRIMARY KEY,  -- Client-generated span ID
    trace_id        UUID NOT NULL REFERENCES traces(id),
    parent_span_id  UUID REFERENCES spans(id),
    organization_id UUID NOT NULL,  -- Denormalized for RLS

    -- Classification
    span_type       TEXT NOT NULL,  -- 'llm', 'tool', 'chain', 'retriever', 'agent', 'graph'
    name            TEXT NOT NULL,

    -- Timing
    start_time      TIMESTAMPTZ NOT NULL,
    end_time        TIMESTAMPTZ,
    duration_ms     INTEGER,

    -- Data
    input           JSONB,
    output          JSONB,

    -- LLM-specific
    model           TEXT,
    prompt_tokens   INTEGER,
    completion_tokens INTEGER,
    cost_usd        DECIMAL(10, 6),

    -- Tool-specific
    tool_name       TEXT,

    -- Status
    status          TEXT NOT NULL DEFAULT 'running',
    error_message   TEXT,
    error_type      TEXT,

    -- Events (agent actions, etc.)
    events          JSONB,

    -- Context
    metadata        JSONB NOT NULL DEFAULT '{}',

    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_spans_trace ON spans(trace_id);
CREATE INDEX idx_spans_parent ON spans(parent_span_id);
CREATE INDEX idx_spans_type ON spans(span_type);
CREATE INDEX idx_spans_org_time ON spans(organization_id, start_time DESC);
```

---

## MCP Security Entities

### MCP Server

Registered MCP servers.

```sql
CREATE TABLE mcp_servers (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id),

    -- Identity
    name            TEXT NOT NULL,
    url             TEXT NOT NULL,
    transport       TEXT NOT NULL,  -- 'stdio', 'sse', 'http'

    -- Discovery
    discovered_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_scanned_at TIMESTAMPTZ,

    -- Status
    status          TEXT NOT NULL DEFAULT 'active',  -- active, unreachable, blocked
    health_status   TEXT,  -- 'healthy', 'degraded', 'down'

    -- Security
    risk_score      INTEGER,  -- 0-100
    risk_factors    JSONB,

    -- Metadata from server
    server_info     JSONB,  -- name, version from initialize

    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE(organization_id, url)
);

CREATE INDEX idx_mcp_servers_org ON mcp_servers(organization_id);
```

### Tool

Tools exposed by MCP servers.

```sql
CREATE TABLE tools (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mcp_server_id   UUID NOT NULL REFERENCES mcp_servers(id),
    organization_id UUID NOT NULL,

    -- Identity
    name            TEXT NOT NULL,
    description     TEXT,

    -- Schema
    input_schema    JSONB NOT NULL,
    annotations     JSONB,

    -- Security analysis
    definition_hash TEXT NOT NULL,  -- SHA-256 for rug pull detection
    risk_score      INTEGER,        -- 0-100
    risk_factors    JSONB,          -- ['prompt_injection', 'credential_exposure', etc.]

    -- Classification
    category        TEXT,           -- 'filesystem', 'network', 'database', 'shell', etc.
    sensitivity     TEXT,           -- 'low', 'medium', 'high', 'critical'

    -- Stats
    call_count      BIGINT NOT NULL DEFAULT 0,
    error_count     BIGINT NOT NULL DEFAULT 0,
    last_called_at  TIMESTAMPTZ,

    -- Versioning
    version         INTEGER NOT NULL DEFAULT 1,
    previous_hash   TEXT,
    hash_changed_at TIMESTAMPTZ,

    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE(mcp_server_id, name)
);

CREATE INDEX idx_tools_server ON tools(mcp_server_id);
CREATE INDEX idx_tools_org ON tools(organization_id);
CREATE INDEX idx_tools_risk ON tools(risk_score DESC) WHERE risk_score > 50;
```

### Tool Pin

Version pinning for tools.

```sql
CREATE TABLE tool_pins (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tool_id         UUID NOT NULL REFERENCES tools(id),
    organization_id UUID NOT NULL,

    -- Pin details
    pinned_hash     TEXT NOT NULL,
    pinned_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    pinned_by       UUID REFERENCES users(id),

    -- Policy
    on_mismatch     TEXT NOT NULL DEFAULT 'block',  -- 'block', 'alert', 'allow'

    -- Status
    status          TEXT NOT NULL DEFAULT 'active',  -- active, violated, disabled
    last_verified_at TIMESTAMPTZ,
    violation_count INTEGER NOT NULL DEFAULT 0,

    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_tool_pins_tool ON tool_pins(tool_id);
```

---

## Policy Entities

### Policy

Security policy definitions.

```sql
CREATE TABLE policies (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id),
    project_id      UUID REFERENCES projects(id),  -- NULL = org-wide

    -- Identity
    name            TEXT NOT NULL,
    description     TEXT,

    -- Rule
    priority        INTEGER NOT NULL DEFAULT 100,  -- Lower = higher priority
    condition       JSONB NOT NULL,  -- PolicyCondition
    action          TEXT NOT NULL,   -- 'allow', 'deny', 'log', 'transform'
    transformations JSONB,

    -- Status
    enabled         BOOLEAN NOT NULL DEFAULT true,

    -- Audit
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by      UUID REFERENCES users(id),
    updated_by      UUID REFERENCES users(id)
);

CREATE INDEX idx_policies_org ON policies(organization_id);
CREATE INDEX idx_policies_project ON policies(project_id);
CREATE INDEX idx_policies_enabled ON policies(enabled, priority);
```

### Policy Evaluation Log

Audit trail of policy decisions.

```sql
CREATE TABLE policy_evaluations (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL,

    -- Context
    trace_id        UUID REFERENCES traces(id),
    span_id         UUID REFERENCES spans(id),
    agent_id        UUID REFERENCES agents(id),

    -- Request
    request_type    TEXT NOT NULL,  -- 'tool_call', 'llm_call', etc.
    request_target  TEXT,           -- Tool name, model, etc.
    request_summary JSONB,          -- Sanitized request details

    -- Evaluation
    policies_checked UUID[] NOT NULL,
    matched_policy  UUID REFERENCES policies(id),
    decision        TEXT NOT NULL,  -- 'allow', 'deny'
    denial_reason   TEXT,

    -- Timing
    evaluated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    evaluation_ms   INTEGER
);

-- Partitioned table for high volume
CREATE INDEX idx_policy_evals_org ON policy_evaluations(organization_id, evaluated_at DESC);
CREATE INDEX idx_policy_evals_trace ON policy_evaluations(trace_id);
CREATE INDEX idx_policy_evals_denied ON policy_evaluations(decision) WHERE decision = 'deny';
```

---

## Aggregation Views

### Dashboard View

Pre-aggregated for fast dashboard loading.

```sql
CREATE VIEW dashboard_stats AS
SELECT
    o.id AS organization_id,
    p.id AS project_id,

    -- Agent counts
    COUNT(DISTINCT a.id) FILTER (WHERE a.status = 'active') AS active_agents,

    -- Today's stats
    COUNT(t.id) FILTER (WHERE t.start_time > NOW() - INTERVAL '24 hours') AS traces_24h,
    COALESCE(SUM(t.total_tokens) FILTER (WHERE t.start_time > NOW() - INTERVAL '24 hours'), 0) AS tokens_24h,
    COALESCE(SUM(t.cost_usd) FILTER (WHERE t.start_time > NOW() - INTERVAL '24 hours'), 0) AS cost_24h,
    COUNT(t.id) FILTER (WHERE t.status = 'error' AND t.start_time > NOW() - INTERVAL '24 hours') AS errors_24h,

    -- This month
    COUNT(t.id) FILTER (WHERE t.start_time > DATE_TRUNC('month', NOW())) AS traces_month,
    COALESCE(SUM(t.cost_usd) FILTER (WHERE t.start_time > DATE_TRUNC('month', NOW())), 0) AS cost_month

FROM organizations o
LEFT JOIN projects p ON p.organization_id = o.id
LEFT JOIN agents a ON a.project_id = p.id
LEFT JOIN traces t ON t.agent_id = a.id
GROUP BY o.id, p.id;
```

### MCP Inventory View

```sql
CREATE VIEW mcp_inventory AS
SELECT
    s.organization_id,
    s.id AS server_id,
    s.name AS server_name,
    s.url AS server_url,
    s.status AS server_status,
    s.risk_score AS server_risk,

    COUNT(t.id) AS tool_count,
    COUNT(t.id) FILTER (WHERE t.risk_score > 70) AS high_risk_tools,
    COUNT(tp.id) FILTER (WHERE tp.status = 'violated') AS violated_pins,

    COALESCE(SUM(t.call_count), 0) AS total_calls,
    MAX(t.last_called_at) AS last_activity

FROM mcp_servers s
LEFT JOIN tools t ON t.mcp_server_id = s.id
LEFT JOIN tool_pins tp ON tp.tool_id = t.id
GROUP BY s.id;
```

---

## API Contracts

### Ingest API (SDK → Platform)

```typescript
// POST /v1/traces
interface IngestRequest {
  spans: RindSpan[];
}

interface IngestResponse {
  accepted: number;
  rejected: number;
  errors?: {
    spanId: string;
    error: string;
  }[];
}
```

### Query API (Dashboard)

```typescript
// GET /v1/traces
interface TraceListRequest {
  projectId?: string;
  agentId?: string;
  status?: 'running' | 'success' | 'error';
  startTime?: string;  // ISO 8601
  endTime?: string;
  tags?: string[];
  limit?: number;      // Default 50, max 1000
  cursor?: string;
}

interface TraceListResponse {
  traces: TraceSummary[];
  nextCursor?: string;
  total: number;
}

// GET /v1/traces/:id
interface TraceDetailResponse {
  trace: Trace;
  spans: Span[];
}
```

### Policy API

```typescript
// GET /v1/policies
interface PolicyListResponse {
  policies: Policy[];
}

// POST /v1/policies
interface CreatePolicyRequest {
  name: string;
  description?: string;
  projectId?: string;
  priority?: number;
  condition: PolicyCondition;
  action: 'allow' | 'deny' | 'log' | 'transform';
  transformations?: Transformation[];
}

// PUT /v1/policies/:id
interface UpdatePolicyRequest extends Partial<CreatePolicyRequest> {}
```

### MCP Proxy API

```typescript
// GET /v1/mcp/servers
interface MCPServerListResponse {
  servers: MCPServer[];
}

// POST /v1/mcp/servers/:id/scan
interface ScanResponse {
  server: MCPServer;
  tools: Tool[];
  vulnerabilities: Vulnerability[];
}

// POST /v1/tools/:id/pin
interface PinToolRequest {
  onMismatch: 'block' | 'alert' | 'allow';
}
```

---

## Data Retention

| Data Type | Hot Storage | Cold Storage | Total Retention |
|-----------|-------------|--------------|-----------------|
| Traces | 30 days | 90 days | 120 days |
| Spans | 30 days | 90 days | 120 days |
| Policy Evaluations | 7 days | 90 days | 97 days |
| Audit Logs | 90 days | 1 year | 15 months |
| Aggregations | Forever | N/A | Forever |

Enterprise tier: Configurable up to 7 years for compliance.

---

*Previous: [SDK Architecture](./sdk-langchain.md)*
*Next: [API Specification](./api-spec.md)*
