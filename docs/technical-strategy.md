# Aegis Technical Strategy: Grounded Analysis

Based on comprehensive research into enterprise deployment patterns, MCP security landscape, OS vs prompt-level feasibility, and feature prioritization.

---

## Executive Summary

### The Honest Answer to Your Questions

| Question | Research Answer |
|----------|-----------------|
| **Should we compete with big players?** | No - target MCP security + observability niche first |
| **OS-level enforcement - feasible?** | Cloud sandbox YES (Firecracker), cross-platform agent NO (12-18 months) |
| **Prompt vs OS layer - which to focus?** | Both needed, but cloud sandbox is deployable NOW |
| **What's the wedge feature?** | Observability-first (30-35% of budget), MCP security as differentiator |
| **MCP proxy vs secure MCPs?** | MCP Proxy is the path - intercept, don't replace |

---

## 1. Feature Prioritization: What to Build First

### Research Finding: Observability is the Wedge

| Feature | Ease of Deploy | Value Perception | Competition | Score |
|---------|----------------|------------------|-------------|-------|
| **Observability + Threat Detection** | 9/10 | 9/10 | 6/10 | **8.6/10** ✓ |
| **MCP Security** | 6/10 | 9/10 | 9/10 | **7.6/10** |
| **Prompt Injection** | 9/10 | 7/10 | 4/10 | 7.2/10 |
| **Policy Enforcement** | 5/10 | 8/10 | 8/10 | 6.0/10 |
| **Compliance/Governance** | 5/10 | 9/10 | 6/10 | 5.4/10 |
| **Agent Identity** | 4/10 | 8/10 | 5/10 | 4.8/10 |

### Why Observability First?

1. **30-35% of AI security budget** goes to discovery/visibility
2. **Only 24.4%** have full visibility into agent communication
3. **Mirrors Wiz playbook** - "show me what I don't know" → land customers
4. **Enables everything else** - can't enforce policies on agents you can't see
5. **LangSmith/Langfuse aren't security-focused** - gap in market

### Recommended Build Sequence

| Timeline | Feature | Rationale |
|----------|---------|-----------|
| **Months 1-3** | Core observability + MCP inventory | Fast value, land customers |
| **Months 4-6** | MCP proxy + policy engine | Differentiation, upsell |
| **Months 7-9** | Prompt injection + compliance | Feature parity |
| **Months 10-12** | Cloud sandbox for code execution | Premium tier |

---

## 2. MCP Security: The Differentiator

### What Exists Today

| Tool | Type | Open Source | Key Capability |
|------|------|-------------|----------------|
| **Snyk mcp-scan** (ex-Invariant) | Scanner | Yes | Tool pinning, rug pull detection |
| **Cisco MCP Scanner** | Scanner | Yes | YARA rules, behavioral analysis |
| **Enkrypt AI MCP Scan** | Scanner | No | Static analysis, CI/CD integration |
| **MCPScan.ai** | Scanner | No | Web-based, monitoring |
| **MintMCP Gateway** | Gateway | No | SOC 2 certified, OAuth 2.0 |
| **Speakeasy** | Gateway | No | Enterprise SSO, RBAC |

### What "MCP Scanner" Means Technically

```
1. Connect to MCP server
2. Retrieve tool list (tools/list)
3. For each tool:
   - Analyze name, description, input schema
   - Scan for prompt injection patterns
   - Check for suspicious instructions
   - Hash tool definition (rug pull detection)
4. If source available: static code analysis
5. Report vulnerabilities
```

### MCP Architecture Decision

| Option | Pros | Cons | Recommendation |
|--------|------|------|----------------|
| **MCP Proxy** | Single enforcement point, works with any MCP | Latency, single point of failure | **BUILD THIS** |
| **Secure MCP Registry** | Preventive, community-driven | Can't stop runtime attacks | Complement only |
| **MCP Wrapper/Sandbox** | Blast radius containment | Performance overhead | For high-risk |

### Why MCP Proxy Wins

1. **Retrofits security** onto existing MCP servers
2. **Complete visibility** into all tool calls
3. **Policy enforcement** without modifying agents
4. **Latency is acceptable** - optimized gateways achieve <5ms overhead
5. **Matches enterprise expectations** - they understand proxies

### MCP Proxy MVP Features

```
┌─────────────────────────────────────────────┐
│              AEGIS MCP PROXY                │
├─────────────────────────────────────────────┤
│ • Authentication (OAuth 2.1 with PKCE)      │
│ • Tool-level authorization (RBAC)           │
│ • Request/response logging (audit trail)    │
│ • Tool pinning (hash verification)          │
│ • Rate limiting (per agent, per tool)       │
│ • PII detection (output filtering)          │
│ • Anomaly alerting                          │
└─────────────────────────────────────────────┘
```

---

## 3. OS-Level vs Prompt-Level: Honest Assessment

### Prompt-Level Security Reality

| Aspect | Finding |
|--------|---------|
| **Detection accuracy** | 92.5% best case (Lakera benchmark) |
| **Bypass rate** | 76-98% for novel attacks (FlipAttack: 98%) |
| **Limitation** | Stateless analysis misses conversational attacks |
| **Verdict** | Necessary but insufficient for high-risk agents |

**Key insight**: Prompt-level security "largely fails against attacks that omit explicit instructions or employ imperceptible perturbations."

### OS-Level Enforcement Reality

| Technology | Isolation | Startup | Cross-Platform | Feasible? |
|------------|-----------|---------|----------------|-----------|
| **Firecracker MicroVM** | Hardware (KVM) | 28ms (snapshot) | Linux only | **YES** |
| **gVisor** | User-space kernel | ~50ms | Linux only | YES |
| **Cloudflare V8 Isolates** | Process | <1ms | Any | YES (weaker) |
| **Cross-platform agent** | Kernel | N/A | All OS | **12-18 months** |

### The Uncomfortable Truth

**Cross-platform endpoint agent is HARD:**
- Requires separate implementations for Linux/macOS/Windows
- Each OS has different security primitives
- Enterprises resistant to installing new kernel-level agents
- 12-18 months minimum for production quality

**Cloud sandbox is EASY:**
- Firecracker boot: 28ms with snapshots
- Used by ~50% of Fortune 500 for AI workloads
- No endpoint installation required
- Ship in 3-6 months

### Recommended Approach

```
Phase 1 (MVP): Cloud-hosted + Proxy
├── MCP Proxy for tool security
├── API Gateway for prompt detection
└── No endpoint agent required

Phase 2: Cloud Sandbox
├── Firecracker pools for code execution
├── Strong isolation for untrusted agents
└── 28ms startup with snapshots

Phase 3 (Optional): Endpoint
├── Only if desktop AI becomes critical
├── Partner with existing EDR vendors
└── Don't build cross-platform yourself
```

---

## 4. Enterprise Deployment Reality

### How Agents Are Actually Deployed

| Infrastructure | Percentage | Security Implication |
|----------------|------------|---------------------|
| **Kubernetes/Containers** | 60-70% | Can integrate at cluster level |
| **Serverless + Managed LLM** | 20-30% | Must proxy API calls |
| **On-premises** | 10-20% | VPC-deployable version needed |

### Framework Market Share

| Framework | Downloads | Maturity | Integration Priority |
|-----------|-----------|----------|---------------------|
| **LangChain/LangGraph** | 47M/month | Production | P0 |
| **CrewAI** | 5.2M/month | Production | P1 |
| **AutoGen/Microsoft** | Growing | Production | P1 |
| **Custom** | N/A | Varies | P2 |

### The Security Gap

| Stat | Finding |
|------|---------|
| **14.4%** | Agents with full security/IT approval |
| **47.1%** | Agents actively monitored |
| **88%** | Orgs with security incidents |
| **33%** | Orgs lacking audit trails |

**This is the opportunity** - massive gap between deployment and security.

---

## 5. Integration Strategy: Path of Least Resistance

### Deployment Friction (Easiest → Hardest)

```
API Proxy → SDK → K8s Operator → VPC Deploy → Endpoint Agent
  (days)   (days)   (weeks)      (weeks)      (months)
```

### P0 Integrations (Must Have for Launch)

| Integration | Why | Effort |
|-------------|-----|--------|
| **LangChain/LangGraph SDK** | 47M downloads, dominant | 2-4 weeks |
| **GitHub Actions** | Shift-left, CI/CD | 1-2 weeks |
| **OpenTelemetry export** | Standard observability | 1-2 weeks |

### P1 Integrations (For Enterprise Sales)

| Integration | Why | Effort |
|-------------|-----|--------|
| **Datadog/Splunk** | Enterprise SIEM | 2-4 weeks |
| **Okta/Azure AD** | Enterprise IAM | 2-4 weeks |
| **AWS Bedrock** | 29-32% market share | 2-4 weeks |

---

## 6. Strategic Recommendation

### The Niche to Own

**"Security-first observability for AI agents with MCP-native capabilities"**

Why this wins:
1. **LangSmith/Langfuse** = debugging tools, not security
2. **Lakera** = prompt injection point solution
3. **Wiz/Palo Alto** = cloud posture, not agent-specific
4. **Nobody** = MCP security + observability combined

### Product Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        AEGIS PLATFORM                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌───────────────────┐  ┌───────────────────┐                  │
│  │  OBSERVABILITY    │  │  MCP PROXY        │                  │
│  │  ─────────────    │  │  ─────────────    │                  │
│  │  • Agent tracing  │  │  • Auth/authz     │                  │
│  │  • Tool calls     │  │  • Tool pinning   │                  │
│  │  • Anomalies      │  │  • Rate limiting  │                  │
│  │  • Cost tracking  │  │  • PII filtering  │                  │
│  └───────────────────┘  └───────────────────┘                  │
│                                                                  │
│  ┌───────────────────┐  ┌───────────────────┐                  │
│  │  POLICY ENGINE    │  │  COMPLIANCE       │                  │
│  │  ─────────────    │  │  ─────────────    │                  │
│  │  • Rules DSL      │  │  • Audit logs     │                  │
│  │  • Enforcement    │  │  • SOC 2 reports  │                  │
│  │  • Alerts         │  │  • EU AI Act      │                  │
│  └───────────────────┘  └───────────────────┘                  │
│                                                                  │
├─────────────────────────────────────────────────────────────────┤
│  SDK: LangChain | CrewAI | Custom                               │
│  Export: OpenTelemetry | Datadog | Splunk                       │
└─────────────────────────────────────────────────────────────────┘
```

### What NOT to Build

| Don't Build | Why |
|-------------|-----|
| Cross-platform endpoint agent | 12-18 months, partner instead |
| Prompt injection from scratch | Commoditizing, integrate existing |
| Agent identity (like Okta) | Giants moving here, avoid |
| Full governance platform | Credo AI, Holistic AI own this |

### 90-Day Technical Plan

**Month 1: Foundation**
- [ ] SDK for LangChain/LangGraph (observability)
- [ ] Basic dashboard (traces, tool calls, costs)
- [ ] OpenTelemetry export

**Month 2: MCP Security**
- [ ] MCP proxy prototype (auth, logging, tool pinning)
- [ ] Integration with 3 design partners
- [ ] Basic policy engine (allow/deny rules)

**Month 3: Launch**
- [ ] Public launch (free tier)
- [ ] GitHub Actions integration
- [ ] Documentation + viral "MCP Security Scanner" tool

---

## 7. Pricing Based on Research

| Tier | Price | Features | Target |
|------|-------|----------|--------|
| **Community** | Free | 100K events/mo, basic observability | Developers |
| **Team** | $500/mo | 1M events, MCP proxy, policies | Startups |
| **Business** | $2,000/mo | 10M events, compliance reports, SSO | Mid-market |
| **Enterprise** | Custom | Unlimited, VPC deploy, SLA | Enterprise |

---

## Key Research Sources

- [Gravitee State of AI Agent Security 2026](https://www.gravitee.io/blog/state-of-ai-agent-security-2026-report-when-adoption-outpaces-control)
- [Obsidian Security AI Agent Market Landscape](https://www.obsidiansecurity.com/blog/ai-agent-market-landscape)
- [Snyk mcp-scan](https://github.com/invariantlabs-ai/mcp-scan)
- [Cisco MCP Scanner](https://github.com/cisco-ai-defense/mcp-scanner)
- [Vulnerable MCP Project](https://vulnerablemcp.info/)
- [Northflank: How to Sandbox AI Agents](https://northflank.com/blog/how-to-sandbox-ai-agents)
- [MintMCP Gateway](https://www.mintmcp.com/mcp-gateway)

---

*Last Updated: March 2026*
