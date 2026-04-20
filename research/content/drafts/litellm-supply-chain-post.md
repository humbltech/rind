# LiteLLM's Supply Chain Attack Exposes MCP's Security Gap

**Published by Aegis Team | April 2026**

> **Draft status**: Challenger/steelman loop complete. Ready for user review before publishing.
>
> **SEO metadata**
> - Title: `LiteLLM's Supply Chain Attack Exposes MCP's Security Gap`
> - Slug: `litellm-supply-chain-attack-mcp-security-runtime-trust`
> - Meta description: `The LiteLLM supply chain attack reveals two distinct MCP security failures: compromised packages and inherited runtime trust. Here's what's actually exposed.`
> - dev.to tags: `security`, `ai`, `devops`, `typescript`, `webdev`
> - Publish platform: dev.to (Aegis brand account), canonical → aegis GitHub Pages blog
> - Author: Aegis Team (no personal name)

---

On March 24, 2026, versions 1.82.7 and 1.82.8 of LiteLLM — one of the most widely deployed AI gateway libraries, with 171 million monthly PyPI downloads — shipped a credential stealer. Not because someone compromised a developer's laptop. Not because of a misconfigured S3 bucket. Because attackers first compromised the Trivy CI/CD pipeline, used that foothold to steal the PYPI_PUBLISH token, and then injected base64-encoded malicious code directly into `proxy_server.py`. A `.pth` file provided persistence. The malicious packages were live for approximately three hours, from 10:39 to 13:38 UTC, before being pulled.

Three hours is enough. Every team that ran `pip install litellm` or let their CI pipeline update dependencies in that window pulled attacker-controlled code directly into their AI routing layer. And that three-hour window understates actual organizational exposure — private Artifactory caches, Docker layer caches, and warm pip environments mean teams that didn't touch LiteLLM in that window can still be running the compromised version today.

This was not an application-layer attack. It hit the AI infrastructure layer — the component that proxies every model call, every tool invocation, every agent decision.

## Two MCP Security Attack Surfaces, Not One

The instinct when reading about the LiteLLM incident is to file it under "supply chain risk" and treat MCP as a separate concern. That categorization misses the structural problem — and it understates how compounding these failure modes are when they occur in the same stack.

There are two distinct attack surfaces at play here.

**Surface 1 — Supply chain integrity**: Was the package tampered with before you installed it? This is the LiteLLM attack. An adversary with a PyPI publishing token can ship attacker-controlled code to every team that installs or updates the package. Defenses exist: pinned versions, hash verification, reproducible builds, private registries with approval flows. Most teams deploy none of these for AI infrastructure dependencies.

**Surface 2 — Runtime trust**: Does your system re-verify what it connected to after the initial handshake? This is the MCP-specific failure. Once an agent connects to an MCP server and receives a tool manifest, there is no native mechanism to re-verify that the server — or the tools it offers — is still what was originally approved. New tools can appear. Existing tools can change their behavior. The agent sees an updated tool list and treats it as authorized.

These are independent failure modes. A team that perfectly pins their MCP server packages — fully closing Surface 1 — remains exposed on Surface 2 because pinning controls what version installs, not what that version exposes at runtime. Conversely, a team with runtime tool-manifest monitoring still needs supply chain controls to ensure the thing they're monitoring hasn't been replaced before it was connected. In a connected agent stack, both surfaces must be defended. The LiteLLM attack demonstrates what happens when Surface 1 is undefended. The MCP protocol's connection model is the structural reason Surface 2 remains open for most deployments.

## MCP Is Already Infrastructure Scale

Before examining the mechanics, establish the exposure surface. The `@modelcontextprotocol/sdk` ships 32.8 million npm downloads per week (as of April 2026). The MCP PyPI package logs 217 million monthly downloads (as of April 2026). MCP is already infrastructure, not an experimental protocol.

According to AgentSeal research scanning 523 publicly discoverable deployed MCP servers — a sample that likely skews toward development and test environments rather than production systems behind firewalls — 41% had no authentication configured. A Kiteworks 2026 survey of 225 security and IT leaders found that 58% have some form of agent monitoring in place, but only 37 to 40% have containment controls. More concretely: 60% of organizations cannot terminate a misbehaving agent quickly.

The OWASP MCP Top 10 project (owasp.org/www-project-mcp-top-10) now formally taxonomizes MCP-specific risks, a signal that the security community has recognized the attack surface. But recognition and mitigation are different problems. The gap between "we know this is risky" and "we have runtime controls" is where the LiteLLM attack found its entry point.

## How the LiteLLM Supply Chain Attack Actually Worked

The LiteLLM compromise followed a multi-stage supply chain attack. Understanding each step matters because the same pattern applies to any package in the AI infrastructure stack.

**Step 1 — CI/CD Pipeline Compromise**: Attackers targeted the Trivy security scanning pipeline. Trivy runs in CI, often with elevated access. Compromising the pipeline gives access to secrets scoped to that pipeline.

**Step 2 — Token Theft**: The compromised pipeline leaked `PYPI_PUBLISH`, the PyPI publishing token for the `litellm` package. Once an attacker holds a publishing token for a high-download package, the distribution mechanism is fully trusted by downstream consumers.

**Step 3 — Payload Injection**: The attackers published versions 1.82.7 and 1.82.8 with a credential stealer embedded in `proxy_server.py`. The payload was base64-encoded to evade naive static analysis. The target: credentials passing through the LiteLLM proxy — which, in a typical deployment, includes API keys for OpenAI, Anthropic, Bedrock, and every other provider the gateway routes to.

**Step 4 — Persistence**: A `.pth` file was added to the package. Python processes `.pth` files at interpreter startup, meaning the malicious code would execute even if the dependency wasn't directly imported. Removing `litellm` from `requirements.txt` would not have been sufficient without also clearing the Python environment — particularly for teams using global Python installs or baked Docker images. Teams using virtual environments can remediate by deleting and recreating the venv from a clean lockfile, but must also ensure the `.pth` file is not present in any shared or system-level site-packages.

**Step 5 — Delivery Window**: The malicious versions were live for approximately three hours. Any automated dependency update, `pip install`, or clean Docker build in that window would have installed attacker-controlled code. Teams with warm caches or private registry mirrors may still be running the compromised version.

The mechanism requires no vulnerability in the application code. It requires only that the infrastructure component was trusted after initial installation, and that trust was not re-verified at runtime.

## How MCP Inherits the Runtime Trust Problem

With the two attack surfaces distinguished, the MCP-specific risk comes into focus. MCP's connection model grants tool access at connection time and does not require re-verification after that point. This is a structural runtime trust gap — independent of, and compounding with, supply chain integrity risk.

Consider a standard MCP server configuration:

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/home/user/projects"]
    },
    "database": {
      "command": "npx",
      "args": ["-y", "acme-mcp-server", "--connection-string", "postgres://..."]
    }
  }
}
```

When Claude Desktop, Cursor, or any MCP-compatible agent runtime reads this configuration and connects, it receives the tool manifest from each server and proceeds to use those tools. The `-y` flag on `npx` installs the latest version on any cache miss — clean CI builds, fresh developer environments, and periodic cache invalidations all qualify. There is no pinning. There is no hash verification. There is no re-check of what tools are available after the initial handshake.

This creates the **schema drift problem** — MCP's specific instantiation of the runtime trust failure. MCP tool definitions can change between connections. If `acme-mcp-server` ships an update that adds a new tool — `execute_sql` with write permissions, for example — that tool is available in the next tool-list response. Behavior from there varies by MCP client: the MCP protocol itself does not mandate re-approval for new tools, leaving this to client discretion. Clients that present per-tool approval prompts expose the risk on next session start; clients that don't expose it immediately.

```
MCP Runtime Trust Gap
─────────────────────────────────────────────────────────────

  Agent Runtime
       │
       │  initial connection (tool manifest approved)
       ▼
  MCP Server ──── tools/list ──── [tool_A, tool_B]  ◄── agent authorizes
       │
       │  vendor ships update (no notification, no re-approval required)
       │
  MCP Server ──── tools/list ──── [tool_A, tool_B, execute_sql]
                                                        ▲
                                    new write-access ───┘
                                    tool — agent authorizes automatically

  Missing controls: schema pinning, drift detection, re-approval flow

─────────────────────────────────────────────────────────────
```

Notice how the two surfaces compound: the `-y` flag with no version pinning means Surface 1 (supply chain integrity) is fully open. An attacker who can push to the `acme-mcp-server` npm package ships attacker-controlled tool definitions directly into the agent's authorized tool set. And because Surface 2 (runtime trust) is also open, even a pinned version that was clean at install time can expose new capabilities — servers can mutate their tool manifests without triggering any re-approval. Closing one surface without the other leaves teams half-defended.

## Who Is Actually Exposed Right Now

The teams most immediately exposed are those who:

- Use `npx -y` or equivalent unpinned install patterns for MCP servers
- Pull MCP servers from third-party npm packages without hash verification
- Operate MCP servers with no authentication (41% of the publicly discoverable servers in AgentSeal's scan)
- Have no mechanism to diff tool manifests between connections
- Cannot quickly terminate an agent whose MCP server has been updated or replaced

This is not a description of negligent teams. This is the default configuration for most MCP deployments today, because the protocol does not mandate any of these controls and tooling to enforce them at scale does not yet widely exist.

## MCP Agent Security Checklist: What To Do Now

Items 1 and 2 address supply chain integrity (Surface 1). Items 3, 5, 6, 9, and 10 address runtime trust (Surface 2). Items 4, 7, and 8 address both. A complete defense requires progress on all ten.

**1. Pin your MCP server package versions.**
Replace `npx -y @modelcontextprotocol/server-filesystem` with an exact version specifier. Add lockfiles (`package-lock.json`, `uv.lock`) and commit them. Treat MCP server updates the same as application dependency updates: reviewed, intentional, not automatic.

**2. Add hash verification for critical MCP packages.**
Commit lockfiles that include per-version integrity hashes (npm's `package-lock.json` and uv's lockfile both do this). Then use `npm ci` — not `npm install` — in CI pipelines: `npm ci` enforces the lockfile strictly and verifies integrity hashes on install. `npm install` will regenerate the lockfile if dependencies resolve differently and does not guarantee hash enforcement. A compromised package will have a different hash than the legitimate version, even if the version number matches.

**3. Audit your MCP server tool manifests on a schedule.**
At every deployment or on a weekly cadence, log the full tool list returned by each connected MCP server. Diff against the previous known-good manifest. Any new tool — especially one with write access or external network calls — should require explicit approval before agents can invoke it.

**4. Require authentication on every MCP server you operate.**
If you are running an MCP server, confirm it requires authentication before returning tool definitions or accepting tool calls. The 41% unauthenticated figure from AgentSeal's scan suggests this is treated as optional. It is not.

**5. Scope MCP server filesystem and network access at the OS level.**
An MCP filesystem server that can read and write `/home/user/projects` should not have access to `/etc`, `~/.ssh`, or any path outside its declared scope. Use Linux namespaces, Docker volume mounts, or macOS sandbox profiles to enforce this at the kernel level, not the application level.

**6. Test your agent termination path.**
If a connected MCP server begins returning anomalous tool calls, can you terminate the agent within 60 seconds? Run the drill. Document the runbook. The Kiteworks finding that 60% of organizations cannot terminate quickly is not a statistic about other teams.

**7. Monitor CVEs for your MCP dependencies.**
Subscribe to GitHub security advisories for `@modelcontextprotocol/sdk`, `mcp` (PyPI), and any MCP server packages in your environment. Set up automated alerts so vulnerabilities are not discovered reactively.

**8. Treat MCP servers as third-party code in your dependency review process.**
If your organization reviews third-party libraries before approval, MCP servers belong in that queue. A tool that can execute SQL, read files, or call external APIs has higher blast radius than most npm packages.

**9. Document what each MCP server is authorized to do — before connecting it.**
Write down the expected tool list, the data it can access, and the network endpoints it can reach. When the actual manifest diverges from the documented one, that divergence is an alert, not an incidental update.

**10. Log all MCP tool invocations, not just model inputs and outputs.**
If your observability stack captures LLM calls but not MCP tool calls, you have a blind spot exactly where the LiteLLM attack delivered its payload. The credential stealer ran inside the proxy — below the model layer. MCP tool calls are the equivalent execution surface.

## Conclusion: MCP Security Starts at the Infrastructure Layer

The LiteLLM attack is a case study in what happens when infrastructure that touches AI workloads is treated with less rigor than application code. But the lesson is not just "do supply chain security." It is that AI infrastructure stacks expose two compounding attack surfaces — supply chain integrity and runtime trust — and most teams have closed neither.

The MCP ecosystem, at hundreds of millions of monthly downloads and growing, inherits this exposure structurally. The controls that close these gaps — pinning, hash verification, tool manifest monitoring, least-privilege scoping, audit logging — are not novel. None of them require waiting for new tooling. They require treating MCP servers with the same rigor applied to any production dependency.

Runtime verification of AI infrastructure is a missing control in most current deployments. Closing that gap starts with the list above.

---

*The Aegis team is building open-source tooling for MCP runtime verification and observability. Follow along as we build in public.*

---

## Draft Notes (remove before publishing)

**Quality loop status:**
- [x] Initial draft complete
- [x] `/challenger` skill — Round 1: 3 HIGH structural issues (conflated attack surfaces, bare CVE citation, broken GitHub link)
- [x] Steelman rewrite (inline) — Round 1 fixes: two-surface framing, CVE removed, GitHub link replaced, caching caveat, AgentSeal caveat, dated stats
- [x] `/challenger` skill — Round 2 (proper skill invocation): 4 precision issues, all EVIDENCE-BACKED, none structural
- [x] `/steelman` skill — Round 2 verdicts: all 4 VALID-MITIGATED; net confidence 9/10; recommend proceed
- [x] Round 2 fixes applied: npx cache miss qualification, client-dependent authorization clause, venv persistence nuance, `npm ci` vs `npm install` distinction
- [x] `/seo-expert` skill — title, slug, meta description, header optimization
- [ ] User review
- [ ] Publish to dev.to

**All changes across both rounds:**
1. Two-surface framing (structural): supply chain integrity (Surface 1) and runtime trust (Surface 2) named as distinct, compounding failure modes
2. CVE-2025-6514 removed — mechanism unverifiable; naked CVSS score damages credibility
3. GitHub CTA replaced — repo not yet live
4. Three-hour window: added caching caveat (Artifactory, Docker layers, pip caches extend exposure)
5. AgentSeal 41%: added methodology caveat (publicly discoverable servers skew to dev/test)
6. MCP download stats: dated "as of April 2026"
7. `npx -y`: qualified to "installs latest on any cache miss" (not every invocation)
8. Client authorization: qualified with "MCP protocol does not mandate re-approval; behavior varies by client"
9. `.pth` persistence: nuanced for venv vs global install users
10. Checklist item 2: added `npm ci` vs `npm install` distinction explicitly

**When to publish:**
- Legal clearance obtained (employment lawyer consulted)
- GitHub org and brand domain live
- At minimum: waitlist or contact email exists so CTA has a destination
- Ideal: proxy MVP local demo exists so there's something to link to
