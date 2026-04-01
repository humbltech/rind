# Aegis MCP Proxy Architecture

## Overview

The MCP Proxy is the core security enforcement point for MCP (Model Context Protocol) communications. It sits between AI agents and MCP servers, providing authentication, authorization, logging, and policy enforcement without modifying existing agents or servers.

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              AI AGENT                                        │
│  (Claude, GPT-4, Custom LangChain Agent, etc.)                              │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ MCP Protocol (stdio/SSE/HTTP)
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           AEGIS MCP PROXY                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐    │
│  │   AUTHN      │  │   AUTHZ      │  │   POLICY     │  │   AUDIT      │    │
│  │   Layer      │  │   Layer      │  │   Engine     │  │   Logger     │    │
│  ├──────────────┤  ├──────────────┤  ├──────────────┤  ├──────────────┤    │
│  │ • OAuth 2.1  │  │ • RBAC       │  │ • Allow/Deny │  │ • Structured │    │
│  │ • API Keys   │  │ • Tool-level │  │ • Rate Limit │  │ • Real-time  │    │
│  │ • mTLS       │  │ • Per-agent  │  │ • PII Filter │  │ • Searchable │    │
│  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘    │
│                                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                       │
│  │   TOOL       │  │   ANOMALY    │  │   CIRCUIT    │                       │
│  │   PINNING    │  │   DETECTION  │  │   BREAKER    │                       │
│  ├──────────────┤  ├──────────────┤  ├──────────────┤                       │
│  │ • Hash verify│  │ • Behavioral │  │ • Fail-safe  │                       │
│  │ • Rug pull   │  │ • ML-based   │  │ • Fallback   │                       │
│  │ • Version pin│  │ • Alerting   │  │ • Recovery   │                       │
│  └──────────────┘  └──────────────┘  └──────────────┘                       │
│                                                                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                         CONNECTION MANAGER                                   │
│  • Connection pooling to MCP servers                                        │
│  • Protocol translation (stdio ↔ HTTP ↔ SSE)                                │
│  • Health checks and failover                                               │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ MCP Protocol
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           MCP SERVERS                                        │
│  (filesystem, github, slack, database, custom tools, etc.)                  │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Core Components

### 1. Authentication Layer (AuthN)

Verifies identity of agents connecting to the proxy.

```typescript
interface AuthNConfig {
  // OAuth 2.1 with PKCE (recommended for production)
  oauth?: {
    issuer: string;
    clientId: string;
    allowedScopes: string[];
  };

  // API Keys (simpler, for development/internal)
  apiKeys?: {
    header: string; // e.g., "X-Aegis-API-Key"
    keys: Map<string, AgentIdentity>;
  };

  // mTLS (for high-security environments)
  mtls?: {
    ca: string;
    requireClientCert: boolean;
  };
}

interface AgentIdentity {
  id: string;
  name: string;
  organizationId: string;
  roles: string[];
  metadata: Record<string, unknown>;
}
```

### 2. Authorization Layer (AuthZ)

Controls which tools each agent can access.

```typescript
interface AuthZPolicy {
  // Role-based access control
  roles: {
    [roleName: string]: {
      allowedTools: string[];      // Tool names or patterns
      deniedTools: string[];       // Explicit denials
      allowedServers: string[];    // MCP server URLs
    };
  };

  // Per-agent overrides
  agentOverrides: {
    [agentId: string]: {
      additionalTools: string[];
      restrictedTools: string[];
    };
  };
}

// Example policy
const examplePolicy: AuthZPolicy = {
  roles: {
    "read-only": {
      allowedTools: ["read_*", "list_*", "get_*"],
      deniedTools: ["write_*", "delete_*", "execute_*"],
      allowedServers: ["*"]
    },
    "developer": {
      allowedTools: ["*"],
      deniedTools: ["execute_shell", "write_credentials"],
      allowedServers: ["github", "filesystem", "database"]
    }
  },
  agentOverrides: {}
};
```

### 3. Policy Engine

Evaluates requests against configurable rules.

```typescript
interface PolicyRule {
  id: string;
  name: string;
  priority: number;          // Lower = higher priority
  condition: PolicyCondition;
  action: "allow" | "deny" | "log" | "transform";
  transformations?: Transformation[];
}

interface PolicyCondition {
  // Match criteria
  tools?: string[];           // Tool name patterns
  agents?: string[];          // Agent ID patterns
  servers?: string[];         // Server patterns

  // Content inspection
  inputContains?: string[];   // Block if input contains
  inputRegex?: string[];      // Regex patterns

  // Rate limiting
  rateLimit?: {
    requests: number;
    window: "minute" | "hour" | "day";
    scope: "agent" | "tool" | "global";
  };
}

interface Transformation {
  type: "redact_pii" | "mask_secrets" | "truncate" | "custom";
  config: Record<string, unknown>;
}
```

### 4. Tool Pinning

Prevents "rug pull" attacks where tool definitions change maliciously.

```typescript
interface ToolPin {
  serverId: string;
  toolName: string;
  pinnedHash: string;           // SHA-256 of tool definition
  pinnedAt: Date;
  allowedVersions?: string[];   // Semantic versioning

  // What to do on mismatch
  onMismatch: "block" | "alert" | "allow_with_warning";
}

// Tool definition hash includes:
// - name
// - description
// - inputSchema
// - annotations
function computeToolHash(tool: MCPTool): string {
  const canonical = JSON.stringify({
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
  }, Object.keys(tool).sort());

  return crypto.createHash('sha256').update(canonical).digest('hex');
}
```

### 5. Audit Logger

Comprehensive logging for compliance and debugging.

```typescript
interface AuditEvent {
  id: string;
  timestamp: Date;

  // Who
  agentId: string;
  agentName: string;
  organizationId: string;

  // What
  eventType: "tool_call" | "tool_response" | "auth_attempt" | "policy_violation";
  serverId: string;
  toolName: string;

  // Details
  request: {
    method: string;
    arguments: Record<string, unknown>;  // Sanitized
  };
  response?: {
    success: boolean;
    duration: number;
    size: number;
  };

  // Policy
  policiesEvaluated: string[];
  policyDecision: "allow" | "deny";
  denialReason?: string;

  // Metadata
  clientIp: string;
  userAgent: string;
  traceId: string;
}
```

---

## Request Flow

```
1. Agent connects to Aegis MCP Proxy
   │
   ▼
2. AuthN: Verify identity (OAuth/API Key/mTLS)
   │ ✗ → Return 401 Unauthorized
   ▼
3. Parse MCP request (tools/list, tools/call, etc.)
   │
   ▼
4. AuthZ: Check if agent can access this tool/server
   │ ✗ → Return 403 Forbidden + Audit Log
   ▼
5. Policy Engine: Evaluate all matching rules
   │ ✗ → Return 403 + Detailed reason + Audit Log
   │
   ├─ Rate limiting check
   ├─ Input validation
   ├─ PII detection
   └─ Content transformations
   │
   ▼
6. Tool Pinning: Verify tool definition hasn't changed
   │ ✗ → Block or Alert based on config
   ▼
7. Forward request to MCP Server
   │
   ▼
8. Receive response from MCP Server
   │
   ▼
9. Response Policy: Apply output transformations
   │
   ├─ PII redaction
   ├─ Secret masking
   └─ Response truncation
   │
   ▼
10. Audit Log: Record full interaction
    │
    ▼
11. Return response to Agent
```

---

## Deployment Models

### Model 1: Sidecar (Kubernetes)

```yaml
# aegis-sidecar.yaml
apiVersion: v1
kind: Pod
metadata:
  name: agent-with-aegis
spec:
  containers:
  - name: ai-agent
    image: my-agent:latest
    env:
    - name: MCP_PROXY_URL
      value: "http://localhost:8080"

  - name: aegis-proxy
    image: aegis/mcp-proxy:latest
    ports:
    - containerPort: 8080
    env:
    - name: AEGIS_API_KEY
      valueFrom:
        secretKeyRef:
          name: aegis-secrets
          key: api-key
    - name: AEGIS_POLICY_URL
      value: "https://api.aegis.security/v1/policies"
```

### Model 2: Standalone Gateway

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Agent Pool    │────▶│  Aegis Gateway  │────▶│   MCP Servers   │
│   (multiple)    │     │  (load balanced)│     │   (multiple)    │
└─────────────────┘     └─────────────────┘     └─────────────────┘
```

### Model 3: Cloud-Hosted (SaaS)

```
┌─────────────────┐     ┌─────────────────────────────────────────┐
│   Your Agent    │────▶│         Aegis Cloud                      │
│                 │     │  ┌─────────────────────────────────────┐ │
│  MCP_PROXY=     │     │  │  Regional Edge (low latency)        │ │
│  aegis.cloud/   │     │  │  ┌───────┐ ┌───────┐ ┌───────┐     │ │
│  org/abc123     │     │  │  │ us-e1 │ │ eu-w1 │ │ ap-s1 │     │ │
└─────────────────┘     │  │  └───────┘ └───────┘ └───────┘     │ │
                        │  └─────────────────────────────────────┘ │
                        │                    │                     │
                        │                    ▼                     │
                        │  ┌─────────────────────────────────────┐ │
                        │  │  Your MCP Servers (your VPC)        │ │
                        │  └─────────────────────────────────────┘ │
                        └─────────────────────────────────────────┘
```

---

## Technology Stack

| Component | Technology | Rationale |
|-----------|------------|-----------|
| **Runtime** | Node.js 22+ / Bun | Native MCP SDK support, async I/O |
| **Framework** | Hono or Fastify | Lightweight, fast, TypeScript-first |
| **Protocol** | MCP SDK | Official protocol implementation |
| **Auth** | jose (JWT), oauth4webapi | Standards-compliant OAuth 2.1 |
| **Storage** | PostgreSQL + Redis | Policies in PG, rate limits in Redis |
| **Logging** | Pino → OpenTelemetry | Structured, exportable |
| **Deployment** | Docker, Kubernetes | Standard enterprise deployment |

---

## Performance Targets

| Metric | Target | Measurement |
|--------|--------|-------------|
| **Latency overhead** | < 5ms p99 | Proxy processing time only |
| **Throughput** | 10K req/sec per instance | Tool calls per second |
| **Connection pool** | 100 concurrent per server | MCP server connections |
| **Cold start** | < 100ms | Container startup |
| **Memory** | < 256MB base | Per instance |

---

## Security Considerations

### Secrets Management
- Never log raw secrets or PII
- Use envelope encryption for stored credentials
- Rotate API keys automatically

### Network Security
- TLS 1.3 required for all connections
- mTLS option for server-to-server
- Network policies to restrict egress

### Audit Retention
- Default: 90 days hot, 1 year cold
- Configurable per compliance requirement
- Immutable audit log (append-only)

---

## MVP Scope (Month 2)

### In Scope
- [ ] OAuth 2.1 + API Key authentication
- [ ] Basic RBAC authorization
- [ ] Tool-level allow/deny policies
- [ ] Request/response logging
- [ ] Tool definition hashing (rug pull detection)
- [ ] Rate limiting (per agent, per tool)
- [ ] OpenTelemetry export
- [ ] Docker deployment

### Out of Scope (Future)
- ML-based anomaly detection
- Custom transformation functions
- Multi-region deployment
- Offline mode
- Policy version control UI

---

## API Reference

### Proxy Endpoints

```
# MCP Protocol (forwarded to servers)
POST /mcp/{serverId}/*

# Management API
GET  /api/v1/policies
POST /api/v1/policies
GET  /api/v1/audit/events
GET  /api/v1/tools/inventory
POST /api/v1/tools/pin
GET  /api/v1/health
```

### Configuration

```typescript
interface ProxyConfig {
  // Server binding
  port: number;
  host: string;

  // Authentication
  auth: AuthNConfig;

  // MCP Servers to proxy
  servers: {
    [serverId: string]: {
      url: string;
      transport: "stdio" | "sse" | "http";
      healthCheck?: string;
    };
  };

  // Policies
  policies: {
    source: "file" | "api" | "database";
    url?: string;
    refreshInterval?: number;
  };

  // Observability
  telemetry: {
    otlpEndpoint?: string;
    logLevel: "debug" | "info" | "warn" | "error";
  };
}
```

---

*Next: [SDK Architecture](./sdk-langchain.md)*
