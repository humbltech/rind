# Aegis — Agent Deployment Patterns & Installation Experience

> Research-based document mapping how AI agents are built, deployed, and permissioned across three persona segments. Used to design the Aegis installation and monitoring experience to be "wow" for each persona.

**Last Updated**: April 18, 2026
**Status**: Pre-code — informs onboarding flow and SDK/proxy design

---

## Summary: What We Learned

Three personas deploy agents in fundamentally different ways — different infrastructure, different permission models, different pain points. The Aegis installation experience must branch at step one and feel native to each persona's existing workflow.

| Aspect | Indie Developer | Startup Team | Enterprise |
|--------|----------------|--------------|------------|
| **Build framework** | LangChain, CrewAI, direct API | LangGraph, CrewAI | LangGraph, AutoGen |
| **Deploy target** | Serverless (Lambda, Railway) | Docker + ECS/Kubernetes | Kubernetes (hybrid) |
| **Permissions today** | `.env` files, raw API keys | Secrets Manager, manual rotation | Vault + IAM, service accounts |
| **Agent identity** | Non-existent | Emerging | Service accounts (but not AI-native) |
| **MCP usage** | ~0% (unaware) | ~10-20% (POC) | ~5-10% (experimental) |
| **Observability** | None (print statements) | LangSmith | LangSmith + SIEM |
| **Budget for tools** | <$50/month | $2-20K/year | $500K-$5M/year |
| **Primary pain** | Cost runaway, no audit trail | Enterprise demands, framework instability | 85.6% shipped without security approval |

---

## Persona 1: Indie Developer

### How They Build Agents

- **Tools**: LangChain (most tutorials), CrewAI (simple syntax), direct OpenAI/Anthropic API
- **Where they code**: Local machine, Cursor, Replit
- **Typical agent**: A single ReAct agent with 3-5 tools; maybe a simple multi-step pipeline
- **Agent definition**: Everything in code — tool list, system prompt, memory config

```python
# Typical indie dev agent setup
from langchain.agents import create_react_agent
from langchain_openai import ChatOpenAI

agent = create_react_agent(
    llm=ChatOpenAI(api_key=os.getenv("OPENAI_API_KEY")),
    tools=[search_tool, calculator_tool, file_tool]
)
```

### How They Deploy

- **Primary**: Serverless — AWS Lambda, Vercel, Railway, Render
- **Secondary**: Just running locally (many "production" agents run on their laptop)
- **Zero**: Kubernetes (too complex, too expensive)
- **Why serverless**: No ops overhead, scales from zero, minimal cost

```
[Local dev] → git push → [Railway/Vercel]
                              ↓
                        [Agent runs as serverless function]
                        [No orchestration, no health checks]
                        [Logs go to... wherever the platform sends them]
```

### How They Handle Permissions Today

**Reality**: Almost no real permission model.

```
developer's .env file:
OPENAI_API_KEY=sk-...
GITHUB_TOKEN=ghp_...
SUPABASE_KEY=eyJ...
DATABASE_URL=postgres://...
```

- All tools share the developer's credentials
- Agent has the same access as the developer
- No concept of "this agent should only read, not write"
- API key rotation: never (until key is leaked)
- Agent identity: doesn't exist — agent = developer

### Current Pain Points (With Evidence)

1. **Cost runaway** — "$47K agent loop" is a real fear; no guardrails on spend
2. **No audit trail** — "My agent modified 200 rows in production. I have no idea what it changed."
3. **MCP security theater** — Know their MCP setup is unsafe, don't know how to fix it
4. **Secret sprawl** — API keys scattered across .env, GitHub secrets, Replit secrets, hardcoded strings
5. **No monitoring** — Agent fails silently, user discovers it 3 days later

### MCP Adoption

- Most indie devs are **unaware of MCP** or treat it as "the Claude desktop thing"
- Those who use it: direct connections with no proxy, no auth, no versioning
- **MCP servers they trust**: Filesystem, web search, Supabase — all with full access

### The "Wow" Installation Experience for Indie Devs

**Goal**: From zero to "oh shit" moment in under 5 minutes. No Docker, no proxy, no account setup for first run.

**Installation flow**:
```bash
npm install @aegis/langchain
# Python users: pip install aegis-sdk (HTTP wrapper of cloud API, not a proxy)
```

```typescript
// 2-line change to existing agent code (TypeScript)
import { AegisCallbackHandler } from '@aegis/langchain';

const aegis = new AegisCallbackHandler({
  apiKey: process.env.AEGIS_API_KEY,  // or omit for local-only free tier
  costLimitUsd: 10.0,
  loopDetection: true,
});

const agent = createReactAgent({
  llm: new ChatOpenAI({ callbacks: [aegis] }),
  tools,
});
```

```python
# Python (LangChain) — uses cloud API wrapper
from aegis import AegisCallbackHandler

aegis = AegisCallbackHandler(
    api_key=os.getenv("AEGIS_API_KEY"),
    cost_limit_usd=10.0,
    loop_detection=True,
)
agent = create_react_agent(llm, tools, callbacks=[aegis])
```

**What happens immediately**:
- First tool call appears in the Aegis dashboard within seconds
- Cost counter increments in real time
- If agent loops (same tool, same input >3 times), blocked automatically

**The "oh shit" moment** (happens in free tier):
```
Dashboard notification:
"Your agent called filesystem.read 47 times in 2 minutes.
 Budget alert: $12.40 spent in the last hour (you set no limit).
 2 tool calls blocked by safety rules.
 View trace →"
```

**Free tier onboarding sequence**:
1. `npm install @aegis/langchain` (or `pip install aegis-sdk` for Python) — 30 seconds
2. Add 2 lines to agent code — 2 minutes
3. Run agent once — triggers dashboard population
4. Email: "Your agent just did something interesting. View it →" — 5 minutes
5. Click link — see trace, cost, blocked calls — **"oh shit" moment**
6. Set cost limit, enable destructive action blocking — upgrade prompt appears naturally

**Permission creation for indie devs**: Code-first. No dashboard configuration needed.
```python
# Optional: set rules in code
aegis = AegisSDK(
    cost_limit_usd=10.0,          # block if over $10
    block_destructive=True,        # require approval for DELETE operations
    loop_detection=True            # block after 3 identical calls
)
```

---

## Persona 2: Startup Team

### How They Build Agents

- **Tools**: LangGraph (production-grade, supports persistent state), CrewAI (multi-agent), some custom
- **Framework switch rate**: ~50% switch frameworks mid-project as needs evolve
- **Typical agent**: Multi-step workflow with human-in-the-loop gates; sometimes multi-agent
- **Agent definition**: Mix of code and config; team shares agent definitions via Git

```python
# Typical startup: LangGraph with persistent state
from langgraph.graph import StateGraph
from langgraph.checkpoint.memory import MemorySaver

builder = StateGraph(AgentState)
builder.add_node("agent", call_model)
builder.add_node("tools", tool_node)
graph = builder.compile(checkpointer=MemorySaver())
```

### How They Deploy

- **Primary**: Docker containers → AWS ECS or Kubernetes (30-40%)
- **Secondary**: Managed services (Bedrock, Vertex AI) to reduce ops burden
- **Common pattern**: Long-running agent containers + job queues
- **CI/CD**: GitHub Actions triggers agent deployments on merge

```
[GitHub] → [CI/CD] → [ECR] → [ECS/EKS]
                                  ↓
                           [Agent container(s)]
                                  ↓
                           [AWS Secrets Manager] (API keys)
                                  ↓
                           [CloudWatch / LangSmith] (logs)
```

### How They Handle Permissions Today

**Reality**: Better than indie, but still manual and brittle.

```
AWS Secrets Manager:
  OPENAI_API_KEY: "sk-..."      # manually rotated every 6 months
  GITHUB_TOKEN: "ghp_..."
  DATABASE_URL: "postgres://..."

agent_service IAM role: {
  "Effect": "Allow",
  "Action": ["s3:GetObject", "s3:PutObject"],
  "Resource": "arn:aws:s3:::company-data/*"
}
```

- Separate service account for agent (`agent_prod_crm`)
- But all agents share the same role (no per-agent distinction)
- No per-tool authorization: agent either has the role or doesn't
- MCP: connections are hardcoded, no central access control
- "Agent identity" is emerging as a concept, especially when selling to enterprise customers

### Current Pain Points (With Evidence)

1. **Enterprise customer demands they can't fulfill**:
   - "Do you have audit logs for agent actions?" → scramble to build custom logging
   - "Can you limit what data the agent can access?" → "we can try..."
   - "SOC 2 type II requires this" → months of work
2. **Framework instability**: Major LangChain API changes mid-project, breaking production
3. **Cost attribution**: Can't tell which agent or customer is burning tokens
4. **Multi-agent visibility**: Agent A calls Agent B calls Agent C — no trace across the chain
5. **MCP governance gap**: No way to enforce which MCP servers specific agents can access

### MCP Adoption

- ~10-20% have tried MCP, mostly in POC or staging
- Blockers: security concerns (which servers are safe?), no versioning, no audit
- Those in production: direct connections, no proxy/gateway
- **The ask**: "We want to use MCP but need to be able to audit every tool call and revoke access"

### The "Wow" Installation Experience for Startups

**Goal**: Team-wide visibility + instant cost control, no infrastructure changes, takes 20 minutes.

**Installation flow**:
```bash
npm install @aegis/langchain
# Python: pip install aegis-sdk
```

Add to existing agent code (1 line per agent):
```python
from aegis import AegisSDK

aegis = AegisSDK(team_id="my-startup", agent_id="crm-agent-prod")
tools = aegis.wrap(tools, policy="crm-agent-policy")
```

Or for proxy approach, just set an env var (no code change):
```bash
AEGIS_PROXY_URL=https://proxy.aegis.dev/sk-your-key
MCP_PROXY_URL=https://proxy.aegis.dev/sk-your-key/mcp
```

**Team dashboard activates**:
- Shared view: all agents, all tool calls, cost by agent
- Cost alerts: "crm-agent spent $340 today (budget: $50)"
- Anomaly feed: "crm-agent tried to call user.delete for the first time"
- Policy editor: team creates rules together (visual + YAML)

**The "oh shit" moment for startups**:
```
Team alert (Slack):
"⚠️ crm-agent tried to delete customer records (BLOCKED)
 3 times in the last hour.
 Waiting for approval. View trace →"

→ CTO approves or denies inline in Slack
→ Post-mortem: agent was confused by ambiguous prompt
→ Policy updated: customer.delete requires REQUIRE_APPROVAL always
```

**Permission creation for startups**: Mix of code and dashboard.

Code-first default:
```python
# In agent definition
aegis.policy("crm-agent-policy", {
    "allow": ["crm.read", "crm.write", "email.send"],
    "require_approval": ["customer.delete", "bulk.*"],
    "deny": ["payments.*", "admin.*"],
    "cost_limit": {"daily_usd": 50}
})
```

Dashboard for non-technical team members (sales ops, ops lead):
- Visual policy builder: add/remove allowed tools
- Budget settings: per-agent daily/monthly limits
- Alert routing: which Slack channel gets which alerts

---

## Persona 3: Enterprise Team

### How They Build Agents

- **Tools**: LangGraph (most enterprise-ready), AutoGen (Microsoft ecosystem), custom in-house frameworks
- **Framework selection**: Driven by security review, compliance, existing tooling
- **Central platform team**: Creates approved agent templates; individual teams instantiate
- **Agent definition**: YAML or JSON config deployed via GitOps (no magic strings in code)

```yaml
# Enterprise: agent config checked into GitOps
agent:
  id: "agent-prod-crm-updater-001"
  image: "internal-registry/langchain-agent:v2.4.1"
  role: "crm-updater"
  permissions:
    - "crm.read"
    - "crm.write"
  environment: "production"
  mcp_servers:
    - url: "https://mcp.internal.corp/crm"
      auth: vault://agents/crm-mcp-token
```

### How They Deploy

- **Primary**: Kubernetes (on-prem or managed) — 60-70%
- **Pattern**: AI Gateway layer → Agent pod → MCP proxy → Real tools
- **Infrastructure**: Dedicated node pools for AI workloads, GPU/CPU isolation
- **Security review**: Every new agent requires security team sign-off (when process exists)
- **GitOps**: Agent configs in Git, reviewed, approved, deployed to K8s

```
[GitOps repo] → [CI/CD] → [K8s] 
                              ↓
                    [Agent pods (isolated namespaces)]
                              ↓
                    [Service mesh (mTLS)] 
                              ↓
                    [MCP Gateway / AI Gateway]
                              ↓
                    [Vault] → [API credentials]
                              ↓
                    [Tool endpoints / MCP servers]
                              ↓
                    [SIEM / Audit log]
```

### How They Handle Permissions Today

**Reality**: Best practices exist on paper, 85.6% don't follow them in practice.

```
HashiCorp Vault:
  agents/crm-agent/openai-key: "sk-..." (rotated every 7 days)
  agents/crm-agent/db-password: (rotated daily)
  
IAM Service Account: agent_crm_prod
  - IAM policy: CustomerRecord:GetItem, CustomerRecord:PutItem
  - Deny: CustomerRecord:DeleteItem
  
RBAC (Kubernetes):
  agent ServiceAccount → ClusterRole (agent-crm-role)
  → can access: namespace "agent-prod", secret "crm-creds"
  → cannot: cross-namespace access
```

The problem: this level of control exists for **cloud infrastructure** permissions, but **not for MCP tools and agent actions**. There's no equivalent of IAM for "Agent X can call tool Y with parameter Z."

- Agent identity is emerging (NIST AI Agent Standards, Jan 2026)
- Only 21.9% have distinct agent identities in practice
- 92% cannot enforce agent identity at the execution layer

### Current Pain Points (With Evidence)

1. **85.6% shipped agents without formal security review** (Gravitee 2026 survey)
2. **No MCP governance**: OAuth 2.1 for MCP doesn't exist yet; enterprises blocked from MCP adoption
3. **Shadow AI**: 1,200 unofficial AI apps per enterprise on average; zero visibility
4. **Identity crisis**: IAM designed for humans, not AI agents. Service accounts don't capture agent intent.
5. **Audit gap**: 33% lack audit trails. HIPAA/SOC2/PCI auditors are starting to ask for agent logs.
6. **Inter-agent blindness**: 75.6% can't see agent-to-agent communication
7. **EU AI Act pressure**: Enforcement begins August 2026. Agent audit trails are mandatory.

### MCP Adoption

- ~5-10% have MCP in production, mostly internal tools
- Blockers: no OAuth 2.1 standard yet, no audit trail, no version pinning, no central policy
- **The ask**: "We want MCP but we need the same controls we have for our APIs — auth, RBAC, audit, rate limiting"
- **Current workaround**: Building internal MCP gateways from scratch (6-12 month projects)

### The "Wow" Installation Experience for Enterprise

**Goal**: Drop into existing K8s infrastructure, integrate with SSO and SIEM, no agent code changes required. Security team + platform team onboard together.

**Installation flow** (Self-hosted):
```bash
helm install aegis aegis/aegis-proxy \
  --set auth.provider=okta \
  --set audit.siem=splunk \
  --set vault.address=https://vault.internal.corp
```

**Or** (Cloud-hosted with data residency controls):
```bash
# In existing K8s deployment
env:
  - name: MCP_PROXY_URL
    value: "https://proxy.aegis.dev/sk-ent-key"
  - name: AEGIS_ORG_ID
    value: "acme-corp"
```

**Platform team onboards first**:
- Connect SSO (Okta, Azure AD) — 30 minutes
- Import agent inventory from Kubernetes (auto-discover running agents)
- Connect SIEM for audit export (Splunk, Datadog, ElasticSearch)
- Set default-deny policy: all new agents get zero tool access until explicitly granted

**Security team activates**:
- Reviews agent inventory: "I didn't know we had 47 agents running"
- Policy editor: write enforcement rules in YAML or visual builder
- Audit log: searchable, filterable, exportable
- Alert routing: critical alerts → PagerDuty; standard alerts → Slack

**The "oh shit" moment for enterprise**:
```
Security dashboard (first login):
"47 agents discovered — 41 have no formal identity
 12 agents connected to unregistered MCP servers
 3 agents have no cost limits
 1 agent attempted to access payment data (BLOCKED)
  
 Start with the 12 unauthorized MCP connections →"
```

**Permission creation for enterprise**: Dashboard-first with GitOps export.

1. Security team creates policy in dashboard visual builder
2. Exports as YAML: `agent-policy-crm.yaml`
3. Checks into GitOps repo → reviewed by security team → deployed via CI/CD
4. Agent is now governed without any code change

```yaml
# Aegis policy (checked into Git)
apiVersion: aegis.dev/v1
kind: AgentPolicy
metadata:
  name: crm-agent-policy
  namespace: production
spec:
  agent:
    id: "agent-crm-*"          # glob pattern
    role: "crm-updater"
  mcp_servers:
    allow:
      - url: "https://mcp.internal.corp/crm"
        tools: ["read_customer", "update_customer"]
      - url: "https://mcp.internal.corp/email"
        tools: ["send_email"]
    deny:
      - url: "*"                # deny all other MCP servers
  tool_calls:
    require_approval: ["customer.bulk_delete", "payment.*"]
    block: ["admin.*", "infrastructure.*"]
  limits:
    daily_cost_usd: 200
    calls_per_minute: 100
  audit:
    export_to: "splunk://audit-ai-agents"
    retention_days: 365         # SOC2 compliance
```

---

## Cross-Persona: Where Aegis Fits in Each Flow

### Code-First vs. Dashboard-First

| Persona | Primary config method | Why |
|---------|----------------------|-----|
| Indie | Code (SDK params) | No ops team; code IS the config |
| Startup | Code + Dashboard | Team has non-technical stakeholders; policies shared |
| Enterprise | Dashboard → GitOps export | Security team owns policy; code teams consume |

### How Permissions Flow From Day One

```
INDIE:
  Agent code → aegis.wrap(tools, block_destructive=True)
  → No dashboard setup needed
  → Can graduate to YAML policies later

STARTUP:
  Team creates policy in dashboard OR
  Engineer writes policy in code
  → Both methods write to same policy store
  → Dashboard shows live enforcement status

ENTERPRISE:
  Security team writes policy (dashboard or YAML)
  → Checked into GitOps
  → CI/CD deploys policy
  → Agent code unchanged
  → Agent automatically governed
```

### Installation Paths by Persona

```
INDIE — Path 1: SDK Only
  npm install @aegis/langchain  (or pip install aegis-sdk for Python)
  Add 2 lines → run agent → "oh shit" moment in 5 min
  No proxy, no Docker, no signup required for local testing
  Free tier forever for single-agent hobbyists

STARTUP — Path 2: SDK + Cloud Proxy
  npm install @aegis/langchain + AEGIS_PROXY_URL env var
  All Path 1 features + MCP auth + server allowlists
  No Docker; uses Aegis hosted proxy
  Team dashboard activated immediately

ENTERPRISE — Path 3: Self-Hosted Proxy
  helm install aegis-proxy
  SSO + SIEM + Vault integration
  GitOps policy management
  Data never leaves their infrastructure
  Security team onboards first; engineers follow
```

---

## Agent Identity: The Emerging Standard

### Why "Agent Identity" Matters

Agents must be first-class security principals — not just "a process running with the developer's API key."

| Without Agent Identity | With Agent Identity (Aegis) |
|------------------------|----------------------------|
| Agent = developer's credentials | Agent has unique identity: `agent-prod-crm-001` |
| Can't audit what agent did vs. developer | Full audit trail per agent |
| Can't revoke agent access without breaking dev tools | Revoke agent token; dev continues working |
| Agent inherits all developer's permissions | Agent has minimal necessary permissions |
| Cost billed to organization | Cost attributed to specific agent |

### Identity Components in Aegis

```yaml
agent:
  id: "agent-prod-crm-updater-001"   # unique, immutable
  role: "crm-updater"                 # maps to capability profile
  environment: "production"           # prod vs. staging vs. dev
  owner: "sales-automation-team"      # for billing and alerting
  created_at: "2026-04-18T10:00:00Z"
  credentials:
    type: "short-lived-token"         # rotated every 24h
    scopes: ["crm.read", "crm.write"]
```

### How Identity Is Created Per Persona

**Indie**: Auto-generated from `AegisSDK()` initialization. One token per agent file.

**Startup**: Created in dashboard with role assignment. Engineers reference by name in code:
```python
aegis = AegisSDK(agent_id="crm-agent-prod")  # pulls policy from cloud
```

**Enterprise**: Created via GitOps declaration. Aegis issues short-lived tokens at pod startup via Vault integration:
```yaml
annotations:
  aegis.dev/agent-id: "agent-prod-crm-001"
  aegis.dev/policy: "crm-agent-policy"
  vault.hashicorp.com/agent-inject: "true"  # Vault injects Aegis token at startup
```

---

## Framework Integration Reference

### LangChain / LangGraph (47M downloads/month)

```python
from langchain.agents import create_react_agent
from aegis.integrations.langchain import AegisCallbackHandler, aegis_tools

agent = create_react_agent(
    llm=llm,
    tools=aegis_tools(tools, agent_id="crm-agent"),  # wrap tools
    callbacks=[AegisCallbackHandler()]                # capture traces
)
```

### CrewAI (5.2M downloads/month)

```python
from crewai import Agent, Crew
from aegis.integrations.crewai import AegisCrewMonitor

crew = Crew(
    agents=[agent1, agent2],
    tasks=[task1, task2],
    callbacks=[AegisCrewMonitor(team_id="my-startup")]
)
```

### OpenAI Assistants API

```python
from openai import OpenAI
from aegis.integrations.openai import aegis_functions

client = OpenAI()
assistant = client.beta.assistants.create(
    tools=aegis_functions(my_tools, agent_id="support-assistant"),
    model="gpt-4o"
)
```

### Bedrock Agents (AWS)

```python
# Aegis MCP proxy intercepts at network layer
# No SDK changes needed for Bedrock
# Set proxy in Bedrock agent config:
# mcp_endpoint: "https://proxy.aegis.dev/sk-key/mcp"
```

---

## Open Questions for Validation

These require design partner conversations to validate:

| Question | Why It Matters | Priority |
|---------|---------------|---------|
| Do indie devs discover Aegis via CLI scanner (`npx aegis-scan`) or SDK? | Shapes GTM sequence | High |
| Do startups want code-first policy or dashboard-first? | Shapes onboarding flow | High |
| Will enterprises accept cloud-hosted proxy or require self-hosted from day one? | Shapes infrastructure build order | High |
| What's the first MCP server most startups connect? | Shapes which integrations to prioritize | Medium |
| Does the "oh shit" moment require the dashboard or can it happen via CLI/email? | Shapes free tier design | Medium |
| How long does enterprise security review take to approve a proxy? | Shapes sales cycle estimate | Medium |
