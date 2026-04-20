# Tool Discovery & AI Policy Generation

**Version:** 1.0
**Last Updated:** April 2026
**Status:** Technical Specification

---

## Executive Summary

Rind uses a **hybrid approach** to policy management:

1. **Pre-built catalog** for known tools (SQL, filesystem, payments, etc.)
2. **AI-generated policies** for unknown/custom tools
3. **Human approval** before any policy is active
4. **Custom DSL** for power users with unique requirements

The key insight: **Tool calls are finite and known at deployment time.** Unlike prompts (infinite, unpredictable), tools are enumerated when an agent connects. This allows us to:

- Auto-discover all available tools
- Match against our catalog or generate policies via AI
- Require human review before the agent goes live

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    TOOL DISCOVERY & POLICY GENERATION                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                         DISCOVERY LAYER                              │    │
│  │                                                                      │    │
│  │  Agent Connects → Enumerate Tools → Extract Metadata                │    │
│  │                                                                      │    │
│  │  Sources:                                                            │    │
│  │  ├── LangChain/LangGraph tool definitions                           │    │
│  │  ├── MCP server tool lists (tools/list)                             │    │
│  │  ├── OpenAI function calling schemas                                │    │
│  │  └── Custom tool registrations via SDK                              │    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                    │                                         │
│                                    ▼                                         │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                       CLASSIFICATION LAYER                           │    │
│  │                                                                      │    │
│  │  For each tool:                                                      │    │
│  │  ├── Match against Tool Catalog? ──YES──► Apply Catalog Policy      │    │
│  │  │                                                                   │    │
│  │  └── No match? ──► AI Classification ──► Generate Policy            │    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                    │                                         │
│                                    ▼                                         │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                        APPROVAL LAYER                                │    │
│  │                                                                      │    │
│  │  ├── Catalog policies: Auto-applied (user can customize)            │    │
│  │  └── AI-generated policies: Require human review                    │    │
│  │                                                                      │    │
│  │  Until approved: Tools are BLOCKED or REQUIRE_APPROVAL              │    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                    │                                         │
│                                    ▼                                         │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                        ENFORCEMENT LAYER                             │    │
│  │                                                                      │    │
│  │  Policy Engine evaluates every tool call against:                   │    │
│  │  ├── Active policies (catalog + custom)                             │    │
│  │  ├── Temporary grants (if any)                                      │    │
│  │  └── Organization defaults                                          │    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Policy Layers

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         RIND POLICY LAYERS                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  LAYER 3: Simple Toggles (90% of users)                                     │
│  ────────────────────────────────────────                                   │
│  "Enable production database protection" [ON/OFF]                           │
│  "Require approval for payments > $1000" [ON/OFF]                          │
│  "Block file deletion outside /tmp" [ON/OFF]                                │
│                                                                              │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                              │
│  LAYER 2: Pre-built Packs (Power users)                                     │
│  ───────────────────────────────────────                                    │
│  SQL Pack: 12 rules (destructive queries, injection patterns, etc.)        │
│  Filesystem Pack: 8 rules (sensitive paths, deletion, permissions)         │
│  Payments Pack: 6 rules (amount thresholds, unusual patterns)              │
│  Cloud Pack: 10 rules (AWS/GCP dangerous APIs)                              │
│  → Users can enable/disable individual rules, adjust thresholds            │
│                                                                              │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                              │
│  LAYER 1: Custom Policies (Advanced users - 5%)                             │
│  ─────────────────────────────────────────                                  │
│  Full DSL access for custom tools, unique business logic                   │
│  "We use a custom CRM API, need to protect customer deletion"              │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### User Distribution

| Layer | Users | Configuration Effort |
|-------|-------|---------------------|
| Simple Toggles | 90% | Zero - just enable/disable |
| Policy Packs | 15% | Minimal - adjust thresholds |
| Custom DSL | 5% | Full flexibility |

*Note: Users can use multiple layers simultaneously*

---

## Tool Discovery

### Sources of Tool Definitions

#### 1. LangChain/LangGraph Agents

```python
# We intercept tool definitions from LangChain
from langchain.tools import Tool

@tool
def sql_execute(query: str) -> str:
    """Execute a SQL query against the database."""
    # ...

# Rind extracts:
# - name: "sql_execute"
# - description: "Execute a SQL query against the database."
# - parameters: [{"name": "query", "type": "str", "required": true}]
# - return_type: "str"
```

#### 2. MCP Servers

```json
// MCP tools/list response
{
  "tools": [
    {
      "name": "delete_customer",
      "description": "Permanently delete a customer record",
      "inputSchema": {
        "type": "object",
        "properties": {
          "customer_id": { "type": "string" },
          "cascade": { "type": "boolean", "default": true }
        },
        "required": ["customer_id"]
      }
    }
  ]
}
```

#### 3. OpenAI Function Calling

```json
// Function definitions
{
  "name": "send_email",
  "description": "Send an email to a recipient",
  "parameters": {
    "type": "object",
    "properties": {
      "to": { "type": "string" },
      "subject": { "type": "string" },
      "body": { "type": "string" }
    }
  }
}
```

### Discovery Process

```python
# tool_discovery.py

from dataclasses import dataclass
from typing import Optional

@dataclass
class DiscoveredTool:
    name: str
    description: Optional[str]
    parameters: list[ToolParameter]
    return_type: Optional[str]
    source: str  # "langchain", "mcp", "openai", "custom"
    source_name: str  # MCP server name, etc.
    raw_definition: dict  # Original definition for reference

async def discover_tools(agent_connection: AgentConnection) -> list[DiscoveredTool]:
    """
    Discover all tools available to an agent.
    """
    tools = []

    # 1. Check for LangChain tools
    if agent_connection.framework == "langchain":
        lc_tools = await extract_langchain_tools(agent_connection)
        tools.extend(lc_tools)

    # 2. Check for MCP servers
    for mcp_server in agent_connection.mcp_servers:
        mcp_tools = await enumerate_mcp_tools(mcp_server)
        tools.extend(mcp_tools)

    # 3. Check for OpenAI function definitions
    if agent_connection.has_openai_functions:
        openai_tools = await extract_openai_functions(agent_connection)
        tools.extend(openai_tools)

    # 4. Custom registered tools via SDK
    custom_tools = await get_custom_registered_tools(agent_connection.agent_id)
    tools.extend(custom_tools)

    # Deduplicate by name
    return deduplicate_tools(tools)


async def enumerate_mcp_tools(mcp_server: MCPServer) -> list[DiscoveredTool]:
    """
    Get all tools from an MCP server.
    """
    # Call MCP tools/list
    response = await mcp_server.call("tools/list")

    tools = []
    for tool_def in response.get("tools", []):
        tools.append(DiscoveredTool(
            name=tool_def["name"],
            description=tool_def.get("description"),
            parameters=parse_json_schema(tool_def.get("inputSchema", {})),
            return_type=None,  # MCP doesn't specify return types
            source="mcp",
            source_name=mcp_server.name,
            raw_definition=tool_def
        ))

    return tools
```

---

## Tool Catalog

### Catalog Structure

```yaml
# config/tool-catalog.yaml

catalog:
  version: "2026.04.01"
  last_updated: "2026-04-01"

  # ═══════════════════════════════════════════════════════════════════════
  # TOOL PATTERNS
  # ═══════════════════════════════════════════════════════════════════════

  patterns:
    # SQL / Database Tools
    - id: "sql-tools"
      pattern: "sql_*|db_*|postgres_*|mysql_*|sqlite_*|database_*"
      category: "database"
      pack: "sql-protection"
      default_risk: high
      description: "SQL and database operation tools"

    # Filesystem Tools
    - id: "filesystem-tools"
      pattern: "read_file|write_file|delete_file|list_directory|create_directory|move_file|copy_file"
      category: "filesystem"
      pack: "filesystem-protection"
      risk_by_operation:
        read: low
        list: low
        create: medium
        write: medium
        copy: medium
        move: medium
        delete: high
      description: "File and directory operation tools"

    # Email / Communication Tools
    - id: "email-tools"
      pattern: "send_email|send_*_email|email_*|sendgrid_*|mailgun_*|ses_*"
      category: "communication"
      pack: "email-protection"
      default_risk: medium
      high_risk_conditions:
        - parameter: "recipients"
          condition: "count > 10"
        - parameter: "bcc"
          condition: "exists"
      description: "Email sending tools"

    # Payment Tools
    - id: "payment-tools"
      pattern: "stripe_*|charge_*|refund_*|payment_*|invoice_*|subscription_*"
      category: "payments"
      pack: "payment-protection"
      default_risk: high
      description: "Payment processing tools"

    # Cloud Provider Tools
    - id: "aws-tools"
      pattern: "aws_*|s3_*|ec2_*|lambda_*|dynamodb_*|rds_*"
      category: "cloud"
      pack: "aws-protection"
      default_risk: high
      description: "AWS service tools"

    - id: "gcp-tools"
      pattern: "gcp_*|gcs_*|bigquery_*|compute_*"
      category: "cloud"
      pack: "gcp-protection"
      default_risk: high
      description: "Google Cloud Platform tools"

    # Shell / System Tools
    - id: "shell-tools"
      pattern: "shell_*|bash_*|exec_*|run_command|terminal_*"
      category: "system"
      pack: "shell-protection"
      default_risk: critical
      description: "Shell and command execution tools"

    # HTTP / API Tools
    - id: "http-tools"
      pattern: "http_*|api_*|fetch_*|request_*|curl_*"
      category: "network"
      pack: "http-protection"
      default_risk: medium
      high_risk_conditions:
        - parameter: "method"
          condition: "in ['DELETE', 'PUT', 'PATCH']"
        - parameter: "url"
          condition: "matches_internal_network"
      description: "HTTP and API request tools"

  # ═══════════════════════════════════════════════════════════════════════
  # AI CLASSIFICATION RULES
  # ═══════════════════════════════════════════════════════════════════════

  ai_classification:
    # Risk signals for AI to consider when generating policies

    critical_risk_signals:
      name_contains:
        - "exec"
        - "shell"
        - "bash"
        - "sudo"
        - "root"
        - "admin"
      description_contains:
        - "arbitrary code"
        - "system command"
        - "root access"

    high_risk_signals:
      name_contains:
        - "delete"
        - "remove"
        - "drop"
        - "destroy"
        - "terminate"
        - "purge"
        - "truncate"
        - "wipe"
        - "bulk"
        - "batch"
        - "mass"
        - "all"
      description_contains:
        - "permanently"
        - "irreversible"
        - "cannot be undone"
        - "destructive"
      parameter_names:
        - "password"
        - "secret"
        - "token"
        - "api_key"
        - "credential"
        - "private_key"

    medium_risk_signals:
      name_contains:
        - "update"
        - "modify"
        - "change"
        - "edit"
        - "write"
        - "create"
        - "set"
        - "send"
        - "post"
        - "publish"
        - "notify"
      affects_entities:
        - "customer"
        - "user"
        - "account"
        - "order"
        - "payment"
        - "invoice"
        - "subscription"

    low_risk_signals:
      name_contains:
        - "get"
        - "read"
        - "list"
        - "fetch"
        - "search"
        - "find"
        - "query"
        - "count"
        - "stats"
        - "status"
        - "health"
        - "ping"
        - "check"
```

### Catalog Matching

```python
# catalog_matcher.py

import re
from typing import Optional

class CatalogMatcher:
    def __init__(self, catalog: ToolCatalog):
        self.catalog = catalog
        # Pre-compile patterns for performance
        self.compiled_patterns = {
            p.id: re.compile(self._glob_to_regex(p.pattern), re.IGNORECASE)
            for p in catalog.patterns
        }

    def match(self, tool: DiscoveredTool) -> Optional[CatalogMatch]:
        """
        Match a tool against the catalog.
        Returns the matching pattern and associated pack, or None.
        """
        for pattern in self.catalog.patterns:
            compiled = self.compiled_patterns[pattern.id]
            if compiled.match(tool.name):
                return CatalogMatch(
                    tool=tool,
                    pattern=pattern,
                    pack=pattern.pack,
                    risk_level=self._determine_risk(tool, pattern),
                    confidence=1.0  # Catalog match = 100% confidence
                )

        return None

    def _determine_risk(self, tool: DiscoveredTool, pattern: CatalogPattern) -> str:
        """
        Determine risk level based on pattern config and tool specifics.
        """
        # Check for operation-specific risk
        if pattern.risk_by_operation:
            for operation, risk in pattern.risk_by_operation.items():
                if operation in tool.name.lower():
                    return risk

        # Check for high-risk conditions
        if pattern.high_risk_conditions:
            for condition in pattern.high_risk_conditions:
                if self._check_condition(tool, condition):
                    return "high"

        return pattern.default_risk

    def _glob_to_regex(self, glob: str) -> str:
        """Convert glob pattern to regex."""
        # Replace * with .* and | is already regex OR
        return "^(" + glob.replace("*", ".*") + ")$"
```

---

## AI Policy Generation

### Generation Pipeline

```python
# policy_generator.py

from anthropic import Anthropic
from dataclasses import dataclass

@dataclass
class GeneratedPolicy:
    tool_name: str
    risk_level: str  # low, medium, high, critical
    action: str  # ALLOW, DENY, REQUIRE_APPROVAL, RATE_LIMIT
    reason: str
    confidence: float  # 0.0 - 1.0

    # Additional settings
    approvers: Optional[list[str]] = None
    rate_limit: Optional[dict] = None
    audit_level: str = "standard"

    # Metadata
    generated_by: str = "ai"
    requires_human_review: bool = True
    signals_detected: list[str] = None

POLICY_GENERATION_PROMPT = """You are a security policy generator for AI agent tool calls.

Given a tool definition, generate an appropriate security policy. Be conservative - when in doubt, require approval rather than allowing.

## Tool Definition
Name: {tool_name}
Description: {description}
Parameters: {parameters}
Return Type: {return_type}
Source: {source}

## Risk Signals Detected
{signals}

## Your Task
Generate a security policy in the following JSON format:

{{
  "risk_level": "low|medium|high|critical",
  "action": "ALLOW|DENY|REQUIRE_APPROVAL|RATE_LIMIT",
  "reason": "Brief explanation of why this action was chosen",
  "confidence": 0.0-1.0,
  "approvers": ["role:security-team"] or null,
  "rate_limit": {{"max_per_minute": N}} or null,
  "audit_level": "minimal|standard|full",
  "parameter_rules": [
    {{"parameter": "name", "condition": "...", "action": "..."}}
  ] or []
}}

## Guidelines
- CRITICAL risk (shell, exec, sudo): Default to DENY
- HIGH risk (delete, bulk operations): Default to REQUIRE_APPROVAL
- MEDIUM risk (write, update, send): Default to ALLOW with audit
- LOW risk (read, list, get): Default to ALLOW

Output ONLY valid JSON, no explanation.
"""

class PolicyGenerator:
    def __init__(self):
        self.client = Anthropic()
        self.catalog = load_catalog()
        self.matcher = CatalogMatcher(self.catalog)

    async def generate_policy(self, tool: DiscoveredTool) -> GeneratedPolicy:
        """
        Generate a security policy for a tool.
        First tries catalog match, then falls back to AI generation.
        """
        # Step 1: Try catalog match
        catalog_match = self.matcher.match(tool)
        if catalog_match:
            return self._policy_from_catalog(catalog_match)

        # Step 2: Detect risk signals
        signals = self._detect_signals(tool)

        # Step 3: Generate via AI
        return await self._generate_via_ai(tool, signals)

    def _detect_signals(self, tool: DiscoveredTool) -> list[RiskSignal]:
        """Detect risk signals from tool definition."""
        signals = []
        name_lower = tool.name.lower()
        desc_lower = (tool.description or "").lower()

        # Check critical signals
        for word in self.catalog.ai_classification.critical_risk_signals.name_contains:
            if word in name_lower:
                signals.append(RiskSignal("critical", f"Name contains '{word}'"))

        # Check high risk signals
        for word in self.catalog.ai_classification.high_risk_signals.name_contains:
            if word in name_lower:
                signals.append(RiskSignal("high", f"Name contains '{word}'"))

        for word in self.catalog.ai_classification.high_risk_signals.description_contains:
            if word in desc_lower:
                signals.append(RiskSignal("high", f"Description contains '{word}'"))

        # Check parameter names for sensitive data
        for param in tool.parameters:
            param_lower = param.name.lower()
            for sensitive in self.catalog.ai_classification.high_risk_signals.parameter_names:
                if sensitive in param_lower:
                    signals.append(RiskSignal("high", f"Parameter '{param.name}' handles sensitive data"))

        # Check medium risk signals
        for word in self.catalog.ai_classification.medium_risk_signals.name_contains:
            if word in name_lower:
                signals.append(RiskSignal("medium", f"Name contains '{word}'"))

        # Check low risk signals
        for word in self.catalog.ai_classification.low_risk_signals.name_contains:
            if word in name_lower:
                signals.append(RiskSignal("low", f"Name contains '{word}' - likely read-only"))

        return signals

    async def _generate_via_ai(
        self,
        tool: DiscoveredTool,
        signals: list[RiskSignal]
    ) -> GeneratedPolicy:
        """Generate policy using Claude."""

        # Format signals for prompt
        signals_text = "\n".join([
            f"- [{s.level.upper()}] {s.reason}" for s in signals
        ]) or "No specific signals detected"

        # Call Claude
        response = await self.client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=500,
            messages=[{
                "role": "user",
                "content": POLICY_GENERATION_PROMPT.format(
                    tool_name=tool.name,
                    description=tool.description or "No description provided",
                    parameters=json.dumps([p.to_dict() for p in tool.parameters]),
                    return_type=tool.return_type or "unknown",
                    source=f"{tool.source} ({tool.source_name})",
                    signals=signals_text
                )
            }]
        )

        # Parse response
        policy_json = json.loads(response.content[0].text)

        return GeneratedPolicy(
            tool_name=tool.name,
            risk_level=policy_json["risk_level"],
            action=policy_json["action"],
            reason=policy_json["reason"],
            confidence=policy_json["confidence"],
            approvers=policy_json.get("approvers"),
            rate_limit=policy_json.get("rate_limit"),
            audit_level=policy_json.get("audit_level", "standard"),
            generated_by="ai",
            requires_human_review=True,
            signals_detected=[s.reason for s in signals]
        )
```

---

## Policy Packs

### Pack Structure

```yaml
# packs/sql-protection.yaml

pack:
  id: "sql-protection"
  name: "SQL Protection"
  description: "Protect against destructive and dangerous database operations"
  version: "1.2.0"
  category: "database"
  icon: "database"

  # What tools this pack applies to
  applies_to:
    patterns:
      - "sql_*"
      - "db_*"
      - "postgres_*"
      - "mysql_*"
      - "sqlite_*"
    parameter_detection:
      - name: "query"
        looks_like: "sql"
      - name: "statement"
        looks_like: "sql"

  # User-configurable settings
  settings:
    production_environments:
      type: list
      default: ["production", "prod", "live"]
      label: "Production environment names"
      description: "Environment names that should have stricter protections"

    require_where_clause:
      type: boolean
      default: true
      label: "Require WHERE clause"
      description: "Block UPDATE/DELETE without WHERE clause"

    approval_timeout:
      type: duration
      default: "15m"
      label: "Approval timeout"
      description: "How long to wait for human approval"
      options: ["5m", "15m", "30m", "1h"]

    max_affected_rows:
      type: number
      default: 1000
      label: "Max affected rows"
      description: "Require approval if query affects more rows"

  # Individual rules
  rules:
    # ═══════════════════════════════════════════════════════════════════
    # TIER 3: CRITICAL - Require Approval or Deny
    # ═══════════════════════════════════════════════════════════════════

    - id: "sql-drop-table"
      name: "DROP TABLE/DATABASE protection"
      description: "Require approval before dropping tables or databases"
      tier: 3
      enabled: true

      match:
        parameters:
          query:
            regex: "(?i)\\bDROP\\s+(TABLE|DATABASE|SCHEMA|INDEX)\\b"

      action: REQUIRE_APPROVAL

      approval:
        default_approvers: ["role:dba", "role:on-call"]
        timeout: "{{ settings.approval_timeout }}"
        message: |
          🚨 *DROP operation detected*

          Query: ```{{ parameters.query }}```

          This will permanently delete the table/database.

      configurable:
        - action  # User can change to DENY
        - approval.default_approvers

    - id: "sql-truncate"
      name: "TRUNCATE protection"
      description: "Require approval before truncating tables"
      tier: 3
      enabled: true

      match:
        parameters:
          query:
            regex: "(?i)\\bTRUNCATE\\b"

      action: REQUIRE_APPROVAL

    - id: "sql-delete-no-where"
      name: "DELETE without WHERE"
      description: "Block DELETE statements without WHERE clause"
      tier: 3
      enabled: "{{ settings.require_where_clause }}"

      match:
        parameters:
          query:
            regex: "(?i)\\bDELETE\\s+FROM\\s+\\w+\\s*$"

      action: DENY
      response:
        message: "DELETE without WHERE clause is not allowed"

    - id: "sql-update-no-where"
      name: "UPDATE without WHERE"
      description: "Block UPDATE statements without WHERE clause"
      tier: 3
      enabled: "{{ settings.require_where_clause }}"

      match:
        parameters:
          query:
            regex: "(?i)\\bUPDATE\\s+\\w+\\s+SET\\s+[^;]+$(?<!WHERE)"

      action: DENY
      response:
        message: "UPDATE without WHERE clause is not allowed"

    # ═══════════════════════════════════════════════════════════════════
    # TIER 2: HIGH RISK - Conditional Approval
    # ═══════════════════════════════════════════════════════════════════

    - id: "sql-delete-production"
      name: "DELETE in production"
      description: "Require approval for DELETE in production environments"
      tier: 2
      enabled: true

      match:
        parameters:
          query:
            regex: "(?i)\\bDELETE\\s+FROM\\b"
        context:
          environment:
            in: "{{ settings.production_environments }}"

      action: REQUIRE_APPROVAL

    - id: "sql-alter-table"
      name: "ALTER TABLE protection"
      description: "Require approval for schema changes"
      tier: 2
      enabled: true

      match:
        parameters:
          query:
            regex: "(?i)\\bALTER\\s+TABLE\\b"

      action: REQUIRE_APPROVAL

    # ═══════════════════════════════════════════════════════════════════
    # TIER 1: MEDIUM RISK - Monitor and Audit
    # ═══════════════════════════════════════════════════════════════════

    - id: "sql-insert-audit"
      name: "INSERT monitoring"
      description: "Audit all INSERT operations"
      tier: 1
      enabled: true

      match:
        parameters:
          query:
            regex: "(?i)\\bINSERT\\s+INTO\\b"

      action: ALLOW
      audit:
        level: standard
        capture_query: true

    - id: "sql-update-audit"
      name: "UPDATE monitoring"
      description: "Audit all UPDATE operations"
      tier: 1
      enabled: true

      match:
        parameters:
          query:
            regex: "(?i)\\bUPDATE\\s+\\w+\\s+SET\\b"
        context:
          environment:
            not_in: "{{ settings.production_environments }}"

      action: ALLOW
      audit:
        level: standard

    # ═══════════════════════════════════════════════════════════════════
    # TIER 0: LOW RISK - Allow
    # ═══════════════════════════════════════════════════════════════════

    - id: "sql-select"
      name: "SELECT operations"
      description: "Allow read operations"
      tier: 0
      enabled: true

      match:
        parameters:
          query:
            regex: "(?i)^\\s*SELECT\\b"

      action: ALLOW
      audit:
        level: minimal
```

### Pack: Filesystem Protection

```yaml
# packs/filesystem-protection.yaml

pack:
  id: "filesystem-protection"
  name: "Filesystem Protection"
  description: "Protect against dangerous file and directory operations"
  version: "1.1.0"
  category: "filesystem"
  icon: "folder"

  applies_to:
    patterns:
      - "read_file"
      - "write_file"
      - "delete_file"
      - "list_directory"
      - "create_directory"
      - "move_file"
      - "copy_file"
      - "file_*"
      - "fs_*"

  settings:
    protected_paths:
      type: list
      default:
        - "/etc"
        - "/var"
        - "/usr"
        - "/bin"
        - "/sbin"
        - "/root"
        - "~/.ssh"
        - "~/.aws"
        - "~/.config"
      label: "Protected paths"
      description: "Paths that require approval to access"

    allowed_write_paths:
      type: list
      default:
        - "/tmp"
        - "/var/tmp"
        - "./output"
        - "./data"
      label: "Allowed write paths"
      description: "Paths where writes are allowed without approval"

    block_hidden_files:
      type: boolean
      default: true
      label: "Block hidden files"
      description: "Block access to files starting with ."

  rules:
    # TIER 3: Critical
    - id: "fs-delete-protected"
      name: "Delete in protected paths"
      tier: 3
      match:
        tool: "delete_file"
        parameters:
          path:
            matches_any: "{{ settings.protected_paths }}"
      action: DENY
      response:
        message: "Cannot delete files in protected paths"

    - id: "fs-delete-any"
      name: "Delete file approval"
      tier: 3
      match:
        tool: "delete_file"
      action: REQUIRE_APPROVAL

    # TIER 2: High
    - id: "fs-write-protected"
      name: "Write to protected paths"
      tier: 2
      match:
        tool: "write_file"
        parameters:
          path:
            matches_any: "{{ settings.protected_paths }}"
      action: REQUIRE_APPROVAL

    - id: "fs-hidden-files"
      name: "Hidden file access"
      tier: 2
      enabled: "{{ settings.block_hidden_files }}"
      match:
        parameters:
          path:
            regex: "/\\.[^/]+$"
      action: DENY
      response:
        message: "Access to hidden files is not allowed"

    # TIER 1: Medium
    - id: "fs-write-allowed"
      name: "Write to allowed paths"
      tier: 1
      match:
        tool: "write_file"
        parameters:
          path:
            matches_any: "{{ settings.allowed_write_paths }}"
      action: ALLOW
      audit:
        level: standard

    # TIER 0: Low
    - id: "fs-read"
      name: "Read files"
      tier: 0
      match:
        tool: "read_file"
      action: ALLOW
      audit:
        level: minimal

    - id: "fs-list"
      name: "List directories"
      tier: 0
      match:
        tool: "list_directory"
      action: ALLOW
```

---

## Onboarding Flow

### Step 1: Agent Connection

```python
# onboarding.py

async def handle_new_agent(agent: AgentConnection) -> OnboardingResult:
    """
    Handle a new agent connecting to Rind.
    """
    # 1. Discover all tools
    tools = await discover_tools(agent)

    # 2. Classify each tool
    classified_tools = []
    for tool in tools:
        classification = await classify_tool(tool)
        classified_tools.append(classification)

    # 3. Separate into catalog-matched vs AI-generated
    catalog_matched = [t for t in classified_tools if t.source == "catalog"]
    ai_generated = [t for t in classified_tools if t.source == "ai"]

    # 4. Auto-apply catalog policies
    for tool in catalog_matched:
        await apply_policy(agent.org_id, agent.id, tool.policy)

    # 5. Queue AI-generated for review
    if ai_generated:
        review_request = await create_policy_review_request(
            agent=agent,
            tools=ai_generated
        )

        # Notify admin
        await notify_admin_new_tools(agent, review_request)

    # 6. Determine agent status
    if ai_generated and agent.org.settings.unknown_tools.pending_review_action == "BLOCK":
        agent_status = "blocked_pending_review"
    else:
        agent_status = "active"

    return OnboardingResult(
        agent_id=agent.id,
        status=agent_status,
        tools_discovered=len(tools),
        catalog_matched=len(catalog_matched),
        pending_review=len(ai_generated),
        review_request_id=review_request.id if ai_generated else None
    )
```

### Step 2: Human Review UI

```typescript
// PolicyReviewPage.tsx

interface PolicyReview {
  id: string;
  agent: Agent;
  tools: ToolWithPolicy[];
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
}

interface ToolWithPolicy {
  tool: DiscoveredTool;
  policy: GeneratedPolicy;
  user_decision?: 'accept' | 'modify' | 'reject';
  modified_policy?: Policy;
}

function PolicyReviewPage({ reviewId }: { reviewId: string }) {
  const { data: review } = useReview(reviewId);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});

  const currentTool = review.tools[currentIndex];

  return (
    <div className="max-w-4xl mx-auto p-6">
      <header className="mb-8">
        <h1 className="text-2xl font-bold">Review Generated Policies</h1>
        <p className="text-gray-600">
          Agent: {review.agent.name} • {review.tools.length} tools need review
        </p>
        <ProgressBar current={currentIndex + 1} total={review.tools.length} />
      </header>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <RiskBadge level={currentTool.policy.risk_level} />
            <h2 className="text-xl font-mono">{currentTool.tool.name}</h2>
          </div>
        </CardHeader>

        <CardContent>
          {/* Tool Definition */}
          <Section title="Tool Definition">
            <CodeBlock language="json">
              {JSON.stringify(currentTool.tool.raw_definition, null, 2)}
            </CodeBlock>
          </Section>

          {/* AI Analysis */}
          <Section title="AI Analysis">
            <ul className="space-y-2">
              {currentTool.policy.signals_detected.map((signal, i) => (
                <li key={i} className="flex items-center gap-2">
                  <SignalIcon level={getSignalLevel(signal)} />
                  <span>{signal}</span>
                </li>
              ))}
            </ul>
          </Section>

          {/* Suggested Policy */}
          <Section title="Suggested Policy">
            <div className="bg-gray-50 p-4 rounded-lg">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Action</Label>
                  <Badge variant={getActionVariant(currentTool.policy.action)}>
                    {currentTool.policy.action}
                  </Badge>
                </div>
                <div>
                  <Label>Confidence</Label>
                  <span>{(currentTool.policy.confidence * 100).toFixed(0)}%</span>
                </div>
              </div>
              <div className="mt-4">
                <Label>Reason</Label>
                <p className="text-gray-700">{currentTool.policy.reason}</p>
              </div>
            </div>
          </Section>

          {/* User Decision */}
          <Section title="Your Decision">
            <RadioGroup
              value={decisions[currentTool.tool.name]?.action || 'accept'}
              onValueChange={(v) => handleDecision(currentTool.tool.name, v)}
            >
              <RadioOption value="accept">
                Accept suggestion ({currentTool.policy.action})
              </RadioOption>
              <RadioOption value="deny">
                More restrictive (DENY - block completely)
              </RadioOption>
              <RadioOption value="allow">
                Less restrictive (ALLOW - trust the agent)
              </RadioOption>
              <RadioOption value="customize">
                Customize policy...
              </RadioOption>
            </RadioGroup>

            {decisions[currentTool.tool.name]?.action === 'accept' &&
             currentTool.policy.action === 'REQUIRE_APPROVAL' && (
              <div className="mt-4">
                <Label>Approvers</Label>
                <TeamSelector
                  value={decisions[currentTool.tool.name]?.approvers}
                  onChange={(v) => handleApproversChange(currentTool.tool.name, v)}
                />
              </div>
            )}
          </Section>
        </CardContent>

        <CardFooter className="flex justify-between">
          <Button
            variant="outline"
            onClick={() => setCurrentIndex(i => i - 1)}
            disabled={currentIndex === 0}
          >
            ← Previous
          </Button>

          {currentIndex < review.tools.length - 1 ? (
            <Button onClick={() => setCurrentIndex(i => i + 1)}>
              Accept & Next →
            </Button>
          ) : (
            <Button variant="primary" onClick={handleSubmitAll}>
              Approve All & Activate Agent
            </Button>
          )}
        </CardFooter>
      </Card>
    </div>
  );
}
```

---

## Runtime: New Tool Detection

When tools change after initial onboarding:

```python
# tool_monitor.py

async def check_tool_changes(agent: Agent) -> Optional[ToolChangeEvent]:
    """
    Check if an agent's available tools have changed.
    Called periodically or on MCP server reconnection.
    """
    # Get current tools
    current_tools = await discover_tools(agent)
    current_names = {t.name for t in current_tools}

    # Get known tools
    known_tools = await get_known_tools(agent.id)
    known_names = {t.name for t in known_tools}

    # Detect changes
    new_tools = [t for t in current_tools if t.name not in known_names]
    removed_tools = [t for t in known_tools if t.name not in current_names]

    if not new_tools and not removed_tools:
        return None

    # Handle new tools
    if new_tools:
        for tool in new_tools:
            # Classify and generate policy
            classification = await classify_tool(tool)

            if classification.source == "catalog":
                # Auto-apply catalog policy
                await apply_policy(agent.org_id, agent.id, classification.policy)
                await notify_new_tool_auto_protected(agent, tool, classification)
            else:
                # Block until reviewed (based on org settings)
                default_action = agent.org.settings.unknown_tools.default_action

                if default_action == "BLOCK":
                    await block_tool(agent.id, tool.name)
                elif default_action == "REQUIRE_APPROVAL":
                    await set_tool_action(agent.id, tool.name, "REQUIRE_APPROVAL")

                # Create review request
                await create_tool_review_request(agent, tool, classification)
                await notify_new_tool_needs_review(agent, tool, classification)

    return ToolChangeEvent(
        agent_id=agent.id,
        new_tools=new_tools,
        removed_tools=removed_tools,
        timestamp=datetime.utcnow()
    )
```

### Slack Notification for New Tool

```python
# notifications.py

async def notify_new_tool_needs_review(
    agent: Agent,
    tool: DiscoveredTool,
    classification: ToolClassification
):
    """Send Slack notification for new tool needing review."""

    blocks = [
        {
            "type": "header",
            "text": {
                "type": "plain_text",
                "text": "🆕 New Tool Detected"
            }
        },
        {
            "type": "section",
            "fields": [
                {
                    "type": "mrkdwn",
                    "text": f"*Agent:*\n{agent.name}"
                },
                {
                    "type": "mrkdwn",
                    "text": f"*Tool:*\n`{tool.name}`"
                },
                {
                    "type": "mrkdwn",
                    "text": f"*Source:*\n{tool.source_name}"
                },
                {
                    "type": "mrkdwn",
                    "text": f"*Risk:*\n{risk_emoji(classification.risk_level)} {classification.risk_level.upper()}"
                }
            ]
        },
        {
            "type": "section",
            "text": {
                "type": "mrkdwn",
                "text": f"*AI Analysis:*\n" + "\n".join([
                    f"• {signal}" for signal in classification.signals[:3]
                ])
            }
        },
        {
            "type": "section",
            "text": {
                "type": "mrkdwn",
                "text": f"*Current Status:* ⛔ Tool is blocked until policy is configured"
            }
        },
        {
            "type": "actions",
            "elements": [
                {
                    "type": "button",
                    "text": {"type": "plain_text", "text": "Configure Policy"},
                    "style": "primary",
                    "url": f"https://app.rind.io/tools/{tool.id}/configure"
                },
                {
                    "type": "button",
                    "text": {"type": "plain_text", "text": "Keep Blocked"},
                    "action_id": "keep_tool_blocked",
                    "value": tool.id
                }
            ]
        }
    ]

    await slack.post_message(
        channel=agent.org.settings.notifications.security_channel,
        blocks=blocks
    )
```

---

## Database Schema

```sql
-- Tool catalog (our maintained list)
CREATE TABLE tool_catalog_patterns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pattern VARCHAR(255) NOT NULL,
    category VARCHAR(100) NOT NULL,
    pack_id VARCHAR(100),
    default_risk VARCHAR(20) NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Discovered tools per agent
CREATE TABLE agent_tools (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id),
    agent_id VARCHAR(255) NOT NULL,

    -- Tool definition
    name VARCHAR(255) NOT NULL,
    description TEXT,
    parameters JSONB NOT NULL DEFAULT '[]',
    return_type VARCHAR(100),

    -- Source
    source VARCHAR(50) NOT NULL,  -- 'langchain', 'mcp', 'openai', 'custom'
    source_name VARCHAR(255),
    raw_definition JSONB,

    -- Classification
    classification_source VARCHAR(20) NOT NULL,  -- 'catalog', 'ai'
    catalog_pattern_id UUID REFERENCES tool_catalog_patterns(id),
    risk_level VARCHAR(20) NOT NULL,
    signals_detected JSONB DEFAULT '[]',

    -- Policy
    policy_id UUID REFERENCES policies(id),
    policy_status VARCHAR(20) NOT NULL DEFAULT 'pending',
    -- pending, active, blocked, review_required

    -- Metadata
    first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE(organization_id, agent_id, name)
);

-- Policy review requests
CREATE TABLE policy_review_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id),
    agent_id VARCHAR(255) NOT NULL,

    -- Tools being reviewed
    tool_ids UUID[] NOT NULL,

    -- Status
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    -- pending, approved, rejected, expired

    -- Review details
    reviewed_by VARCHAR(255),
    reviewed_at TIMESTAMPTZ,
    decisions JSONB,  -- Per-tool decisions

    -- Metadata
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ
);

-- Indexes
CREATE INDEX idx_agent_tools_org_agent ON agent_tools(organization_id, agent_id);
CREATE INDEX idx_agent_tools_pending ON agent_tools(organization_id, policy_status)
    WHERE policy_status IN ('pending', 'review_required');
CREATE INDEX idx_review_requests_pending ON policy_review_requests(organization_id, status)
    WHERE status = 'pending';
```

---

## Organization Settings

```yaml
# Default organization settings for unknown tools

settings:
  unknown_tools:
    # What to do when we see a tool without a policy
    default_action: BLOCK  # BLOCK | REQUIRE_APPROVAL | ALLOW_WITH_AUDIT

    # Auto-generate policies using AI?
    auto_generate_policies: true

    # Require human review before applying AI-generated policies?
    require_human_review: true  # STRONGLY RECOMMENDED

    # If human review required, what to do while waiting?
    pending_review_action: BLOCK  # BLOCK | REQUIRE_APPROVAL

    # How long before review request expires?
    review_expiry: "7d"

    # Notifications
    notify:
      channels:
        - type: slack
          channel: "#security-alerts"
        - type: email
          recipients: ["security@company.com"]

      # What to notify about
      events:
        - new_tool_detected
        - tool_blocked
        - review_required
        - review_expired
```

---

## Success Metrics

| Metric | Target |
|--------|--------|
| Tool discovery accuracy | 100% (must find all tools) |
| Catalog match rate | 70%+ (common tools covered) |
| AI policy generation time | <2 seconds |
| AI policy accuracy (human agreement) | 90%+ |
| Time to configure new agent | <5 minutes (with catalog tools) |
| Time to review AI-generated policies | <30 seconds per tool |

---

## Implementation Phases

### Phase 1: Foundation (Week 1-2)

- [ ] Tool discovery for LangChain agents
- [ ] Basic catalog with SQL, filesystem patterns
- [ ] Simple matching (no AI yet)
- [ ] Manual policy assignment UI

### Phase 2: AI Generation (Week 3-4)

- [ ] AI policy generator using Claude
- [ ] Risk signal detection
- [ ] Policy review UI
- [ ] Slack notifications for new tools

### Phase 3: Packs (Week 5-6)

- [ ] Full pack structure implementation
- [ ] SQL Protection pack
- [ ] Filesystem Protection pack
- [ ] Pack configuration UI

### Phase 4: Polish (Week 7-8)

- [ ] MCP tool discovery
- [ ] Runtime tool change detection
- [ ] Additional packs (payments, cloud, email)
- [ ] Pack versioning and updates

---

## References

- [LangChain Tool Definition](https://python.langchain.com/docs/how_to/custom_tools/)
- [MCP Specification - Tools](https://spec.modelcontextprotocol.io/specification/server/tools/)
- [OpenAI Function Calling](https://platform.openai.com/docs/guides/function-calling)
