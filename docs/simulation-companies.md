# Fictional Company Profiles for Simulation

*Realistic AI agent deployment scenarios based on market research*

---

## Company 1: Meridian Financial Services

### Company Profile

| Attribute | Details |
|-----------|---------|
| **Industry** | Fintech / Wealth Management |
| **Size** | 450 employees |
| **Revenue** | $85M ARR |
| **Location** | Boston, MA (HQ) + remote |
| **Tech Stack** | AWS, Kubernetes (EKS), Python, PostgreSQL |
| **Compliance** | SOC 2 Type II, working toward SEC/FINRA AI guidelines |

### The AI Team

```
Engineering (45 people)
├── Platform Team (8)
│   └── Manages K8s, observability, CI/CD
├── ML/AI Team (6)
│   ├── 2 ML Engineers (model fine-tuning)
│   ├── 2 AI Engineers (agent development)
│   └── 2 Data Scientists (analytics)
├── Backend Team (15)
└── Frontend Team (10)

Security (4 people)
├── 1 CISO (reports to CEO)
├── 2 Security Engineers
└── 1 Compliance Manager
```

### Their AI Agents

#### Agent 1: Portfolio Research Assistant
**Framework:** LangChain + LangGraph
**Deployed:** 6 months ago
**Users:** 120 financial advisors

```
Purpose: Help advisors research stocks, summarize earnings calls,
         generate investment thesis documents

Architecture:
┌─────────────────────────────────────────────────────────────┐
│  EKS Cluster                                                 │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  portfolio-research-agent (3 replicas)               │    │
│  │  - LangGraph workflow                                │    │
│  │  - Tools: web_search, document_reader, calculator    │    │
│  │  - Memory: Redis                                     │    │
│  └────────────────────────┬────────────────────────────┘    │
│                           │                                  │
│  ┌────────────────────────▼────────────────────────────┐    │
│  │  LiteLLM Proxy (cost tracking, rate limiting)        │    │
│  └────────────────────────┬────────────────────────────┘    │
│                           │                                  │
└───────────────────────────┼─────────────────────────────────┘
                            │
              ┌─────────────▼─────────────┐
              │  OpenAI API (GPT-4o)      │
              │  ~$8,000/month            │
              └───────────────────────────┘

Tools:
- web_search: Tavily API for real-time market data
- document_reader: Internal S3 bucket with earnings reports
- calculator: Financial calculations (DCF, ratios)
- report_generator: Creates PDF investment memos
```

**Current Security Posture:**
- LiteLLM handles rate limiting and cost tracking
- No prompt injection detection
- No policy enforcement on tool calls
- Logging exists but not monitored actively
- "We'll add security later" - actual quote from AI team lead

**What Could Go Wrong:**
- Advisor asks agent to "email this analysis to client" → agent has SMTP access
- Malicious document in S3 contains prompt injection → agent follows embedded instructions
- Agent generates investment advice that violates compliance rules → no guardrails

#### Agent 2: Client Communication Drafter
**Framework:** Custom Python + OpenAI SDK
**Deployed:** 3 months ago
**Users:** 45 client service reps

```
Purpose: Draft personalized client emails, meeting summaries,
         quarterly review documents

Architecture:
┌─────────────────────────────────────────────────────────────┐
│  EKS Cluster                                                 │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  client-comms-agent (2 replicas)                     │    │
│  │  - Custom Python (no framework)                      │    │
│  │  - Direct OpenAI calls                               │    │
│  │  - Tools: email_draft, crm_lookup, calendar_check   │    │
│  └────────────────────────┬────────────────────────────┘    │
│                           │                                  │
│              (NO PROXY - direct to OpenAI!)                 │
│                           │                                  │
└───────────────────────────┼─────────────────────────────────┘
                            │
              ┌─────────────▼─────────────┐
              │  OpenAI API               │
              │  (API key in env var)     │
              │  ~$3,000/month            │
              └───────────────────────────┘

Tools:
- email_draft: Drafts emails (human reviews before send)
- crm_lookup: Queries Salesforce for client history
- calendar_check: Reads advisor calendars
- document_fetch: Pulls client statements from document store
```

**Current Security Posture:**
- ZERO security controls
- API key shared across all instances
- No logging of prompts/responses
- Built by a backend engineer in 2 weeks
- Security team doesn't know this exists (shadow AI)

**What Could Go Wrong:**
- CRM contains sensitive client data → agent can read all of it
- No PII detection → agent might include SSN/account numbers in drafts
- Prompt injection via client name field in CRM
- Cost explosion if agent loops

#### Agent 3: Compliance Document Analyzer (Pilot)
**Framework:** LangGraph
**Deployed:** 2 weeks ago (pilot)
**Users:** 4 compliance team members

```
Purpose: Analyze regulatory filings, flag potential issues,
         summarize compliance requirements

Architecture:
┌─────────────────────────────────────────────────────────────┐
│  Single EC2 Instance (not in K8s yet - "just a pilot")      │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  compliance-analyzer                                 │    │
│  │  - LangGraph                                         │    │
│  │  - RAG over regulatory documents                     │    │
│  │  - Tools: pdf_reader, regulation_search, risk_scorer │    │
│  └────────────────────────┬────────────────────────────┘    │
│                           │                                  │
│              (Direct API calls)                              │
└───────────────────────────┼─────────────────────────────────┘
                            │
              ┌─────────────▼─────────────┐
              │  Anthropic API (Claude)   │
              │  ~$1,500/month            │
              └───────────────────────────┘
```

**Current Security Posture:**
- "It's just a pilot, we'll secure it before production"
- Running on engineer's personal AWS account
- Claude API key hardcoded in config file
- No access controls (anyone with SSH can use it)

### Meridian's Pain Points

1. **No unified view** - 3 agents, 3 different setups, no central dashboard
2. **Shadow AI** - Security doesn't know about Agent 2
3. **Cost tracking** - Finance complains about unpredictable OpenAI bills
4. **Compliance risk** - No audit trail for AI-assisted decisions
5. **Tool sprawl** - Each agent has different tools with different access levels
6. **No kill switch** - If agent goes rogue, have to SSH and kill process

### What Rind Would Provide

```yaml
# meridian-policies.yaml
policies:
  # All agents route through Rind
  - name: global-pii-protection
    match:
      agent_id: "*"
    actions:
      pii_detection:
        enabled: true
        redact: [ssn, account_number, dob]
        log_violations: true

  - name: financial-advice-guardrail
    match:
      agent_id: "portfolio-research-*"
    actions:
      content_filter:
        block_patterns:
          - "you should buy"
          - "guaranteed returns"
          - "risk-free investment"
        reason: "Compliance: Cannot provide direct investment advice"

  - name: email-requires-approval
    match:
      tool_name: "email_send"
    actions:
      require_approval:
        approvers: ["compliance-team"]
        timeout: "24h"

  - name: cost-limits
    match:
      agent_id: "*"
    actions:
      budget:
        daily_max: 500
        monthly_max: 15000
        alert_at: [50, 80, 100]
```

---

## Company 2: Nimbus SaaS (B2B Software)

### Company Profile

| Attribute | Details |
|-----------|---------|
| **Industry** | B2B SaaS (Project Management) |
| **Size** | 180 employees |
| **Revenue** | $25M ARR |
| **Location** | San Francisco (remote-first) |
| **Tech Stack** | GCP, Cloud Run, TypeScript/Node.js, MongoDB |
| **Compliance** | SOC 2 Type I (working on Type II) |

### The AI Team

```
Engineering (35 people)
├── Platform Team (4)
│   └── GCP, CI/CD, infrastructure
├── AI Team (3)
│   ├── 1 AI Lead (ex-Google)
│   └── 2 AI Engineers
├── Product Engineering (20)
└── DevOps (2)

No dedicated security team
- CISO responsibilities fall on VP Engineering
- Use third-party security tools (Snyk, Wiz)
```

### Their AI Agents

#### Agent 1: AI Project Assistant (Customer-Facing)
**Framework:** LangChain
**Deployed:** 4 months ago
**Users:** 12,000 customers (freemium + paid)

```
Purpose: Help customers manage projects - create tasks, set priorities,
         summarize project status, suggest next actions

Architecture:
┌─────────────────────────────────────────────────────────────┐
│  GCP Cloud Run                                               │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  project-assistant (auto-scaling 2-50 instances)     │    │
│  │  - LangChain + TypeScript                            │    │
│  │  - Tools: create_task, update_task, query_projects   │    │
│  │  - Per-tenant isolation via workspace_id             │    │
│  └────────────────────────┬────────────────────────────┘    │
│                           │                                  │
│  ┌────────────────────────▼────────────────────────────┐    │
│  │  Custom API Proxy (rate limiting by tier)            │    │
│  │  - Free: 50 requests/day                             │    │
│  │  - Pro: 500 requests/day                             │    │
│  │  - Enterprise: unlimited                             │    │
│  └────────────────────────┬────────────────────────────┘    │
└───────────────────────────┼─────────────────────────────────┘
                            │
              ┌─────────────▼─────────────┐
              │  OpenAI API (GPT-4o-mini) │
              │  ~$15,000/month           │
              └───────────────────────────┘

Tools (scoped per customer):
- create_task: Creates task in customer's workspace
- update_task: Updates task status/priority
- query_projects: Reads project data (customer's only)
- generate_report: Creates project summary
- send_notification: Slack/email notifications
```

**Current Security Posture:**
- Rate limiting per pricing tier
- Tenant isolation via workspace_id filtering
- Basic input validation (length limits)
- No prompt injection detection
- No content filtering on outputs
- Logging to BigQuery (but not monitored)

**What Could Go Wrong:**
- Prompt injection via task descriptions → agent acts on malicious instructions
- Customer A tricks agent into accessing Customer B's data (tenant escape)
- Agent generates harmful content in project summaries
- Recursive task creation → cost explosion
- Agent sends notifications to wrong recipients

#### Agent 2: Internal Support Bot
**Framework:** CrewAI
**Deployed:** 2 months ago
**Users:** All employees (internal)

```
Purpose: Answer employee questions about HR policies, IT support,
         product documentation, onboarding

Architecture:
┌─────────────────────────────────────────────────────────────┐
│  GCP Cloud Run                                               │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  internal-support-crew                               │    │
│  │  - CrewAI with 3 specialized agents:                 │    │
│  │    - HR Agent (policies, benefits)                   │    │
│  │    - IT Agent (tech support, access)                 │    │
│  │    - Product Agent (documentation, features)         │    │
│  └────────────────────────┬────────────────────────────┘    │
│                           │                                  │
│  ┌────────────────────────▼────────────────────────────┐    │
│  │  Shared RAG (Pinecone)                               │    │
│  │  - HR docs, IT runbooks, product docs                │    │
│  └────────────────────────┬────────────────────────────┘    │
└───────────────────────────┼─────────────────────────────────┘
                            │
              ┌─────────────▼─────────────┐
              │  OpenAI API (GPT-4o)      │
              │  ~$2,000/month            │
              └───────────────────────────┘

CrewAI Agents:
┌─────────────────────────────────────────────────────────────┐
│  Crew: Internal Support                                      │
├─────────────────────────────────────────────────────────────┤
│  ┌────────────┐  ┌────────────┐  ┌────────────┐            │
│  │ HR Agent   │  │ IT Agent   │  │ Product    │            │
│  │            │  │            │  │ Agent      │            │
│  │ Tools:     │  │ Tools:     │  │ Tools:     │            │
│  │ -hr_search │  │ -ticket    │  │ -doc_search│            │
│  │ -policy_   │  │ -reset_pwd │  │ -feature_  │            │
│  │  lookup    │  │ -access_req│  │  lookup    │            │
│  └────────────┘  └────────────┘  └────────────┘            │
│                                                              │
│  Manager Agent (routes to appropriate specialist)           │
└─────────────────────────────────────────────────────────────┘
```

**Current Security Posture:**
- Internal only (Google OAuth)
- No audit logging
- IT Agent can reset passwords (!!)
- IT Agent can request access (!!)
- "It's internal, we trust our employees"

**What Could Go Wrong:**
- Employee asks "Reset John's password" → agent does it (no verification)
- Prompt injection via HR doc content
- Agent reveals salary information from HR docs
- IT agent grants access to systems without proper approval

#### Agent 3: Code Review Assistant (Engineering)
**Framework:** Custom + Claude API
**Deployed:** 1 month ago
**Users:** 30 engineers

```
Purpose: Review PRs, suggest improvements, check for security issues,
         generate documentation

Architecture:
┌─────────────────────────────────────────────────────────────┐
│  GitHub Actions                                              │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  code-review-bot                                     │    │
│  │  - Triggered on PR creation                          │    │
│  │  - Reads diff, comments on PR                        │    │
│  │  - Tools: read_file, suggest_change, add_comment    │    │
│  └────────────────────────┬────────────────────────────┘    │
│                           │                                  │
└───────────────────────────┼─────────────────────────────────┘
                            │
              ┌─────────────▼─────────────┐
              │  Anthropic API (Claude)   │
              │  ~$800/month              │
              └───────────────────────────┘
```

**Current Security Posture:**
- GitHub token has write access to all repos
- No rate limiting
- API key in GitHub secrets (good)
- No content filtering on suggestions
- Can see all code (including secrets that slip through)

**What Could Go Wrong:**
- Agent comments on PR with code that introduces vulnerabilities
- Sees API keys in code, could potentially leak in comments
- Malicious PR description with prompt injection
- Agent auto-merges PR (if given permission)

### Nimbus's Pain Points

1. **Customer-facing risk** - If AI Project Assistant fails, customers see it
2. **Tenant isolation anxiety** - "Are we sure Customer A can't see Customer B's data?"
3. **Internal agent has too much power** - IT agent shouldn't reset passwords
4. **No visibility** - "We have 3 agents but no idea what they're actually doing"
5. **SOC 2 auditors asking questions** - "Show us your AI governance controls"
6. **Cost unpredictability** - Customer-facing agent costs vary wildly

### What Rind Would Provide

```yaml
# nimbus-policies.yaml
policies:
  # Customer-facing agent - strict isolation
  - name: tenant-isolation
    match:
      agent_id: "project-assistant-*"
    conditions:
      - field: tool_input.workspace_id
        operator: equals
        value: "@context.user.workspace_id"
    actions:
      allow: true
      audit:
        level: detailed

  - name: block-cross-tenant
    match:
      agent_id: "project-assistant-*"
    conditions:
      - field: tool_input.workspace_id
        operator: not_equals
        value: "@context.user.workspace_id"
    actions:
      deny: true
      alert:
        severity: critical
        channel: security-team

  # Internal agent - require approval for sensitive actions
  - name: password-reset-approval
    match:
      tool_name: "reset_password"
    actions:
      require_approval:
        approvers: ["it-manager@nimbus.io"]
        timeout: "1h"

  - name: access-request-approval
    match:
      tool_name: "access_request"
    actions:
      require_approval:
        approvers: ["security@nimbus.io"]
        audit: true
```

---

## Company 3: Healix Medical Group

### Company Profile

| Attribute | Details |
|-----------|---------|
| **Industry** | Healthcare / Medical Practice Management |
| **Size** | 280 employees |
| **Revenue** | $45M |
| **Location** | Chicago, IL (3 clinic locations) |
| **Tech Stack** | Azure, AKS, .NET Core, SQL Server |
| **Compliance** | HIPAA, SOC 2, state healthcare regulations |

### The AI Team

```
IT Department (12 people)
├── Infrastructure (4)
│   └── Azure, networking, security
├── Development (5)
│   └── EMR integrations, internal tools
├── AI Initiative (2) - NEW
│   ├── 1 AI Lead (promoted from Dev)
│   └── 1 Data Analyst
└── Help Desk (3)

Compliance (3 people)
├── 1 Compliance Officer (HIPAA expert)
├── 1 Privacy Officer
└── 1 Audit Coordinator

Security: Outsourced to MSSP
```

### Their AI Agents

#### Agent 1: Clinical Documentation Assistant
**Framework:** Azure OpenAI + LangChain
**Deployed:** 3 months ago (limited pilot)
**Users:** 8 physicians (pilot group)

```
Purpose: Transcribe patient encounters, generate clinical notes,
         suggest ICD-10 codes, draft referral letters

Architecture:
┌─────────────────────────────────────────────────────────────┐
│  Azure AKS Cluster                                           │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  clinical-docs-assistant                             │    │
│  │  - LangChain (Python)                                │    │
│  │  - Azure Speech-to-Text for transcription            │    │
│  │  - Tools: search_patient, update_chart, code_lookup │    │
│  │  - HIPAA logging enabled                             │    │
│  └────────────────────────┬────────────────────────────┘    │
│                           │                                  │
│  ┌────────────────────────▼────────────────────────────┐    │
│  │  Azure API Management (logging, auth)                │    │
│  └────────────────────────┬────────────────────────────┘    │
│                           │                                  │
│  ┌────────────────────────▼────────────────────────────┐    │
│  │  Azure OpenAI (GPT-4) - data stays in Azure         │    │
│  │  ~$5,000/month                                       │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘

Tools (all access PHI):
- search_patient: Query patient records by MRN
- update_chart: Write clinical notes to EMR
- code_lookup: ICD-10/CPT code suggestions
- referral_draft: Generate referral letters
- lab_results: Pull recent lab results
```

**Current Security Posture:**
- Azure OpenAI (data stays in Azure tenant) ✓
- Azure APIM logging ✓
- HIPAA BAA with Microsoft ✓
- Role-based access (only pilot physicians) ✓
- BUT: No AI-specific guardrails
- No minimum necessary enforcement
- No audit of what PHI the agent accesses
- Compliance team nervous but approved pilot

**What Could Go Wrong:**
- Agent accesses patient records not relevant to current encounter (HIPAA violation)
- Prompt injection via patient's chief complaint field
- Agent hallucinates medication dosages
- Agent generates note that's medically incorrect
- Referral letter sent to wrong provider

#### Agent 2: Prior Authorization Helper
**Framework:** Custom .NET + Azure OpenAI
**Deployed:** 6 weeks ago
**Users:** 5 billing staff

```
Purpose: Help staff complete prior authorization forms,
         gather supporting documentation, draft appeal letters

Architecture:
┌─────────────────────────────────────────────────────────────┐
│  Azure App Service                                           │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  prior-auth-assistant                                │    │
│  │  - .NET 8 + Semantic Kernel                          │    │
│  │  - Tools: patient_lookup, insurance_check,          │    │
│  │           document_gather, form_fill                 │    │
│  └────────────────────────┬────────────────────────────┘    │
│                           │                                  │
│              (Direct Azure OpenAI calls)                    │
└───────────────────────────┼─────────────────────────────────┘
                            │
              ┌─────────────▼─────────────┐
              │  Azure OpenAI (GPT-4)     │
              │  ~$1,500/month            │
              └───────────────────────────┘

Tools:
- patient_lookup: Get patient demographics, insurance
- insurance_check: Query insurance eligibility
- document_gather: Pull clinical docs for authorization
- form_fill: Auto-populate authorization forms
- fax_send: Send forms to insurance (!!!)
```

**Current Security Posture:**
- Azure AD authentication
- Minimal logging
- CAN SEND FAXES without human review
- Accesses sensitive insurance/billing data
- Built quickly to solve "urgent problem"

**What Could Go Wrong:**
- Agent sends PHI to wrong fax number
- Agent includes excessive PHI in authorization (minimum necessary violation)
- Insurance data exposed inappropriately
- Agent makes coverage determinations (practicing medicine?)

#### Agent 3: Patient FAQ Bot (Pilot Planning)
**Framework:** TBD
**Status:** Evaluating, not deployed

```
Purpose: Answer patient questions via website/portal
         about appointments, billing, general health info

Concerns blocking deployment:
- Can't give medical advice
- Can't access PHI without patient authentication
- HIPAA implications unclear
- Compliance Officer has concerns
- "What if patient asks about their condition?"
```

### Healix's Pain Points

1. **HIPAA compliance** - "We need to prove AI isn't accessing unnecessary PHI"
2. **Audit trail requirements** - "Auditors want to see every AI interaction"
3. **Minimum necessary** - "Agent should only see data needed for the task"
4. **Human oversight** - "A physician must review before notes go in chart"
5. **Medical accuracy** - "We can't have AI hallucinating medication dosages"
6. **Patient-facing fear** - "We want to launch patient FAQ but compliance says no"

### What Rind Would Provide

```yaml
# healix-policies.yaml
policies:
  # Enforce minimum necessary access
  - name: minimum-necessary-patient-access
    match:
      tool_name: "search_patient"
    conditions:
      - field: context.current_patient_mrn
        operator: equals
        value: tool_input.patient_mrn
    actions:
      allow: true
      audit:
        level: hipaa
        include_phi_access: true

  - name: block-unnecessary-patient-access
    match:
      tool_name: "search_patient"
    conditions:
      - field: context.current_patient_mrn
        operator: not_equals
        value: tool_input.patient_mrn
    actions:
      deny: true
      alert:
        severity: critical
        reason: "HIPAA: Attempted access to non-current patient"

  # Require physician review for chart updates
  - name: chart-update-requires-review
    match:
      tool_name: "update_chart"
    actions:
      require_approval:
        approvers: ["@context.attending_physician"]
        timeout: "24h"
        on_timeout: "deny"

  # Block fax without human confirmation
  - name: fax-requires-confirmation
    match:
      tool_name: "fax_send"
    actions:
      require_approval:
        approvers: ["@context.user"]
        show_preview: true
        message: "Please verify fax number and contents"

  # Medical content guardrails
  - name: medical-accuracy-check
    match:
      agent_id: "clinical-docs-*"
      request_type: "llm_response"
    actions:
      content_filter:
        flag_patterns:
          - medication_dosage  # Flag for physician review
          - diagnosis_statement
          - treatment_recommendation
        action: "add_disclaimer"
        disclaimer: "[AI-GENERATED: Requires physician verification]"

  # Compliance audit logging
  - name: hipaa-audit-trail
    match:
      agent_id: "*"
    actions:
      audit:
        level: detailed
        retention: "7 years"
        include:
          - user_id
          - patient_mrn (if applicable)
          - action_taken
          - phi_accessed
          - timestamp
          - justification
```

---

## Summary: Agent Types Across Companies

| Company | Agent | Framework | Type | Risk Level |
|---------|-------|-----------|------|------------|
| **Meridian** | Portfolio Research | LangGraph | Agentic workflow | High (financial) |
| **Meridian** | Client Comms | Custom + OpenAI | Simple chain | Medium |
| **Meridian** | Compliance Analyzer | LangGraph | RAG + Analysis | High (regulatory) |
| **Nimbus** | Project Assistant | LangChain | Customer-facing | Critical (multi-tenant) |
| **Nimbus** | Support Bot | CrewAI | Multi-agent | High (internal access) |
| **Nimbus** | Code Review | Custom + Claude | CI/CD integration | Medium |
| **Healix** | Clinical Docs | LangChain + Azure | PHI handling | Critical (HIPAA) |
| **Healix** | Prior Auth | Semantic Kernel | Workflow automation | High (PHI + fax) |

### Common Patterns

1. **Most agents are LangChain/LangGraph** - It's the dominant framework
2. **Many have "shadow" agents** - Built without security review
3. **Tool access is overpermissioned** - "Just make it work"
4. **Observability is afterthought** - Logging exists, monitoring doesn't
5. **No policy enforcement** - Trust the prompt, hope for the best
6. **Human oversight is manual** - Review everything or review nothing

### Simulation Priority

| Priority | Scenario | Represents |
|----------|----------|------------|
| **P1** | Nimbus Project Assistant | Customer-facing SaaS agent |
| **P1** | Meridian Portfolio Research | Enterprise K8s + LangGraph |
| **P2** | Nimbus Support Bot (CrewAI) | Multi-agent internal |
| **P2** | Healix Clinical Docs | Regulated industry (HIPAA) |
| **P3** | Code Review Bot | CI/CD integration |

---

## Docker Compose for Simulation

```yaml
# docker-compose.simulation.yml
version: '3.8'

services:
  # Simulates Nimbus Project Assistant
  nimbus-agent:
    build: ./agents/nimbus-project-assistant
    environment:
      - OPENAI_API_KEY=${OPENAI_KEY}
      - RIND_ENABLED=${RIND_ENABLED:-false}
    depends_on:
      - nimbus-db
      - rind-proxy

  nimbus-db:
    image: mongo:7
    volumes:
      - ./data/nimbus:/data/db

  # Simulates Meridian Portfolio Agent
  meridian-agent:
    build: ./agents/meridian-portfolio
    environment:
      - OPENAI_API_KEY=${OPENAI_KEY}
      - RIND_ENABLED=${RIND_ENABLED:-false}
    depends_on:
      - redis
      - rind-proxy

  redis:
    image: redis:7-alpine

  # Simulates multi-agent (CrewAI)
  crewai-support:
    build: ./agents/crewai-support
    environment:
      - OPENAI_API_KEY=${OPENAI_KEY}
      - RIND_ENABLED=${RIND_ENABLED:-false}

  # Rind components
  rind-proxy:
    image: rind/proxy:latest
    ports:
      - "8080:8080"
    volumes:
      - ./policies:/etc/rind/policies

  rind-dashboard:
    image: rind/dashboard:latest
    ports:
      - "3000:3000"
    depends_on:
      - rind-proxy

  # Mock LLM for testing (avoid API costs)
  mock-llm:
    image: rind/mock-llm:latest
    ports:
      - "4000:4000"
```

---

*These fictional companies represent realistic deployment patterns observed in the market research. Use them for simulation, demos, and design partner conversations.*
