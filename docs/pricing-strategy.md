# Aegis Pricing Strategy

## Market Research: How Competitors Price

### AI Gateways & Proxies

| Competitor | Model | Free Tier | Paid Tiers | Notes |
|------------|-------|-----------|------------|-------|
| **Portkey** | Usage + seats | Limited | $49-$499/mo + usage | Complex, hard to predict |
| **LiteLLM Cloud** | Usage | 100 req/day | Custom enterprise | Open source free |
| **Cloudflare AI Gateway** | Requests | 100K/day free | Workers pricing | Very generous free |
| **Helicone** | Requests + seats | 10K req/mo | $20/seat + usage | Per-seat model |
| **Kong AI Gateway** | Complex | - | $10K-$100K+/yr | Enterprise only |

### AI Observability

| Competitor | Model | Free Tier | Paid Tiers | Notes |
|------------|-------|-----------|------------|-------|
| **LangSmith** | Traces + seats | 5K traces/mo | $39/seat + $2.50/1K traces | LangChain lock-in |
| **Langfuse** | Events | 50K/mo | $29-$2,499/mo | Self-host free |
| **Datadog LLM** | Spans | None | $0.008/span + $120/day | Very expensive |
| **Arize Phoenix** | Self-host | Unlimited | Enterprise custom | Open source |

### AI Security

| Competitor | Model | Free Tier | Paid Tiers | Notes |
|------------|-------|-----------|------------|-------|
| **Lakera Guard** | Requests | Limited | ~$0.001-0.003/req | Per-request |
| **NeMo Guardrails** | Self-host | Unlimited | - | Open source |
| **Palo Alto AIRS** | Enterprise | - | $100K-$500K/yr | Bundle deals |

---

## Pricing Philosophy

### Principles

1. **Value-based, not cost-based** - Price on value of preventing incidents, not our compute cost
2. **Predictable** - Customers hate surprise bills (pain point from research)
3. **Land and expand** - Free tier to get in, expand with usage
4. **Agent-centric** - Price by protected agents, not seats (aligns with value)
5. **Policy evaluations** - Core metric that scales with usage

### What Customers Are Willing to Pay (From Research)

| Category | Willingness to Pay | Evidence |
|----------|-------------------|----------|
| Basic security | 5-10% premium | Entry-level features |
| Advanced governance | 15-25% premium | Most pain here |
| Enterprise compliance | 30-40% premium | Audit, SOC2, HIPAA |
| **Incident prevention** | **$50K-$500K/year** | $47K bills, Meta Sev 1 incidents |

### Our Value Proposition

**What's the cost of NOT having Aegis?**

| Incident Type | Potential Cost | Aegis Prevention |
|---------------|---------------|------------------|
| Runaway agent costs | $47K+ per incident | Cost policies |
| Data exposure (Meta-style) | $1M+ in remediation | Tool call policies |
| Database deletion | $100K+ downtime | Destructive action blocks |
| Compliance failure | $1M+ fines | Audit trail, policies |
| Prompt injection breach | $500K+ | Integrated detection |

**If Aegis prevents ONE major incident per year, it pays for itself 10x.**

---

## Recommended Pricing Tiers

### Tier Structure

| Tier | Price | Policy Evals | Agents | Users | Key Features |
|------|-------|--------------|--------|-------|--------------|
| **Free** | $0 | 10K/mo | 5 | 1 | Basic policies, 7-day audit |
| **Starter** | $99/mo | 100K/mo | 25 | 3 | All policy types, 30-day audit, email alerts |
| **Team** | $399/mo | 1M/mo | 100 | 10 | Lakera integration, Slack alerts, 90-day audit |
| **Business** | $999/mo | 10M/mo | 500 | 25 | SSO, approvals, priority support, 1-year audit |
| **Enterprise** | Custom | Unlimited | Unlimited | Unlimited | Self-host, SLA, compliance reports, dedicated support |

### Why These Numbers?

**Free Tier:**
- 10K policy evaluations = ~100 tool calls/day with 3 policies each
- Enough for a developer testing, not enough for production
- 5 agents = one small project

**Starter ($99/mo):**
- 100K evals = ~3K tool calls/day = small production deployment
- Comparable to LangSmith's entry ($39/seat but 3 seats = $117)
- Lower than Portkey's Team ($299)

**Team ($399/mo):**
- 1M evals = ~30K tool calls/day = serious production
- Includes Lakera (would cost $300+/mo separately)
- Comparable to Langfuse Pro ($249) + Lakera

**Business ($999/mo):**
- 10M evals = 300K tool calls/day = enterprise scale
- SSO is table stakes for enterprise
- Human approvals is killer feature
- Still cheaper than Datadog ($120/day = $3,600/mo baseline)

**Enterprise (Custom, $25K-$100K/year):**
- Self-hosted option
- Compliance reports (SOC2, HIPAA)
- SLA with guarantees
- Dedicated support

---

## Alternative Pricing Models Considered

### Model A: Per-Request (Like Lakera)

```
$0.001 per policy evaluation
```

**Pros:** Simple, scales linearly
**Cons:** Unpredictable bills, customers hate this

**Verdict:** ❌ Don't do this - unpredictable pricing is a pain point

### Model B: Per-Agent (Like Langfuse)

```
$10/agent/month
```

**Pros:** Predictable, aligns with value
**Cons:** Hard to define "agent", gaming potential

**Verdict:** ⚠️ Consider as hybrid with evals

### Model C: Per-Seat (Like LangSmith)

```
$39/user/month
```

**Pros:** Familiar, predictable
**Cons:** Doesn't scale with value (one user can have 1000 agents)

**Verdict:** ❌ Not aligned with our value

### Model D: Tiered with Overages (Recommended)

```
$399/mo includes 1M evals
$0.30 per 1K additional evals
```

**Pros:** Predictable base, scales with usage, no surprise bills
**Cons:** Slightly complex

**Verdict:** ✅ Best balance

---

## Final Pricing Recommendation

### Pricing Table

| | **Free** | **Starter** | **Team** | **Business** | **Enterprise** |
|---|---|---|---|---|---|
| **Price** | $0 | $99/mo | $399/mo | $999/mo | Custom |
| **Annual** | - | $990/yr (save 17%) | $3,990/yr (17%) | $9,990/yr (17%) | Negotiated |
| **Policy Evals** | 10K/mo | 100K/mo | 1M/mo | 10M/mo | Unlimited |
| **Overage** | Block | $1/1K | $0.50/1K | $0.30/1K | Included |
| **Agents** | 5 | 25 | 100 | 500 | Unlimited |
| **Users** | 1 | 3 | 10 | 25 | Unlimited |
| **Audit Retention** | 7 days | 30 days | 90 days | 1 year | Custom |
| **Support** | Community | Email | Email + Slack | Priority | Dedicated |
| | | | | | |
| **Features** | | | | | |
| Tool call policies | ✓ | ✓ | ✓ | ✓ | ✓ |
| Prompt policies | ✓ | ✓ | ✓ | ✓ | ✓ |
| MCP policies | - | ✓ | ✓ | ✓ | ✓ |
| Cost policies | - | ✓ | ✓ | ✓ | ✓ |
| Virtual keys | ✓ | ✓ | ✓ | ✓ | ✓ |
| Lakera integration | - | - | ✓ | ✓ | ✓ |
| Slack/webhook alerts | - | - | ✓ | ✓ | ✓ |
| Human approvals | - | - | - | ✓ | ✓ |
| SSO (OIDC/SAML) | - | - | - | ✓ | ✓ |
| Self-hosted | - | - | - | - | ✓ |
| SLA | - | - | - | 99.9% | 99.99% |
| Compliance reports | - | - | - | - | ✓ |

---

## Revenue Projections

### Assumptions

- 6 months to 50 paying customers
- 12 months to 200 paying customers
- Distribution: 40% Starter, 35% Team, 20% Business, 5% Enterprise

### Year 1 Projections

| Month | Free | Starter | Team | Business | Enterprise | MRR |
|-------|------|---------|------|----------|------------|-----|
| 3 | 100 | 5 | 3 | 1 | 0 | $2,691 |
| 6 | 300 | 20 | 15 | 10 | 2 | $21,880 |
| 9 | 600 | 50 | 40 | 25 | 5 | $68,950 |
| 12 | 1000 | 80 | 70 | 40 | 10 | $125,520 |

**Year 1 ARR Target:** ~$1.5M

### Break-even Analysis

| Cost Category | Monthly |
|---------------|---------|
| Infrastructure (AWS/GCP) | $5,000 |
| Integrations (Lakera, etc.) | $2,000 |
| Tools (Vercel, Supabase, etc.) | $1,000 |
| **Total Fixed** | $8,000 |

**Break-even:** ~80 Starter customers OR ~20 Team customers

---

## Competitive Positioning

### Price Comparison

```
                          MONTHLY COST
                  $0    $100   $500   $1000  $5000
                  |      |      |      |      |
Cloudflare        ████ (free core)
Aegis Free        ████
LangSmith (1 seat)      ███
Aegis Starter           ████
Langfuse Pro            █████
Portkey Team                  ████████
Aegis Team                    ██████
Helicone Pro                  ███████
Aegis Business                       █████████
Datadog LLM                          ████████████████████
Kong                                              ██████████████
```

### Value Positioning

| Competitor | Their Value Prop | Our Counter |
|------------|-----------------|-------------|
| **LangSmith** | "Debug LangChain" | "Secure any agent, not just LangChain" |
| **Langfuse** | "Open source observability" | "Observability + enforcement" |
| **Portkey** | "AI gateway" | "Policy-first gateway" |
| **Datadog** | "Part of your APM" | "Purpose-built for AI, 10x cheaper" |
| **Lakera** | "Prompt security" | "Full agent security, not just prompts" |

---

## Pricing FAQ

### "Why per-evaluation, not per-request?"

A single agent request might trigger multiple policy evaluations (tool call + prompt + cost check). Charging per-evaluation is more accurate to our compute cost and scales with the security value we provide.

### "What counts as a policy evaluation?"

Each time we check a request against your policies. If you have 5 policies and make 1 request, that's potentially 5 evaluations (though we optimize with short-circuiting).

### "Can we self-host to avoid limits?"

Enterprise tier includes self-hosted option. You pay for support and features, not usage.

### "What happens when we hit limits?"

- Free tier: Requests are blocked until next month
- Paid tiers: Overages charged at published rates, no blocking

### "Do you offer discounts?"

- Annual billing: 17% discount
- Startups (<$5M raised): 50% off first year
- Non-profits: 50% off always
- Education: Free Team tier

---

## Launch Pricing Strategy

### Phase 1: Design Partners (Months 1-3)

- Free access for first 10 design partners
- Collect feedback on pricing tolerance
- Test value proposition

### Phase 2: Early Access (Months 4-6)

- 50% discount for early adopters
- Lock in pricing for 2 years
- Focus on Starter and Team tiers

### Phase 3: General Availability (Month 7+)

- Full pricing
- Introduce Business and Enterprise
- Add annual discounts

---

## Open Questions

1. **Should we offer per-agent pricing as alternative?**
   - Simpler to understand
   - Might appeal to enterprises with many agents

2. **Self-hosted pricing?**
   - Flat license fee vs per-node?
   - Support tiers?

3. **Usage-based add-ons?**
   - Lakera integration: included or extra?
   - Extended audit retention: extra?

4. **Reseller/partner pricing?**
   - For SIs and consultants
   - White-label options?

---

*Last Updated: March 2026*
