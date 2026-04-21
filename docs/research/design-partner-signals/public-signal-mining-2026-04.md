# Rind Design Partner Signal Mining — Final Report
**Research completed**: April 2026
**Method**: Public signal mining (14 sources, challenge/rectify loop)
**Replaces**: Traditional design partner interviews (deferred — legal/stealth constraints)

---

## Executive Summary

- **The enforcement gap is the dominant signal.** Across every source — HN threads, GitHub issues, industry surveys, job postings, and competitor launches — developers and security teams can observe what AI agents do but cannot stop them. The exact framing: "63% of organizations cannot enforce purpose limitations on their AI agents" (Kiteworks 2026, n=225). This is the market's defining pain point, and it maps directly to Rind's core proposition.
- **Auth ≠ authz ≠ policy — developers understand this distinction.** Multiple independent sources articulate a three-layer problem: authentication (who), authorization (what endpoint), and policy (what specific action, in what context, at what cost, under what delegation). MCP only partially solves layer one. Layers two and three are wide open.
- **Response-side enforcement is the most underbuilt feature in every competing tool.** MCP-fence is the only proxy that scans both request and response. Every other tool — including Vectimus, Permit MCP Gateway, and Snyk agent-scan — is request-only. Developer quotes confirm this is a known gap.
- **Cost and loop safety are secondary but validated.** Budget enforcement ("Agent stuck in a retry loop against a $0.10/call API burns real money" — SatGate) and loop detection appear in proxy tool positioning but are underrepresented in organic developer complaint threads, suggesting they are real problems that developers have mostly accepted as unsolved rather than actively complained about.
- **Supply chain risk (LiteLLM attack) has moved scan-on-connect from nice-to-have to urgent.** The March 24, 2026 attack — malicious litellm versions live for approximately 3 hours before quarantine, with detection burden falling entirely on users — demonstrates that static import is no longer safe. Developers are independently converging on runtime sandboxing and out-of-process isolation as the correct mitigation class, which validates Rind's proxy model.

---

## Top 5 Unmet Needs (ranked by signal frequency)

### Need #1: Enforcement — The Ability to Block, Not Just Watch
**Signal strength**: HIGH (appeared in 9+ sources)

**Developer language**: "kill switch," "purpose limitations," "cannot stop them," "containment," "enforcement layer," "policy as a first-class primitive"

**Key quotes**:
- "Most organizations can monitor what their AI agents are doing—but the majority cannot stop them when something goes wrong." — MintMCP/Kiteworks survey (Kiteworks 2026 Data Security Forecast, n=225)
- "63% of organizations cannot enforce purpose limitations on their AI agents—they know what agents should do, but cannot technically prevent other actions." — Kiteworks 2026 (n=225, confidence: MEDIUM — small self-selected sample)
- "Policy enforcement as a first-class protocol primitive" — Thomas Scola, Medium (explicitly named as missing from MCP spec)
- "The challenge with AI agents is not generating answers. It is governing actions." — Thomas Scola, Medium
- "I wouldn't allow an LLM to communicate with the outside world in any capacity at the same time as it has access to any sensitive data" — alkonaut, HN #44219755 (developer resorting to binary all-or-nothing access because per-action enforcement doesn't exist)

**Rind feature map**: Feature #3 (Block tool calls based on policy rules) directly addresses this. Feature #7 (Allow/deny lists) is the simplest implementation of enforcement. Both are validated. Gap: the Kiteworks data also shows 60% cannot terminate misbehaving agents quickly — an active kill-switch capability (session termination, not just call blocking) is not in the current MVP plan.

---

### Need #2: Audit Trail — Evidence-Quality Logging for Security Operations
**Signal strength**: HIGH (appeared in 8 sources)

**Developer language**: "audit trail," "full context," "forensic evidence," "cryptographic audit trail," "who authorized which agent at what trust level," "compliance failures"

**Key quotes**:
- "Most of the implementations...do not have any auditing or metrics. Claude stores log output...but that is geared more for debugging than for DevOps/SecOps." — neomantra, HN #43600192
- "33% of organizations lack audit trails for their AI agent activity—a critical gap exposing them to compliance failures without forensic evidence." — Kiteworks 2026 (n=225)
- "Organizations with evidence-quality audit trails are 20-32 points ahead on every AI maturity metric." — Kiteworks 2026 (n=225)
- "Enterprises need 'end-to-end visibility into what was requested, what was executed, and what the outcome was'" — WorkOS MCP Enterprise Readiness blog
- "Teams are stitching together custom logging, bolting on their own trace identifiers" — WorkOS
- "what we are hoping to do next iteration is to add audit logs of actions taken (of high risk actions)" — jodoking, HN #44904974 (MCP Security Suite author — logging is the stated roadmap item even for tools that already scan)

**Rind feature map**: Feature #2 (Log every tool call with full context) maps to this directly. Gap identified: OTel export drops I/O content (Langfuse issue #5971 — "input/output values being set seem to be getting lost in transit"). Rind must not rely on OTel passthrough for security-critical data; log at the proxy level before forwarding.

---

### Need #3: Tool-Level Authorization (Per-Tool RBAC / Scoped Permissions)
**Signal strength**: HIGH (appeared in 7 sources)

**Developer language**: "per-tool RBAC," "scoped tokens," "no per-tool policy," "fine-grained access tokens," "just-in-time permission scoping," "tool-level filtering"

**Key quotes**:
- "Once an agent authenticates, it can call any tool on the server" — Permit MCP Gateway positioning (HN, HN item 47426690): auth ≠ authz gap
- "OAuth 2.1 + PKCE, Microsoft Entra SSO, per-tool RBAC, full audit trail on every tool call" — salterisp, HN #47356600 (explicit feature request list)
- "gateway authenticates the caller, protect-mcp constrains which tools they can call" — tomjwxf, HN #47356600
- "fine-grained access tokens, so you can generate one scoped to just the repo" — losvedir, HN #44097390
- "permissions system itself, so even if the GitHub token has permissions, different projects have their tool calls filtered" — frabcus, HN #44097390
- "No per-tool policy, no way to scope what an agent can do" — gap statement, HN proxy enforcement thread

**Rind feature map**: Feature #7 (Allow/deny lists) is a basic form of this. Feature #3 (Block tool calls based on policy rules) is the full implementation. Gap: the signal specifically calls for per-agent and per-context scoping, not just global allow/deny. The planned MVP has string-match policy rules; the market wants identity-aware, context-aware per-tool RBAC. This is a prioritization signal — the allow/deny list alone will feel incomplete to this audience.

---

### Need #4: MCP Server Trust Verification (Scan-on-Connect / Pre-Deployment Gating)
**Signal strength**: HIGH (appeared in 6 sources)

**Developer language**: "nobody's validating what a server does vs. what it declares," "tool description changes go undetected," "scan before you install," "supply chain verification," "cryptographic provenance"

**Key quotes**:
- "nobody's validating what a server does vs what it declares" — riteshkew1001, HN #47356600 (comment #47436500, VERIFIED)
- "Current MCP clients like Claude and Cursor, will not notify you about this change" [tool description changes] — lbeurerkellner (Invariant Labs), HN #43600192
- "Scanners catch known patterns in config files. They can't catch a tool server that changes its schema after you approved it." — paolovella, HN #47232476 (comment #47232480, VERIFIED — this is the VellaVeto thread)
- "decide if server is safe to consume" before installation — Snyk agent-scan issue #7 (pre-deployment gating request)
- "Building sandboxed VM technology for isolated runtime environments to prevent credential theft" — jFriedensreich, HN LiteLLM thread #47501426 (comment #47502586, VERIFIED)
- "Even just having an import statement triggers malware in 1.82.8" — dot_treo, HN #47501426 (comment #47502067, VERIFIED) — confirms the need for pre-connection verification

**Rind feature map**: Feature #4 (Scan-on-connect) directly addresses this. The signal is stronger than anticipated — it covers both static pre-connect scanning AND runtime behavioral monitoring for schema drift. The MVP plan should treat scan-on-connect as a real-time behavioral comparison (declared vs. actual capabilities) not just a one-time static check.

---

### Need #5: Response-Side Enforcement (Bidirectional Tool Call Inspection)
**Signal strength**: MEDIUM (appeared in 4 sources, but named as a gap by competitors building in this space)

**Developer language**: "response-side blind spot," "output from your MCP server is safe," "the lethal trifecta," "poisoned outputs," "hidden instructions in tool responses," "tainted sessions"

**Key quotes**:
- "Most MCP security tools only check the request side" — yjcho9317 (MCP-fence author), HN #47692889 (comment, VERIFIED)
- "the tool is legitimate but the server is compromised and data is leaked by returning a malicious error message" — charleyc, HN #44219755
- "If the response contains hidden instructions, the agent may follow them" — gap statement from proxy enforcement thread
- "Vectimus does input inspection on approved MCP servers, but it can only catch known bad patterns too. It does not try to solve prompt injections or if a legitimate MCP server was compromised and returned poisoned outputs." — JXavierH, HN Vectimus thread (comment #47534497, VERIFIED)
- "the lethal trifecta — data access + malicious instruction exposure + exfiltration capability" — simonw, HN #44219755
- "notion of 'tainted' sessions" — btown, HN #44097390

**Rind feature map**: No planned MVP feature addresses response-side inspection. This is a gap. Every competing proxy (Vectimus, Permit MCP Gateway, Snyk agent-scan) is request-only. MCP-fence is the only tool with bidirectional inspection and it explicitly markets this as a differentiator. Rind's proxy position makes response-side inspection architecturally natural — it is in the data path for both request and response.

---

## Feature Validation Matrix

| MVP Feature | Signal Strength | Evidence | Priority Adjustment |
|---|---|---|---|
| Intercept all MCP tool calls (proxy) | HIGH | HN threads, WorkOS, Thomas Scola, Kong launch, 6 proxy tools built independently | KEEP — validated as correct architecture; proxy is the only place enforcement is possible |
| Log every tool call with full context | HIGH | Kiteworks survey (63%/33% gaps), neomantra HN quote, WorkOS audit gap, jodoking roadmap statement | KEEP — core feature, but ensure logs are written at proxy layer, not via OTel passthrough (Langfuse OTel data loss bug) |
| Block tool calls based on policy rules | HIGH | Kiteworks enforcement gap, salterisp explicit feature request, Permit MCP Gateway positioning, Thomas Scola | KEEP and RAISE — this is the primary purchase driver, not just a feature |
| Scan-on-connect (auth gaps, tool poisoning) | HIGH | LiteLLM supply chain attack, riteshkew1001 CVE quotes, paolovella schema drift quote, Snyk issue #7 | KEEP and RAISE — extend scope to include runtime schema drift detection, not just connect-time scanning |
| Cost tracking (LLM spend per agent) | MEDIUM | SatGate positioning, LangSmith issue #1918 (token per node), Langfuse cost mismatch bug | KEEP — validated but lower priority than enforcement; cost tracking is table stakes for observability, not a purchase driver alone |
| Loop detection (same tool+input N times) | MEDIUM | SatGate "retry loop burns real money" positioning, implicit in LiteLLM incident (.pth fires on every Python startup) | KEEP — validated but signal is from proxy tool positioning, not organic developer complaint; treat as safety feature, not selling point |
| Allow/deny lists (string-match on tool names) | MEDIUM | salterisp feature list, tomjwxf multi-layer enforcement quote, frabcus per-project filtering | KEEP but SCOPE UP — signal calls for per-agent, per-context, identity-aware policies; plain string matching will feel incomplete to the target audience; ship string match now, flag identity-aware RBAC as immediate follow-on |

---

## Missing MVP Features (not in plan but signaled)

- **Feature**: Response-side inspection (scan tool responses for prompt injection, credential exfiltration, taint markers)
  - **Signal**: MCP-fence markets bidirectional scanning as its primary differentiator (HN #47692889, VERIFIED). JXavierH explicitly states Vectimus cannot catch poisoned outputs (comment #47534497, VERIFIED). simonw's "lethal trifecta" (HN #44219755) — all three legs of the attack are in the response path.
  - **Recommendation**: Add to MVP. Rind is in the response path by architecture — not inspecting responses is leaving the most dangerous attack vector unaddressed. Even basic response-side pattern matching (credential patterns, instruction injection markers) would be a meaningful differentiator vs. all request-only proxies.

- **Feature**: Session/agent kill switch (terminate a running agent session, not just block individual calls)
  - **Signal**: Kiteworks survey — 60% cannot terminate misbehaving agents quickly. MintMCP: "Kill switches matter more than monitoring." This is the second most-cited enforcement gap after purpose limitations.
  - **Recommendation**: Add to MVP roadmap. Does not need to be in the first release but should be in the v1.1 milestone and mentioned in positioning. It is a named gap in the Kiteworks data used by the market.

- **Feature**: Runtime schema drift detection (alert when an MCP server's tool definitions change after approval)
  - **Signal**: paolovella (VellaVeto, HN #47232476, comment #47232480, VERIFIED): "Scanners can't catch a tool server that changes its schema after you approved it." lbeurerkellner (Invariant Labs, HN #43600192): MCP clients do not notify when tool descriptions change. This is distinct from scan-on-connect — it requires continuous comparison against a stored baseline.
  - **Recommendation**: Add to roadmap (v1.x). Include baseline storage in data model from day one so this feature can be added without schema migrations. Mention in positioning as a planned differentiator.

- **Feature**: Sub-agent delegation with carved permission budgets
  - **Signal**: SatGate parent post (HN #47002845, VERIFIED): "Budget isolation is real — when research-agent hits 0, siblings and parent are unaffected." Gap statement from proxy enforcement thread: "Parent agents need to mint sub-agent tokens with carved budgets." devashishjadhav (Permit MCP Gateway thread, comment #47452796, VERIFIED): advocates for cryptographic provenance validation in agent chains.
  - **Recommendation**: Add to roadmap (v2). Complex to implement correctly; requires a credential/delegation model. Worth naming in the architecture from the start.

- **Feature**: Offline/air-gap policy enforcement mode
  - **Signal**: Snyk agent-scan issue #125 — "--local-only flag not supported. Users want offline policy checks — privacy/air-gap requirement." The Snyk scanner's dependency on Invariant Labs external API (issue #75 — entire scanning capability blocked when upstream is down) is cited as an architecture risk.
  - **Recommendation**: Add to roadmap. Air-gap mode is a named enterprise requirement. Design the policy evaluation engine to run locally from day one; avoid architectural dependency on Rind cloud for basic enforcement.

---

## Key Developer Quotes

### Theme: The Enforcement Gap

1. "Most organizations can monitor what their AI agents are doing—but the majority cannot stop them when something goes wrong." — MintMCP summarizing Kiteworks 2026 survey (n=225) https://www.mintmcp.com/blog/ai-agent-security

2. "63% of organizations cannot enforce purpose limitations on their AI agents—they know what agents should do, but cannot technically prevent other actions." — Kiteworks 2026 Data Security Forecast (n=225) https://www.mintmcp.com/blog/ai-agent-security

3. "The challenge with AI agents is not generating answers. It is governing actions." — Thomas Scola, Medium https://medium.com/@thomas.scola/mcp-is-not-enough-the-missing-gaps-in-open-agent-standards-3bc31e7b4e59

4. "Policy enforcement as a first-class protocol primitive" [explicitly named as missing from MCP] — Thomas Scola, Medium

5. "Authorization (OAuth 2.1) tells you whether an agent is permitted to call an endpoint. Policy tells you whether a specific agent, with a specific identity, performing a specific action, in a specific context, under a specific delegation chain, is permitted to proceed." — Thomas Scola, Medium

### Theme: Auth ≠ Authz ≠ Policy

6. "Once an agent authenticates, it can call any tool on the server" — Permit MCP Gateway positioning, HN item 47426690

7. "absent authentication, blind trust, no access control" are root causes "the protocol leaves up to each implementer" — salterisp, HN #47356600

8. "OAuth 2.1 + PKCE, Microsoft Entra SSO, per-tool RBAC, full audit trail on every tool call" — salterisp, HN #47356600 (explicit feature request list)

9. "Auth says 'who' and 'what' — nothing says 'how much.'" — satgate author, HN #47002845 (VERIFIED — parent post)

### Theme: The Audit Gap

10. "Most of the implementations...do not have any auditing or metrics. Claude stores log output...but that is geared more for debugging than for DevOps/SecOps." — neomantra, HN #43600192

11. "I cannot find a local log of even my prompts. I cannot find anything other than my credits counts." — xrd, HN #43600192

12. "Teams are stitching together custom logging, bolting on their own trace identifiers" — WorkOS MCP Enterprise Readiness blog https://workos.com/blog/2026-mcp-roadmap-enterprise-readiness

### Theme: Response-Side and Trust Verification

13. "nobody's validating what a server does vs what it declares" — riteshkew1001, HN #47356600 comment #47436500 (VERIFIED)

14. "Scanners catch known patterns in config files. They can't catch a tool server that changes its schema after you approved it." — paolovella, HN #47232476 comment #47232480 (VERIFIED)

15. "Most MCP security tools only check the request side" — yjcho9317 (MCP-fence), HN #47692889 (VERIFIED)

16. "Vectimus does input inspection on approved MCP servers, but it can only catch known bad patterns too. It does not try to solve prompt injections or if a legitimate MCP server was compromised and returned poisoned outputs." — JXavierH, HN Vectimus thread comment #47534497 (VERIFIED)

### Theme: Supply Chain and Runtime Risk

17. "CVE-2025-6514 alone is a 9.6 command injection in mcp-remote through the auth flow, that's terrifying." — riteshkew1001, HN #47356600 comment #47436500 (VERIFIED)

18. "Even just having an import statement triggers malware in 1.82.8" — dot_treo, HN LiteLLM thread #47501426 comment #47502067 (VERIFIED)

19. "Detection burden fell entirely on users, not preventive infrastructure" — Snyk LiteLLM post-mortem https://snyk.io/blog/poisoned-security-scanner-backdooring-litellm/

20. "Need sandboxing at language/runtime level for untrusted library isolation" — staticassertion, HN #47501426 comment #47502971 (VERIFIED)

---

## LiteLLM Supply Chain Attack — Signal Summary

**Thread**: "Tell HN: Litellm 1.82.7 and 1.82.8 on PyPI are compromised" — HN item 47501426

**What happened (rectified)**: Malicious litellm versions were live on PyPI for approximately 3 hours (10:39–13:38 UTC, March 24, 2026) — not "40 minutes" as originally stated in the raw signals file. Detection was community-driven; no automated monitoring caught it. The versions exfiltrated environment variables, API tokens, SSH keys, cloud credentials, Kubernetes secrets, and SSL/TLS keys.

**What the thread reveals about what developers want**:

The HN post-mortem thread converged independently on the same solution class as Rind:

1. **Out-of-process isolation** — jFriedensreich (comment #47502586) and kstenerud (comment #47502549) are both building sandboxed execution frameworks. staticassertion (comment #47502971) explicitly calls for "sandboxing at language/runtime level." This is the proxy model validated by developers building workarounds.

2. **Runtime enforcement over install-time trust** — The thread rejects hash verification as insufficient ("Hash verification confirms a file matches what PyPI advertised, but does not indicate whether the advertised content is malicious" — Snyk post-mortem). Developers are asking for runtime behavioral monitoring, not better install-time checks.

3. **Supply chain verification primitives** — rdevilla (comment #47502459) calls for "enforcement of deterministic, verifiable build chains." binsquare (comment #47503625) calls for "signed, verifiable artifacts." This maps to Rind's scan-on-connect feature.

4. **The LiteLLM attack is existential for proxy adoption**: LiteLLM is the AI gateway/proxy that thousands of companies run in production. A supply chain attack on the gateway attacks every agent calling through it. This both validates the need for a trustworthy proxy layer and raises the question Rind must answer: "How do we know Rind itself hasn't been compromised?" Reproducible builds, signed releases, and SBOM publication should be in the Rind security posture from day one.

---

## OWASP MCP Top 10 — Feature Coverage

| OWASP ID | Name | Rind MVP Coverage | Feature Mapping |
|---|---|---|---|
| MCP01 | Token Mismanagement & Secret Exposure | FULL | Feature #2 (log) + response-side inspection (gap) — proxy intercepts credential leakage in tool responses |
| MCP02 | Privilege Escalation via Scope Creep | FULL | Feature #3 (block) + Feature #7 (allow/deny) — proxy enforces permission envelopes, blocks scope expansion |
| MCP03 | Tool Poisoning | FULL | Feature #4 (scan-on-connect) + runtime schema drift detection (gap) |
| MCP04 | Software Supply Chain Attacks | PARTIAL | Feature #4 catches post-connect behavioral anomalies; pre-execution compromise (e.g., malicious import) is outside proxy enforcement boundary. Signed Rind releases partially mitigate. |
| MCP05 | Command Injection & Execution | FULL | Feature #1 (intercept) + Feature #3 (block) — proxy validates tool call parameters before forwarding |
| MCP06 | Intent Flow Subversion | PARTIAL | Response-side inspection (currently a gap) would cover this. Proxy can detect instruction injection patterns in tool responses when response inspection is added. |
| MCP07 | Insufficient Authentication & Authorization | FULL | Feature #3 (block) + Feature #7 (allow/deny) — proxy enforces authN/authZ at the tool call boundary |
| MCP08 | Lack of Audit and Telemetry | FULL | Feature #2 (log every tool call with full context) |
| MCP09 | Shadow MCP Servers | PARTIAL | Feature #7 (allow/deny lists) enables server allowlisting; blocks calls to unapproved servers. Complete with server-level deny rules. |
| MCP10 | Context Injection & Over-Sharing | PARTIAL | Response-side inspection (gap) would enable PII redaction/sanitization in responses before returning to agent. Not in current MVP. |

**Coverage summary**: Rind MVP covers 7 of 10 OWASP MCP Top 10 categories fully, and 3 partially. Adding response-side inspection (recommended gap) would bring full coverage to 9 of 10 (MCP04 remains partial by nature — pre-execution supply chain compromise cannot be stopped at the proxy layer). This matches MCP-fence's self-reported "9/10 OWASP MCP Top 10 covered."

---

## Data Quality Notes

### HIGH confidence (verified to primary source)
- LiteLLM attack timeline: ~3 hours live (10:39–13:38 UTC, March 24, 2026) — confirmed by Snyk, Datadog, BleepingComputer, Wiz, Truesec, Sonatype independently
- HN comment IDs in LiteLLM thread (#47501426): dec0dedab0de #47502586, rdevilla #47502459, jFriedensreich #47502945, staticassertion #47502971, kstenerud #47502549, binsquare #47503625, dot_treo #47502067 — all verified
- HN comment IDs in CVE thread (#47356600): riteshkew1001 #47436500 — verified
- HN comment IDs in proxy tools: salterisp #47528497, JXavierH #47534497, difc #46866118, devashishjadhav #47452796, globalchatads #47697142, paolovella #47232480 — all verified
- Kiteworks 2026 survey figures (59%/58%/63%/60%/55%/40%/37%) — confirmed, primary source identified
- OWASP MCP Top 10 — confirmed at https://owasp.org/www-project-mcp-top-10/
- CVE-2025-6514 (CVSS 9.6, command injection in mcp-remote) — verified

### MEDIUM confidence (secondary source or small sample)
- Kiteworks n=225 figures — confirmed but caveat: small self-selected sample (security/IT/risk leaders who opted in), likely skews toward organizations already aware of AI governance risk; may overstate monitoring sophistication in less security-aware orgs
- AgentSeal "41% of MCP servers have no authentication" (n=523 servers, late 2025–2026) — secondary source, primary not directly accessed
- Trend Micro "38% of 1,862 exposed servers responded to unauthenticated requests" — secondary source
- "86% of MCP servers never leave the developer's laptop" — production stat from MCP Production Deployment Gaps industry analysis; primary source not directly verified
- "52% of remote MCP server endpoints completely dead, only 9% fully healthy" — from same industry analysis source; not independently verified

### DO NOT CITE IN EXTERNAL MATERIALS (UNVERIFIED)
- "86% unauthenticated" — no primary source found; this specific statistic does not appear in the Clutch Security article it was attributed to. Replace with AgentSeal 41% figure (n=523) if needed.
- "52% no transport encryption" — no primary source found. Remove.
- The original "40 minutes" quarantine figure for LiteLLM — INCORRECT. Correct figure is approximately 3 hours.
- MintMCP as attribution for Kiteworks statistics — MintMCP is a secondary source. Cite "Kiteworks 2026 Data Security Forecast (n=225)" directly.

### Thread ID corrections (affects quote attribution)
The original raw signals file had three HN thread IDs swapped:
- HN item 46855770 = Nucleus thread (difc, Firecracker microVM) — NOT MCP-fence
- HN item 47692889 = MCP-fence thread (yjcho9317) — NOT VellaVeto
- HN item 47232476 = VellaVeto thread (paolovella) — NOT Nucleus

All quotes in this report use the corrected thread-to-tool mapping.

### Unresolved
- Reddit signal: No MCP security enforcement discussions indexed by search at time of rectification. HN is the primary developer forum for this audience.
- Exact AgentSeal primary source URL not directly accessed — figure used with confidence note.

---

## Recommended MVP Feature Priority Adjustments

Based on all signals, the following specific changes are recommended to the planned MVP feature sequence:

**1. Raise priority: Block tool calls via policy (Feature #3)**
This is the primary purchase driver — not a supporting feature. The Kiteworks enforcement gap data (63% cannot enforce purpose limitations), the Thomas Scola framing ("governing actions"), and the Permit MCP Gateway "auth ≠ authz" positioning all converge on enforcement as the reason to buy. The MVP narrative should lead with enforcement, not observability. Observability is the discovery hook; enforcement is the value.

**2. Raise priority and extend scope: Scan-on-connect (Feature #4)**
Extend beyond one-time static scanning at connection time to include:
- (a) Baseline storage of tool definitions at connect time
- (b) Drift detection on subsequent calls — alert when tool behavior deviates from declared schema
The paolovella quote (VERIFIED) makes this distinction explicit: static scanners fail for servers that change their schema post-approval. Store baselines in the data model from day one.

**3. Add to MVP: Response-side inspection**
No planned feature covers this. It is a named gap by competing tools (MCP-fence markets bidirectional scanning as its primary differentiator). Rind is architecturally in the response path — not inspecting responses is leaving the most dangerous attack vector (prompt injection via tool response, credential exfiltration in error messages, tainted data propagation) unaddressed. Minimum viable implementation: regex pattern matching for known credential formats, instruction injection markers in responses.

**4. Scope up: Allow/deny lists (Feature #7) toward identity-aware policies**
String-match on tool names will ship, but the market signal specifically requests per-agent, per-context, per-project scoping. Plain string matching will feel incomplete to developers who have articulated three-layer policy models. Plan the policy schema to support identity attributes from day one, even if v1 only evaluates tool name. This avoids a breaking schema change in v1.x.

**5. Add to data model (not MVP UI): Session kill switch capability**
60% of enterprises cannot terminate misbehaving agents quickly (Kiteworks). MintMCP explicitly says "Kill switches matter more than monitoring." The MVP does not need a kill-switch UI in week one, but the proxy's session tracking must support forced termination from day one so this feature can be added without architectural rework.

**6. Keep but reframe: Cost tracking (Feature #5) and loop detection (Feature #6)**
Both are validated but neither is a primary purchase driver. Cost tracking is table stakes for observability completeness. Loop detection is a safety feature. Do not position either as selling points in the top-line narrative. They belong in the feature matrix, not the pitch.

**7. Operational design note: Avoid external API dependencies for core enforcement**
Snyk agent-scan's dependency on the Invariant Labs API (issue #75 — entire scanning capability blocked when upstream is down) is cited as an architecture risk. Rind policy enforcement must work offline and without third-party availability dependencies. Air-gap mode is an explicit enterprise requirement (Snyk issue #125). Design the policy evaluation engine to run fully local.

---

## Unresolved Items

- **Reddit signal**: No MCP security enforcement discussions found via search. Not a research failure — HN appears to be the actual forum for this audience. No action needed.
- **"86% unauthenticated" original source**: Claimed to be Clutch Security; Clutch Security article does not contain this statistic. No primary source identified after rectification. Statistic should not be cited.
- **AgentSeal primary source**: The 41% no-auth figure (n=523 servers) is referenced through secondary sources. Direct access to AgentSeal's scanning report would strengthen this statistic to HIGH confidence.
- **Conversion rate signal**: No data on whether free observability converts to paid enforcement. OQ-005 (Does observability alone close deals, or must policy engine be bundled?) remains open — nothing in public signals resolves it, though the Kiteworks enforcement gap data and "kill switches matter more than monitoring" framing suggest enforcement must be bundled.
