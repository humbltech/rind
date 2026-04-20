# Human-in-the-Loop (HITL) Approval Workflow

**Version:** 1.0
**Last Updated:** April 2026
**Status:** Technical Specification

---

## Executive Summary

Human-in-the-loop approval is Aegis's key differentiator. While Lakera can only BLOCK or ALLOW, Aegis adds a third option: **REQUIRE_APPROVAL**.

This enables enterprises to:
- Allow agents to operate autonomously for low-risk actions
- Route high-risk actions (production DB changes, large payments, sensitive data access) to humans
- Build trust gradually by starting restrictive and loosening over time
- Meet compliance requirements for audit trails and approval workflows

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              AEGIS HITL ARCHITECTURE                             │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│   ┌─────────────┐     ┌─────────────────┐     ┌─────────────────────────────┐   │
│   │   Agent     │────►│  Aegis Proxy    │────►│  Policy Engine              │   │
│   │             │     │                 │     │                             │   │
│   └─────────────┘     └────────┬────────┘     │  Decision:                  │   │
│                                │              │  ├── ALLOW → forward        │   │
│                                │              │  ├── DENY → block           │   │
│                                │              │  └── REQUIRE_APPROVAL →     │   │
│                                │              └───────────────┬─────────────┘   │
│                                │                              │                  │
│                                │              ┌───────────────▼─────────────┐   │
│                                │              │   Approval Queue Service    │   │
│                                │              │                             │   │
│                                │              │  • Create approval request  │   │
│                                │              │  • Store in PostgreSQL      │   │
│                                │              │  • Send notifications       │   │
│                                │              │  • Wait for response        │   │
│                                │              └───────────────┬─────────────┘   │
│                                │                              │                  │
│                                │         ┌────────────────────┼────────────┐    │
│                                │         │                    │            │    │
│                                │         ▼                    ▼            ▼    │
│                                │   ┌──────────┐        ┌──────────┐  ┌────────┐│
│                                │   │  Slack   │        │  Email   │  │ Web UI ││
│                                │   │  Bot     │        │  Service │  │        ││
│                                │   └────┬─────┘        └────┬─────┘  └───┬────┘│
│                                │        │                   │            │     │
│                                │        └───────────────────┴────────────┘     │
│                                │                      │                         │
│                                │                      │ Approve / Deny          │
│                                │                      ▼                         │
│                                │        ┌─────────────────────────────┐        │
│                                │        │   Approval Response Handler │        │
│                                │        │                             │        │
│                                │        │  • Validate approver auth   │        │
│                                │        │  • Check timeout            │        │
│                                │        │  • Update request status    │        │
│                                │        │  • Resume/reject agent      │        │
│                                │        └─────────────┬───────────────┘        │
│                                │                      │                         │
│                                ◄──────────────────────┘                         │
│                                │                                                │
│                                ▼                                                │
│                    ┌─────────────────────┐                                     │
│                    │  Execute or Reject  │                                     │
│                    │  Original Action    │                                     │
│                    └─────────────────────┘                                     │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## Request Flow (Detailed)

### Happy Path: Action Approved

```
Timeline:
─────────────────────────────────────────────────────────────────────────────────►

T+0ms        T+5ms           T+10ms              T+30s              T+35s
  │            │                │                   │                  │
  ▼            ▼                ▼                   ▼                  ▼

Agent      Aegis Proxy      Policy Engine      Human Approver      Agent
sends      intercepts       evaluates          clicks "Approve"    receives
DELETE     request          → REQUIRE_APPROVAL in Slack            response
query                       → creates approval                     from DB
                            → sends Slack msg
                            → waits...

                 ◄─────────── Request suspended ───────────►
                              (agent connection held open
                               or webhook callback)
```

### Sequence Diagram

```
┌───────┐     ┌───────────┐     ┌──────────────┐     ┌─────────────┐     ┌─────────┐
│ Agent │     │Aegis Proxy│     │Policy Engine │     │Approval Svc │     │ Slack   │
└───┬───┘     └─────┬─────┘     └──────┬───────┘     └──────┬──────┘     └────┬────┘
    │               │                  │                    │                 │
    │ tool_call     │                  │                    │                 │
    │ (DELETE...)   │                  │                    │                 │
    │──────────────►│                  │                    │                 │
    │               │                  │                    │                 │
    │               │ evaluate(req)    │                    │                 │
    │               │─────────────────►│                    │                 │
    │               │                  │                    │                 │
    │               │                  │ match policy       │                 │
    │               │                  │ "block-destructive"│                 │
    │               │                  │                    │                 │
    │               │  REQUIRE_APPROVAL│                    │                 │
    │               │◄─────────────────│                    │                 │
    │               │                  │                    │                 │
    │               │ create_approval_request(req, policy)  │                 │
    │               │──────────────────────────────────────►│                 │
    │               │                  │                    │                 │
    │               │                  │                    │ send_message    │
    │               │                  │                    │────────────────►│
    │               │                  │                    │                 │
    │               │  request_id      │                    │                 │
    │               │◄──────────────────────────────────────│                 │
    │               │                  │                    │                 │
    │               │                  │                    │                 │
    │     ┌─────────┴─────────┐        │                    │                 │
    │     │ Connection held   │        │                    │                 │
    │     │ (long poll) OR    │        │                    │                 │
    │     │ 202 + webhook     │        │                    │                 │
    │     └─────────┬─────────┘        │                    │                 │
    │               │                  │                    │                 │
    │               │                  │                    │      [Human     │
    │               │                  │                    │       clicks    │
    │               │                  │                    │       Approve]  │
    │               │                  │                    │                 │
    │               │                  │                    │◄────────────────│
    │               │                  │                    │ action=approve  │
    │               │                  │                    │ approver=@jane  │
    │               │                  │                    │                 │
    │               │ approval_granted(request_id)          │                 │
    │               │◄──────────────────────────────────────│                 │
    │               │                  │                    │                 │
    │               │ forward original request to upstream  │                 │
    │               │─────────────────────────────────────────────────────────►
    │               │                  │                    │                 │
    │  response     │                  │                    │                 │
    │◄──────────────│                  │                    │                 │
    │               │                  │                    │                 │
```

---

## Policy Configuration

### Basic REQUIRE_APPROVAL Policy

```yaml
# aegis-policies.yaml

policies:
  - name: "require-approval-destructive-db"
    description: "Require human approval for destructive database operations"
    type: tool_call
    priority: 1
    enabled: true

    # When to trigger
    match:
      tools:
        - "sql_execute"
        - "db_query"
        - "postgres_*"
      parameters:
        query:
          regex: "(?i)(DROP|DELETE|TRUNCATE|ALTER|UPDATE)\\s"
      context:
        # Only in production
        environment:
          in: ["production", "prod"]

    # What to do
    action: REQUIRE_APPROVAL

    # Approval configuration
    approval:
      # Who can approve
      approvers:
        - type: team
          id: "dba-team"
        - type: user
          id: "jane@company.com"
        - type: role
          id: "on-call-engineer"

      # How long to wait
      timeout: 15m

      # What happens on timeout
      on_timeout: DENY

      # Notification channels
      channels:
        - type: slack
          channel: "#db-approvals"
          mention: "@dba-oncall"
        - type: email
          recipients: ["dba-team@company.com"]
        - type: pagerduty
          severity: high
          # Only for certain conditions
          condition:
            parameters.query:
              contains: "DROP"

      # Message customization
      message_template: |
        🚨 *Destructive DB Operation Requires Approval*

        *Agent:* {{ agent.name }} ({{ agent.id }})
        *Environment:* {{ context.environment }}
        *Operation:*
        ```sql
        {{ parameters.query }}
        ```

        *Affected Table:* {{ extracted.table_name }}
        *Estimated Rows:* {{ extracted.row_count | default: "unknown" }}

        React with ✅ to approve or ❌ to deny.

    # Audit requirements
    audit:
      capture_full_request: true
      capture_response: true
      retention_days: 365

    # Alert even if approved
    alert:
      on_approval: true
      on_denial: true
      severity: HIGH
```

### Risk-Tiered Policies

```yaml
# Tier 1: Low Risk - Automated monitoring only
policies:
  - name: "tier-1-read-operations"
    type: tool_call
    match:
      tools: ["db_query"]
      parameters:
        query:
          regex: "^SELECT\\s"
    action: ALLOW
    audit:
      capture_full_request: true

# Tier 2: Medium Risk - Real-time guardrails
  - name: "tier-2-write-operations"
    type: tool_call
    match:
      tools: ["db_query"]
      parameters:
        query:
          regex: "^(INSERT|UPDATE)\\s"
      context:
        environment: "production"
    action: ALLOW
    rate_limit:
      max_per_minute: 10
    alert:
      severity: MEDIUM
      channels: ["slack"]

# Tier 3: High Risk - Human approval required
  - name: "tier-3-destructive-operations"
    type: tool_call
    match:
      tools: ["db_query"]
      parameters:
        query:
          regex: "(?i)(DROP|DELETE|TRUNCATE)"
    action: REQUIRE_APPROVAL
    approval:
      approvers: ["dba-team"]
      timeout: 15m
      on_timeout: DENY
```

---

## Database Schema

```sql
-- Approval requests table
CREATE TABLE approval_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Request identification
    organization_id UUID NOT NULL REFERENCES organizations(id),
    project_id UUID NOT NULL REFERENCES projects(id),
    agent_id VARCHAR(255) NOT NULL,

    -- Original request details
    request_type VARCHAR(50) NOT NULL, -- 'tool_call', 'llm_request', 'mcp'
    request_payload JSONB NOT NULL,    -- Full original request
    request_hash VARCHAR(64) NOT NULL, -- SHA-256 for deduplication

    -- Policy that triggered approval
    policy_id UUID NOT NULL REFERENCES policies(id),
    policy_name VARCHAR(255) NOT NULL,

    -- Approval configuration (snapshot from policy)
    approvers JSONB NOT NULL,          -- List of allowed approvers
    timeout_at TIMESTAMPTZ NOT NULL,   -- When approval expires
    channels JSONB NOT NULL,           -- Notification channels used

    -- Status tracking
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    -- pending, approved, denied, timeout, cancelled

    -- Resolution details
    resolved_at TIMESTAMPTZ,
    resolved_by VARCHAR(255),          -- User who approved/denied
    resolved_via VARCHAR(50),          -- 'slack', 'email', 'web', 'api', 'timeout'
    resolution_note TEXT,              -- Optional comment from approver

    -- Metadata
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Indexes
    CONSTRAINT valid_status CHECK (status IN ('pending', 'approved', 'denied', 'timeout', 'cancelled'))
);

-- Indexes for common queries
CREATE INDEX idx_approval_requests_org_status ON approval_requests(organization_id, status);
CREATE INDEX idx_approval_requests_pending ON approval_requests(status, timeout_at) WHERE status = 'pending';
CREATE INDEX idx_approval_requests_agent ON approval_requests(agent_id, created_at);

-- Notification tracking
CREATE TABLE approval_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    approval_request_id UUID NOT NULL REFERENCES approval_requests(id),

    channel_type VARCHAR(50) NOT NULL, -- 'slack', 'email', 'pagerduty', 'webhook'
    channel_target VARCHAR(255) NOT NULL, -- Channel ID, email address, etc.

    -- Delivery status
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    -- pending, sent, delivered, failed

    sent_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ,
    error_message TEXT,

    -- For Slack: message_ts for updating
    external_id VARCHAR(255),

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Approval audit log (immutable)
CREATE TABLE approval_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    approval_request_id UUID NOT NULL REFERENCES approval_requests(id),

    event_type VARCHAR(50) NOT NULL,
    -- created, notification_sent, reminder_sent, approved, denied, timeout, cancelled

    actor VARCHAR(255),                -- Who performed the action
    actor_type VARCHAR(50),            -- 'system', 'user', 'timeout'

    details JSONB,                     -- Event-specific details

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS policies for multi-tenancy
ALTER TABLE approval_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE approval_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE approval_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY approval_requests_org_isolation ON approval_requests
    USING (organization_id = current_setting('app.current_org_id')::UUID);
```

---

## API Design

### Internal API (Proxy ↔ Approval Service)

```typescript
// Create approval request
POST /internal/approvals
{
  "organization_id": "org_xxx",
  "project_id": "proj_xxx",
  "agent_id": "agent_123",
  "request_type": "tool_call",
  "request_payload": {
    "tool": "sql_execute",
    "parameters": {
      "query": "DELETE FROM users WHERE id = 123"
    }
  },
  "policy": {
    "id": "pol_xxx",
    "name": "require-approval-destructive-db",
    "approvers": [...],
    "timeout": "15m",
    "channels": [...]
  },
  "context": {
    "environment": "production",
    "user_id": "user_456",
    "session_id": "sess_789"
  }
}

Response:
{
  "id": "apr_xxx",
  "status": "pending",
  "timeout_at": "2026-04-01T12:15:00Z",
  "notification_channels": ["slack", "email"],
  "wait_url": "/internal/approvals/apr_xxx/wait",
  "webhook_url": "https://aegis.io/webhooks/approval/apr_xxx"
}
```

```typescript
// Wait for approval (long poll)
GET /internal/approvals/{id}/wait?timeout=60s

Response (when resolved):
{
  "id": "apr_xxx",
  "status": "approved", // or "denied", "timeout"
  "resolved_by": "jane@company.com",
  "resolved_via": "slack",
  "resolved_at": "2026-04-01T12:01:30Z"
}
```

### External API (Approvers)

```typescript
// Resolve approval (from Slack bot, web UI, etc.)
POST /api/v1/approvals/{id}/resolve
Authorization: Bearer <approver_token>
{
  "action": "approve", // or "deny"
  "note": "Verified with DBA team, safe to proceed"
}

Response:
{
  "id": "apr_xxx",
  "status": "approved",
  "resolved_at": "2026-04-01T12:01:30Z"
}
```

```typescript
// List pending approvals (for dashboard)
GET /api/v1/approvals?status=pending&limit=50

Response:
{
  "approvals": [
    {
      "id": "apr_xxx",
      "agent_name": "data-cleanup-agent",
      "policy_name": "require-approval-destructive-db",
      "request_summary": "DELETE FROM users WHERE...",
      "created_at": "2026-04-01T12:00:00Z",
      "timeout_at": "2026-04-01T12:15:00Z",
      "time_remaining": "13m 45s"
    }
  ],
  "total": 3,
  "has_more": false
}
```

---

## Notification Integrations

### Slack Integration

```typescript
// Slack message format (Block Kit)
{
  "channel": "#db-approvals",
  "blocks": [
    {
      "type": "header",
      "text": {
        "type": "plain_text",
        "text": "🚨 Approval Required: Destructive DB Operation"
      }
    },
    {
      "type": "section",
      "fields": [
        {
          "type": "mrkdwn",
          "text": "*Agent:*\ndata-cleanup-agent"
        },
        {
          "type": "mrkdwn",
          "text": "*Environment:*\nproduction"
        },
        {
          "type": "mrkdwn",
          "text": "*Policy:*\nrequire-approval-destructive-db"
        },
        {
          "type": "mrkdwn",
          "text": "*Timeout:*\n15 minutes"
        }
      ]
    },
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": "*Operation:*\n```DELETE FROM users WHERE created_at < '2024-01-01'```"
      }
    },
    {
      "type": "context",
      "elements": [
        {
          "type": "mrkdwn",
          "text": "⏰ Expires <t:1712145600:R>"
        }
      ]
    },
    {
      "type": "actions",
      "elements": [
        {
          "type": "button",
          "text": {
            "type": "plain_text",
            "text": "✅ Approve"
          },
          "style": "primary",
          "action_id": "approve_request",
          "value": "apr_xxx"
        },
        {
          "type": "button",
          "text": {
            "type": "plain_text",
            "text": "❌ Deny"
          },
          "style": "danger",
          "action_id": "deny_request",
          "value": "apr_xxx"
        },
        {
          "type": "button",
          "text": {
            "type": "plain_text",
            "text": "🔍 View Details"
          },
          "action_id": "view_details",
          "url": "https://app.aegis.io/approvals/apr_xxx"
        }
      ]
    }
  ]
}
```

### Slack Bot Interaction Handler

```python
# slack_handler.py

from fastapi import FastAPI, Request
from aegis.approvals import ApprovalService

app = FastAPI()
approval_service = ApprovalService()

@app.post("/slack/interactions")
async def handle_slack_interaction(request: Request):
    payload = await parse_slack_payload(request)

    action = payload["actions"][0]
    user = payload["user"]

    # Verify user is authorized approver
    approval_id = action["value"]
    approval = await approval_service.get(approval_id)

    if not await is_authorized_approver(user["id"], approval):
        return slack_response(
            "❌ You are not authorized to approve this request.",
            ephemeral=True
        )

    # Process the action
    if action["action_id"] == "approve_request":
        result = await approval_service.resolve(
            approval_id=approval_id,
            action="approve",
            resolved_by=user["id"],
            resolved_via="slack"
        )

        # Update the original message
        return slack_update_message(
            "✅ *Approved* by <@{user_id}> at {timestamp}".format(
                user_id=user["id"],
                timestamp=result.resolved_at
            ),
            remove_buttons=True
        )

    elif action["action_id"] == "deny_request":
        # Show modal for denial reason
        return slack_open_modal(
            "denial_reason_modal",
            approval_id=approval_id
        )
```

### Email Template

```html
<!-- approval_request.html -->
<!DOCTYPE html>
<html>
<head>
  <style>
    .container { max-width: 600px; margin: 0 auto; font-family: sans-serif; }
    .header { background: #dc2626; color: white; padding: 20px; }
    .content { padding: 20px; }
    .code-block { background: #f3f4f6; padding: 15px; border-radius: 5px; font-family: monospace; }
    .button { display: inline-block; padding: 12px 24px; border-radius: 5px; text-decoration: none; margin: 5px; }
    .approve { background: #16a34a; color: white; }
    .deny { background: #dc2626; color: white; }
    .meta { color: #6b7280; font-size: 14px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🚨 Approval Required</h1>
    </div>
    <div class="content">
      <p><strong>Agent:</strong> {{ agent.name }}</p>
      <p><strong>Environment:</strong> {{ context.environment }}</p>
      <p><strong>Policy:</strong> {{ policy.name }}</p>

      <h3>Operation:</h3>
      <div class="code-block">
        {{ parameters.query }}
      </div>

      <p class="meta">⏰ This request expires in {{ timeout_remaining }}</p>

      <div style="margin-top: 20px;">
        <a href="{{ approve_url }}" class="button approve">✅ Approve</a>
        <a href="{{ deny_url }}" class="button deny">❌ Deny</a>
        <a href="{{ details_url }}" class="button" style="background: #6b7280; color: white;">View Details</a>
      </div>
    </div>
  </div>
</body>
</html>
```

---

## Connection Handling Strategies

### Option A: Long Polling (Simpler)

```
Agent ──► Aegis Proxy ──► Approval Service
              │
              │ HTTP connection held open
              │ (with timeout)
              │
              ◄─────────────────────────────
              │ Response when resolved
              ▼
         Forward to upstream or return error
```

**Pros:** Simple, works with any client
**Cons:** Connection timeout limits (typically 30-120s), resource intensive

### Option B: Webhook Callback (Recommended)

```
Agent ──► Aegis Proxy ──► Approval Service
              │
              │ Return 202 Accepted immediately
              │ + approval_id + status_url
              ▼
         Agent polls status_url
         OR
         Agent provides callback_url
              │
              ◄─────────────────────────────
              │ Webhook when resolved
              ▼
         Agent retries original request
         (with approval token)
```

**Pros:** Scalable, handles long approvals
**Cons:** Requires agent-side changes

### Option C: Hybrid (SDK)

```python
# aegis_sdk.py

class AegisClient:
    async def execute_with_approval(self, tool_call):
        """
        Execute a tool call, handling approval flow transparently.
        """
        response = await self.proxy.forward(tool_call)

        if response.status == 202:  # Approval required
            approval_id = response.approval_id

            # Wait for approval (with progress callback)
            result = await self.wait_for_approval(
                approval_id,
                timeout=response.timeout,
                on_progress=lambda status: print(f"Waiting for approval: {status}")
            )

            if result.status == "approved":
                # Retry with approval token
                return await self.proxy.forward(
                    tool_call,
                    headers={"X-Aegis-Approval": approval_id}
                )
            else:
                raise ApprovalDeniedError(result)

        return response
```

---

## Timeout Handling

### Timeout Flow

```
T+0:      Approval request created
T+5m:     First reminder sent (if configured)
T+10m:    Second reminder sent
T+14m:    Final warning: "1 minute remaining"
T+15m:    TIMEOUT
          │
          ├── If on_timeout: DENY
          │   └── Return error to agent
          │
          ├── If on_timeout: ALLOW
          │   └── Forward request (use carefully!)
          │
          └── If on_timeout: ESCALATE
              └── Notify escalation contacts
```

### Timeout Configuration

```yaml
approval:
  timeout: 15m
  on_timeout: DENY  # DENY | ALLOW | ESCALATE

  reminders:
    - at: 5m
      channels: ["slack"]
    - at: 10m
      channels: ["slack", "email"]
    - at: 14m
      channels: ["slack", "email", "pagerduty"]
      message: "⚠️ FINAL WARNING: 1 minute remaining!"

  escalation:
    enabled: true
    after_timeout: true
    contacts:
      - type: pagerduty
        service_id: "xxx"
      - type: email
        recipients: ["security-oncall@company.com"]
```

---

## Security Considerations

### Approver Authentication

```python
async def verify_approver(approver_id: str, approval: ApprovalRequest) -> bool:
    """
    Verify that the approver is authorized for this request.
    """
    allowed_approvers = approval.policy.approvers

    for approver_spec in allowed_approvers:
        if approver_spec.type == "user":
            if approver_id == approver_spec.id:
                return True

        elif approver_spec.type == "team":
            team_members = await get_team_members(approver_spec.id)
            if approver_id in team_members:
                return True

        elif approver_spec.type == "role":
            user_roles = await get_user_roles(approver_id)
            if approver_spec.id in user_roles:
                return True

    return False
```

### Approval Token Validation

```python
async def validate_approval_token(request: Request) -> Optional[ApprovalRequest]:
    """
    Validate that a request includes a valid approval token.
    """
    approval_id = request.headers.get("X-Aegis-Approval")
    if not approval_id:
        return None

    approval = await approval_service.get(approval_id)

    # Verify approval is valid
    if approval.status != "approved":
        raise InvalidApprovalError("Approval not granted")

    # Verify request matches original
    request_hash = hash_request(request)
    if request_hash != approval.request_hash:
        raise InvalidApprovalError("Request does not match approval")

    # Verify not expired (approval valid for 5 min after granted)
    if approval.resolved_at + timedelta(minutes=5) < datetime.utcnow():
        raise InvalidApprovalError("Approval expired")

    # Verify not already used (one-time use)
    if approval.used_at is not None:
        raise InvalidApprovalError("Approval already used")

    # Mark as used
    await approval_service.mark_used(approval_id)

    return approval
```

### Audit Trail

Every approval action is logged immutably:

```python
async def log_approval_event(
    approval_id: str,
    event_type: str,
    actor: str,
    actor_type: str,
    details: dict
):
    """
    Create immutable audit log entry.
    """
    await db.execute("""
        INSERT INTO approval_audit_log
        (approval_request_id, event_type, actor, actor_type, details)
        VALUES ($1, $2, $3, $4, $5)
    """, approval_id, event_type, actor, actor_type, json.dumps(details))

    # Also emit to SIEM if configured
    await siem_exporter.emit({
        "event": f"aegis.approval.{event_type}",
        "approval_id": approval_id,
        "actor": actor,
        "timestamp": datetime.utcnow().isoformat(),
        "details": details
    })
```

---

## Dashboard UI Components

### Pending Approvals View

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│  Pending Approvals (3)                                          [Filter ▼]      │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  ┌────────────────────────────────────────────────────────────────────────────┐ │
│  │ 🔴 HIGH PRIORITY                                              ⏰ 2m left   │ │
│  │                                                                             │ │
│  │ Agent: data-cleanup-agent                                                  │ │
│  │ Policy: require-approval-destructive-db                                    │ │
│  │ Environment: production                                                     │ │
│  │                                                                             │ │
│  │ Operation:                                                                  │ │
│  │ ┌─────────────────────────────────────────────────────────────────────┐   │ │
│  │ │ DELETE FROM users WHERE created_at < '2024-01-01'                   │   │ │
│  │ └─────────────────────────────────────────────────────────────────────┘   │ │
│  │                                                                             │ │
│  │ [✅ Approve]  [❌ Deny]  [📋 View Full Context]                            │ │
│  └────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                  │
│  ┌────────────────────────────────────────────────────────────────────────────┐ │
│  │ 🟡 MEDIUM                                                      ⏰ 8m left  │ │
│  │                                                                             │ │
│  │ Agent: payment-processor                                                    │ │
│  │ Policy: require-approval-large-payments                                     │ │
│  │ ...                                                                         │ │
│  └────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### Approval History View

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│  Approval History                                    [Last 7 days ▼] [Export]   │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  ┌──────────────────────────────────────────────────────────────────────────┐   │
│  │ Status │ Agent           │ Policy              │ Resolved By │ Time     │   │
│  ├──────────────────────────────────────────────────────────────────────────┤   │
│  │ ✅     │ data-cleanup    │ destructive-db      │ jane@co.com │ 2m ago   │   │
│  │ ❌     │ payment-proc    │ large-payments      │ bob@co.com  │ 1h ago   │   │
│  │ ⏰     │ report-gen      │ file-export         │ (timeout)   │ 3h ago   │   │
│  │ ✅     │ data-cleanup    │ destructive-db      │ jane@co.com │ 1d ago   │   │
│  └──────────────────────────────────────────────────────────────────────────┘   │
│                                                                                  │
│  Summary: 45 approved │ 12 denied │ 3 timeouts                                  │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## Implementation Phases

### Phase 1: Core Flow (Week 1-2)

- [ ] Approval request creation and storage
- [ ] Basic Slack notification
- [ ] Slack button handler (approve/deny)
- [ ] Long-poll wait endpoint
- [ ] Timeout handling (cron job)

### Phase 2: Production Ready (Week 3-4)

- [ ] Email notifications
- [ ] Dashboard UI (pending list, history)
- [ ] Multiple approvers support
- [ ] Reminder notifications
- [ ] Webhook callback option

### Phase 3: Enterprise (Week 5-6)

- [ ] PagerDuty integration
- [ ] SIEM export (audit logs)
- [ ] Approval delegation ("approve on behalf of")
- [ ] Bulk approval (for trusted patterns)
- [ ] Analytics (approval rates, response times)

---

## Success Metrics

| Metric | Target |
|--------|--------|
| Approval request creation latency | <50ms |
| Notification delivery (Slack) | <2s |
| Approval resolution (human action to agent resume) | <5s |
| Timeout accuracy | ±1 minute |
| False positive rate (requests requiring approval that shouldn't) | <5% |

---

## References

- [McKinsey AI Agent Guardrails Framework](https://galileo.ai/blog/ai-agent-guardrails-framework)
- [OpenAI HITL Implementation Guide](https://machinelearningmastery.com/building-a-human-in-the-loop-approval-gate-for-autonomous-agents/)
- [Building Enterprise-Ready AI Agents](https://dev.to/saths/building-enterprise-ready-ai-agents-with-guardrails-and-human-in-the-loop-controls-559l)
- [Slack Block Kit Builder](https://app.slack.com/block-kit-builder)
