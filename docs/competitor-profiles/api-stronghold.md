# API Stronghold — Competitor Profile

**URL**: apistronghold.com
**Stage**: Early stage | **Pricing**: Free tier + $10/user/month Pro

---

## What They Do

Secrets management and credential proxy for non-human identities (AI agents, CI/CD pipelines, bots, scripts). Credential lifecycle management, NOT action governance.

## Architecture

SaaS platform with CLI:
- **Encrypted vault** — AES-256, zero-knowledge (client-side encryption, server never sees plaintext)
- **Phantom tokens** — Agents receive scoped, session-bound tokens instead of real API keys. Real credentials stay in vault, injected at API boundary. Compromised tokens expire within minutes.
- **Agent identity management** — Unique identity per script, pipeline, bot, or agent

## Pricing

| Tier | Cost | Limits |
|---|---|---|
| Free | $0 | 10 API keys, 5 secrets, 1 deployment, no audit logs |
| Pro | $10/user/month | Unlimited, audit trail, agent identities |
| Enterprise | Custom | White-label, custom compliance |

## Strengths

- Clear, focused product — does one thing well
- Phantom token architecture is sound
- Zero-knowledge encryption
- Accessible pricing
- Strong content marketing (88 blog posts with incident narratives)
- Confused deputy awareness (mentions in blog)

## Weaknesses

- NOT an execution-layer product — cannot inspect, block, or govern agent actions
- No MCP-specific features despite blog content discussing MCP
- Blog-heavy, product-light (product docs return 404)
- Small scale (free tier: 10 keys, 5 secrets)
- No open source presence
- SaaS only
- No audit logs on free tier

## Relationship to Rind

**Not competitive.** API Stronghold manages credentials. Rind governs actions. The confused deputy problem (authorized agent doing destructive things with legitimate credentials) is exactly what API Stronghold cannot solve. Potential integration partner — their phantom tokens feeding into Rind's proxy.

## Sources

- [API Stronghold website](https://apistronghold.com)
- [API Stronghold pricing](https://apistronghold.com/pricing)
