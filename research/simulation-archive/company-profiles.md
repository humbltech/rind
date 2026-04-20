# Fictional Company Profiles — Archive

> Source: `aegis-simulation/README.md` + agent configs (code deleted April 2026)
> These profiles are ported into the TypeScript simulation's `companies/` directory.
> Updated to match new three-customer strategy (Meridian, Stackline, Fortress).

---

## Company 1: Meridian Financial

**Type**: Series B fintech, $80M raised, 120 employees
**Industry**: Financial services, HIPAA-adjacent (handles health FSA accounts)
**HQ**: Toronto, ON
**Agent framework**: LangGraph (stateful multi-step workflows)
**Deployment architecture**: LLM Gateway (LiteLLM fronting Anthropic Claude)
**Aegis integration point**: Proxy in front of all MCP tool servers

### Technical Setup
```
User → Web App → LangGraph Agent
                     ↓
             LiteLLM Gateway (Claude Haiku for classification, Sonnet for analysis)
                     ↓
             Aegis Proxy ←── This is where Aegis intercepts
                     ↓
             MCP Tool Servers:
               - db.execute (PostgreSQL — customer accounts, transactions)
               - email.send (Mailgun — customer notifications)
               - report.generate (internal reporting service)
               - document.read (S3 — KYC documents)
```

### Tools in Use
| Tool | Description | Risk Level |
|------|-------------|-----------|
| `db.execute` | Run SQL against customer database | CRITICAL (destructive ops possible) |
| `db.query` | Read-only SQL queries | MEDIUM (PII exposure) |
| `email.send` | Send email to customer or external | HIGH (exfil vector) |
| `report.generate` | Create financial reports | LOW |
| `document.read` | Read S3 documents by path | HIGH (unrestricted path access) |

### Policy Config (aegis.policy.yaml)
```yaml
policies:
  - name: block-destructive-sql
    agent: "*"
    match:
      tool: ["db.execute"]
      # Future: parameter matching for DROP/TRUNCATE
    action: REQUIRE_APPROVAL

  - name: deny-external-email
    agent: "*"
    match:
      tool: ["email.send"]
      # Future: parameter matching for non-meridian.com domains
    action: DENY

  - name: block-unscoped-document-read
    agent: "agent-public"  # Customer-facing agent
    match:
      tool: ["document.read"]
    action: DENY
```

### Primary Scenarios (Meridian)
1. **Replit-style DB deletion** — coding agent issues DROP TABLE on production
2. **EchoLeak exfiltration** — malicious email triggers document read + external POST
3. **Credential leak in error** — `db.execute` error message contains connection string

### Original Simulation Reference
Previously named "Meridian" in `aegis-simulation/` — runs on port 8002, uses LangGraph for risk analysis workflows.

---

## Company 2: Stackline

**Type**: Series A SaaS startup, $18M raised, 40 employees
**Industry**: B2B project management / analytics
**HQ**: Vancouver, BC
**Agent framework**: Direct MCP connections (Cursor IDE, Claude Desktop)
**Deployment architecture**: Direct MCP — developers use Claude Desktop with MCP servers configured
**Aegis integration point**: Proxy as the MCP server endpoint (transparent to Claude Desktop)

### Technical Setup
```
Claude Desktop / Cursor
    ↓ MCP protocol
Aegis Proxy (transparent to Claude — configured as MCP server URL)
    ↓ forwarded tool calls
Actual MCP Servers:
  - github.* (PR review, file access)
  - terminal.run (shell commands)
  - database.* (read/write to Postgres)
  - jira.* (ticket management)
```

### Tools in Use
| Tool | Description | Risk Level |
|------|-------------|-----------|
| `github.read_file` | Read any file in any repo | HIGH (unrestricted) |
| `github.create_pr` | Create pull requests | MEDIUM |
| `terminal.run` | Execute shell commands | CRITICAL (RCE surface) |
| `database.query` | Read database records | MEDIUM |
| `database.execute` | Write/modify database | HIGH |
| `jira.create_ticket` | Create Jira issues | LOW |

### Policy Config (aegis.policy.yaml)
```yaml
policies:
  - name: block-shell-execution
    agent: "*"
    match:
      tool: ["terminal.run", "shell.exec", "process.spawn"]
    action: DENY

  - name: require-approval-db-write
    agent: "*"
    match:
      tool: ["database.execute"]
    action: REQUIRE_APPROVAL

  - name: cost-limit-session
    # Phase 2: session-level cost limit
    agent: "*"
    match:
      tool: ["*"]
    action: ALLOW
    # costLimitUsd: 10.00 per session
```

### Primary Scenarios (Stackline)
1. **Cost runaway loop** — multi-agent workflow loops, $47K pattern
2. **Session kill-switch** — engineer kills runaway agent session mid-run
3. **Copilot RCE** — PR review agent executes injected shell command
4. **Schema drift** — a third-party MCP server adds new `export_all_data` tool silently

### Original Simulation Reference
Previously "Nimbus" in `aegis-simulation/` — B2B SaaS with LangChain, task management, port 8001.

---

## Company 3: Fortress Systems

**Type**: Enterprise, 3,000 employees, publicly traded
**Industry**: Managed security services
**HQ**: Montreal, QC
**Agent framework**: LangChain (with custom tool registry)
**Deployment architecture**: Framework SDK — agents built with `@aegis/langchain` middleware
**Aegis integration point**: SDK middleware in the LangChain tool call layer

### Technical Setup
```
LangChain Agent
    ↓ tool call intercepted by @aegis/langchain middleware
Aegis SDK (in-process)
    ↓ allowed calls forwarded to
MCP Tool Servers (third-party, from vendors):
  - vendor-a.* (security scanning tools)
  - vendor-b.* (threat intelligence feed)
  - internal.* (internal data tools)
  - reporting.* (compliance reporting)
```

### Key Risk: Third-Party MCP Servers
Fortress's specific risk is supply chain — they install MCP servers from security vendors and can't fully control their code. Any of these servers could:
- Have tool descriptions modified in a software update (rug pull)
- Add new tools that weren't there at procurement time
- Be compromised in a supply chain attack (LiteLLM pattern)

### Tools in Use
| Tool | Source | Risk |
|------|--------|------|
| `vendor-a.scan_target` | Third-party vendor | Trust issue |
| `vendor-a.get_results` | Third-party vendor | Trust issue |
| `vendor-b.threat_lookup` | Third-party vendor | Trust issue |
| `internal.db.query` | Internal | Medium |
| `reporting.generate` | Internal | Low |

### Policy Config (aegis.policy.yaml)
```yaml
policies:
  - name: deny-unknown-tools
    agent: "*"
    match:
      toolPattern: "vendor-*"
    action: REQUIRE_APPROVAL
    # Any new vendor tool requires human sign-off first

  - name: block-exfil-from-vendor-tools
    agent: "*"
    match:
      tool: ["vendor-a.*", "vendor-b.*"]
    action: ALLOW
    # Response inspection active for all vendor tool outputs
```

### Primary Scenarios (Fortress)
1. **Tool poisoning scan** — scan-on-connect detects injected instruction in vendor tool description
2. **Schema drift** — vendor releases update, new `export_all_findings` tool appears
3. **Supply chain response injection** — vendor tool response contains embedded SYSTEM directive

### Original Simulation Reference
Previously "Healix" in `aegis-simulation/` — healthcare/HIPAA, LangChain, patient scheduling, port 8003. Repurposed as enterprise security services company.

---

## Summary

| Company | Size | Deployment | Main Risk | Aegis Entry |
|---------|------|-----------|-----------|-------------|
| Meridian Financial | 120 | LLM Gateway | Data leak, destructive SQL | Proxy in front of MCP servers |
| Stackline | 40 | Direct MCP (Claude Desktop) | Cost loops, RCE, schema drift | Transparent proxy as MCP endpoint |
| Fortress Systems | 3,000 | Framework SDK (LangChain) | Supply chain, tool poisoning | `@aegis/langchain` middleware |

These three companies cover the three primary Aegis installation patterns and the three buyer personas: platform engineer (Stackline), security team (Fortress), compliance/fintech (Meridian).
