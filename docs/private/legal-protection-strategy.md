# Legal Protection Strategy — Rind
**Private — do not commit to public repo**
**Last updated:** April 2026

> This is strategic framing, not legal advice. Consult a Canadian employment lawyer before publishing anything publicly.

---

## Situation

- Solo developer with full-time employer
- Employment contract has **broad IP assignment clause** (covers adjacent fields)
- Parent incorporation held by spouse (HumblTech or equivalent)
- Rind operates entirely under the parent company brand
- No personal name used publicly; all commits under `humbltechnologies@gmail.com / HumblTech`

---

## Risk Assessment

**Low risk (current state):**
- All code is local, not published
- All commits use `humbltechnologies@gmail.com` — not personal or work email ✓
- Git author name is "HumblTech" — not personal name ✓
- Work done on personal equipment, personal time

**Moderate risk (when publishing):**
- Pushing to GitHub under a brand org
- Publishing npm package
- Blog posts under Rind brand
- If employer discovers Rind via npm downloads, GitHub, or HN posts

**Higher risk (when going public):**
- Identity revealed (funding announcement, conference, LinkedIn)
- Employer traces back the timeline of when Rind was built

---

## Structural Protections

### 1. Parent Incorporation as IP Owner (Already in place)
The parent company (spouse's incorporation) owns all Rind IP. The individual is a private shareholder. Code is authored by the company, not the individual.

**Strength:** Corporate veil provides some separation. Employer would need to sue the company, not the individual, to claim IP.

**Weakness:** If founder is the sole technical contributor and the company operates in the exact domain of their employer, a broad IP clause could still be claimed. Courts look at substance, not just form.

### 2. Multi-Contributor Origin Story (Key to strengthen)
If the director (who coined the idea) contributes initial commits before anything is published publicly, the IP origin story becomes: "This is a company co-founded with [director]. I advise on security architecture."

**Action:** Before publishing ANY code publicly, ensure the director has committed code to the repo under their own name/email.

### 3. Resource Separation (Critical)
- Never use employer's laptop, network, cloud accounts, or email
- Document this: keep a simple log of which machine, location, and time each significant work session occurred
- Keep personal and work environments completely separate

### 4. Domain Expertise Argument (Weakest protection)
"I'm a security expert — anything I build in security is personal IP, not the employer's." This argument is thin with a broad clause. Don't rely on it.

### 5. One-Hour Legal Consultation (Highest ROI action)
Cost: ~$300-500 CAD
Question to ask: "My employment contract has an IP assignment clause covering [describe scope]. I'm building a side project in [describe Rind at a high level] on personal time, personal equipment, through a separate incorporation. Does this clause cover my side project?"

**The lawyer's answer shapes everything else.**

---

## Publishing Timeline Risk

| Stage | Risk Level | Mitigation |
|-------|-----------|-----------|
| Code exists locally | Very low | Nothing published |
| Push to private GitHub org | Low | Private repo, brand email only |
| Publish npm package (`npx rind-scan`) | Moderate | Brand name only, no personal identity. Director commits in repo first. |
| Blog post on dev.to | Moderate | "Rind Team" author, no personal info |
| Landing page live | Moderate | Same |
| Show HN post | Moderate | Pseudonymous, brand account |
| Funding announcement | High | Requires identity; legal clearance needed first |
| Conference talk | High | Face reveal; requires legal clearance |

---

## Git Hygiene (Already Clean)

Current state verified April 2026:
- Author email: `humbltechnologies@gmail.com` ✓
- Author name: `HumblTech` ✓
- No personal email in git log ✓

Before pushing to GitHub: configure git identity at the repo level:
```bash
git config user.email "dev@[rind-domain].dev"
git config user.name "Rind Dev"
```

---

## Recommended Immediate Actions

1. **Book employment lawyer consultation** — do this before publishing anything
2. **Have director make initial commits** — strengthens multi-contributor story
3. **Never use work email or laptop for Rind** — maintain absolute separation
4. **Document work sessions** — simple log: date, machine (personal), hours worked
5. **All public publishing** deferred until after lawyer review confirms it's safe

---

## If the Employer Claims IP

If an employer with a broad clause claims IP over open-source code published under Apache 2.0 by a separate company, they would need to demonstrate:
1. The employee created the code (not just contributed to a company project)
2. The creation happened using company resources OR within the scope of employment
3. The IP clause covers this specific type of work

Clean resource separation + multiple contributors + separate incorporation + documented personal-time work = strong defense. Not a guarantee, but reasonable protection.
