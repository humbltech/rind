# Policy Examples — Archive

> Source: `aegis-simulation/incidents/aegis-policies/` (code deleted April 2026)
> These policy examples are referenced when building the TypeScript simulation's `fixtures/policies.ts`.
> Note: The policy YAML format used here is aspirational (Phase 2+ spec). Phase 1 policy format is simpler
> (see `apps/proxy/src/policy/loader.ts` for the current Zod schema).

---

## Policy 1: SQL Protection
**Incident**: Replit DB Deletion (AI Incident Database #1152)
**Purpose**: Prevent catastrophic database operations

```yaml
# Phase 1 (current proxy format)
policies:
  - name: block-destructive-sql
    agent: "*"
    match:
      tool: ["drop", "truncate", "delete", "destroy"]
    action: DENY

  - name: require-approval-delete
    agent: "*"
    match:
      tool: ["db.delete", "sql.delete"]
    action: REQUIRE_APPROVAL
```

```yaml
# Phase 2+ aspirational format (parameter matching, alerts, templates)
apiVersion: aegis/v1
kind: SecurityPolicy
metadata:
  name: sql-protection
  incident_reference: "AI Incident Database #1152 - Replit DB Deletion"

spec:
  - name: sql-destructive-block
    type: tool_call
    priority: 0
    match:
      tools: ["sql_execute", "sql_*", "db_*", "postgres_*"]
      parameters:
        query:
          regex: "(?i)(DROP|TRUNCATE)\\s+(TABLE|DATABASE|SCHEMA)"
    action: DENY
    alert:
      severity: CRITICAL
      channels: ["slack", "pagerduty"]

  - name: sql-delete-approval
    type: tool_call
    priority: 1
    match:
      tools: ["sql_execute", "db_*"]
      parameters:
        query:
          regex: "(?i)DELETE\\s+FROM"
    action: REQUIRE_APPROVAL
    approval:
      approvers: ["role:dba", "role:data-team"]
      timeout: 30m
      on_timeout: DENY

  - name: sql-write-audit
    type: tool_call
    priority: 2
    match:
      tools: ["sql_execute", "db_*"]
      parameters:
        query:
          regex: "(?i)(INSERT|UPDATE|ALTER)"
    action: ALLOW
    audit:
      enabled: true
      retention_days: 90
```

---

## Policy 2: Data Exfiltration Protection
**Incident**: EchoLeak (CVE-2025-32711)
**Purpose**: Block unauthorized external URL access and sensitive file reads

```yaml
# Phase 1 (current proxy format)
policies:
  - name: block-external-http
    agent: "*"
    match:
      tool: ["http.post", "http.get", "fetch_url", "send_to_url", "webhook"]
    action: DENY

  - name: block-sensitive-files
    agent: "agent-public"
    match:
      tool: ["file.read", "document.read", "read_file"]
    action: DENY
```

```yaml
# Phase 2+ aspirational format
apiVersion: aegis/v1
kind: SecurityPolicy
metadata:
  name: exfil-protection
  incident_reference: "CVE-2025-32711 - EchoLeak MS Copilot"

spec:
  - name: external-url-block
    type: tool_call
    priority: 0
    match:
      tools: ["send_to_url", "http_request", "fetch_url", "post_data", "webhook_*"]
      parameters:
        url:
          not_matches_domain:
            - "{{ org.domain }}"
            - "*.{{ org.domain }}"
            - "api.openai.com"
            - "api.anthropic.com"
    action: DENY
    alert:
      severity: CRITICAL
      channels: ["slack", "siem"]

  - name: sensitive-file-protection
    type: tool_call
    priority: 0
    match:
      tools: ["fetch_file", "read_file", "get_file"]
      parameters:
        filename:
          regex: "(?i)(salary|password|secret|api.?key|credential|ssn|\\.env|\\.pem|\\.key)"
    action: DENY
    alert:
      severity: HIGH

  - name: encoded-exfil-block
    type: tool_call
    priority: 1
    match:
      tools: ["send_to_url", "http_request", "post_data"]
      parameters:
        data:
          regex: "[A-Za-z0-9+/]{100,}={0,2}"  # Large base64 payload
    action: DENY
    alert:
      severity: HIGH
```

---

## Policy 3: Cost & Loop Protection
**Incident**: $47K Multi-Agent Loop
**Purpose**: Rate limits, cost budgets, loop detection

```yaml
# Phase 1 (current proxy format — loop detection via interceptor, not policy)
# Note: cost limits and loop detection are implemented in the interceptor, not policy YAML
# The policy below is illustrative of Phase 2 design
policies:
  - name: rate-limit-all-tools
    agent: "*"
    match:
      tool: ["*"]
    action: RATE_LIMIT
    # Phase 2: rateLimit: { limit: 60, window: "1m" }
```

```yaml
# Phase 2+ aspirational format
apiVersion: aegis/v1
kind: SecurityPolicy
metadata:
  name: cost-protection
  incident_reference: "$47K Multi-Agent Loop"

spec:
  - name: agent-cost-budget
    type: cost
    priority: 0
    scope:
      agents: ["*"]
    limits:
      per_request: 5.00
      hourly: 50.00
      daily: 200.00
      monthly: 5000.00
    action_on_exceed: DENY
    alert:
      at_percentage: [50, 80, 95, 100]
      channels: ["slack", "email"]

  - name: loop-detection-exact
    type: tool_call
    priority: 0
    rate_limit:
      limit: 3
      window: 1m
      scope: per_agent_per_tool_signature
    action_on_exceed: DENY
    alert:
      severity: HIGH
      channels: ["slack", "pagerduty"]

  - name: agent-chain-depth
    type: tool_call
    priority: 0
    match:
      context:
        call_chain_depth:
          gt: 5
    action: DENY
```

---

## Phase 1 vs Phase 2 Policy Format

| Feature | Phase 1 (current) | Phase 2 (planned) |
|---------|-------------------|-------------------|
| Tool matching | Exact name or keyword | Exact, glob, regex |
| Parameter matching | Not supported | Regex on any parameter |
| Agent scoping | `agentId` field | `agentId` or role |
| Time windows | Day-of-week + hours | Same |
| Cost limits | In-session via `costLimitUsd` | Full YAML spec |
| Loop detection | In-interceptor (hash-based) | Policy YAML |
| Alerts | Pino log only | Slack, PagerDuty, SIEM |
| Approval flows | Block (not async) | Async with timeout |
| Audit retention | In-memory log | Configurable retention |

The Phase 1 format is intentionally simple — the Zod schema in `apps/proxy/src/policy/loader.ts` defines what's valid today. Phase 2 features are designed in the aspirational YAML above but not implemented yet.
