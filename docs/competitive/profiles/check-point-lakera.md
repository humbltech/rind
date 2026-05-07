# Check Point / Lakera — Competitor Profile

**URL**: checkpoint.com (Lakera acquired ~$300M, Nov 2025)
**Stage**: Post-acquisition. Lakera tech powers "Check Point AI Agent Security."

---

## What They Do

**Pre-acquisition (Lakera Guard)**: Detection and flagging API. App calls `/guard` endpoint, Guard returns boolean `flagged` status. **Detection only — app decides response.** From their own docs: "Guard detects and flags threats; applications decide response."

**Post-acquisition (Check Point AI Agent Security)**: Marketing claims expanded capabilities:
- "Intercepts and evaluates agent tool calls before execution"
- "External Content & MCP Inspection"
- Real-time data protection with policy-based redaction
- Agent action control at decision point

## Core Competency

Prompt injection detection — best-in-class:
- 85M+ training prompts from Gandalf game (1M+ players)
- 100+ language support
- Direct and indirect injection detection
- L1-L4 sensitivity thresholds
- Content moderation (crime, hate, profanity, sexual, violence, weapons)

## Critical Assessment

**The original Lakera Guard architecture is fundamentally detection-only.** The Check Point marketing page CLAIMS pre-execution blocking and MCP inspection, but NO technical documentation, APIs, or integration guides are publicly available. This could be:
1. Real product that shipped post-acquisition (best case)
2. Marketing ahead of product (common post-acquisition)
3. Planned features presented as current capabilities

**Cannot verify.** Until technical docs appear, treat inline blocking claims as unverified.

## Strengths

- Best prompt injection detection in the market (85M training dataset)
- Check Point enterprise sales force (instant CISO access)
- Self-hosted option available
- Sub-50ms latency (consistent claim)
- 100+ language support (industry-leading)

## Weaknesses

- Original architecture is detection-only (flags, doesn't block)
- Post-acquisition claims unverifiable
- No credential management
- No session management / kill-switch
- No time-window policies
- No schema drift detection
- MCP "inspection" vs MCP "enforcement" — unclear
- Large company integration may slow innovation

## The Real Threat

Distribution, not technology. Check Point can put this in front of every CISO they already sell to. If the inline blocking claims become real, that's detection (best-in-class) + enforcement (Check Point infrastructure) in one enterprise package.

## Sources

- Lakera Guard technical docs (pre-acquisition)
- Check Point AI Agent Security product page
- SecurityWeek acquisition coverage
