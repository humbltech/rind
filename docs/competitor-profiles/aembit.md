# Aembit — Competitor Profile

**URL**: aembit.io
**Stage**: GA (MCP Identity Gateway in Beta) | **Partnership**: Netskope

---

## What They Do

IAM for non-human identities — specifically AI agents and workloads. Credential proxy with policy-based access control. NOT an execution firewall.

## Architecture

Two components:
1. **MCP Authorization Server** — Managed SaaS. Mints OAuth 2.1 access tokens, integrates with existing IdPs (OIDC/SAML).
2. **MCP Identity Gateway** — Linux VM in customer environment. Validates tokens, enforces access policy, exchanges credentials on agent's behalf. Agent never holds direct credentials.

**Blended Identity** (genuinely novel): Evaluates BOTH the AI agent's identity AND the human operator's identity together in a single policy decision. Two different users operating the same agent get different credential scopes.

## Pricing

| Tier | Cost | Scope |
|---|---|---|
| Starter | Free | Dev/PoC |
| AI Teams | $20/agent/month | 10-500 agents |
| Enterprise | Custom | Unlimited |

## Strengths

- Best-in-class MCP credential management
- Blended Identity (agent + human) is genuinely innovative
- Production-ready with clear pricing
- Netskope partnership (enterprise distribution)
- Strong compliance story (SOC 2, HIPAA, PCI with dual attribution)
- AI kill switch (one-click access revocation)

## Weaknesses

- ZERO execution-layer governance — controls WHO accesses WHAT, not WHAT they DO
- No response inspection (credential leaks invisible)
- No schema drift / tool poisoning detection
- MCP-only (blind to direct API calls)
- Gateway still in Beta

## Relationship to Rind

**Complementary, not competitive.** Aembit manages credentials; Rind governs actions. The confused deputy problem (authorized agent doing destructive things) is exactly what Aembit cannot solve and Rind can. Integration opportunity is real.

## Sources

- [Aembit GA Announcement](https://aembit.io/blog/aembit-iam-for-agentic-ai-is-now-generally-available/)
- [Aembit MCP Identity Gateway Docs](https://docs.aembit.io/ai-guide/mcp/identity-gateway/)
- [Aembit Homepage](https://aembit.io/)
