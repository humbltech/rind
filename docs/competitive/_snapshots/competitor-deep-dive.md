# AI Security & Observability Competitor Analysis
## Deep-Dive Market Research Report - March 2026

---

## Executive Summary

The AI security and observability market has undergone significant consolidation in 2025-2026, with major acquisitions reshaping the competitive landscape:
- **Lakera** acquired by Check Point (November 2025)
- **Prompt Security** acquired by SentinelOne (~$180M, September 2025)
- **CalypsoAI** acquired by F5 ($180M, November 2025)

This report provides a comprehensive analysis of 8 major competitors across AI security guardrails, LLM observability, and AI governance.

---

## Table of Contents

1. [Lakera Guard](#1-lakera-guard)
2. [Prompt Security](#2-prompt-security)
3. [CalypsoAI (F5)](#3-calypsoai-f5)
4. [Datadog LLM Observability](#4-datadog-llm-observability)
5. [Arize AI / Phoenix](#5-arize-ai--phoenix)
6. [LangSmith (LangChain)](#6-langsmith-langchain)
7. [Credo AI](#7-credo-ai)
8. [Wiz AI-SPM](#8-wiz-ai-spm)
9. [Competitive Positioning Matrix](#9-competitive-positioning-matrix)
10. [Market Opportunities](#10-market-opportunities)

---

## 1. Lakera Guard

### Company Overview
| Attribute | Details |
|-----------|---------|
| **Headquarters** | Zurich, Switzerland & San Francisco, CA |
| **Founded** | 2021 |
| **Team Size** | 52 employees (2025) |
| **Total Funding** | $30M (Series A) |
| **Key Investors** | Atomico, Citi Ventures, Redalpine, Fly Ventures, Dropbox Ventures |
| **Status** | Acquired by Check Point (November 2025) |

### Exact Features

**Core Security Capabilities:**
- **Prompt Injection Detection**: 99.2% accuracy detecting direct hijacking, obfuscated jailbreaks, indirect injections, role-playing attacks, and context manipulation
- **Data Leakage Prevention**: PII detection and redaction, API key protection, proprietary data safeguarding
- **Content Moderation**: Toxic/harmful content blocking, violent/dangerous content detection
- **Advanced PII Detection & DLP**: Enterprise-grade data loss prevention
- **Multi-language Support**: Content screening across 100+ languages and scripts

**Performance Specifications:**
- Sub-50ms latency for threat assessment
- 98%+ detection rates
- False positive rates below 0.5%
- ML models trained on 50,000+ attack patterns
- Detection models learn from 100K+ new adversarial samples daily

**Red Teaming (Lakera Red):**
- Automated adversarial testing during development
- Continuous security assessment

### Architecture / How It Works

**Deployment Options:**
1. **SaaS (Cloud-hosted)**: Enterprise-grade cloud solution with API key authentication
2. **Self-hosted**: Docker container deployment as internal service, no API keys required

**Integration Pattern:**
- Functions as a "firewall" between AI applications and users
- Inspects prompts going in and responses coming out
- Single API endpoint (`/v2/guard`) for all defenses
- Sub-200ms latency for real-time protection

**API Gateway Integration:**
- Kong AI Lakera Guard plugin available
- Inspects traffic at three points in LLM request lifecycle
- Can block unsafe content before reaching upstream LLMs

### Pricing

| Tier | Price | Includes |
|------|-------|----------|
| **Community (Free)** | $0 | 10,000 API requests/month, 8,000 tokens/prompt |
| **Starter** | $99/month | Small teams, increased limits |
| **Enterprise** | Custom | Volume-based, SLA, dedicated support |

### Integrations

- LangChain (via LakeraChainGuard utilities)
- OpenAI models
- Any LangChain-supported LLM provider
- Kong API Gateway
- liteLLM
- Generic REST API integration

### Customer Reviews & Sentiment

**Strengths (from G2 reviews):**
- Essential tool for AI threat protection
- User-friendly and easy to implement
- Real-time security with fast response
- Protects against data leakage and toxic language

**Limitations (from G2 reviews):**
- **Expensive** for some use cases
- **Limited customization options** frustrate users
- Custom allow/deny lists are "temporary measures" not permanent solutions
- G2 profile hasn't been managed for over a year (potentially outdated feedback)

### Gaps/Limitations

1. Performance can lag with very long or complex prompts
2. Pricing doesn't fit all business types
3. Customization is limited - more of a "one-size-fits-all" approach
4. No built-in observability/analytics dashboard
5. Focus on security only - no evaluation or testing capabilities

### Recent Announcements (2025-2026)

- **Check Point Acquisition** (September 2025): Integration into Check Point's Infinity Platform, CloudGuard WAF, and GenAI Protect
- **SOC 2 Type I Compliance**: Achieved AICPA standards
- **Expanded Content Moderation**: Detection of violent and dangerous content
- **Advanced PII Detection**: Enhanced DLP capabilities
- **PINT Benchmark**: First comprehensive prompt injection test benchmark released

---

## 2. Prompt Security

### Company Overview
| Attribute | Details |
|-----------|---------|
| **Headquarters** | Israel |
| **Founded** | August 2023 |
| **Team Size** | 30-50 employees |
| **Total Funding** | $23M ($5M Seed + $18M Series A) |
| **Key Investors** | Jump Capital, Hetz Ventures, Ridge Ventures, Okta, F5 |
| **Status** | Acquired by SentinelOne (~$180M, September 2025) |

### Exact Features

**Core Capabilities:**

1. **Governance & Shadow AI Detection**
   - Visibility into gen AI tool usage across organization
   - LLM-agnostic detection based on usage patterns
   - Identifies thousands of AI tools
   - Define access policies per application and user group

2. **Data Privacy Protection**
   - Contextual LLM-based models for sensitive data detection
   - PII, PHI, and intellectual property redaction
   - On-the-fly data filtering and obfuscation

3. **Safety Controls**
   - Response scrutiny for harmful/toxic content
   - Content policy enforcement

4. **Threat Protection**
   - Prompt injection prevention
   - Data leakage blocking
   - Prompt chaining abuse prevention
   - Unsafe output generation blocking
   - Jailbreak prevention
   - Denial of Wallet attacks
   - RCE protection

5. **MCP Gateway Security**
   - Security between AI applications and 13,000+ known MCP servers

### Architecture / How It Works

**Deployment Options:**
1. Cloud-hosted
2. Self-hosted (VPC)
3. On-premise

**Integration Methods:**
- REST API
- SDK integration
- NVIDIA NeMo Guardrails integration
- Environment variable configuration (e.g., `PS_PROTECT_URL`)

**How It Works:**
- Inspects each prompt and model response in real-time
- Prevents sensitive data exposure
- Blocks harmful content
- Secures against AI-specific attacks

### Pricing

- **Enterprise-grade platform** with custom pricing
- Based on: usage volume, team size, integration depth
- **No free tier or trial** available
- Contact sales required

### Integrations

- OpenAI
- Anthropic
- Google models
- NVIDIA NeMo Guardrails
- Self-hosted/on-prem models
- MCP servers (13,000+)
- SentinelOne Singularity Platform (post-acquisition)

### Customer Reviews & Sentiment

**G2 Reviews - Strengths:**
- Attentive to organizational needs
- High-quality professional support
- Flexible implementation options (on-prem available)
- Exceptional customer service
- Smooth and easy integration

**Limitations:**
- Rapidly changing market leads to fast emergence of new needs
- Enterprise pricing may be prohibitive for SMBs
- Limited public documentation compared to competitors

### Gaps/Limitations

1. No free tier limits accessibility
2. Premium enterprise pricing excludes smaller teams
3. Less established brand compared to Lakera
4. Documentation not as extensive as competitors
5. Now part of SentinelOne - may require broader platform commitment

### Recent Announcements (2025)

- **SentinelOne Acquisition** (August 2025): ~$180M deal completed September 2025
- Integration into SentinelOne's AI-native Singularity Platform
- Part of SentinelOne's GenAI and agentic AI security strategy

---

## 3. CalypsoAI (F5)

### Company Overview
| Attribute | Details |
|-----------|---------|
| **Headquarters** | USA |
| **Founded** | 2018 |
| **Acquisition Price** | $180M by F5 |
| **Status** | Acquired by F5 (November 2025) |
| **Product Name** | F5 AI Guardrails |

### Exact Features

**F5 AI Guardrails:**

1. **Adversarial Threat Protection**
   - Prompt injection blocking
   - Jailbreak attack prevention
   - Real-time threat management
   - 97% harmful prompt blocking rate
   - 95% decision accuracy

2. **Red Team Capabilities (F5 AI Red Team)**
   - Automated adversarial testing
   - Vulnerability database with 10,000+ new attack techniques monthly
   - Scalable red-teaming at enterprise scale
   - Risk scoring for AI systems

3. **Secure Data Guardrails**
   - Sensitive data leakage detection and prevention
   - Policy violation detection at runtime
   - AI interaction auditing across models

4. **Unified Visibility & Governance**
   - Centralized observability
   - Policy control and audit logs
   - GDPR/EU AI Act compliance support
   - Multi-environment support (SaaS, on-prem, hybrid)

5. **Explainability Features**
   - Understanding why AI made specific decisions
   - Audit-ready documentation

### Architecture / How It Works

**Deployment Model:**
- **Proxy-based architecture**: Deploys between users and AI models
- Intercepts prompts before reaching models
- Analyzes outputs before returning to users
- "Front door" of AI interaction

**Integration with F5:**
- Integrated into F5 Application Delivery and Security Platform (ADSP)
- Works alongside BIG-IP load balancers
- Combines with existing WAF and API security
- Traffic routing through CalypsoAI security layers

**Key Approach:**
- "Test-Defend-Observe" stack
- Model-agnostic runtime protection
- Spans clouds, edges, and hybrid setups

### Pricing

- **Enterprise-focused** with custom pricing
- No public pricing available
- Contact F5 sales for quotes
- Likely bundled with F5 ADSP platform

### Integrations

- F5 Application Delivery and Security Platform (ADSP)
- F5 BIG-IP load balancers
- F5 WAF
- Multi-cloud environments (AWS, Azure, GCP)
- Hybrid deployments

### Customer Reviews & Sentiment

**Strengths:**
- Enterprise-grade solution
- Strong compliance features (GDPR, EU AI Act)
- Explainability is a core feature
- Already deployed at Fortune 500 firms in finance and healthcare
- Part of established F5 ecosystem

**Limitations:**
- Less public feedback available
- Tied to F5 platform
- Enterprise pricing likely excludes smaller organizations

### Gaps/Limitations

1. Requires F5 ecosystem commitment
2. Enterprise-only focus
3. Limited standalone availability post-acquisition
4. Less developer-friendly than API-first competitors
5. Proxy-based approach may add latency

### Recent Announcements (2025-2026)

- **F5 Acquisition Completed** (November 2025): $180M deal
- **F5 AI Guardrails Launch** (January 2026): New product combining CalypsoAI tech with F5 platform
- **F5 AI Red Team Launch** (January 2026): Automated adversarial testing product
- **F5 Labs AI Security Benchmarking**: Model risk leaderboards and threat intelligence

---

## 4. Datadog LLM Observability

### Company Overview
| Attribute | Details |
|-----------|---------|
| **Company** | Datadog, Inc. |
| **Headquarters** | New York, NY |
| **Public Company** | NASDAQ: DDOG |
| **Market Cap** | ~$45B (2025) |
| **LLM Observability GA** | July 2024 |

### Exact Features

**Core Observability:**
- End-to-end tracing across AI agents
- Visibility into inputs, outputs, latency, token usage, and errors
- Step-by-step agent execution visibility
- Root cause investigation for issues

**AI Agent Monitoring (June 2025):**
- Agentic system monitoring
- Third-party agent evaluation
- Agent service maps showing interconnections
- Tool calling and trajectory tracking

**LLM Experiments:**
- Structured experimentation framework
- A/B testing for prompts
- Safe deployment validation

**AI Agents Console:**
- Centralized governance
- Usage pattern analysis
- Impact measurement for AI investments

**Quality & Security Evaluations:**
- Online evals for quality scoring
- Automatic trace clustering
- Failure mode detection
- Security vulnerability detection

**Cost Management:**
- OpenAI spend monitoring
- Token usage tracking
- Cloud cost integration

### Architecture / How It Works

**SDK Support:**
- Python, Node.js, Java
- Automatic instrumentation for supported frameworks

**Automatic Instrumentation:**
- OpenAI
- LangChain
- AWS Bedrock
- Anthropic
- Google Agent Development Kit (2026)

**Deployment Options:**
1. **Datadog Agent**: Standard deployment with existing infrastructure
2. **Direct API**: No agent required, API key authentication
3. **AWS Lambda**: Extension and language layers
4. **OpenTelemetry**: Native OTel GenAI Semantic Conventions support (v1.37+)

**Data Flow:**
- LLM spans captured via SDK
- Async callback handler (no performance impact)
- Distributed collector for traces

### Pricing

| Component | Price |
|-----------|-------|
| **LLM Observability** | Based on LLM span count |
| **Auto-activation** | ~$120/day when LLM spans detected |
| **Sensitive Data Scanner** | 1 GB included per 10K LLM requests |
| **Standalone Available** | Yes, no other Datadog products required |

**Data Retention:**
- Traces: 15 days default
- Metrics: 15 months

### Integrations

**LLM Providers:**
- OpenAI
- Anthropic
- AWS Bedrock
- Google Vertex AI / ADK
- Azure OpenAI

**Frameworks:**
- LangChain
- LlamaIndex
- Strands Agents Framework
- Amazon Bedrock Agents

**Observability:**
- Full OpenTelemetry support
- Correlation with APM traces
- Integration with existing Datadog stack

### Customer Reviews & Sentiment

**G2 Reviews - Strengths:**
- Unified observability platform
- Real-time insights
- Single interface for logs, metrics, traces
- Enhanced troubleshooting efficiency
- Strong existing customer base

**Limitations:**
- **Cost escalation** is the primary complaint
- Becomes expensive quickly with log volume growth
- Custom metrics pricing adds up
- Requires constant governance to manage bills
- Dashboard customization can feel limited
- Advanced visualizations not always straightforward

### Gaps/Limitations

1. **Expensive** - costs can escalate rapidly
2. Lacks robust prompt management compared to LangSmith/Phoenix
3. No side-by-side LLM evaluation interface
4. Basic quality checks vs. specialized platforms
5. Requires Datadog expertise for optimal configuration
6. LLM Observability is add-on to existing platform

### Recent Announcements (2025-2026)

**June 2025:**
- AI Agent Monitoring launch
- LLM Experiments feature
- AI Agents Console for governance

**February 2026:**
- Google Agent Development Kit (ADK) integration
- Enhanced agent decision path visualization
- Tool call tracing improvements

**AWS Partnership:**
- Amazon Bedrock Agents monitoring
- Strands Agents Framework support

---

## 5. Arize AI / Phoenix

### Company Overview
| Attribute | Details |
|-----------|---------|
| **Headquarters** | San Francisco, CA |
| **Founded** | 2020 |
| **Team Size** | 101-250 employees (~135 as of 2025) |
| **Total Funding** | $131M (including $70M Series C) |
| **Key Investors** | Adams Street Partners, M12 (Microsoft), Foundation Capital, Battery Ventures, TCV, Datadog, PagerDuty |
| **Products** | Phoenix (open-source), Arize AX (enterprise) |

### Exact Features

**Phoenix (Open-Source):**

1. **Tracing**
   - OpenTelemetry-based instrumentation
   - Vendor, language, and framework agnostic
   - Support for 20+ frameworks
   - Local-first debugging capability

2. **Evaluation**
   - 50+ research-backed metrics
   - Faithfulness, relevance, safety scoring
   - Hallucination detection
   - LLM-as-judge capabilities

3. **Datasets & Experiments**
   - Versioned datasets
   - Experiment tracking
   - Automatic dataset curation from production traces

4. **Prompt Management**
   - Playground for prompt optimization
   - Model comparison
   - Saved views for collaboration

5. **Agent Visibility**
   - Multi-agent system debugging
   - Dedicated Agents tab
   - Multi-step trajectory analysis
   - Drift detection

**Arize AX (Enterprise):**
- Production monitoring at scale
- Advanced analytics
- Enterprise security features
- Dedicated support

### Architecture / How It Works

**OpenTelemetry Native:**
- Built entirely on OpenTelemetry standards
- `phoenix-otel` package with Phoenix-aware defaults
- `register()` function with `auto_instrument=True`
- Production-ready batching

**Deployment Options:**
1. **Local**: Run `phoenix serve` on machine
2. **Jupyter Notebook**: Embedded development
3. **Docker Container**: Self-hosted production
4. **Phoenix Cloud**: Managed cloud service

**Database:**
- PostgreSQL for Phoenix
- ClickHouse for Arize AX (better scale)

### Pricing

| Tier | Price |
|------|-------|
| **Phoenix (Open-Source)** | FREE |
| **Infrastructure Costs** | $50-500/month (self-hosted) |
| **Phoenix Cloud** | $1/GB-month storage, $19.99/seat/month |
| **Arize AX (Enterprise)** | $50K-100K/year |

### Integrations

**LLM Providers:**
- OpenAI (including GPT-5.4 family)
- Anthropic (Claude Opus 4.6)
- Amazon Bedrock
- Google Vertex AI
- Azure OpenAI
- Groq

**Frameworks:**
- LangChain
- LlamaIndex
- DSPy
- Vercel AI SDK
- CrewAI
- liteLLM

**Development Tools:**
- Cursor (via MCP)
- Claude Code (via MCP)

### Customer Reviews & Sentiment

**Strengths:**
- Open-source with no feature gates
- Responsive engineering/support team
- Quick GitHub issue resolution
- Roadmap reflects user feedback
- Strong evaluation capabilities

**Limitations:**
- Phoenix lacks prompt management features
- Requires engineering involvement for setup
- No end-to-end no-code evaluation workflows
- Arize AI better for production monitoring, Phoenix better for debugging
- Phoenix doesn't scale as well for broader evaluation needs
- Arize AX is proprietary enterprise SaaS

### Gaps/Limitations

1. Phoenix is subset of full Arize platform
2. No prompt versioning in Phoenix interface
3. Lacks pre-deployment simulation/experimentation
4. Requires technical users - not for non-engineers
5. Fine-grained RBAC still developing
6. Management APIs need improvement

### Recent Announcements (2025-2026)

**Observe 2025 Releases:**
- Amazon Bedrock support in Playground
- Prompt Playground with saved views
- Agent Visibility tab launch
- MCP debugging via Cursor/Claude Code
- Phoenix Spaces for team collaboration

**Model Support (2025-2026):**
- GPT-5.4 family
- Claude Opus 4.6 with extended thinking
- Full cost tracking for new models

**Phoenix Cloud:**
- New management and provisioning layer
- Enhanced access control
- Multi-user collaboration

**Phoenix CLI:**
- Terminal commands for prompts, datasets, experiments

---

## 6. LangSmith (LangChain)

### Company Overview
| Attribute | Details |
|-----------|---------|
| **Company** | LangChain, Inc. |
| **Headquarters** | San Francisco, CA |
| **Founded** | 2022 |
| **Team Size** | Growing (35% Fortune 500 usage) |
| **Total Funding** | $150M+ ($25M Series A + $125M Series B) |
| **Valuation** | $1.25B (Unicorn as of October 2025) |
| **Key Investors** | IVP, Sequoia, Benchmark, Amplify, CapitalG, Sapphire Ventures |
| **Revenue** | $16M (October 2025) |

### Exact Features

**Observability:**
- Step-by-step agent execution visibility
- Real-time monitoring and alerting
- Quality scoring with online evals
- Automatic trace analysis and clustering
- Agent-specific metrics (tool calling, trajectory)
- Cost tracking across full agent workflow

**Evaluation:**
- Multi-turn evaluations
- Pairwise annotation queues
- LLM-as-judge capabilities
- Human feedback collection

**Development Tools:**
- LangSmith Fetch CLI (debug from terminal)
- Playground for prompt testing
- Prompt versioning and management

**Deployment:**
- LangGraph Platform (GA May 2025)
- 1-click agent deployment
- Cloud, Hybrid, Self-hosted options
- LangSmith Fleet (agent management)

**Insights Agent:**
- Automated insights on schedule
- Pattern detection
- Anomaly alerting

### Architecture / How It Works

**SDK Support:**
- Python
- TypeScript/JavaScript
- Go
- Java

**Trace Architecture:**
- `RunTree` objects form tree structure
- Async callback handler (no performance impact)
- Distributed collector

**Deployment Options:**
1. **Managed Cloud**: Standard SaaS
2. **BYOC (Bring Your Own Cloud)**: Cloud with data residency
3. **Self-hosted**: Full control

**OpenTelemetry:**
- Can send trace data to OTel
- Can ingest OTel data into LangSmith

### Pricing

| Tier | Price | Includes |
|------|-------|----------|
| **Developer (Free)** | $0 | 5,000 traces/month, 14-day retention, 1 seat |
| **Plus** | $39/user/month | 10K base traces, unlimited seats |
| **Base Traces** | $2.50/1K traces | 14-day retention |
| **Extended Traces** | $5.00/1K traces | 400-day retention |
| **Enterprise** | Custom | Advanced admin, security, support |

### Integrations

**Framework Native:**
- LangChain (automatic integration)
- LangGraph (automatic integration)

**Other Frameworks:**
- OpenAI SDK
- Anthropic SDK
- Vercel AI SDK
- LlamaIndex
- Custom implementations

**Observability:**
- OpenTelemetry bi-directional
- Existing observability pipelines

### Customer Reviews & Sentiment

**G2 Reviews - Strengths:**
- Amazing support for multiple LLM vendors
- Easy integrations
- Best debugging for LangChain users
- Exceptional efficiency, virtually no overhead
- Automatic integration with LangChain/LangGraph

**Limitations:**
- LangChain itself has bloated dependencies
- Documentation gaps for advanced use cases
- Breaking changes in updates
- Complex due to many modules
- Pushes users toward LangSmith (vendor lock-in concerns)
- Challenging learning curve for beginners

### Gaps/Limitations

1. Best with LangChain/LangGraph - less value for other frameworks
2. Perceived vendor lock-in
3. Documentation could be better for advanced use
4. Frequent breaking changes
5. Not truly framework-agnostic despite claims
6. Evaluation features require Plus tier

### Recent Announcements (2025-2026)

**October 2025:**
- $125M Series B at $1.25B valuation
- LangSmith trace volume 12x year-over-year

**September 2025:**
- LangChain 1.0 and LangGraph 1.0 release
- Context engineering front and center

**May 2025:**
- LangGraph Platform GA
- 1-click agent deployment

**December 2025:**
- LangSmith Fetch CLI launch
- Fleet (renamed from Agent Builder)

**January 2026:**
- Pairwise Annotation Queues
- Enhanced cost tracking

---

## 7. Credo AI

### Company Overview
| Attribute | Details |
|-----------|---------|
| **Headquarters** | Palo Alto, CA |
| **Founded** | 2020 |
| **Team Size** | ~66 employees (3x growth) |
| **Total Funding** | $41.3M (4 rounds, Series B July 2024) |
| **Key Investors** | CrimsoNox Capital, Mozilla Ventures, FPV Ventures, Sands Capital, Decibel VC, Booz Allen Hamilton, AI Fund |
| **Recognition** | Fast Company #6 Applied AI (2026), Gartner Cool Vendor |

### Exact Features

**AI Governance Platform:**

1. **AI Registry & Discovery**
   - Discover every AI agent, model, and application
   - Vendor Registry for third-party AI
   - Shadow AI detection
   - Continuous inventory updates

2. **Risk Assessment**
   - Automated risk scoring
   - AI Impact Assessments
   - Model Cards generation
   - Gap identification

3. **Policy Management**
   - Pre-built policy packs: EU AI Act, NIST AI RMF, ISO 42001, SOC 2
   - Custom policy creation
   - Automated policy enforcement
   - Audit-ready evidence

4. **Compliance Workflows**
   - Automated governance workflows
   - Human-in-the-loop escalation
   - Incident remediation
   - Technical documentation generation

5. **AI Agents for Governance**
   - Evidence retrieval automation
   - Risk assessment automation
   - Governance plan generation
   - Incident remediation

6. **Agent Trace Evaluation**
   - Continuous trace monitoring
   - Policy violation detection
   - Drift detection
   - Unsafe behavior flagging

### Architecture / How It Works

**SDK (pycredoai):**
- Python interface
- Synchronous and async operations
- Pydantic models for strong typing
- httpx for HTTP client (proxy support, custom SSL)

**Deployment Options:**
1. **SaaS**: Managed cloud
2. **Self-hosted**: Kubernetes or VM via Replicated installer
3. **AWS Marketplace**
4. **Microsoft Azure Marketplace**

**Integration Approach:**
- API-led architecture
- Connects to MLOps tools, LLM observability systems
- Data warehouse integration
- CI/CD pipeline integration

### Pricing

- **Enterprise platform** with custom pricing
- Available through AWS Marketplace
- Available through Microsoft Azure Marketplace
- Contact sales for quotes

### Integrations

**Cloud Platforms:**
- AWS
- Azure
- GCP
- Snowflake

**MLOps Tools:**
- Databricks (official partner)
- MLflow
- Amazon SageMaker
- Amazon Bedrock

**Business Tools:**
- Jira
- ServiceNow
- Salesforce
- Asana
- Confluence
- Slack
- GitHub

### Customer Reviews & Sentiment

**Recognition:**
- Forrester Wave Leader (Q3 2025) - highest scores in 12 criteria
- Gartner Cool Vendor in AI Cybersecurity Governance
- Gartner Market Guide for AI Governance Platforms
- Fast Company Most Innovative Companies #6 Applied AI

**Customer Testimonials:**
- "Accelerated EU AI Act compliance by 10x"
- Mastercard: "Manage AI risk with better speed and scale"

**Limitations:**
- Enterprise focus may exclude smaller organizations
- Limited public reviews on G2
- Governance-focused, not a full observability platform

### Gaps/Limitations

1. Governance-focused - not for runtime security
2. No prompt injection detection
3. No real-time guardrails
4. Enterprise pricing excludes SMBs
5. Less technical depth than observability platforms
6. Requires organizational commitment to governance processes

### Recent Announcements (2025-2026)

**2025:**
- Forrester Wave Leader recognition
- Gartner Cool Vendor designation
- Databricks partnership
- Integrations Hub launch
- SDK release for developers
- Microsoft Marketplace availability

**2026:**
- Fast Company #6 Applied AI recognition
- EU AI Act compliance features expanded
- Agent governance capabilities enhanced

---

## 8. Wiz AI-SPM

### Company Overview
| Attribute | Details |
|-----------|---------|
| **Company** | Wiz, Inc. |
| **Headquarters** | New York, NY |
| **Founded** | 2020 |
| **Valuation** | $12B+ |
| **Status** | Google acquisition announced ($32B) |
| **Recognition** | G2 #1 CDR, Forrester Wave Leader |

### Exact Features

**AI Security Posture Management:**

1. **AI Discovery & Inventory**
   - Dynamic inventory of AI estate
   - Shadow AI detection
   - AI agents discovery
   - MCP discovery
   - Endpoint scanning (code and cloud)
   - AI Bill of Materials (AI-BOM)

2. **Risk Analysis**
   - Infrastructure context analysis
   - Architectural flaw identification
   - Exposed inference endpoint detection
   - Insecure model configuration detection
   - Attack path analysis
   - Toxic combination identification

3. **Misconfiguration Detection**
   - Built-in configuration rules for AI services
   - OpenAI misconfigurations
   - Amazon Bedrock misconfigurations
   - Azure AI misconfigurations
   - Vertex AI misconfigurations

4. **Training Data Protection**
   - Sensitive data detection
   - Attack path removal to training data
   - Data exposure prevention

5. **Governance**
   - OWASP LLM Top 10 flagging
   - Agent and model threat correlation
   - Security baseline enforcement
   - Mika AI for plain language investigation

### Architecture / How It Works

**Agentless Architecture:**
- Read-only API access to cloud environments
- No agent deployment required
- Scans across all workloads

**Cloud Support:**
- AWS
- Azure
- GCP
- OCI
- Kubernetes

**Integration Approach:**
- Security Graph for unified risk view
- 200+ tool integrations via WIN (Wiz Integration Network)
- WizExtend browser extension for cloud consoles

### Pricing

- **Enterprise platform** with custom pricing
- Workload-based pricing model
- Minimum contracts often $50,000+
- Contact sales for quotes

### Integrations

**Cloud AI Platforms:**
- OpenAI
- Amazon Bedrock
- Amazon SageMaker
- Azure AI
- Google Vertex AI

**Cloud Providers:**
- AWS
- Azure
- GCP
- OCI

**Integrations:**
- 200+ tools via Wiz Integration Network (WIN)
- SIEM platforms
- Ticketing systems
- CI/CD pipelines

### Customer Reviews & Sentiment

**G2 Reviews - Strengths:**
- User-friendly interface
- Easy deployment and onboarding
- Constantly improving features
- Excellent security insights
- 98% satisfaction (highest in CDR space)
- Agentless scanning works flawlessly
- Seamless multi-module integration (CSPM, CWPP, CIEM, DSPM)

**Limitations:**
- **Expensive** with high minimum contracts
- Overwhelming alerts
- Difficulties managing reports
- Real-time threat management challenges
- Remediation steps need improvement
- Menu clarity could be better
- **AI-SPM domain needs more rapid development**

### Gaps/Limitations

1. Expensive - often $50K+ minimum contracts
2. Alert fatigue is common complaint
3. AI-SPM is newer capability, still maturing
4. Focus on cloud posture, not runtime protection
5. No prompt injection/jailbreak detection
6. Not an observability platform
7. Google acquisition may impact roadmap

### Recent Announcements (2025-2026)

**Wizdom 2025 (November):**
- AI Agent Security launch
- MCP discovery feature
- AI-BOM capabilities
- Expanded AI-SPM coverage

**Ongoing:**
- Posture management for AI agents (GA)
- MCP discovery (GA)
- Enhanced Security Graph for AI
- OWASP LLM Top 10 support

**Forrester Wave:**
- Leader in CNAPP (Q1 2026)

---

## 9. Competitive Positioning Matrix

### Category Breakdown

| Competitor | Category | Primary Focus |
|------------|----------|---------------|
| Lakera Guard | AI Security Guardrails | Runtime protection, prompt injection |
| Prompt Security | AI Security Guardrails | Enterprise AI protection, Shadow AI |
| CalypsoAI (F5) | AI Security Guardrails | Enterprise guardrails, compliance |
| Datadog LLM | Observability | Monitoring, tracing, cost management |
| Arize/Phoenix | Observability + Evaluation | Tracing, evaluation, debugging |
| LangSmith | Observability + Development | Agent development, debugging, deployment |
| Credo AI | AI Governance | Compliance, risk management, policy |
| Wiz AI-SPM | Cloud Security | AI posture, misconfiguration, discovery |

### Feature Comparison Matrix

| Feature | Lakera | Prompt Sec | CalypsoAI | Datadog | Arize | LangSmith | Credo | Wiz |
|---------|--------|------------|-----------|---------|-------|-----------|-------|-----|
| Prompt Injection Detection | ★★★ | ★★★ | ★★★ | ★☆☆ | ★☆☆ | ★☆☆ | ☆☆☆ | ☆☆☆ |
| PII/Data Leakage Prevention | ★★★ | ★★★ | ★★★ | ★★☆ | ★☆☆ | ★☆☆ | ★☆☆ | ★★☆ |
| Tracing/Observability | ★☆☆ | ★☆☆ | ★☆☆ | ★★★ | ★★★ | ★★★ | ★☆☆ | ★☆☆ |
| LLM Evaluation | ☆☆☆ | ☆☆☆ | ☆☆☆ | ★★☆ | ★★★ | ★★★ | ★★☆ | ☆☆☆ |
| Compliance/Governance | ★☆☆ | ★★☆ | ★★★ | ★☆☆ | ★☆☆ | ★☆☆ | ★★★ | ★★☆ |
| Shadow AI Detection | ☆☆☆ | ★★★ | ★☆☆ | ☆☆☆ | ☆☆☆ | ☆☆☆ | ★★★ | ★★★ |
| Cloud Posture | ☆☆☆ | ☆☆☆ | ☆☆☆ | ☆☆☆ | ☆☆☆ | ☆☆☆ | ☆☆☆ | ★★★ |
| Open Source Option | ☆☆☆ | ☆☆☆ | ☆☆☆ | ☆☆☆ | ★★★ | ☆☆☆ | ☆☆☆ | ☆☆☆ |
| Free Tier | ★★☆ | ☆☆☆ | ☆☆☆ | ☆☆☆ | ★★★ | ★★☆ | ☆☆☆ | ☆☆☆ |

### Pricing Comparison

| Competitor | Entry Point | Enterprise |
|------------|-------------|------------|
| Lakera Guard | $0 (10K req/mo) | Custom |
| Prompt Security | Sales only | Custom |
| CalypsoAI (F5) | Sales only | Custom |
| Datadog LLM | ~$120/day | Usage-based |
| Arize Phoenix | $0 (open source) | $50K-100K/yr |
| LangSmith | $0 (5K traces/mo) | Custom |
| Credo AI | Sales only | Custom |
| Wiz AI-SPM | ~$50K minimum | Custom |

### Acquisition Impact Summary

| Company | Acquirer | Price | Date | Strategic Impact |
|---------|----------|-------|------|------------------|
| Lakera | Check Point | N/A | Nov 2025 | Integration into Infinity Platform |
| Prompt Security | SentinelOne | ~$180M | Sep 2025 | Part of Singularity Platform |
| CalypsoAI | F5 | $180M | Nov 2025 | F5 AI Guardrails product |

---

## 10. Market Opportunities

### Identified Gaps in the Market

1. **Unified Platform Gap**
   - No single platform combines security guardrails + observability + evaluation + governance
   - Customers must stitch together multiple tools

2. **SMB Accessibility**
   - Most enterprise solutions have $50K+ price points
   - Free tiers are limited (Lakera 10K req, LangSmith 5K traces)
   - Arize Phoenix is the only robust open-source option

3. **Developer Experience**
   - Governance tools (Credo) require organizational process changes
   - Security tools often feel like "bolt-ons"
   - Need for security integrated into development workflow

4. **Real-time + Observability**
   - Security tools (Lakera, Prompt Security) lack observability
   - Observability tools (Datadog, Arize) lack real-time security
   - Opportunity for combined offering

5. **Agent-Specific Security**
   - MCP security is nascent
   - Agent-to-agent communication security lacking
   - Multi-agent system security is immature

6. **Cost Transparency**
   - Datadog's cost escalation is major pain point
   - Usage-based pricing is unpredictable
   - Opportunity for predictable pricing models

### Competitive Differentiation Opportunities

1. **All-in-One Platform**: Security + Observability + Evaluation
2. **Developer-First**: IDE integration, CLI tools, API-first design
3. **Transparent Pricing**: Predictable costs, generous free tier
4. **Open Source Core**: Community building, no vendor lock-in fears
5. **Multi-Cloud Native**: Not tied to single cloud ecosystem
6. **Agent Security Focus**: Purpose-built for agentic AI era

---

## Sources

### Lakera Guard
- [Lakera Official Website](https://www.lakera.ai/)
- [Lakera Guard Product Page](https://www.lakera.ai/lakera-guard)
- [Lakera Pricing](https://platform.lakera.ai/pricing)
- [Lakera G2 Reviews](https://www.g2.com/products/lakera-guard/reviews)
- [Lakera Integration Guide](https://docs.lakera.ai/docs/integration)
- [Lakera Crunchbase](https://www.crunchbase.com/organization/lakera-ai)

### Prompt Security
- [Prompt Security Official Website](https://prompt.security/)
- [Prompt Security G2 Reviews](https://www.g2.com/products/prompt-security/reviews)
- [Prompt Security Series A Announcement](https://prompt.security/press/prompt-security-raises-18m-series-a-to-accelerate-its-mission-to-secure-genai-in-enterprises)
- [SentinelOne Acquisition Press Release](https://www.sentinelone.com/press/sentinelone-to-acquire-prompt-security-to-advance-genai-security/)

### CalypsoAI (F5)
- [F5 AI Guardrails Product Page](https://www.f5.com/products/ai-guardrails)
- [F5 Acquisition Announcement](https://www.f5.com/company/news/press-releases/f5-to-acquire-calypsoai-to-bring-advanced-ai-guardrails-to-large-enterprises)
- [F5 AI Security Blog](https://www.f5.com/company/blog/what-are-ai-guardrails)

### Datadog LLM Observability
- [Datadog LLM Observability Product Page](https://www.datadoghq.com/product/ai/llm-observability/)
- [Datadog LLM Observability Docs](https://docs.datadoghq.com/llm_observability/)
- [Datadog Pricing](https://www.datadoghq.com/pricing/)
- [Datadog G2 Reviews](https://www.g2.com/products/datadog/reviews)
- [Datadog Agentic AI Announcement](https://www.datadoghq.com/about/latest-news/press-releases/datadog-expands-llm-observability-with-new-capabilities-to-monitor-agentic-ai-accelerate-development-and-improve-model-performance/)

### Arize AI / Phoenix
- [Arize AI Official Website](https://arize.com/)
- [Phoenix Official Website](https://phoenix.arize.com/)
- [Phoenix GitHub](https://github.com/Arize-ai/phoenix)
- [Phoenix Pricing](https://phoenix.arize.com/pricing/)
- [Arize AI G2 Reviews](https://www.g2.com/products/arize-ai/reviews)
- [Arize Series C Announcement](https://arize.com/blog/arize-ai-raises-70m-series-c-to-build-the-gold-standard-for-ai-evaluation-observability/)

### LangSmith (LangChain)
- [LangSmith Product Page](https://www.langchain.com/langsmith)
- [LangSmith Observability](https://www.langchain.com/langsmith/observability)
- [LangSmith Pricing](https://www.langchain.com/pricing)
- [LangChain G2 Reviews](https://www.g2.com/products/langchain/reviews)
- [LangChain Series B Announcement](https://blog.langchain.com/series-b/)
- [LangChain Changelog](https://changelog.langchain.com/)

### Credo AI
- [Credo AI Official Website](https://www.credo.ai/)
- [Credo AI Product Page](https://www.credo.ai/product)
- [Credo AI SDK Documentation](https://docs.sdk.credo.ai/docs/intro/)
- [Credo AI Forrester Wave Recognition](https://www.businesswire.com/news/home/20250825500906/en/Credo-AI-Named-a-Leader-in-2025-AI-Governance-Solutions-Report)
- [Credo AI Databricks Partnership](https://www.businesswire.com/news/home/20240118676024/en/Credo-AI-Announces-Partnership-with-Databricks-to-Enable-Responsible-Compliant-Safe-AI-at-Scale)

### Wiz AI-SPM
- [Wiz AI-SPM Product Page](https://www.wiz.io/solutions/ai-spm)
- [Wiz AI-SPM Academy](https://www.wiz.io/academy/what-is-ai-security-posture-management-ai-spm)
- [Wiz G2 Reviews](https://www.g2.com/products/wiz-wiz/reviews)
- [Wiz AI Agent Security Blog](https://www.wiz.io/blog/wiz-ai-spm-secures-ai-agents)
- [Wizdom 2025 Announcements](https://www.wiz.io/blog/wizdom-product-launches-2025)

---

*Report Generated: March 2026*
*Research Methodology: Web search, G2 reviews, Gartner Peer Insights, company documentation, press releases, and industry analyst reports*
