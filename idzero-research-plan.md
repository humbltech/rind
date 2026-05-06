# idzero: Market Research & Differentiation Analysis
**Status:** Deferred pending market research  
**Purpose:** Properly evaluate idzero viability before running strategic-council on RIND vs idzero  
**Trigger:** Complete this research, THEN run strategic-council with full evidence

---

## Research Objective

Understand what makes idzero potentially viable, not as "Auth0 competitor" but as a **uniquely differentiated identity/auth platform**.

Original vision: "Something better that others are not doing. Better user experience, smoother, less friction."

Questions to answer via research:
1. **What is Auth0 NOT doing well?** (Where is the frustration in the market?)
2. **What is a potential idzero competitive advantage?** (UX, compliance, specific verticals, developer experience, pricing, speed, integration?)
3. **What market is underserved?** (Not enterprise software in general, but a specific segment Auth0 ignores or does poorly)
4. **Can we sustain differentiation against Auth0?** (Is this a moat or a temporary advantage?)
5. **What would need to be true for idzero to reach $100K+ MRR?** (TAM, pricing, sales cycle, customer acquisition cost)

---

## Research Tasks

### Phase 1: Competitive Analysis (1 week)

**Task 1.1: Auth0 Customer Interviews**
- Interview 5-10 Auth0 customers (target: startups, scaleups, specific verticals like fintech/healthcare)
- Questions:
  - What does Auth0 do well? Poorly?
  - What would make you switch to a competitor?
  - What do you pay Auth0? What's your cost vs value?
  - Are there compliance, speed, UX, or integration gaps?
- Output: Frustration map (what Auth0 misses)

**Task 1.2: Okta, Amazon Cognito, Firebase Auth Competitive Analysis**
- How do these differ from Auth0?
- Which segments do they serve well/poorly?
- What's Auth0's moat vs these competitors?
- Output: Competitive positioning matrix

**Task 1.3: Auth0 Public Data**
- Review Auth0 Changelog (what features are they shipping?)
- Review Auth0 Pricing + pricing complaints (Reddit, HN, G2 reviews)
- Review Auth0 Competitor Mentions (who do customers compare Auth0 to?)
- Output: Auth0's roadmap + pricing pain points

### Phase 2: Market Segmentation (1 week)

**Task 2.1: Identify Underserved Segments**
- Enterprise (Auth0's core) — well-served
- Mid-market (Auth0 is expensive, Okta is costly) — possible gap
- Startups (Firebase Auth, Auth0 free tier) — well-served
- **Healthcare + Compliance (HIPAA, PIPEDA)** — Auth0 is enterprise-only, startups have gap?
- **Fintech + Compliance (PCI, SOX)** — similar gap?
- **Government / GxP (FDA)** — Auth0 is expensive, smaller vendors exist
- **Specific integrations** — e.g., Auth0 lacks [X] integration that [segment] needs
- Output: Segmentation matrix (TAM per segment, Auth0 penetration, gaps)

**Task 2.2: Interview Segment Leaders**
- Interview 5-10 companies in 2-3 underserved segments
- Questions:
  - Why did you choose your identity solution?
  - What do you wish it did?
  - What would you pay for [missing feature]?
  - What would make you switch?
- Output: Validation of segment frustration

### Phase 3: Differentiation Hypothesis (1 week)

**Task 3.1: Define idzero's Potential Advantages**
- Based on research, what could idzero do **better than Auth0**?
- Options:
  - **Healthcare/Compliance Focus** — HIPAA-optimized, PIPEDA-compliant, compliance built-in (not bolted-on)
  - **Developer Experience** — faster to integrate, simpler API, better docs, better SDK (Auth0 SDKs are bloated)
  - **Pricing Model** — flat fee vs per-user, lower cost for startups, transparent pricing
  - **Vertical Solutions** — fintech identity, healthcare identity, education identity (Auth0 is horizontal)
  - **Speed** — faster to deploy, fewer config steps, better onboarding
  - **Integration Breadth** — integrate with [specific tools] that Auth0 doesn't support well (e.g., Stripe → compliance)
  - **Open Source** — self-hostable identity platform (vs Auth0's proprietary)

**Task 3.2: Validate Top 3 Hypotheses**
- Pick top 3 differentiation ideas (e.g., Healthcare + Better UX + Lower Pricing)
- Interview 10 potential customers in target segment
- Questions:
  - Would this solve your identity problem?
  - Would you switch from Auth0 for this?
  - What's your price sensitivity?
  - What's your deployment timeline?
- Output: Validation score for each hypothesis (1-10 likelihood)

### Phase 4: Business Model (1 week)

**Task 4.1: TAM Estimation**
- If idzero targets healthcare startups needing HIPAA identity:
  - How many healthcare startups exist globally?
  - What % need identity solutions?
  - What's the TAM?
  - What's realistic market capture (0.1%, 1%, 5%)?
- Output: TAM + revenue potential at different capture rates

**Task 4.2: Pricing Strategy**
- Auth0 pricing: $0 (free tier) → $240+/month (pro) → enterprise (custom)
- idzero pricing options:
  - Flat $99/month (all features) — targets price-sensitive segment
  - $49/month (basic) → $199/month (pro) → enterprise
  - Per-transaction (vs per-user) — targets high-volume, low-auth-user companies
- Output: Pricing model + estimated ARPU

**Task 4.3: Customer Acquisition**
- How would you acquire idzero customers?
  - Direct sales (enterprise)?
  - Self-serve (startups)?
  - Partner channel (agencies, integrators)?
  - Open source community → commercial tier?
- Output: GTM strategy + CAC estimate

### Phase 5: Sustainability (1 week)

**Task 5.1: Can idzero Sustain Differentiation?**
- If idzero's advantage is "better healthcare compliance":
  - How long until Auth0 adds healthcare compliance?
  - Can idzero build compliance moat (certifications, customers, references)?
  - What locks in customers (switching cost, deep integration)?
- Output: Moat analysis (defensible for 3 years? 5 years?)

**Task 5.2: Build Complexity Estimate**
- MVP scope: [list of features required]
- Timeline: How long to MVP? (4 months? 8 months? 12 months?)
- Ongoing: What's the maintenance burden? (compliance updates, security patches, integrations)
- Output: Dev effort estimate + team size needed

---

## Decision Gate

**After Research Complete:**

Run strategic-council on RIND vs idzero with full evidence:
- RIND: Market timing (AI boom), director validation, POB ready
- idzero: Market opportunity (healthcare/fintech segment), differentiation (compliance-first), sustainability (moat potential)

Decision framework:
- **If idzero validation scores < 5/10:** Don't build idzero, keep RIND as primary bet
- **If idzero validation scores 6-8/10:** Run strategic-council to compare RIND + idzero sequencing
- **If idzero validation scores > 8/10:** Consider idzero as co-equal bet to RIND (do both sequentially)

---

## Output Documents

When research is complete, create:
1. `IDZERO_MARKET_RESEARCH.md` — Full findings (competitive analysis, segments, differentiation validation)
2. `IDZERO_BUSINESS_PLAN.md` — TAM, pricing, GTM, sustainability
3. `RIND_VS_IDZERO_STRATEGIC_COUNCIL.md` — Final strategic-council analysis comparing both

---

## Timeline

- **Week 1:** Competitive analysis + customer interviews
- **Week 2:** Segmentation + validation interviews
- **Week 3:** Differentiation hypothesis testing
- **Week 4:** Business model + TAM estimation
- **Week 5:** Sustainability analysis + research synthesis

**Start Date:** After Sprint 0 (CitizenPrep + RIND prep complete), ~2026-05-30  
**Expected Completion:** 2026-07-04  
**Strategic-Council on RIND vs idzero:** 2026-07-10

---

## Success Criteria

Research is complete when:
- [ ] 10+ Auth0 customers interviewed (frustration map created)
- [ ] 3+ underserved segments identified (with TAM estimates)
- [ ] Top 3 differentiation hypotheses validated with target customers (scores 1-10)
- [ ] Business model (pricing, GTM, CAC) defined
- [ ] Moat analysis complete (how long is idzero defensible?)
- [ ] Development timeline estimated (MVP → profitability)
- [ ] Strategic-council ready to run with full evidence

---

## Note

**Director interest is NOT a factor in this research.** What matters:
- Market demand (real, not director hype)
- Differentiation capability (can we actually be better?)
- Sustainability (can we maintain advantage against Auth0?)
- Unit economics (can we reach profitability?)

Use this research to decide idzero's viability independently of director relationships.
