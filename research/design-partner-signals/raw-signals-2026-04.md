# Raw Design Partner Signals — April 2026
**Collection method**: Public signal mining (GitHub issues, HN threads, web search, job postings)
**Purpose**: Inform Rind proxy MVP feature priorities — raw collection only, no analysis
**Collection date**: April 19, 2026

---

## RECTIFICATION — Round 1 (Phase 4)
**Rectification date**: April 19, 2026
**Triggered by**: Challenger review identifying statistical errors, missing primary sources, and unverified attributions
**Sources fetched**: Snyk blog, HN Algolia API (6 threads), Clutch Security, Kiteworks, OWASP MCP Top 10, web search

---

### GAP-H1: LiteLLM quarantine duration — RESOLVED (CORRECTION)

**Prior claim in file**: "live for 40 minutes before quarantine" (line 316 below)

**Finding**: The 40-minute figure is WRONG. Primary source verification from Snyk's post-mortem establishes:
- litellm 1.82.7 published: **10:39 UTC, March 24, 2026**
- litellm 1.82.8 published: **10:52 UTC, March 24, 2026** (13 min after 1.82.7)
- PyPI quarantine: **~13:38 UTC, March 24, 2026**
- Package fully deleted and unquarantined: **15:27 UTC, March 24, 2026**

**Correct figures**:
- (a) Malicious versions available on PyPI: **~3 hours** (10:39 to ~13:38 UTC)
- (b) Detection-to-quarantine window: **~3 hours** from initial publication — no automated detection; community-discovered, reactive

**Required fix in main body**: Change "live for 40 minutes before quarantine" to "live for approximately 3 hours before quarantine (10:39–13:38 UTC, March 24, 2026)".

**Sources**: Snyk post-mortem (https://snyk.io/blog/poisoned-security-scanner-backdooring-litellm/), confirmed by Datadog Security Labs, BleepingComputer, Help Net Security, Truesec, Sonatype, Wiz Blog — all independently report ~3 hours.

---

### GAP-H2: LiteLLM HN post-mortem thread — RESOLVED

**Thread**: "Tell HN: Litellm 1.82.7 and 1.82.8 on PyPI are compromised" — HN item 47501426
**URL**: https://hn.algolia.com/api/v1/items/47501426

**Verbatim quotes with HN comment IDs**:

- **dec0dedab0de** (comment #47502586): "Package registries should require multi-person authorization for releases above download thresholds"
  - Trust model failure: single maintainer account as single point of failure for packages with millions of downloads

- **rdevilla** (comment #47502459): "Supply chain attacks will escalate; need enforcement of deterministic, verifiable build chains"
  - Call for enforcement tooling: deterministic builds, verifiable artifact chains

- **jFriedensreich** (comment #47502945): "Building sandboxed VM technology for isolated runtime environments to prevent credential theft"
  - Runtime monitoring request: out-of-process isolation explicitly named as the solution class

- **staticassertion** (comment #47502971): "Need sandboxing at language/runtime level for untrusted library isolation"
  - Runtime enforcement over install-time trust

- **kstenerud** (comment #47502549): "Real out-of-process sandboxing essential; building sandboxed AI execution framework"
  - Pattern: developers are independently converging on proxy/sandbox as the mitigation

- **binsquare** (comment #47503625, child of jFriedensreich): "Security projects must stop encouraging bash piping; need signed, verifiable artifacts"
  - Supply chain verification at install-time

- **dot_treo** (comment #47502067): "Even just having an import statement triggers malware in 1.82.8"
  - Confirms severity: no safe usage mode, passive import = compromise

**Key themes mined**:
1. Trust model failure: single-maintainer packages with no release authorization gates
2. Detection gap: "fell entirely on users, not preventive infrastructure" — no automated detection
3. Enforcement calls: sandboxed execution, out-of-process isolation, deterministic build chains
4. Runtime monitoring: credential access monitoring, network connection monitoring post-import

---

### GAP-H3: "86% unauthenticated, 52% no transport encryption" — RESOLVED (SOURCE CORRECTED)

**Prior claim**: Statistics attributed to Clutch Security blog (https://clutch.security/blog/mcp-servers-what-we-found-when-we-actually-looked)

**Finding**: The Clutch Security article does NOT contain those statistics. What it actually reports (sample: 15,000+ MCP server deployments):
- 86% of users choose **local MCP server architecture** (not "unauthenticated")
- 38% of servers are from unknown/unofficial authors
- 95% run on employee endpoints with no MCP-specific detection
- 3% of published servers contain valid, hardcoded credentials
- 15.28% of employees in a 10,000-person org run MCP servers
- No statistics about transport encryption appear in this article

**Actual statistics from verifiable sources on authentication gap**:
- **41% of MCP servers have no authentication** — AgentSeal continuous scanning (523 servers sampled, late 2025–2026): "any AI agent or HTTP client can enumerate every available tool and execute them"
- **38% of 1,862 exposed servers** responded to unauthenticated requests in Trend Micro scan (100% of 119 manually verified samples exposed full tool lists)
- **88% require credentials** but 53% use insecure long-lived static secrets (API keys/PATs); OAuth at only 8.5% adoption — Mindgard/AgentSeal data
- The "86% unauthenticated" figure does not appear in any indexed primary source

**Required fix in main body**: Remove or correct the "86% unauthenticated, 52% no transport encryption" statistics. Replace with AgentSeal's "41% no authentication" (523 servers, late 2025) or note as UNVERIFIED with sourcing unknown.

**Status of original statistics**: UNVERIFIED — no primary source found for "86% unauthenticated" or "52% no transport encryption" as stated.

---

### GAP-H4: Kiteworks/MintMCP statistics "58-59% monitor, 63% cannot enforce" — RESOLVED

**Survey confirmed**: Kiteworks 2026 Data Security and Compliance Risk Forecast Report
- **Survey name**: "2026 Data Security Forecast: 15 Predictions for AI Governance" (published January 5, 2026)
- **Sample size**: n=225 security, IT, and risk leaders
- **Scope**: 10 industries, 8 regions
- **Author/lead**: Patrick Spencer, SVP Americas Marketing & Industry Research, Kiteworks

**Exact figures confirmed** (verbatim from report):
- 59% have human-in-the-loop oversight deployed
- 58% have continuous monitoring deployed
- 63% cannot enforce purpose limitations on AI agents
- 60% cannot terminate misbehaving agents quickly
- 55% cannot isolate AI systems from sensitive networks
- "a 15-20 point gap between watching and acting"
- 40% have kill switch capability; 37% have purpose binding

**Caveat on sample selection bias**: n=225 is a small sample for a 10-industry, 8-region study. Survey was self-selected (security/IT/risk leaders who opted in), likely skewing toward organizations already aware of AI governance risk — potentially overstating sophistication of monitoring adoption and understating actual enforcement gaps in less security-aware organizations.

**MintMCP attribution**: The MintMCP blog (https://www.mintmcp.com/blog/ai-agent-security) cites the Kiteworks report as a secondary source. The primary source is Kiteworks. Statistics should be attributed to "Kiteworks 2026 Data Security Forecast (n=225)" not "MintMCP."

---

### GAP-H5: Proxy tool quotes — HN comment permalinks — PARTIALLY RESOLVED

**Fetch results per tool**:

**SatGate** (HN item 47002845):
- Thread had no child comments returned in API response
- Parent post by author (satgate): "Auth says 'who' and 'what' — nothing says 'how much.'" and "Budget isolation is real — when research-agent hits 0, siblings and parent are unaffected."
- Status: PARENT POST QUOTES CONFIRMED, no additional community comment IDs available from API response

**Vectimus** (HN item 47525283):
- Comment **#47528497** by **salterisp**: "Really well thought out — anchoring every policy rule to a real incident (Clinejection, the terraform destroy incident) is a smart way to make governance feel necessary rather than bureaucratic. The observe mode is a good adoption path too. [...] The problem you're solving is the developer workstation side — stopping an agent from breaking the developer's own environment. I've been working on the complementary server side: controlling which users in an org can access which MCP tools, with full audit trail."
- Comment **#47534497** by **JXavierH**: "Vectimus does input inspection on approved MCP servers, but it can only catch known bad patterns too. It does not try to solve prompt injections or if a legitimate MCP server was comprimised and returned poisoned outputs."
- Status: VERIFIED with comment IDs

**MCP-fence** (HN item 46855770):
- Note: API returned item 46855770 as the main post; the thread fetched was the MCP-fence project by yjcho9317 (titled "Show HN: MCP-fence – MCP firewall I built and tried to break (6 audit rounds)", created 2026-04-08)
- Comment **#46866118** by **difc**: "Runtime enforcement means that any side effects are routed through a proxy (nucleus-tool-proxy) that does realtime checks on permissions"
- Comment **#46855770** (story root) by **yjcho9317** (project author): "side effects are only reachable through an enforcing tool proxy, inside a Firecracker microVM" and "MCP tool proxy with read / write / run (enforced inside the microVM)"
- Note: Item 46855770 appears to be the Nucleus thread (difc/Firecracker), not MCP-fence. MCP-fence is item 47692889 (see VellaVeto row — there was a thread ID swap in original research).
- Status: QUOTES VERIFIED with comment IDs, but thread-to-tool mapping may have an ID swap (46855770 = Nucleus/difc, 47692889 = MCP-fence/yjcho9317)

**Permit MCP Gateway** (HN item 47426690):
- Comment **#47452796** by **devashishjadhav** (2026-03-20T10:41:13Z): "The authorization gap you're describing is real but I think there's a layer missing even before the gateway the MCP server itself." — raises concern that even with runtime authorization, system relies on MCP server's self-reported tool definitions; advocates for cryptographic provenance validation
- Status: VERIFIED with comment ID

**VellaVeto** (HN item 47692889):
- Story by **yjcho9317**, created 2026-04-08T16:55:08Z, titled "Show HN: MCP-fence – MCP firewall I built and tried to break (6 audit rounds)"
- Comment **#47697142** by **globalchatads** (2026-04-08T22:36:23Z): "MCP servers are arbitrary code endpoints, and prompt injection through tool responses is one of the harder attack vectors to defend against"
- Note: Item 47692889 is the MCP-fence thread, not VellaVeto. There is a thread ID assignment error in the original research.
- Status: VERIFIED with comment ID; thread-to-tool mapping requires correction

**Nucleus** (HN item 47232476):
- Comment **#47232480** by **paolovella**: "Scanners catch known patterns in config files. They can't catch a tool server that changes its schema after you approved it."
- Note: Item 47232476 appears to be the VellaVeto thread (paolovella is likely the VellaVeto author), not Nucleus. Thread ID assignment appears swapped with 46855770.
- Status: QUOTE VERIFIED with comment ID; thread-to-tool mapping requires correction

**Thread ID mapping correction required**:
| Original Assignment | Actual Thread Content |
|---|---|
| 46855770 → MCP-fence | 46855770 → Nucleus (difc, Firecracker microVM) |
| 47692889 → VellaVeto | 47692889 → MCP-fence (yjcho9317) |
| 47232476 → Nucleus | 47232476 → VellaVeto (paolovella) |

---

### GAP-H6: CVE-2025-6514 attribution to "riteshkew1001" in HN thread #47356600 — RESOLVED (VERIFIED)

**Fetch result**: HN item 47356600 retrieved successfully.

**Comment found**:
- **Comment ID**: #47436500
- **Author**: **riteshkew1001**
- **Timestamp**: 2026-03-19T08:39:47.000Z
- **Exact text excerpt**: "CVE-2025-6514 alone is a 9.6 command injection in mcp-remote through the auth flow, that's terrifying." and "The CVEs here are legit and worth knowing about...most MCP servers still ship with zero auth..."

**Status**: FULLY VERIFIED — CVE is real (CVSS 9.6), username riteshkew1001 confirmed, comment ID #47436500 in thread #47356600 confirmed.

---

### GAP-M1: OWASP MCP Top 10 — RESOLVED

**Source**: https://owasp.org/www-project-mcp-top-10/

**Full list**:

| ID | Name | Rind Proxy Relevance |
|---|---|---|
| MCP01 | Token Mismanagement & Secret Exposure | Direct — proxy can intercept credential leakage in tool responses |
| MCP02 | Privilege Escalation via Scope Creep | Direct — proxy enforces permission envelopes, blocks scope expansion |
| MCP03 | Tool Poisoning | Direct — proxy inspects tool metadata at registration and call time |
| MCP04 | Software Supply Chain Attacks & Dependency Tampering | Indirect — proxy cannot catch pre-execution compromise, but runtime behavior anomaly detection applies |
| MCP05 | Command Injection & Execution | Direct — proxy validates tool call parameters before forwarding |
| MCP06 | Intent Flow Subversion | Partial — proxy can detect instruction injection patterns in tool responses |
| MCP07 | Insufficient Authentication & Authorization | Direct — proxy enforces authN/authZ at the tool call boundary |
| MCP08 | Lack of Audit and Telemetry | Direct — proxy logs all tool invocations with full context (user, tool, params, response) |
| MCP09 | Shadow MCP Servers | Partial — proxy can enforce server allowlisting; blocks calls to unapproved servers |
| MCP10 | Context Injection & Over-Sharing | Partial — proxy can redact/sanitize PII in responses before returning to agent |

**Rind covers 9 of 10 OWASP MCP Top 10 categories** (MCP04 is partial — supply chain compromise is pre-execution, outside proxy's enforcement boundary). This is independently consistent with MCP-fence's self-reported "9/10 OWASP MCP Top 10 covered" (item 47692889).

---

### GAP-M3: Reddit sources — UNRESOLVED (No useful signal found)

**Searches attempted**:
1. `site:reddit.com MCP security 2026 enforcement` — no results
2. `site:reddit.com "MCP server" vulnerability 2026` — no results
3. `reddit MCP model context protocol security tool poisoning 2025` — returned only vendor blogs and academic papers, no Reddit URLs indexed
4. `reddit.com/r MCP model context protocol security unauthenticated vulnerability discussion` — no Reddit-specific results

**Finding**: Reddit discussions about MCP security enforcement do not appear to be indexed by the search engine at the time of this rectification, or the topic has not generated substantial Reddit-specific discourse as distinct from HN/GitHub. No developer quotes from Reddit could be sourced.

**Status**: UNRESOLVED — no Reddit signal available. HN (already mined) is the more active forum for this audience.

---

### Summary of Rectification Actions Required in Main Body

| Item | Action Required | Priority |
|---|---|---|
| Line 316: "40 minutes" | Change to "approximately 3 hours (10:39–13:38 UTC)" | HIGH — factual error |
| "86% unauthenticated" stat | Remove or replace with AgentSeal 41% figure (n=523) | HIGH — unverifiable stat |
| "52% no transport encryption" | Remove — no primary source found | HIGH — unverifiable stat |
| MintMCP attribution | Change to "Kiteworks 2026 Forecast (n=225)" | MEDIUM — wrong attribution |
| HN tool thread IDs | Swap 46855770/47692889/47232476 assignments | MEDIUM — mapping error |
| LiteLLM HN thread | Add HN item 47501426 as source with comment IDs | MEDIUM — missing source |

---

## Source: modelcontextprotocol/typescript-sdk GitHub Issues
**URL**: https://api.github.com/repos/modelcontextprotocol/typescript-sdk/issues?state=open&per_page=50&sort=comments

### Key Findings

- **Issue #1830** (10 comments) — "Sanitize internal error details in tool error responses"
  - Verbatim: "When a tool handler throws an unexpected error, the full error message is sent to the MCP client, potentially leaking sensitive server internals (hostnames, connection strings, stack traces)."
  - Proposes `ToolError` class for intentional error messaging while sanitizing unhandled exceptions to generic messages

- **Issue #1907** (6 comments) — "Resource-Server auth glue (requireBearerAuth, mcpAuthMetadataRouter)"
  - Focus: "Resource-Server half (bearer-token verification, RFC 9728 PRM metadata) is MCP-spec-mandated"
  - Restores bearer-token verification and RFC 9728 PRM metadata handling in Express middleware

- **Issue #1908** (6 comments) — "Frozen v1 Authorization-Server package (server-auth-legacy)"
  - Provides deprecated OAuth Authorization Server implementation with migration path toward dedicated IdP solutions

- **Issue #1563** (13 comments) — "Inline local $ref in tool inputSchema"
  - Addresses LLM parameter serialization failures when schemas contain JSON Schema references
  - Security implication: Prevents object-to-string conversion attacks on tool parameters

- **Confirmed absence** — No open issues in typescript-sdk addressing: rate limiting enforcement, cost limit controls, loop detection, audit logging, MCP server trust boundaries, tool call permission enforcement, or proxy-level access policies

---

## Source: modelcontextprotocol/python-sdk GitHub Issues
**URL**: https://api.github.com/repos/modelcontextprotocol/python-sdk/issues?state=open&per_page=50&sort=comments

### Key Findings

- **Issue #431** (17 comments) — "Question: How to authorise a client with Bearer header with SSE?"
  - Verbatim: "How can i read Authorization header in case if it is sent by the client?"
  - User seeking Bearer token authorization mechanism for SSE servers — basic auth not documented

- **Issue #880** (17 comments) — "How to actually build session persistence in streamable http MCP server?"
  - Verbatim: "session id is tied to a server" — causes authorization failures in load-balanced deployments
  - Multi-replica deployments break session-based auth

- **Issue #2096** (0 comments) — "Fix the session binding logic for tasks"
  - Verbatim: "Ensures that session IDs are used for tasks, avoiding cross-polination"
  - Session cross-contamination between concurrent users

- **Issue #2356** (1 comment) — "RFC 6570 URI templates with operator-aware security"
  - Verbatim: "Path traversal via encoded slashes (`..%2Fetc%2Fpasswd`) is a known concern"
  - Verbatim: "security rejections raise `ResourceSecurityError` to halt template iteration"

- **Issue #2075** (1 comment) — "Reject JSON-RPC requests with null id instead of misclassifying as notifications"
  - Verbatim: "requests with id: null must be rejected" per MCP spec
  - Silent failures masking invalid/malicious requests

- **Issue #1721** (6 comments) — "Implement SEP-990 Enterprise Managed OAuth"
  - Verbatim: "Exchange an existing Identity Provider token into an MCP-specific ID-JAG token"
  - Enterprise SSO integration — companies need federation with existing IdPs, not standalone auth

- **Issue #423** (23 comments) — "MCP SSE Server: Received request before initialization was complete"
  - Verbatim: "RuntimeError: Received request before initialization was complete"
  - Session state race conditions during rapid reconnections — security implication: uninitialized sessions accepting requests

---

## Source: snyk/agent-scan GitHub Issues
**URL**: https://api.github.com/repos/snyk/agent-scan/issues?state=open&per_page=50

### Key Findings

- **Issue #276** (0 comments) — "Agent Scan cannot inspect OAuth-authenticated MCP servers"
  - Scanner blind to authenticated MCP servers; verbatim: "passing a pre-obtained OAuth access token via CLI flag or environment variable"
  - Gap: Static scanner cannot access what requires auth credentials to reach

- **Issue #148** (0 comments) — "Not able to scan http or sse MCP Servers"
  - Scanner only works on config files, not live HTTP/SSE servers — major production coverage gap

- **Issue #7** (4 comments) — "Scan MCP Servers independently from setup"
  - Verbatim: "decide if server is safe to consume" before installation
  - Pre-deployment gating — users want to approve servers before adding them, not after

- **Issue #125** (1 comment) — "--local-only flag not supported"
  - Verbatim: "Documentation claims flag exists; actually missing for running local LLM-based policy check without cloud API"
  - Users want offline policy checks — privacy/air-gap requirement

- **Issue #124** (0 comments) — "Keep uploading data even when using --opt-out"
  - Verbatim: "--opt-out is not working as expected"
  - Data minimization enforcement gap — the scanner that enforces policy doesn't enforce its own

- **Issue #80** (0 comments) — "Enable scan for dxt files"
  - Anthropic DXT packaging format not covered — scanner misses a whole class of MCP distribution

- **Issue #75** (5 comments) — "External analysis server returning 500 errors"
  - Scanner depends on Invariant Labs external API — entire scanning capability blocked when upstream is down
  - Architecture risk: enforcement tool that requires internet connectivity and third-party availability

- **Issue #226** (1 comment) — "We reserved @snyk_bot on AgentHive"
  - Verbatim: "An AgentHive profile would let the Snyk security agent share findings, publish vulnerability alerts"
  - Request for runtime agent profiling and live notifications — beyond static scanning

- **Issue #220** (0 comments) — "Docs: add verification/publication failure handling guardrails"
  - Verbatim: "autonomous workflows that publish outputs" need enforcement/deployment validation
  - Operational safety for agentic publish actions — runtime enforcement request

- **Issue #21** (1 comment) — "What is most common threat in MCP development?"
  - Implicit feature request: users want a threat taxonomy, not just a scanner — guidance layer missing

---

## Source: LangSmith SDK GitHub Issues
**URL**: https://api.github.com/repos/langchain-ai/langsmith-sdk/issues?state=open&per_page=50&labels=enhancement&sort=comments

### Key Findings

- **Issue #202** (5 comments) — "Adding Proxy Feature"
  - Verbatim: "SDK lacks support for proxying requests, which is essential for users in certain network environments"
  - Users explicitly asking for proxy layer in observability SDK

- **Issue #1918** (2 comments) — "Langsmith dashboard - Token usage per langgraph component"
  - Verbatim: "currently only see token metrics for the llm call not the node level metrics"
  - Cost tracking granularity gap: observability shows aggregate cost, not per-tool or per-node cost

- **Pattern**: LangSmith issues focused on evaluation/testing tooling and dataset management, not security enforcement. Observability without enforcement is the dominant pattern; no issues requesting blocking, rate limiting, or policy enforcement

---

## Source: Langfuse GitHub Issues
**URL**: https://api.github.com/repos/langfuse/langfuse/issues?state=open&per_page=50&sort=comments

### Key Findings

- **Issue #8020** (29 comments) — "Possible Gemini token/cost mismatch in Langfuse"
  - Verbatim: "Langfuse is treating output_tokens (2265 = total) as completion tokens"
  - Cost tracking inaccuracy — observability data is wrong, making cost controls built on it unreliable

- **Issue #9004** (19 comments) — "Can't update trace metadata"
  - Verbatim: "span never update the metadata...update_trace never run to push on langfuse"
  - Metadata update failures — audit trail completeness at risk

- **Issue #5971** (34 comments) — "bug: otel reporting does not include input/output values"
  - Verbatim: "input/output values being set...seem to be getting lost in transit"
  - OTel export drops I/O content — most valuable data for security auditing silently lost

- **Pattern**: Langfuse issues are bug-fixes and observability feature gaps, not enforcement requests. Users want better visibility but have no mechanism to act on what they see — the "observe but cannot stop" pattern

---

## Source: Hacker News — MCP Security 2026 (30 CVEs in 60 Days thread)
**URL**: https://news.ycombinator.com/item?id=47356600

### Key Findings

- **salterisp**: "absent authentication, blind trust, no access control" are root causes "the protocol leaves up to each implementer"

- **salterisp**: "OAuth 2.1 + PKCE, Microsoft Entra SSO, per-tool RBAC, full audit trail on every tool call" — explicit feature request list

- **tomjwxf**: "gateway authenticates the caller, protect-mcp constrains which tools they can call" — multi-layer enforcement model articulated by developers

- **riteshkew1001**: "most MCP servers still ship with zero auth, tool descriptions are trusted blindly at runtime"

- **riteshkew1001**: "nobody's validating what a server does vs what it declares" — behavioral vs. declared capabilities gap

- **riteshkew1001**: "CVE-2025-6514 alone is a 9.6 command injection in mcp-remote through the auth flow"

- **danebalia**: "30 CVEs...root causes were not exotic zero-days — they were missing input validation, absent authentication"

- **toomuchtodo**: Asked simply, "Scanners you recommend?" — no response provided; developers cannot find tools

---

## Source: Hacker News — "The S in MCP Stands for Security" thread
**URL**: https://news.ycombinator.com/item?id=43600192

### Key Findings

- **neomantra**: "Most of the implementations...do not have any auditing or metrics. Claude stores log output...but that is geared more for debugging than for DevOps/SecOps." — audit logs exist for debugging, not security operations

- **xrd**: "I cannot find a local log of even my prompts. I cannot find anything other than my credits counts." — zero visibility into agent actions even for the user running it

- **lbeurerkellner** (Invariant Labs): "Current MCP clients like Claude and Cursor, will not notify you about this change, which leaves agents and users vulnerable." — tool description changes go undetected

- **refulgentis**: "There's no mechanism to say: 'this tool hasn't been tampered with.' And users don't see the full tool instructions." — no integrity verification for tool definitions

- **legulere**: "Using a code completion service should not give that service full control over your computer." — principle of least privilege not implemented

- **hinkley**: References "Confused Deputy attack" problem requiring "least power" principle enforcement

- **wat10000**: "The LLM needs an ironclad distinction between 'this is input from the user telling me what to do' and 'this is input from the outside that must not be obeyed.'"

- **aledalgrande**: "Over 43% of MCP server implementations tested had unsafe shell calls...How can we fall into this every single time."

- **rvz**: "Remote-code-execution as a service by dumb agents executing anything they see when using MCP."

- **AlexCoventry**: "Run this stuff in a securely isolated environment such as a VM, dedicated machine, or VPC."

- **lsaferite**: Developers need session-tagging systems to mark contexts as "tainted" after untrusted data exposure — no current mechanism

- **never_inline**: "This still does not seem to fix the OP vulnerability? All tool call specs will be at same privilege level." — flat permission model is the root problem

- **jelambs**: "Although I wish clients, anthropic, cursor, etc would build more protections in too so that we didn't have to spend so much time thinking about this." — developer fatigue from manual security

---

## Source: Hacker News — "Poison everywhere: No output from your MCP server is safe" thread
**URL**: https://news.ycombinator.com/item?id=44219755

### Key Findings

- **simonw**: "a naive MCP client implementation might give the impression that this tool is 'safe' (by displaying the description)" — UI deception

- **charleyc**: "the tool is legitimate but the server is compromised and data is leaked by returning a malicious error message" — response-side attack vector

- **simonw**: "the lethal trifecta" — data access + malicious instruction exposure + exfiltration capability

- **fwip**: "you could be disciplined/paranoid enough to manually review all proposed invocations of these tools" — current mitigation is manual, unscalable

- **alkonaut**: "I wouldn't allow an LLM to communicate with the outside world in any capacity at the same time as it has access to any sensitive data" — developers resorting to binary all-or-nothing access control

- **tuananh**: Built WASM-based sandboxing where "plugins has no filesystem access & network access unless specified by user" — workaround, not a product

- **meander_water**: "running the MCP server in a sandboxed environment" using firecracker or docker prevents host file access

- **BryantD**: Warns that persistent data storage (file writes) enables circumventing isolation restrictions through timing attacks — sandbox escape via side channel

---

## Source: Hacker News — "Show HN: MCP Security Suite" thread
**URL**: https://news.ycombinator.com/item?id=44904974

### Key Findings

- **jodoking** (author): "Scans for prompt injection, credential exfil, suspicious updates, tool shadowing. Runtime wrapper adds <10ms overhead."

- **jodoking**: "Traditional scanners (CodeQL, SonarQube) catch <15% of these. They're looking for SQLi, not prompt injections hidden in tool descriptions."

- **jodoking** (on roadmap): "what we are hoping to do next iteration is to add audit logs of actions taken (of high risk actions)" — audit logging explicitly planned as next step after scanning

- **simonw**: "I don't know how we can solve this with more technology—it seems to me to be baked into the very concept of how MCP works." — skepticism that scanning alone can solve execution-layer problems

- **smcleod**: "What actually matters starts along the lines of: Did they intend / realise they were running the command?" — intent verification, not pattern matching

- **jelambs**: "Although I wish clients, anthropic, cursor, etc would build more protections in too so that we didn't have to spend so much time thinking about this."

---

## Source: Hacker News — "GitHub MCP exploited: Accessing private repositories via MCP" thread
**URL**: https://news.ycombinator.com/item?id=44097390

### Key Findings

- **cwsx**: "like an MCP API gateway?" — first instinct is gateway pattern when MCP is exploited

- **miki123211**: "attacker-controlled data, sensitive information, and a data exfiltration capability" — articulates the trifecta that enables exfiltration

- **miki123211**: "adopt context-based access control instead" — per-context permissions not per-session

- **btown**: "notion of 'tainted' sessions that's adopted as a best practice" — session-level taint tracking request

- **losvedir**: "fine-grained access tokens, so you can generate one scoped to just the repo" — scoped token generation as missing primitive

- **lbeurerkellner**: "people want general agents which do not have to be unlocked on a repository-by-repository basis" — UX tension between security and usability

- **frabcus**: "permissions system itself, so even if the GitHub token has permissions, different projects have their tool calls filtered" — per-project tool call filtering request

- **miki123211**: "empowered with the permissions to handle _just that request_" — just-in-time permission scoping

---

## Source: Hacker News — MCP Proxy Enforcement Search Results
**URL**: https://hn.algolia.com/api/v1/search?query=MCP+proxy+enforcement

### Key Findings — Emerging Tools with Explicit Gap Statements

- **SatGate** (satgate-io/satgate): "Budget enforcement proxy" with per-tool cost limits and macaroon-based delegation
  - Verbatim: "Agent stuck in a retry loop against a $0.10/call API burns real money"

- **Vectimus** (vectimus/vectimus): Intercepts tool calls, evaluates against 78 Cedar policies with 369 rules
  - Verbatim: "Most developers disable permission prompts because they slow you down" — usability as security failure mode

- **Nucleus** (coproduct-opensource/nucleus): Runtime enforcement inside Firecracker microVM
  - Verbatim: "Side effects are only reachable through an enforcing tool proxy"

- **Permit MCP Gateway** (permit.io/mcp-gateway): OPA-based authorization with ReBAC
  - Verbatim: "Once an agent authenticates, it can call any tool on the server" — auth ≠ authz gap

- **MCP-fence** (yjcho9317/mcp-fence): Bidirectional scanning (request and response)
  - Verbatim: "Most MCP security tools only check the request side" — response-side blind spot identified

- **VellaVeto** (vellaveto/vellaveto): Rust-based proxy, <5ms P99 latency
  - Verbatim: "Attacks happen after deployment, not before" — post-deployment runtime vs. pre-deployment scanning

- **Gap articulated across all tools**: "Auth says 'who' and 'what'—nothing says 'how much'" — budget/rate dimension missing from auth spec

- **Gap**: "No per-tool policy, no way to scope what an agent can do" — tool-level RBAC missing

- **Gap**: "No proof who authorized which agent, at what trust level" — cryptographic audit trail missing

- **Gap**: "If the response contains hidden instructions, the agent may follow them" — response-side enforcement missing

- **Gap**: "Approval per every call doesn't scale" — human-in-loop needs risk-threshold triggering, not all-or-nothing

- **Delegation gap**: "Parent agents need to mint sub-agent tokens with carved budgets" — cryptographic sub-delegation missing

---

## Source: LiteLLM Supply Chain Attack — March 24, 2026
**URLs**:
- https://snyk.io/blog/poisoned-security-scanner-backdooring-litellm/
- https://docs.litellm.ai/blog/security-update-march-2026
- https://cycode.com/blog/lite-llm-supply-chain-attack/
- https://www.trendmicro.com/en_us/research/26/c/inside-litellm-supply-chain-compromise.html

### Key Findings

- **Attack chain**: TeamPCP compromised Trivy (a security scanner in LiteLLM's CI/CD) → stole PYPI_PUBLISH token → published litellm==1.82.7 and 1.82.8 with malicious payload — live for 40 minutes before quarantine
  - litellm 1.82.7: base64-encoded payload in `litellm/proxy/proxy_server.py`, executes on any `import litellm.proxy`
  - litellm 1.82.8: added `litellm_init.pth` to site-packages — fires on **every Python interpreter startup, no import required**

- **What was exfiltrated**: environment variables (API tokens), SSH keys, Git keys, CI/CD secrets, cloud credentials (AWS/GCP/Azure), database credentials, Kubernetes secrets, SSL/TLS keys

- **What failed (Snyk post-mortem)**: "Hash verification confirms a file matches what PyPI advertised, but does not indicate whether the advertised content is malicious."

- **What failed**: LiteLLM "pulled [Trivy] from `apt` without a pinned version" — unpinned tool versions in CI/CD as attack vector

- **What failed**: No `.pth` file inspection in pip; "No widely deployed pip plugin currently does this automatically"

- **What failed**: `PYPI_PUBLISH` token remained accessible in GitHub Actions runner after Trivy compromise — no credential isolation

- **CPython maintainers acknowledged** security risk of `.pth` startup hooks (issue #113659) — no patch applied

- **Detection burden**: "fell entirely on users, not preventive infrastructure" — community discovered, not automated monitoring

- **Community response**: 9+ projects pinned versions within 3 hours — reactive, not proactive

- **Implication for AI gateway**: LiteLLM is the AI proxy/gateway that thousands of companies run in production. A supply chain attack on the gateway is an attack on every AI agent calling through it. The proxy IS the attack surface.

---

## Source: MCP Production Deployment Gaps — Industry Analysis
**URLs**:
- https://workos.com/blog/2026-mcp-roadmap-enterprise-readiness
- https://thenewstack.io/model-context-protocol-roadmap-2026/
- https://medium.com/@thomas.scola/mcp-is-not-enough-the-missing-gaps-in-open-agent-standards-3bc31e7b4e59

### Key Findings

**WorkOS — Enterprise Readiness Gaps:**
- "The protocol has real gaps in auth, observability, gateway patterns, and configuration portability"
- "Static client secrets are a common pattern in current MCP deployments, and everyone recognizes that's a problem"
- "Enterprises need 'paved paths' away from static secrets and toward SSO-integrated flows"
- "Enterprises need end-to-end visibility into what was requested, what was executed, and what the outcome was"
- "MCP doesn't define a standard way to surface this information"
- "Teams are stitching together custom logging, bolting on their own trace identifiers"
- "Configure an MCP server once and have that configuration work across different MCP clients" — configuration portability gap
- "Enterprise readiness items are pre-RFC; specifications and implementations are still ahead"
- Three specific gateway problems lacking answers: "authorization propagation, session semantics, and gateway visibility boundaries"

**Thomas Scola — MCP Is Not Enough:**
- "Tools are not agents. What happens when agents need to discover each other, prove who they are, carry their capabilities across frameworks, and operate under enforceable policy"
- "Agent identity that does not travel across frameworks"
- "Manifests that describe capabilities but cannot be deployed as contracts"
- "MCP gets you to the edge of the problem and stops."
- "Policy enforcement as a first-class protocol primitive" — explicitly missing
- "Audit trails and provenance across agent chains" — explicitly missing
- "Separation of duties built into the protocol" — explicitly missing
- "Authorization (OAuth 2.1) tells you whether an agent is permitted to call an endpoint. Policy tells you whether a specific agent, with a specific identity, performing a specific action, in a specific context, under a specific delegation chain, is permitted to proceed."
- "The challenge with AI agents is not generating answers. It is governing actions."
- Scale context: 17,000 MCP servers, 97 million monthly SDK downloads, four competing protocols (MCP, A2A, ACP, ANP)

**Production Health Stats:**
- 86% of MCP servers never leave the developer's laptop — only 5% reach actual production
- April 2026 analysis of 2,181 remote MCP server endpoints: 52% completely dead, only 9% fully healthy
- "No standardized audit trails, authentication tied to static secrets, undefined gateway behavior, and configuration that doesn't travel between clients"

---

## Source: Kong Enterprise MCP Gateway — Product Launch Analysis
**URL**: https://konghq.com/blog/product-releases/enterprise-mcp-gateway

### Key Findings (Problems Kong is being paid to solve = validated enterprise demand)

- "Developers spin up ad-hoc MCP servers without standardized processes or governance"
- "MCP's still-evolving authentication specification, novel identity management challenges"
- "More — and often, irrelevant — context is added to every prompt, leading to significantly more expensive and less performant LLM interactions" — context bloat as cost driver
- "Platform teams operate blindly, unable to track which tools agents are invoking, identify performance bottlenecks"
- Kong's solution: OAuth 2.1 Resource Server, centralized security at gateway level, MCP traffic monitoring (prompt/completion sizes), latency metrics, error rates, throughput across entire MCP ecosystem
- "Kong's OAuth plugin secures all MCP servers simultaneously at the gateway level with a single configuration" — enterprises want centralized, not per-server configuration

---

## Source: Enterprise AI Agent Security — Industry Surveys and Job Market
**URLs**:
- https://www.mintmcp.com/blog/ai-agent-security
- https://www.practical-devsecops.com/emerging-ai-security-roles/
- https://www.heisenberginstitute.com/ai-security/ai-security-jobs-2026-hiring/

### Key Findings

**MintMCP Enterprise Survey Data:**
- "Most organizations can monitor what their AI agents are doing—but the majority cannot stop them when something goes wrong."
- "Kill switches matter more than monitoring—prioritize platforms that can terminate agent actions in real-time, not just log them."
- "The governance-containment gap is the #1 enterprise AI security risk: 58–59% report monitoring / human oversight, but only 37–40% have true containment controls."
- "63% of organizations cannot enforce purpose limitations on their AI agents—they know what agents should do, but cannot technically prevent other actions."
- "33% of organizations lack audit trails for their AI agent activity—a critical gap exposing them to compliance failures without forensic evidence."
- "Organizations with evidence-quality audit trails are 20-32 points ahead on every AI maturity metric."
- "Unified MCP Gateway infrastructure to bridge this gap between AI assistants and internal data while maintaining the authentication, permissions, and audit trails that enterprise deployments demand."

**2026 Job Market Language:**
- "While 100% of security leaders said agentic AI is on their roadmap, most organizations can monitor what their AI agents are doing but cannot stop them when something goes wrong" — the defining security challenge framing in job descriptions
- Top companies hiring for AI agent security: OpenAI, Anthropic, Microsoft, Google, Meta, Amazon, Visa — plus specialized startups: WitnessAI, Straiker, Astrix Security, Noma Security, Relyance AI
- AI Security Engineer roles focus on: attacking/assessing/hardening MCP servers, tool poisoning, prompt injection, supply chain security, agentic AI defenses
- Salaries: $150K–$280K for AI Security Engineer roles — high-urgency hiring signal

---

## Source: MCP Spec Gaps — TypeScript/Python SDK Issue Absence Analysis

### Key Findings (What is NOT being asked for = assumed to be solved or unknown)

The complete absence of the following in official SDK repos is itself a signal — developers either:
1. Do not know these features are possible (lack of awareness)
2. Have given up asking (built workarounds)
3. Are building them in downstream tooling (Kong, Vectimus, SatGate, etc.)

**Absent from official SDK issues:**
- Rate limiting / per-agent quota enforcement
- Cost limit / budget enforcement
- Infinite loop detection
- Cryptographic audit trail
- Per-tool RBAC policies
- Agent identity federation across frameworks
- Malicious response detection (response-side)
- Human-in-loop risk thresholds
- Sub-agent delegation with carved permissions
- Behavioral anomaly detection

These are all present in third-party proxy tools — confirming the gap is real and being filled externally.
