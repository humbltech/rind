# Competitive Analysis: Enterprise AI Agent Security, Governance, and Observability Platforms

**Document Date:** March 2026
**Market Focus:** AI/LLM Security, Agent Governance, Observability, and MCP Security

---

## Executive Summary

The enterprise AI agent security market has reached a critical inflection point in 2026, with 100% of security, IT, and risk leaders reporting that agentic AI is on their roadmap. However, a significant "governance-containment gap" exists: most organizations can monitor what their AI agents are doing, but the majority cannot stop them when something goes wrong.

**Key Market Statistics:**
- AI firewall market estimated at $30M with 100% expected growth in 2026
- 40% of enterprise applications expected to embed autonomous AI agents by year-end 2026
- Only 6% of organizations have advanced AI security strategies
- EU AI Act enforcement begins August 2, 2026

---

## Table of Contents

1. [LLM Security & Firewall Products](#1-llm-security--firewall-products)
2. [AI Observability Platforms](#2-ai-observability-platforms)
3. [AI Governance Platforms](#3-ai-governance-platforms)
4. [AI Guardrails Platforms](#4-ai-guardrails-platforms)
5. [MCP Security Tools](#5-mcp-security-tools)
6. [Enterprise Security Vendors with AI Features](#6-enterprise-security-vendors-with-ai-features)
7. [Open Source Projects](#7-open-source-projects)
8. [Emerging Players](#8-emerging-players)
9. [Market Analysis & Recommendations](#9-market-analysis--recommendations)

---

## 1. LLM Security & Firewall Products

### Lakera Guard

**Company:** Lakera
**Website:** [lakera.ai](https://www.lakera.ai/)

**What They Do:**
AI-native security platform that protects LLM applications from prompt injection attacks, data leakage, and malicious inputs. Acts as a security layer between users and AI models by scanning all interactions in real-time.

**Core Features:**
- Real-time prompt injection and jailbreak blocking
- PII and sensitive data leakage detection
- Content moderation for harmful or off-brand outputs
- Detects 15+ threat types (vs. OpenAI's 7 basic categories)
- Support for 100+ languages

**Architecture/Approach:**
- API-first approach with single API integration
- Sub-50ms latency with 98%+ detection rate
- Works with all major AI providers (OpenAI, Anthropic, Cohere)
- SaaS or self-hosted deployment options

**Target Market:**
Enterprise organizations deploying LLM applications at scale

**Pricing:**
- Starter: $99/month (100K API calls)
- Professional: $499/month (1M API calls)
- Enterprise: Custom pricing (flexible volumes, SSO, RBAC, SIEM integrations)

**Strengths:**
- Ultra-low latency (0.01% production false positive rate)
- Broad language support
- SOC2, GDPR, NIST compliance

**Weaknesses:**
- Limited to reactive detection (no proactive security testing)
- Pricing can escalate quickly at high volumes

---

### Akamai Firewall for AI

**Company:** Akamai Technologies
**Website:** [akamai.com/products/firewall-for-ai](https://www.akamai.com/products/firewall-for-ai)

**What They Do:**
Enterprise-grade security solution that protects both inbound AI queries and outbound AI responses, leveraging Akamai's global edge network.

**Core Features:**
- Detection and blocking of prompt injections, jailbreaks, and harmful queries
- Filtering of toxic, biased, or misleading content
- Compliance and data protection capabilities
- Real-time AI threat detection with adaptive security rules

**Architecture/Approach:**
- Model-agnostic, works with any LLM-based application
- Deployment options: API, edge deployment, or reverse proxy
- Leverages Akamai's global CDN infrastructure

**Target Market:**
Large enterprises with existing Akamai infrastructure

**Pricing:**
Contact sales (enterprise pricing)

**Strengths:**
- Leverages existing Akamai edge infrastructure
- Global scale and performance
- Model-agnostic approach

**Weaknesses:**
- Limited availability (currently)
- Best suited for existing Akamai customers
- Less specialized than pure-play AI security vendors

---

### Radware LLM Firewall & Agentic AI Protection

**Company:** Radware
**Website:** [radware.com](https://www.radware.com/)

**What They Do:**
Comprehensive AI security portfolio combining LLM Firewall (launched November 2025) with Agentic AI Protection Solution.

**Core Features:**
- Real-time AI-based protection at the prompt level
- Protection against direct and indirect prompt injection
- Unauthorized data access prevention
- Tool abuse protection for AI agents
- Real-time identification of homegrown and SaaS-based agents
- Advanced runtime behavioral algorithms

**Architecture/Approach:**
- Sits in front of AI-driven applications
- Detects and blocks malicious prompts before reaching models
- Integrated with Cloud Application Protection Services
- Supports Microsoft 365 Copilot and AWS Bedrock

**Target Market:**
Enterprises and MSSPs

**Pricing:**
Enterprise pricing (contact sales)

**Strengths:**
- Comprehensive coverage (LLM + Agents)
- GDPR and HIPAA compliance support
- OWASP Top 10 for LLM and agentic applications alignment

**Weaknesses:**
- Relatively new to AI security market
- May require existing Radware relationship for optimal integration

---

### CalypsoAI (Acquired by F5)

**Company:** CalypsoAI (F5 Networks)
**Website:** [calypsoai.com](https://calypsoai.com/)

**What They Do:**
Unified AI security platform combining red-teaming, real-time defense, and continuous monitoring.

**Core Features:**
- **Inference Red Team:** Proactive adversarial testing against 10,000+ new attack prompts monthly
- **Inference Defend:** Threat detection and prevention
- **Inference Observe:** Enterprise oversight and visibility
- Prompt injection defense and jailbreak prevention
- Customizable Generative AI Security Scanner

**Architecture/Approach:**
- Risk scoring through automated red-teaming
- Real-time visibility dashboard
- Policy-based controls with custom categories

**Target Market:**
Large enterprises and government entities

**Pricing:**
Custom enterprise pricing; free trial available

**Strengths:**
- Proactive red-teaming approach (unique differentiator)
- Strong government/defense sector presence
- F5 acquisition provides enterprise distribution

**Weaknesses:**
- Premium pricing for enterprise-only focus
- May be overkill for smaller deployments

---

### Prompt Security

**Company:** Prompt Security
**Website:** [prompt.security](https://prompt.security/)

**What They Do:**
Comprehensive GenAI security platform with real-time detection, data protection, and endpoint-level monitoring.

**Core Features:**
- GenAI Visibility across all AI activity
- Data Privacy Protection with automatic PII redaction
- Homegrown AI Security for custom applications
- Content Moderation filtering
- Agentic AI Controls with MCP server monitoring
- Automated red teaming

**Architecture/Approach:**
- SaaS or on-premises deployment
- Endpoint-level monitoring capabilities
- Safe prompt pattern enforcement

**Target Market:**
Enterprise development teams

**Pricing:**
~$300 per developer annually; 30-day free trial

**Strengths:**
- Comprehensive coverage across employee tools, homegrown apps, and agents
- MCP server monitoring (differentiator)
- Reasonable per-developer pricing model

**Weaknesses:**
- Relatively newer company
- Limited public case studies

---

## 2. AI Observability Platforms

### Arize AI / Phoenix

**Company:** Arize AI
**Website:** [arize.com](https://arize.com/) | [phoenix.arize.com](https://phoenix.arize.com/)

**What They Do:**
Enterprise-grade AI observability platform with span-level tracing and real-time telemetry, extending ML monitoring infrastructure into LLM systems.

**Core Features:**
- **Tracing:** OpenTelemetry-based instrumentation for LLM applications
- **Evaluation:** LLM-as-a-judge benchmarking, response and retrieval evals
- **Datasets:** Versioned datasets for experimentation and fine-tuning
- **Experiments:** Track and evaluate changes to prompts, LLMs, and retrieval
- **Playground:** Optimize prompts, compare models, replay traced LLM calls
- **Prompt Management:** Version control, tagging, and experimentation

**Architecture/Approach:**
- Open-source Phoenix platform (fully self-hostable)
- Enterprise Arize AX for advanced features
- OpenTelemetry-compliant

**Target Market:**
ML/AI teams from startups to enterprises

**Pricing:**
- Phoenix Open Source: Free (25k spans/month, 7-day retention)
- Phoenix Cloud: $50/month (50k spans, 15-day retention)
- Arize AX Enterprise: $50K-$100K/year

**Strengths:**
- Fully open-source core (no feature gates)
- Strong MLOps heritage
- Comprehensive evaluation capabilities

**Weaknesses:**
- Enterprise platform premium pricing
- May require additional tooling for security/guardrails

---

### Datadog LLM Observability

**Company:** Datadog
**Website:** [datadoghq.com/product/ai/llm-observability](https://www.datadoghq.com/product/ai/llm-observability/)

**What They Do:**
End-to-end AI observability integrated into Datadog's broader observability platform.

**Core Features:**
- End-to-end tracing across AI agents
- Visibility into inputs, outputs, latency, token usage, and errors
- Automatic cost calculation using provider pricing models
- Automatic sensitive data scanning and redaction
- Prompt injection identification
- Structured LLM experiments and evaluations

**Architecture/Approach:**
- SDK integration for Python (OpenAI, LangChain, AWS Bedrock, Anthropic)
- Automatic annotation of LLM calls
- Integration with broader Datadog platform

**Target Market:**
Enterprises already using Datadog for observability

**Pricing:**
$120/day for LLM Observability (can be used standalone)

**Strengths:**
- Integration with full Datadog observability stack
- Automatic instrumentation (no code changes)
- Built-in security evaluations

**Weaknesses:**
- Expensive for high-volume usage
- Best value for existing Datadog customers
- Lock-in to Datadog ecosystem

---

### LangSmith

**Company:** LangChain
**Website:** [langchain.com/langsmith](https://www.langchain.com/langsmith-platform)

**What They Do:**
Framework-agnostic agent engineering platform for observability, evaluation, and deployment.

**Core Features:**
- Full conversation and agent run tracing
- Built-in AI assistant (Polly) for trace analysis
- Custom dashboards for token usage, latency, error rates, cost
- Alert configuration via webhooks or PagerDuty
- Prompt management and experimentation
- Integration with any LLM framework (not just LangChain)

**Architecture/Approach:**
- Managed cloud, BYOC, or self-hosted options
- Framework-agnostic despite LangChain origin
- Can run on customer's Kubernetes cluster (Enterprise)

**Target Market:**
Development teams building LLM applications

**Pricing:**
- Developer: Free (1 seat, 5k traces/month)
- Plus: Usage-based (unlimited seats, 10k traces/month)
- Enterprise: Contact sales (advanced security, BYOC, self-hosted)

**Strengths:**
- Framework-agnostic despite LangChain origin
- Flexible deployment options
- Strong evaluation and experimentation features

**Weaknesses:**
- Perceived as LangChain-specific (though it isn't)
- Enterprise features require sales engagement

---

### Langfuse (Open Source)

**Company:** Langfuse (Y Combinator W23)
**Website:** [langfuse.com](https://langfuse.com/) | [GitHub](https://github.com/langfuse/langfuse)

**What They Do:**
Open-source LLM engineering platform for observability, metrics, evals, and prompt management.

**Core Features:**
- LLM Application Observability with full tracing
- Prompt Management with version control and caching
- Evaluations: LLM-as-a-judge, user feedback, manual labeling
- Native OpenTelemetry integration
- Integrations: LangChain, OpenAI SDK, LiteLLM, and more

**Architecture/Approach:**
- Fully open-source, self-hostable
- Can deploy within VPC or on-premises
- Docker Compose for testing, Kubernetes for production
- Same codebase as Langfuse Cloud

**Target Market:**
Development teams wanting self-hosted observability

**Pricing:**
- Self-hosted: Free (open source)
- Langfuse Cloud: Usage-based tiers

**Strengths:**
- Fully open-source with no feature restrictions
- Self-hostable for data privacy requirements
- Active community and development

**Weaknesses:**
- Requires infrastructure management for self-hosting
- Less enterprise support than commercial alternatives

---

### TrueFoundry

**Company:** TrueFoundry
**Website:** [truefoundry.com](https://www.truefoundry.com/)

**What They Do:**
Kubernetes-native AI platform combining LLM inference, fine-tuning, and comprehensive observability with governance.

**Core Features:**
- Framework-agnostic tracing (prompt execution to GPU performance)
- OpenTelemetry-compliant integration
- P99/P90/P50 latency, time-to-first-token tracking
- AI Gateway with authentication, access control, policy enforcement
- Cost optimization via rate limiting and token budgeting
- Support for agentic workflows with multi-step orchestration

**Architecture/Approach:**
- Kubernetes-native deployment
- On-premise or VPC deployment
- SOC 2, HIPAA, ITAR compliance

**Target Market:**
Medium to large organizations running AI at scale

**Pricing:**
- Pro: $499/month (governance features, higher limits)
- Enterprise: Custom (VPC, air-gapped, multi-region)

**Strengths:**
- Complete platform (observability + governance + gateway)
- Strong enterprise compliance (SOC 2, HIPAA, ITAR)
- Kubernetes-native architecture

**Weaknesses:**
- Requires Kubernetes expertise
- Higher complexity for simple use cases

---

### Helicone

**Company:** Helicone (Y Combinator W23)
**Website:** [helicone.ai](https://www.helicone.ai/) | [GitHub](https://github.com/Helicone/helicone)

**What They Do:**
Open-source LLM observability platform with AI gateway capabilities.

**Core Features:**
- Trace and session observation for agents and chatbots
- Cost, latency, quality, and usage analytics
- Prompt management with production data
- AI Gateway with intelligent routing and fallbacks
- Access to 100+ AI models with single API key
- SOC 2 and GDPR compliance

**Architecture/Approach:**
- Single line change to base URL for implementation
- Open-source core with managed cloud option
- Integrations with OpenPipe and Autonomi for fine-tuning

**Target Market:**
Developers and teams building LLM applications

**Pricing:**
- Free tier: 10,000 requests/month
- Paid tiers: Usage-based

**Strengths:**
- Extremely easy implementation (one line change)
- Open-source with managed option
- Generous free tier

**Weaknesses:**
- Less comprehensive than enterprise platforms
- Limited enterprise features compared to Datadog/Arize

---

### Arthur AI

**Company:** Arthur AI
**Website:** [arthur.ai](https://www.arthur.ai/)

**What They Do:**
AI delivery engine for model monitoring, governance, and optimization across the ML/LLM lifecycle.

**Core Features:**
- Model evaluation and real-time monitoring
- Drift detection and fairness checks
- Transparent prediction explanations
- Custom dashboards with alerts
- Version, reuse, and govern metrics with RBAC
- Discovery of agents and policy enforcement

**Architecture/Approach:**
- Federated control plane / data plane architecture
- Sensitive data never leaves customer environment
- Data plane runs in customer VPC or on-prem
- Only aggregated metrics transmitted to control plane

**Target Market:**
CISOs, CIOs, CDOs, and AI teams in regulated industries

**Pricing:**
- Free tier available
- Premium and Enterprise: $75K-$200K/year typical

**Strengths:**
- Strong data privacy architecture (federated)
- Comprehensive governance and compliance features
- Executive-level reporting capabilities

**Weaknesses:**
- Premium pricing
- May be overkill for simple LLM use cases

---

## 3. AI Governance Platforms

### Credo AI

**Company:** Credo AI
**Website:** [credo.ai](https://www.credo.ai/)

**What They Do:**
Enterprise platform for AI governance, risk, and compliance, enabling organizations to trust their AI and prove it.

**Core Features:**
- Discovery and cataloging of all AI systems (including shadow AI)
- Continuous, contextual risk assessment (bias, security, privacy, compliance)
- Ready-to-deploy policy packs: EU AI Act, NIST AI RMF, ISO 42001, SOC 2, HITRUST
- Automated evidence generation and audit-ready documentation
- Specialized AI agents for governance automation
- Retrieves evidence, assesses risk, generates governance plans, remediates incidents

**Architecture/Approach:**
- Full visibility into agents, models, and applications
- Continuous monitoring (not point-in-time snapshots)
- Governance task automation

**Target Market:**
Large enterprises with regulatory compliance requirements

**Pricing:**
Custom enterprise pricing

**Strengths:**
- Comprehensive regulatory framework coverage
- Automated evidence generation (major time saver)
- Market leader in AI governance

**Weaknesses:**
- Enterprise-only focus
- Requires significant organizational buy-in

---

### Holistic AI

**Company:** Holistic AI
**Website:** [holisticai.com](https://www.holisticai.com/)

**What They Do:**
Enterprise AI Governance Platform delivering full lifecycle oversight from model discovery to risk management and compliance.

**Core Features:**
- **AI Discovery:** Automatic, continuous detection of all AI deployments including shadow AI
- **Risk Assessment:** 100+ automated tests (red teaming, jailbreaks, hallucinations, adversarial probes)
- **Policy Enforcement:** Visual policy builder with EU AI Act, NIST, ISO 42001 templates
- **Runtime Guardrails:** For models, agents, and workflows
- **Continuous Monitoring:** Model drift, bias, and performance degradation detection

**Architecture/Approach:**
- Full lifecycle governance
- Built-in compliance templates
- Real-time violation tracking and enforcement

**Target Market:**
Regulated industries (finance, healthcare, government)

**Pricing:**
Custom enterprise subscription

**Strengths:**
- Comprehensive testing suite (100+ automated tests)
- Strong regulatory compliance focus
- Visual policy builder for ease of use

**Weaknesses:**
- No public pricing
- Best suited for large, compliance-focused organizations

---

### IBM watsonx.governance

**Company:** IBM
**Website:** [ibm.com/products/watsonx-governance](https://www.ibm.com/products/watsonx-governance)

**What They Do:**
Enterprise-grade AI governance solution featuring agent monitoring, risk management, and regulatory compliance.

**Core Features:**
- **Lifecycle Governance:** Automates and scales model governance
- **Customizable Dashboards:** With model metadata captured through factsheets
- **Risk & Security Management:** Monitors for fairness, bias, drift
- **Proactive Risk Detection:** Based on preset thresholds
- **Compliance Management:** Translates regulations into enforceable policies
- **Multi-Platform Support:** AWS, Microsoft, and other third-party tools

**Architecture/Approach:**
- Cloud or on-premises deployment
- Integration with existing MLOps workflows
- Part of broader watsonx AI platform

**Target Market:**
Large enterprises, especially IBM customers

**Pricing:**
Custom pricing (indicative pricing varies by country)

**Strengths:**
- IBM's enterprise credibility and support
- Multi-platform integration
- Part of comprehensive watsonx AI ecosystem

**Weaknesses:**
- Can be complex to implement
- Best suited for IBM ecosystem customers

---

### OneTrust AI Governance

**Company:** OneTrust
**Website:** [onetrust.com/solutions/ai-governance](https://www.onetrust.com/solutions/ai-governance/)

**What They Do:**
Responsible AI governance and compliance solution integrated into OneTrust's broader privacy and compliance platform.

**Core Features:**
- Manage AI initiatives, models, agents, datasets, and vendors in single system
- AI risk assessments aligned to EU AI Act, NIST, ISO 42001
- Configurable approval gates before production deployment
- Automated model documentation and regulatory reporting
- Continuous monitoring of performance, drift, safety, and quality
- Sensitive data detection and runtime controls

**Architecture/Approach:**
- Single system of record approach
- Integration with existing OneTrust compliance platform
- Subscription-based with tiered pricing

**Target Market:**
Organizations already using OneTrust for privacy/compliance

**Pricing:**
- Entry: ~$1,620/year
- Median buyer: ~$11,500/year
- Enterprise: Up to ~$42,534/year

**Strengths:**
- Integration with broader OneTrust compliance ecosystem
- Transparent pricing model
- Strong compliance automation

**Weaknesses:**
- Best value for existing OneTrust customers
- May lack depth of AI-specific competitors

---

### Microsoft Agent 365

**Company:** Microsoft
**Website:** [microsoft.com/en-us/microsoft-agent-365](https://www.microsoft.com/en-us/microsoft-agent-365)

**What They Do:**
Control plane for AI agents providing IT, security, and business teams with visibility and tools to observe, secure, and govern agents at scale.

**Core Features:**
- **Unique Agent IDs:** Extends Entra with identity for every autonomous workload
- **Conditional Access:** Familiar identity rules applied to agent personas
- **Least Privilege Enforcement:** Only necessary access rights granted
- **Audit & Compliance:** Automatic audit, data classification, AI regulation assessments
- **Purview Integration:** Block sensitive information in prompts
- **Unified Audit Log:** Capture prompts, responses, and file access
- **Defender Integration:** Unified investigations across human and non-human actors

**Architecture/Approach:**
- Integrated with Microsoft 365, Entra, Defender, and Purview
- Part of Microsoft 365 E7: The Frontier Suite
- Control plane architecture

**Target Market:**
Microsoft 365 enterprise customers

**Pricing:**
Part of Microsoft 365 E7: The Frontier Suite (GA May 1, 2026)

**Strengths:**
- Deep integration with Microsoft ecosystem
- Leverages existing Entra, Defender, Purview investments
- Comprehensive identity and access management for agents

**Weaknesses:**
- Microsoft ecosystem lock-in
- New product (GA May 2026)
- Requires Microsoft 365 E7 subscription

---

### Entro Security AGA (Agentic Governance & Administration)

**Company:** Entro Security
**Website:** [entro.security](https://entro.security/)

**What They Do:**
Governance and control platform for AI agents and AI access across enterprise systems, built on non-human identity (NHI) security expertise.

**Core Features:**
- **AI Agent Profiling:** Sources, targets, and identities mapping
- **Shadow AI Discovery:** Endpoint telemetry, agent foundries, cloud environments
- **AI Service Monitoring & Enforcement:** Real-time policy enforcement
- **MCP Activity Visibility:** Tools invoked, connected services, policy controls
- **EDR Integrations:** Surface AI clients and local agent runtimes
- **Native Agent Foundry Integration:** AWS Bedrock, Copilot Studio

**Architecture/Approach:**
- Three-layer profiling: Sources, Targets, Identities
- Integrates with EDR, cloud providers, agent foundries
- Audit trails of allowed and blocked activity

**Target Market:**
Security and identity teams in enterprises

**Pricing:**
Contact sales

**Strengths:**
- Unique NHI (non-human identity) focus
- MCP-specific monitoring capabilities
- Comprehensive agent profiling

**Weaknesses:**
- Newer entrant to market
- Requires integration with existing security tools

---

## 4. AI Guardrails Platforms

### NVIDIA NeMo Guardrails (Open Source)

**Company:** NVIDIA
**Website:** [developer.nvidia.com/nemo-guardrails](https://developer.nvidia.com/nemo-guardrails) | [GitHub](https://github.com/NVIDIA-NeMo/Guardrails)

**What They Do:**
Open-source toolkit for adding programmable guardrails to LLM-based conversational systems using the Colang dialogue management language.

**Core Features:**
- Input, retrieval, dialog, execution, and output rails
- Content moderation and topic guidance
- Hallucination prevention and response shaping
- Unique Colang language for multi-turn dialog flow control
- GPU-accelerated guardrail orchestration

**Architecture/Approach:**
- Python package for integration
- Colang language for defining conversation flows
- Connects to NVIDIA NIM, OpenAI, Azure, Anthropic, HuggingFace, LangChain
- Parallel guardrail execution

**Target Market:**
Developers building conversational AI applications

**Pricing:**
Free (open source)

**Strengths:**
- Free and open source
- Unique dialog flow control via Colang
- GPU acceleration for performance
- Flexible provider integrations

**Weaknesses:**
- Requires learning Colang language
- More complex than simple validation approaches
- No managed service option

---

### Guardrails AI (Open Source)

**Company:** Guardrails AI
**Website:** [guardrailsai.com](https://guardrailsai.com/) | [GitHub](https://github.com/guardrails-ai/guardrails)

**What They Do:**
Open-source Python framework using validator-based architecture to enforce output quality and safety constraints on LLM responses.

**Core Features:**
- Input/Output Guards for risk detection and mitigation
- Pydantic-style validation for structured data generation
- Guardrails Hub: Pre-built validators for PII, toxicity, regex, etc.
- Corrective actions: retry, fix, or reject on validation failure
- REST API deployment via Flask

**Architecture/Approach:**
- Validator-based architecture
- Guardrails Hub ecosystem
- Can be deployed as standalone service

**Target Market:**
Developers building LLM applications

**Pricing:**
- Open source: Free
- Guardrails Cloud: Starting ~$500/month (announced Q4 2025)

**Strengths:**
- Simple, Pythonic approach
- Growing validator ecosystem (Hub)
- Easy to integrate

**Weaknesses:**
- No dialog flow control (unlike NeMo)
- Cloud offering still new

---

### Azure AI Content Safety

**Company:** Microsoft
**Website:** [azure.microsoft.com](https://azure.microsoft.com/)

**What They Do:**
Cloud-based service for classifying harmful content with severity scoring, prompt shields, and groundedness detection.

**Core Features:**
- Content classification across four categories (hate, sexual, violence, self-harm)
- Severity scoring (0-6 scale)
- Prompt Shields for adversarial attack detection
- Groundedness detection for hallucination prevention
- Azure AI Foundry integration

**Architecture/Approach:**
- Cloud API service
- Integration with Azure AI ecosystem
- Multi-modal content analysis

**Target Market:**
Azure customers building AI applications

**Pricing:**
Azure consumption-based pricing

**Strengths:**
- Deep Azure integration
- Groundedness detection for hallucinations
- Multi-modal content analysis

**Weaknesses:**
- Azure ecosystem lock-in
- Limited customization vs. open-source options

---

### AWS Bedrock Guardrails

**Company:** Amazon Web Services
**Website:** [aws.amazon.com/bedrock](https://aws.amazon.com/bedrock/)

**What They Do:**
Configurable safeguards for generative AI applications integrated with AWS ecosystem.

**Core Features:**
- Configurable content filters
- PII detection and redaction
- Topic filtering
- Denied topic detection
- Integration with Bedrock models

**Architecture/Approach:**
- Native AWS Bedrock integration
- Configurable policies per use case
- Part of AWS AI services ecosystem

**Target Market:**
Regulated industries (healthcare, finance) on AWS

**Pricing:**
AWS consumption-based pricing

**Strengths:**
- Native AWS integration
- Strong for regulated industries
- 99% validation accuracy claims

**Weaknesses:**
- AWS ecosystem lock-in
- Less flexible than open-source alternatives

---

### Cloudflare AI Gateway

**Company:** Cloudflare
**Website:** [workers.cloudflare.com/product/ai-gateway](https://workers.cloudflare.com/product/ai-gateway)

**What They Do:**
AI control plane extending Cloudflare's edge network to AI traffic with built-in guardrails and security features.

**Core Features:**
- **Guardrails:** Content evaluation against safety parameters
- **Prompt Inspection:** Check prompts before reaching models
- **Response Evaluation:** Inspect and filter hazardous content
- **Granular Control:** Flag or block based on hazard categories
- **Data Loss Prevention (DLP):** Financial info, SSN, credit cards
- **Llama Guard Integration:** Content moderation
- **Authentication:** cf-aig-authorization header enforcement
- **Observability:** Prompts, responses, token usage, cost tracking

**Architecture/Approach:**
- Edge-based AI gateway
- Proxy between application and model providers
- Integration with Cloudflare Zero Trust

**Target Market:**
Organizations using Cloudflare for infrastructure

**Pricing:**
- Free tier available with basic guardrails
- Zero Trust plans for advanced DLP profiles

**Strengths:**
- Leverages Cloudflare's global edge network
- Low latency at edge
- Integration with Zero Trust

**Weaknesses:**
- Best for existing Cloudflare customers
- Less specialized than pure-play AI security vendors

---

### Kong AI Gateway

**Company:** Kong Inc.
**Website:** [konghq.com](https://konghq.com/)

**What They Do:**
AI traffic management extending Kong's API gateway platform with AI-specific plugins.

**Core Features:**
- AI Prompt Guard plugin
- Semantic allow/deny topic lists
- Rate limiting and token management
- Multi-model routing
- Integration with existing Kong infrastructure

**Architecture/Approach:**
- Plugin-based extensibility
- Extension of existing API gateway
- MCP security gateway capabilities

**Target Market:**
Organizations using Kong for API management

**Pricing:**
Enterprise pricing (Kong Konnect plans)

**Strengths:**
- Leverage existing Kong investments
- API management expertise
- Plugin ecosystem

**Weaknesses:**
- Best for existing Kong customers
- AI features are extensions, not core focus

---

## 5. MCP Security Tools

### Overview: MCP Security Landscape

The Model Context Protocol (MCP) is an open standard introduced by Anthropic in November 2024 to standardize how AI systems integrate with external tools and data sources. However, significant security challenges exist:

**Key Statistics:**
- 7.2% of open-source MCP servers contain general vulnerabilities
- 5.5% exhibit MCP-specific tool poisoning
- Research found all verified servers lacked authentication
- Over-permissioning, weak authentication, and poor tool design are common

### MCP Security Controls and Approaches

**Recommended Controls:**
- Per-user authentication with scoped authorization
- Provenance tracking across agent workflows
- Containerized sandboxing with input/output checks
- Inline policy enforcement with DLP and anomaly detection
- Centralized governance using private registries or gateway layers

### Products with MCP Security Features

| Product | MCP Capability |
|---------|----------------|
| **Entro Security AGA** | MCP activity visibility, policy enforcement, audit trails |
| **Prompt Security** | Endpoint-level MCP server monitoring |
| **Kong AI Gateway** | MCP security gateway and tool governance |
| **Thales AI Security Fabric** | MCP security gateway (planned 2026) |
| **Microsoft Agent 365** | MCP policy enforcement via Defender/Entra |

### Best Practices for MCP Security

1. Create formal approval process for new MCP servers
2. Apply same rules as traditional API access
3. Snapshot tool metadata on connect and compare to approved contracts
4. Probe for prompt-injection and tool-poisoning
5. Verify "ask before edits" for destructive actions
6. Validate egress is pinned to approved hosts
7. Test resilience under load

---

## 6. Enterprise Security Vendors with AI Features

### Palo Alto Networks (Prisma Cloud AI-SPM)

**What They Do:**
AI Security Posture Management (AI-SPM) within Prisma Cloud, providing visibility and control over AI security components.

**Core Features:**
- Discover all AI applications, models, and resources
- Identify and trace lineage of AI components
- Vulnerability identification and misconfiguration prioritization
- PII detection in training data and model outputs
- Continuous monitoring of user interactions and prompts
- Rapid incident response workflows

**Target Market:**
Prisma Cloud customers deploying AI workloads

**Pricing:**
Part of Prisma Cloud licensing

**Strengths:**
- Integration with broader Prisma Cloud CNAPP
- Comprehensive AI asset discovery
- Strong compliance focus

---

### Varonis Atlas

**Company:** Varonis (launched March 2026)
**Website:** [varonis.com/blog/atlas-ai-security](https://www.varonis.com/blog/atlas-ai-security)

**What They Do:**
End-to-end AI Security Platform covering discovery, posture management, runtime protection, and compliance.

**Core Features:**
- Continuous discovery and posture management
- Runtime guardrails and AI pen testing
- Compliance reporting and third-party risk controls
- Detection & response integrations
- Connects to hosted AI platforms, custom LLMs, agentic frameworks, chatbots

**Strategic Moves:**
- Acquired AllTrue.ai for $150M (AI Trust, Risk, and Security Management)

**Target Market:**
Varonis customers with AI deployments

**Pricing:**
Free trial available; enterprise pricing

**Strengths:**
- Built on Varonis Data Security Platform (unique data context)
- End-to-end AI security lifecycle
- Strong data-centric approach

---

### Wiz AI-SPM

**Company:** Wiz
**Website:** [wiz.io/solutions/ai-spm](https://www.wiz.io/solutions/ai-spm)

**What They Do:**
First CNAPP to provide AI Security Posture Management, integrated into Wiz's cloud security platform.

**Core Features:**
- **AI-BOM (Bill of Materials):** Agentless discovery of AI services and SDKs
- **Configuration Management:** Built-in rules for AI service misconfigurations
- **Attack Path Analysis:** Deep cloud context for AI model vulnerabilities
- **Data Protection:** Sensitive training data detection
- **Runtime Protection:** Monitoring and automated response

**Target Market:**
Cloud-native organizations using Wiz

**Pricing:**
Part of Wiz platform licensing

**Strengths:**
- Agentless approach (no agent deployment)
- Deep cloud security context
- Attack path analysis for AI

---

### Check Point Infinity AI Copilot

**Company:** Check Point
**Website:** [checkpoint.com/ai/copilot](https://www.checkpoint.com/ai/copilot/)

**What They Do:**
AI-powered security assistant for automating cybersecurity management, with recent extensions for AI application security.

**Core Features:**
- Natural language security management
- Automated access rules and security controls
- AI incident correlation and analysis
- Integration with Copilot Studio for AI guardrails
- DLP and Threat Prevention for AI applications

**Target Market:**
Check Point customers

**Pricing:**
Part of Check Point Infinity platform

**Strengths:**
- 30 years of cybersecurity intelligence
- Reduces admin tasks by up to 90%
- Broad platform support

---

### Cisco Secure Access (Agentic AI)

**Company:** Cisco
**Website:** [cisco.com](https://newsroom.cisco.com/)

**What They Do:**
Identity and access management for agentic AI workforces with MCP policy enforcement.

**Core Features:**
- Duo IAM integration with MCP policy enforcement
- Intent-aware monitoring
- Strict access control for AI agents
- Full visibility and governance over agentic workforce

**Target Market:**
Cisco customers deploying AI agents

**Pricing:**
Part of Cisco security portfolio

**Strengths:**
- Enterprise networking expertise
- Identity-centric approach
- MCP policy enforcement

---

### Thales AI Security Fabric

**Company:** Thales
**Website:** [cpl.thalesgroup.com](https://cpl.thalesgroup.com/about-us/newsroom/thales-launches-ai-security-fabric)

**What They Do:**
Runtime security for Agentic AI and LLM-powered applications, protecting enterprise data and identities.

**Core Features:**
- Protection against prompt injection, data leakage, model manipulation
- Secure RAG pipeline protection
- Controlled dataset access for AI
- Cloud and on-premises deployment
- Integration with CipherTrust Data Security Platform

**Planned Features (2026):**
- MCP security gateway
- End-to-end runtime access control

**Target Market:**
Enterprises with data security requirements

**Pricing:**
Enterprise pricing (contact sales)

**Strengths:**
- Strong data security heritage
- CipherTrust integration
- Runtime security focus

---

### Securiti GenCore AI

**Company:** Securiti
**Website:** [securiti.ai/gencore](https://securiti.ai/gencore/)

**What They Do:**
Holistic solution for building safe enterprise AI systems with data governance foundation.

**Core Features:**
- **Data Command Graph:** Contextual insights about data and AI systems
- **AI Lifecycle Governance:** Oversight, security, and compliance
- **LLM Firewalls:** Intelligent retrieval, response, and prompt firewalls
- **Compliance:** EU AI Act, NIST AI RMF alignment
- **Enterprise Integration:** Data systems, LLMs, MLOps pipelines, security tools

**Target Market:**
Enterprises building AI systems with sensitive data

**Pricing:**
Enterprise pricing

**Strengths:**
- Strong data governance foundation
- Knowledge graph approach
- Comprehensive data protection

---

### Proofpoint AI Security

**Company:** Proofpoint
**Website:** [proofpoint.com](https://www.proofpoint.com/us/newsroom/press-releases/proofpoint-unveils-industrys-newest-intent-based-ai-security-solution)

**What They Do:**
Intent-based AI security solution with Agent Integrity Framework for protecting enterprise AI agents.

**Core Features:**
- Intent-based detection
- Multi-surface control points
- Five-phase maturity model for implementation
- Discovery through runtime enforcement
- Agent Integrity Framework

**Target Market:**
Enterprises deploying AI agents

**Pricing:**
Enterprise pricing

**Strengths:**
- Intent-based approach (unique differentiator)
- Comprehensive implementation framework
- Enterprise security expertise

---

## 7. Open Source Projects

### Summary Table

| Project | Focus | Stars | Key Features |
|---------|-------|-------|--------------|
| **Langfuse** | Observability | 10k+ | Tracing, evals, prompt management |
| **Arize Phoenix** | Observability | 8k+ | Tracing, experiments, datasets |
| **Helicone** | Observability | 3k+ | Gateway, logging, analytics |
| **NeMo Guardrails** | Guardrails | 4k+ | Colang, dialog control, multi-rail |
| **Guardrails AI** | Guardrails | 4k+ | Validators, Hub, structured output |
| **LLM Guard** | Security | 2k+ | Scanners, sanitization, PII |

### LLM Guard (Protect AI)

**Repository:** [github.com/protectai/llm-guard](https://github.com/protectai/llm-guard)

**What It Does:**
Security toolkit for LLM applications with built-in sanitization, harmful language detection, and prompt injection defense.

**Core Features:**
- Input and output scanners
- PII anonymization and secret redaction
- Prompt injection detection
- Jailbreak prevention
- Customizable for specific use cases

**License:** Permissive open source

**Commercial Version:** Coming soon via Protect AI platform

**Strengths:**
- Comprehensive scanner library
- Easy to integrate
- Active development

---

### HiddenLayer

**Company:** HiddenLayer
**Website:** Available on AWS Marketplace

**What They Do:**
Real-time detection and prevention of adversarial attacks against AI models.

**Core Features:**
- Model theft protection
- Data poisoning detection
- Evasion attack prevention
- MLOps workflow integration
- Real-time monitoring

**Target Market:**
ML teams with deployed models

**Pricing:**
Enterprise custom pricing

**Strengths:**
- Focus on adversarial ML attacks
- Easy MLOps integration
- Real-time protection

---

## 8. Emerging Players

### Geordie AI (RSAC 2026 Innovation Sandbox)

**What They Do:**
Agent-native security platform for enterprises enabling real-time discovery, behavior monitoring, and risk control of AI agents.

**Target Market:**
Enterprises with deployed AI agents

**Status:**
Early stage; featured at RSAC 2026 Innovation Sandbox

---

### Arcjet

**What They Do:**
Inline defense against prompt injection in production AI systems at the application boundary.

**Core Features:**
- Detects hostile prompts before reaching models
- Integration with Vercel AI SDK, LangChain
- Direct application code integration

**Target Market:**
Developers building AI applications

---

### Bifrost

**What They Do:**
Ultra-low latency governance for AI applications (11 microsecond latency).

**Target Market:**
High-throughput AI applications

**Differentiator:**
Extreme performance for governance without bottlenecks

---

### Noma Security / Aim Security / Mindgard

**What They Do:**
Various approaches to LLM security and AI protection.

**Status:**
Emerging vendors in the LLM security space

---

## 9. Market Analysis & Recommendations

### Market Segmentation

| Segment | Market Size (2026) | Growth Rate | Key Players |
|---------|-------------------|-------------|-------------|
| LLM Firewalls | ~$60M | 100% | Lakera, CalypsoAI, Radware, Akamai |
| AI Observability | ~$500M | 45% | Datadog, Arize, LangSmith, Langfuse |
| AI Governance | ~$200M | 60% | Credo AI, Holistic AI, IBM, OneTrust |
| AI-SPM | ~$100M | 80% | Wiz, Palo Alto, Varonis |

### Competitive Positioning Matrix

```
                    Depth of AI Security
                           ^
                           |
    Specialized      +-----|-----+
    AI Security      | Lakera   |
                     | CalypsoAI|
                     | Prompt   |
                     +----------+
                           |
                     +-----|-----+
    Platform         | Credo AI |
    Approach         | Holistic |
                     | Arthur   |
                     +----------+
                           |
                     +-----|-----+
    Enterprise       | Datadog  |
    Extension        | Palo Alto|
                     | Varonis  |
                     +----------+
                           |
    ---------------------->|---------------------->
                    Breadth of Enterprise Integration
```

### Key Selection Criteria

1. **For Startups/SMBs:**
   - Open source first (Langfuse, LLM Guard, NeMo Guardrails)
   - Low-cost observability (Helicone, Phoenix)
   - Usage-based pricing (Lakera Starter, Cloudflare)

2. **For Mid-Market:**
   - Balanced cost/features (LangSmith Plus, TrueFoundry Pro)
   - Managed services with self-hosting options
   - Integration with existing tools

3. **For Enterprise:**
   - Compliance-focused platforms (Credo AI, Holistic AI, IBM)
   - Existing vendor extensions (Datadog, Palo Alto, Microsoft)
   - Custom pricing with SLAs

4. **For Regulated Industries:**
   - Strong compliance automation (Credo AI, OneTrust, IBM)
   - Data residency options (self-hosted, BYOC)
   - Audit trails and evidence generation

### Technology Recommendations by Use Case

| Use Case | Recommended Stack |
|----------|-------------------|
| **Basic LLM App Security** | LLM Guard (OSS) + Langfuse |
| **Enterprise LLM Deployment** | Lakera + LangSmith Enterprise |
| **Full AI Governance** | Credo AI + Datadog LLM Obs |
| **Cloud-Native AI Security** | Wiz AI-SPM + Cloudflare Gateway |
| **Microsoft Ecosystem** | Agent 365 + Purview + Defender |
| **Agent/MCP Security** | Entro AGA + Prompt Security |
| **High-Performance Guardrails** | NeMo Guardrails + Bifrost |

### Gaps and Opportunities

1. **MCP Security:** Limited dedicated tooling; mostly extensions of existing products
2. **Agent-to-Agent Security:** Emerging concern with minimal solutions
3. **Cross-Platform Governance:** Most solutions optimize for single cloud/ecosystem
4. **Real-Time Kill Switches:** Most can monitor but few can intervene in real-time
5. **Small Business Solutions:** Market heavily focused on enterprise

### Future Trends (2026-2027)

1. **Consolidation:** Expect M&A as security vendors acquire AI-native startups
2. **Platform Convergence:** Observability, security, and governance merging
3. **Agentic Focus:** Shift from LLM security to agent security
4. **Regulatory Pressure:** EU AI Act enforcement driving compliance tooling
5. **MCP Standardization:** Security standards emerging for MCP ecosystem

---

## Sources

### LLM Security & Firewalls
- [Lakera Guard](https://www.lakera.ai/lakera-guard)
- [Akamai Firewall for AI](https://www.akamai.com/products/firewall-for-ai)
- [Radware LLM Firewall](https://www.msspalert.com/news/radware-combines-ai-agent-llm-firewall-tools-to-give-enterprises-mssps-a-full-ai-security-portfolio)
- [CalypsoAI](https://calypsoai.com/)
- [Prompt Security](https://prompt.security/)
- [TechTarget: LLM Firewalls](https://www.techtarget.com/searchsecurity/feature/LLM-firewalls-emerge-as-a-new-AI-security-layer)

### AI Observability
- [Arize AI](https://arize.com/)
- [Phoenix Pricing](https://phoenix.arize.com/pricing/)
- [Datadog LLM Observability](https://www.datadoghq.com/product/ai/llm-observability/)
- [LangSmith](https://www.langchain.com/langsmith-platform)
- [Langfuse GitHub](https://github.com/langfuse/langfuse)
- [TrueFoundry](https://www.truefoundry.com/)
- [Helicone GitHub](https://github.com/Helicone/helicone)
- [Arthur AI](https://www.arthur.ai/)

### AI Governance
- [Credo AI](https://www.credo.ai/)
- [Holistic AI](https://www.holisticai.com/)
- [IBM watsonx.governance](https://www.ibm.com/products/watsonx-governance)
- [OneTrust AI Governance](https://www.onetrust.com/solutions/ai-governance/)
- [Microsoft Agent 365](https://www.microsoft.com/en-us/microsoft-agent-365)
- [Entro Security AGA](https://www.helpnetsecurity.com/2026/03/19/entro-agentic-governance-administration/)

### AI Guardrails
- [NVIDIA NeMo Guardrails](https://developer.nvidia.com/nemo-guardrails)
- [Guardrails AI](https://guardrailsai.com/)
- [Cloudflare AI Gateway Guardrails](https://developers.cloudflare.com/ai-gateway/features/guardrails/)
- [Galileo: Best AI Guardrails Platforms](https://galileo.ai/blog/best-ai-guardrails-platforms)

### Enterprise Security Vendors
- [Palo Alto Networks AI-SPM](https://www.paloaltonetworks.com/prisma/cloud/ai-spm)
- [Varonis Atlas](https://www.varonis.com/blog/atlas-ai-security)
- [Wiz AI-SPM](https://www.wiz.io/solutions/ai-spm)
- [Check Point Infinity AI Copilot](https://www.checkpoint.com/ai/copilot/)
- [Thales AI Security Fabric](https://cpl.thalesgroup.com/about-us/newsroom/thales-launches-ai-security-fabric)
- [Securiti GenCore AI](https://securiti.ai/gencore/)

### MCP Security
- [MCP Security Best Practices](https://modelcontextprotocol.io/specification/draft/basic/security_best_practices)
- [Red Hat: MCP Security Risks](https://www.redhat.com/en/blog/model-context-protocol-mcp-understanding-security-risks-and-controls)
- [Arxiv: Securing MCP](https://arxiv.org/html/2511.20920v1)
- [Kong: MCP Tool Governance](https://konghq.com/blog/engineering/mcp-tool-governance-security-meets-context-efficiency)

### Market Analysis
- [Bessemer: Securing AI Agents 2026](https://www.bvp.com/atlas/securing-ai-agents-the-defining-cybersecurity-challenge-of-2026)
- [Microsoft Security Blog](https://www.microsoft.com/en-us/security/blog/2026/03/20/secure-agentic-ai-end-to-end/)
- [Cisco Agentic Workforce](https://newsroom.cisco.com/c/r/newsroom/en/us/a/y2026/m03/cisco-reimagines-security-for-the-agentic-workforce.html)

---

*Document prepared for strategic planning purposes. Market data and pricing subject to change. Last updated: March 2026.*
