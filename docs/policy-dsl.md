# Rind Policy DSL Specification

## Overview

The Rind Policy DSL is a YAML-based language for defining runtime policies for AI agents. It covers:

- **Tool Call Policies** - Control what tools agents can use and how
- **Prompt Policies** - Filter, transform, or block prompts
- **MCP Policies** - Govern MCP server connections and tool usage
- **LLM Request Policies** - Control model access, parameters
- **Cost Policies** - Enforce budgets and limits
- **Response Policies** - Filter or transform LLM outputs

---

## Core Concepts

### Policy Structure

Every policy has these components:

```yaml
- name: "unique-policy-name"      # Required: Identifier
  type: tool_call                  # Required: Policy type
  description: "What this does"    # Optional: Documentation
  enabled: true                    # Optional: Default true
  priority: 10                     # Optional: Lower = evaluated first

  # Scope: Who does this apply to?
  scope:
    agents: ["agent-*"]            # Agent ID patterns
    projects: ["prod-*"]           # Project patterns
    users: ["user@example.com"]    # User patterns
    keys: ["key_abc*"]             # Virtual key patterns

  # Match: When does this policy trigger?
  match:
    # ... type-specific conditions

  # Action: What to do when matched
  action: ALLOW | DENY | TRANSFORM | REQUIRE_APPROVAL | RATE_LIMIT

  # Action-specific configuration
  transform: { ... }               # If action is TRANSFORM
  approval: { ... }                # If action is REQUIRE_APPROVAL
  rate_limit: { ... }              # If action is RATE_LIMIT

  # Response to return on DENY
  response:
    message: "Human-readable reason"
    code: "POLICY_VIOLATION"

  # Alerting
  alert:
    severity: LOW | MEDIUM | HIGH | CRITICAL
    channels: ["slack", "email", "pagerduty"]

  # Audit settings
  audit:
    level: NONE | METADATA | FULL
    include_request: true
    include_response: false
```

### Evaluation Order

1. Policies are grouped by type
2. Within each type, sorted by priority (ascending)
3. First matching policy wins (unless `continue: true`)
4. If no policy matches, default action is ALLOW

---

## Policy Types

### 1. Tool Call Policies (`type: tool_call`)

Control what tools agents can invoke.

#### Match Conditions

```yaml
match:
  # Tool name matching
  tools: ["sql_*", "db_execute"]           # Glob patterns
  tools_not: ["safe_read_*"]               # Exclusions

  # Parameter matching
  parameters:
    query:
      contains: ["DROP", "DELETE"]         # String contains
      not_contains: ["SELECT"]
      regex: "^SELECT .* FROM users"
      not_regex: "DROP.*"

    path:
      starts_with: "/home/"
      not_starts_with: "/etc/"
      ends_with: ".txt"

    amount:
      eq: 100                               # Equals
      ne: 0                                 # Not equals
      gt: 1000                              # Greater than
      gte: 1000                             # Greater than or equal
      lt: 10000
      lte: 10000
      between: [100, 10000]

    status:
      in: ["active", "pending"]            # In list
      not_in: ["deleted", "banned"]

    data:
      is_null: true                        # Null check
      is_empty: false                      # Empty string/array

  # Context matching
  context:
    agent_type: ["support", "sales"]
    environment: ["production"]
    time_of_day:
      after: "09:00"
      before: "17:00"
      timezone: "America/New_York"
    day_of_week:
      in: ["monday", "tuesday", "wednesday", "thursday", "friday"]
```

#### Actions

```yaml
# DENY - Block the tool call
action: DENY
response:
  message: "This operation is not permitted"
  code: "TOOL_BLOCKED"

# ALLOW - Explicitly allow (useful for allowlisting)
action: ALLOW

# TRANSFORM - Modify parameters before execution
action: TRANSFORM
transform:
  parameters:
    limit: 100                              # Override parameter
    include_deleted: false                  # Add parameter
  remove_parameters: ["admin_override"]     # Remove parameter

# REQUIRE_APPROVAL - Human in the loop
action: REQUIRE_APPROVAL
approval:
  approvers:
    users: ["admin@company.com"]
    groups: ["engineering-leads"]
    slack_channel: "#agent-approvals"
  timeout: 30m                              # Wait time
  on_timeout: DENY                          # DENY or ALLOW
  message: "Agent {{agent_id}} wants to {{tool_name}}"
  context:
    show_parameters: true
    show_history: true                      # Recent actions

# RATE_LIMIT - Throttle execution
action: RATE_LIMIT
rate_limit:
  limit: 10
  window: 1m                                # 1m, 1h, 1d
  scope: per_agent | per_tool | per_key | global
  burst: 5                                  # Allow burst
  on_exceed: DENY | QUEUE                   # Queue waits for capacity
```

#### Full Example

```yaml
- name: "database-write-controls"
  type: tool_call
  description: "Control database write operations"
  priority: 1

  scope:
    projects: ["*"]                         # All projects

  match:
    tools: ["sql_execute", "db_*"]
    parameters:
      query:
        regex: "(INSERT|UPDATE|DELETE|DROP|TRUNCATE|ALTER)"

  action: REQUIRE_APPROVAL
  approval:
    approvers:
      groups: ["dba-team"]
    timeout: 15m
    on_timeout: DENY
    message: |
      Database write operation requested:
      Agent: {{agent_id}}
      Query: {{parameters.query}}

  alert:
    severity: HIGH
    channels: ["slack"]

  audit:
    level: FULL
```

---

### 2. Prompt Policies (`type: prompt`)

Control prompts sent to LLMs.

#### Match Conditions

```yaml
match:
  # Content matching
  content:
    contains: ["ignore previous", "jailbreak"]
    regex: "(?i)ignore.*instructions"
    length:
      gt: 10000                            # Prompt too long

  # Use external detection
  provider: "lakera"                       # Lakera Guard
  detection:
    prompt_injection:
      threshold: 0.8
    jailbreak:
      threshold: 0.9
    pii:
      types: ["email", "ssn", "phone"]

  # Use NeMo Guardrails
  guardrail: "nemo"
  nemo_config:
    check_jailbreak: true
    check_topic: true
    allowed_topics: ["customer_support", "product_info"]
```

#### Transform Options

```yaml
action: TRANSFORM
transform:
  # PII redaction (uses Presidio)
  redact_pii:
    types: ["email", "phone", "ssn", "credit_card", "ip_address"]
    replacement: "[REDACTED]"
    # Or use placeholders
    use_placeholders: true                 # email -> <EMAIL_1>

  # Content filtering
  remove_patterns:
    - "(?i)password:\\s*\\S+"
    - "api[_-]?key[=:]\\s*\\S+"

  # Truncation
  truncate:
    max_tokens: 4000
    strategy: "tail"                       # head, tail, middle

  # Prepend/append
  prepend: "You are a helpful assistant. "
  append: "\n\nRemember to be respectful."

  # Replace
  replace:
    - pattern: "(?i)competitor"
      replacement: "[COMPETITOR]"
```

#### Full Example

```yaml
- name: "prompt-safety"
  type: prompt
  priority: 1

  match:
    provider: "lakera"
    detection:
      prompt_injection:
        threshold: 0.7

  action: DENY
  response:
    message: "Your request was blocked for safety reasons"
    code: "PROMPT_INJECTION_DETECTED"

  alert:
    severity: CRITICAL
    channels: ["slack", "pagerduty"]

---

- name: "redact-pii-in-prompts"
  type: prompt
  priority: 10

  match:
    content:
      contains_pii: true

  action: TRANSFORM
  transform:
    redact_pii:
      types: ["email", "phone", "ssn"]
      use_placeholders: true

  audit:
    level: METADATA                        # Don't log full prompt
```

---

### 3. MCP Policies (`type: mcp`)

Control MCP server connections and tool calls.

#### Match Conditions

```yaml
match:
  # Server matching
  servers: ["github-official", "internal-*"]
  servers_not: ["untrusted-*"]

  server_url:
    domain: ["github.com", "*.company.com"]
    protocol: ["https"]                    # Block non-HTTPS

  # Tool matching (within MCP)
  tools: ["read_*", "list_*"]
  tools_not: ["delete_*", "write_*"]

  # Parameter matching (same as tool_call)
  parameters:
    path:
      starts_with: "/allowed/"

  # Server metadata
  server_metadata:
    verified: true                         # Only verified servers
    trust_score:
      gte: 80
```

#### MCP-Specific Actions

```yaml
# Server allowlist/blocklist
action: DENY
response:
  message: "MCP server {{server_id}} is not authorized"
  code: "MCP_SERVER_BLOCKED"

# Tool-level control within allowed servers
- name: "mcp-readonly"
  type: mcp
  match:
    servers: ["*"]
    tools_not: ["read_*", "list_*", "get_*", "search_*"]
  action: DENY

# Sandbox execution
action: ALLOW
sandbox:
  enabled: true
  timeout: 30s
  memory_limit: 256M
  network:
    allowed_hosts: ["api.github.com"]
    deny_all: false
```

#### Full Example

```yaml
- name: "mcp-server-allowlist"
  type: mcp
  priority: 1
  description: "Only allow approved MCP servers"

  match:
    servers_not:
      - "github-official"
      - "slack-official"
      - "internal-tools"
      - "company-*"

  action: DENY
  response:
    message: "MCP server not in allowlist. Contact admin to add."
    code: "MCP_NOT_ALLOWED"

  alert:
    severity: HIGH

---

- name: "mcp-filesystem-restrictions"
  type: mcp
  priority: 10

  match:
    servers: ["filesystem"]
    tools: ["write_file", "delete_file"]
    parameters:
      path:
        regex: "^/(etc|var|usr|bin|sbin)/"

  action: DENY
  response:
    message: "Cannot write to system directories"
```

---

### 4. LLM Request Policies (`type: llm_request`)

Control which models can be used and how.

#### Match Conditions

```yaml
match:
  # Model matching
  model:
    in: ["gpt-4o", "claude-3-5-sonnet"]
    not_in: ["gpt-4", "claude-3-opus"]     # Block expensive models
    regex: "^gpt-3\\.5.*"

  # Provider matching
  provider:
    in: ["openai", "anthropic"]
    not_in: ["self-hosted"]

  # Request parameters
  parameters:
    temperature:
      gt: 0.9                              # Block high temperature
    max_tokens:
      gt: 8000
    stream: true

  # Estimated cost
  estimated_cost:
    gt: 1.00                               # USD

  # Token count
  input_tokens:
    gt: 50000
```

#### Actions

```yaml
# Route to different model
action: TRANSFORM
transform:
  model: "gpt-4o-mini"                     # Downgrade model
  parameters:
    max_tokens: 4000                       # Limit tokens

# Require approval for expensive requests
action: REQUIRE_APPROVAL
approval:
  approvers:
    groups: ["ml-platform"]
  message: "Request will cost ~${{estimated_cost}}"
```

#### Full Example

```yaml
- name: "model-cost-controls"
  type: llm_request
  priority: 5

  scope:
    projects: ["internal-*"]               # Only internal projects

  match:
    model:
      in: ["gpt-4", "claude-3-opus", "o1"]
    estimated_cost:
      gt: 0.50

  action: TRANSFORM
  transform:
    model: "gpt-4o-mini"                   # Route to cheaper model

  alert:
    severity: LOW
    channels: ["slack"]
    message: "Downgraded expensive model request"
```

---

### 5. Cost Policies (`type: cost`)

Enforce budgets and spending limits.

#### Configuration

```yaml
- name: "agent-budget-limits"
  type: cost
  priority: 1

  scope:
    agents: ["*"]

  limits:
    per_request: 1.00                      # Max per single request
    hourly: 10.00                          # Rolling hour
    daily: 100.00                          # Rolling 24h
    monthly: 2000.00                       # Calendar month

  scope_by: agent | user | key | project   # What to track

  action_on_exceed: DENY | THROTTLE | ALERT_ONLY

  throttle:
    reduce_to_percentage: 50               # Reduce to 50% of limit

  alert:
    at_percentage: [50, 80, 95, 100]
    channels: ["email", "slack"]

  reset:
    daily: "00:00 UTC"
    monthly: "1st of month"
```

#### Full Example

```yaml
- name: "project-budgets"
  type: cost
  priority: 1

  scope:
    projects: ["*"]

  limits:
    daily: 500.00
    monthly: 10000.00

  scope_by: project
  action_on_exceed: DENY

  response:
    message: "Project budget exceeded. Contact admin."
    code: "BUDGET_EXCEEDED"

  alert:
    at_percentage: [50, 80, 95]
    channels: ["slack"]
    template: |
      Project {{project_id}} has used {{usage_percentage}}% of budget
      Spent: ${{spent}} / ${{limit}}
```

---

### 6. Response Policies (`type: response`)

Filter or transform LLM responses before returning to agent.

#### Match Conditions

```yaml
match:
  content:
    contains: ["internal use only", "confidential"]
    regex: "SSN:\\s*\\d{3}-\\d{2}-\\d{4}"

  # Check for hallucination indicators (integration)
  hallucination:
    provider: "vectara"                    # Hallucination detection
    threshold: 0.7

  # Content safety
  safety:
    provider: "nemo"
    check_toxicity: true
    check_bias: true
```

#### Actions

```yaml
# Block response
action: DENY
response:
  message: "Response contained prohibited content"
  return_to_agent: "I cannot provide that information."

# Transform response
action: TRANSFORM
transform:
  redact_pii: true
  remove_patterns:
    - "(?i)internal.*confidential"
  truncate:
    max_length: 5000
```

---

## Advanced Features

### Policy Inheritance

```yaml
# Base policy (reusable)
policies:
  - name: "base-production-policy"
    type: tool_call
    abstract: true                         # Cannot be used directly

    scope:
      environments: ["production"]

    alert:
      severity: HIGH
      channels: ["pagerduty"]

    audit:
      level: FULL

# Inherit from base
  - name: "prod-database-policy"
    extends: "base-production-policy"

    match:
      tools: ["db_*"]

    action: REQUIRE_APPROVAL
```

### Policy Groups

```yaml
policy_groups:
  - name: "high-security"
    description: "Policies for sensitive operations"
    policies:
      - "block-destructive-db"
      - "require-approval-payments"
      - "block-file-system-writes"

# Apply group to agents
agents:
  - id: "financial-agent"
    policy_groups: ["high-security", "compliance"]
```

### Conditional Logic

```yaml
- name: "conditional-policy"
  type: tool_call

  match:
    tools: ["payment_*"]

  conditions:
    # AND logic (all must match)
    all:
      - parameter: "amount"
        gt: 1000
      - parameter: "currency"
        eq: "USD"

    # OR logic (any must match)
    any:
      - parameter: "country"
        in: ["US", "CA"]
      - context: "user_tier"
        eq: "premium"

  action: REQUIRE_APPROVAL
```

### Variables and Templates

```yaml
variables:
  max_db_rows: 1000
  allowed_domains: ["company.com", "partner.com"]
  finance_team: ["alice@company.com", "bob@company.com"]

policies:
  - name: "use-variables"
    type: tool_call

    match:
      parameters:
        limit:
          gt: "{{max_db_rows}}"

    approval:
      approvers:
        users: "{{finance_team}}"
```

### Audit Templates

```yaml
audit_templates:
  compliance:
    include:
      - request_id
      - timestamp
      - agent_id
      - user_id
      - action
      - tool_name
      - parameters
      - decision
      - policy_matched
    exclude:
      - response_body                      # Don't log full response
    retention: 7y                          # 7 year retention

policies:
  - name: "financial-audit"
    type: tool_call
    match:
      tools: ["payment_*", "transfer_*"]
    action: ALLOW
    audit:
      template: "compliance"
```

---

## Integration Points

### Lakera Integration

```yaml
integrations:
  lakera:
    api_key: "${LAKERA_API_KEY}"
    endpoint: "https://api.lakera.ai/v1"
    timeout: 500ms

policies:
  - name: "lakera-prompt-check"
    type: prompt
    match:
      provider: "lakera"
      detection:
        prompt_injection: { threshold: 0.8 }
        jailbreak: { threshold: 0.9 }
```

### NeMo Guardrails Integration

```yaml
integrations:
  nemo:
    config_path: "/etc/rind/nemo/"

policies:
  - name: "nemo-content-check"
    type: prompt
    match:
      guardrail: "nemo"
      nemo_config:
        check_jailbreak: true
```

### Presidio Integration

```yaml
integrations:
  presidio:
    endpoint: "http://presidio:5000"
    entities: ["EMAIL", "PHONE", "SSN", "CREDIT_CARD"]

policies:
  - name: "presidio-pii-redaction"
    type: prompt
    match:
      content:
        contains_pii: true
    action: TRANSFORM
    transform:
      redact_pii:
        provider: "presidio"
```

---

## API Reference

### Policy Evaluation API

```bash
# Evaluate a request against policies
POST /v1/evaluate

{
  "type": "tool_call",
  "agent_id": "agent_123",
  "key_id": "key_abc",
  "tool": "sql_execute",
  "parameters": {
    "query": "SELECT * FROM users"
  },
  "context": {
    "project_id": "proj_456",
    "environment": "production"
  }
}

# Response
{
  "decision": "ALLOW",
  "policy_matched": "allow-readonly-queries",
  "evaluation_time_ms": 2,
  "audit_id": "audit_789"
}
```

### Policy Management API

```bash
# Create/update policy
PUT /v1/policies/{name}
Content-Type: application/yaml

- name: "my-policy"
  type: tool_call
  ...

# List policies
GET /v1/policies?type=tool_call&project=proj_123

# Delete policy
DELETE /v1/policies/{name}

# Test policy (dry run)
POST /v1/policies/test
{
  "policy": { ... },
  "request": { ... }
}
```

---

## Best Practices

### 1. Start Permissive, Then Restrict

```yaml
# Phase 1: Audit only
- name: "audit-all-tool-calls"
  type: tool_call
  match:
    tools: ["*"]
  action: ALLOW
  audit:
    level: FULL

# Phase 2: Identify patterns, add restrictions
# Phase 3: Enforce restrictions
```

### 2. Use Allowlists for Critical Operations

```yaml
# Explicit allowlist is safer than blocklist
- name: "allowed-payment-tools"
  type: tool_call
  match:
    tools: ["stripe_charge", "paypal_pay"]
  scope:
    agents: ["payment-agent"]
  action: ALLOW

- name: "deny-all-other-payment"
  type: tool_call
  priority: 999
  match:
    tools: ["*_pay*", "*_charge*", "*_transfer*"]
  action: DENY
```

### 3. Layer Policies by Severity

```yaml
# P1: Critical security (always deny)
# P2: Require approval
# P3: Rate limit
# P4: Audit only
# P5: Allow

priorities:
  1-10: Critical security blocks
  11-50: Approval requirements
  51-100: Rate limits
  101-500: Transforms
  501+: Audit/allow
```

### 4. Use Policy Groups for Environments

```yaml
policy_groups:
  - name: "development"
    policies: ["allow-all-tools", "basic-audit"]

  - name: "staging"
    policies: ["restricted-tools", "full-audit", "rate-limits"]

  - name: "production"
    policies: ["strict-tools", "approval-required", "full-audit", "alerts"]
```

---

## Schema Reference

Full JSON Schema for validation available at:
`/v1/schema/policy.json`

---

---

## Policy Packs & Tool Catalog

See [tool-discovery-policy-generation.md](./architecture/tool-discovery-policy-generation.md) for:

- **Tool Catalog**: Pre-defined patterns for known tools (SQL, filesystem, payments, etc.)
- **Policy Packs**: Curated rule sets that apply automatically
- **AI Policy Generation**: For unknown/custom tools
- **Human Review Flow**: Approval workflow for AI-generated policies

### Quick Reference

```yaml
# Policy packs available:
packs:
  - sql-protection        # 12 rules for database safety
  - filesystem-protection # 8 rules for file operations
  - email-protection      # 6 rules for communication
  - payment-protection    # 6 rules for financial operations
  - aws-protection        # 10 rules for AWS APIs
  - shell-protection      # 5 rules for command execution

# Enable pack for an agent:
agents:
  - id: "my-agent"
    packs:
      - sql-protection
      - filesystem-protection
    pack_settings:
      sql-protection:
        require_where_clause: true
        production_environments: ["prod", "production"]
```

---

*Version: 1.1*
*Last Updated: April 2026*
