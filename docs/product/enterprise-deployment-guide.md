# Rind Enterprise Deployment Guide

**Audience**: CISOs, IT Administrators, Security Teams
**Last Updated**: May 2026

---

## What This Document Covers

Two questions CISOs ask in every sales conversation:

1. **How do we install Rind?** — One-command install for a single developer, and how to roll it out fleet-wide.
2. **How do we enforce it?** — Two strategies for ensuring all AI tool usage in the org flows through Rind, with honest trade-offs for each.

---

## Individual Install: One Command

A developer installs Rind on their workstation in a single command:

```bash
curl -sSL https://get.rind.dev/install | sh
```

Or via npm:

```bash
npm install -g @rind/cli
rind-proxy init --org=acme-corp
```

**What happens automatically:**

1. Rind proxy binary is installed to `/usr/local/bin/`
2. Claude Code hooks are written to `~/.claude/settings.json`
3. MCP proxy is configured and started as a background service
4. The endpoint is registered with your organization's Rind instance
5. Developer's name and machine ID appear in the admin dashboard within 60 seconds

**Supported tools (same install, same command):**

| Tool | Hook mechanism | Status |
|------|---------------|--------|
| Claude Code | `~/.claude/settings.json` hooks | Shipping |
| Gemini CLI | `~/.gemini/settings.json` hooks | Planned |
| Cursor | MCP proxy routing | Shipping |
| VS Code (Claude extension) | MCP proxy routing | Shipping |
| Any MCP-compatible tool | MCP proxy | Shipping |

---

## Enterprise-Wide Enforcement

There are two complementary strategies. Most enterprises use both.

---

### Strategy A: Network-Level Enforcement

**What it is**: Block direct connections to AI vendor APIs at the corporate network layer. All AI traffic must route through Rind.

**Enforcement guarantee**: The strongest available. Even if a developer manually removes Rind hooks from their settings file, their AI tools cannot reach vendor APIs directly. The network says no.

**How it works**:

```
Developer's machine
    │
    ├── Tries: api.anthropic.com  ──────────── BLOCKED by firewall
    ├── Tries: api.openai.com  ─────────────── BLOCKED by firewall
    ├── Tries: generativelanguage.googleapis.com  ── BLOCKED
    │
    └── Routes through: rind.internal.corp:8443  ── ALLOWED
                              │
                         Rind Proxy
                         (full enforcement)
                              │
                         AI Vendor APIs
```

**Network policy — domains to block**:

```
# AI Provider APIs
api.anthropic.com
api.openai.com
generativelanguage.googleapis.com
api.mistral.ai
api.cohere.com
bedrock-runtime.*.amazonaws.com (optional — if not using AWS Bedrock)
aiplatform.googleapis.com

# Allow only:
[your-rind-instance].rind.dev
rind.internal.corp (if self-hosted)
```

**Compatible with any corporate network control tool**:

| Platform | Configuration path |
|----------|--------------------|
| Palo Alto Networks | URL Filtering profile → block AI APIs category |
| Zscaler | Cloud App Control → block AI Assistant apps |
| Cisco Umbrella | DNS-layer blocking + destination list |
| Fortinet FortiGate | Web filter profile → custom category |
| Squid / corporate HTTP proxy | `acl deny dstdomain api.anthropic.com` |
| DNS sinkholin | Block AI API FQDNs, redirect to proxy |

**How Claude Code picks up the Rind proxy**:

Environment variable (pushed via MDM or shell profile):
```bash
export ANTHROPIC_BASE_URL=https://rind.internal.corp:8443/anthropic
export HTTPS_PROXY=https://rind.internal.corp:8443
```

Or set once during `rind-proxy init --org=acme-corp` — the installer writes the env vars to `/etc/profile.d/rind.sh` (Linux) or a launchd env config (macOS).

**Honest limitations**:
- Developers on personal devices or using mobile hotspots can bypass unless MDM also manages those (see Strategy B for defense-in-depth)
- Requires firewall access / coordination with network team
- Some CI/CD environments need explicit allow-listing for AI API calls in pipelines

---

### Strategy B: Endpoint Configuration Management (MDM)

**What it is**: IT pushes Rind installation and hook configuration to all developer machines through existing endpoint management tooling. The `~/.claude/settings.json` file (and equivalents) are deployed and optionally protected from modification.

**Enforcement guarantee**: Moderate. Rind hooks are always present on managed devices. Determined users with admin rights can edit the settings file — layer with Strategy A if you need hard enforcement.

**How it works**:

```
IT Admin (Jamf / Intune / Ansible / Puppet)
    │
    ├── Deploys: /usr/local/bin/rind-hook
    ├── Deploys: /usr/local/bin/rind-proxy
    ├── Writes:  ~/.claude/settings.json  (with Rind hooks)
    └── Optional: sets file as read-only via permission or watchdog
```

**Settings file that gets pushed** (`~/.claude/settings.json`):

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "type": "command",
        "command": "/usr/local/bin/rind-hook",
        "env": {
          "RIND_PROXY_URL": "https://rind.internal.corp:7777",
          "RIND_ORG_ID": "acme-corp"
        }
      }
    ],
    "PostToolUse": [
      {
        "type": "command",
        "command": "/usr/local/bin/rind-event"
      }
    ],
    "SubagentStart": [
      {
        "type": "command",
        "command": "/usr/local/bin/rind-event"
      }
    ],
    "UserPromptSubmit": [
      {
        "type": "command",
        "command": "/usr/local/bin/rind-event"
      }
    ]
  }
}
```

**Deployment examples by platform**:

#### macOS — Jamf Pro

```bash
#!/bin/bash
# Jamf policy script: deploy Rind to a developer Mac

RIND_PROXY_URL="https://rind.internal.corp:7777"
RIND_VERSION="1.2.0"

# Install binary
curl -sSL "https://get.rind.dev/releases/${RIND_VERSION}/macos/rind-hook" \
  -o /usr/local/bin/rind-hook && chmod +x /usr/local/bin/rind-hook
curl -sSL "https://get.rind.dev/releases/${RIND_VERSION}/macos/rind-event" \
  -o /usr/local/bin/rind-event && chmod +x /usr/local/bin/rind-event

# Deploy settings (runs as user, not root, via Jamf's "Run script as" setting)
mkdir -p "$HOME/.claude"
cat > "$HOME/.claude/settings.json" << SETTINGS
{
  "hooks": {
    "PreToolUse": [{"type": "command", "command": "/usr/local/bin/rind-hook"}],
    "PostToolUse": [{"type": "command", "command": "/usr/local/bin/rind-event"}]
  }
}
SETTINGS
```

#### Windows — Microsoft Intune / PowerShell

```powershell
# Intune PowerShell script: deploy Rind hooks
$RindProxyUrl = "https://rind.internal.corp:7777"
$ClaudeDir = "$env:USERPROFILE\.claude"
$SettingsFile = "$ClaudeDir\settings.json"

# Create directory if it doesn't exist
New-Item -ItemType Directory -Force -Path $ClaudeDir

# Install binaries
Invoke-WebRequest -Uri "https://get.rind.dev/releases/latest/windows/rind-hook.exe" `
  -OutFile "C:\Program Files\Rind\rind-hook.exe"

# Write settings
$settings = @{
  hooks = @{
    PreToolUse = @(@{ type = "command"; command = "C:\Program Files\Rind\rind-hook.exe" })
    PostToolUse = @(@{ type = "command"; command = "C:\Program Files\Rind\rind-event.exe" })
  }
} | ConvertTo-Json -Depth 5

Set-Content -Path $SettingsFile -Value $settings
```

#### Linux — Ansible

```yaml
# ansible/roles/rind/tasks/main.yml
- name: Install Rind binaries
  get_url:
    url: "https://get.rind.dev/releases/{{ rind_version }}/linux/{{ item }}"
    dest: "/usr/local/bin/{{ item }}"
    mode: '0755'
  loop:
    - rind-hook
    - rind-event

- name: Configure Claude Code hooks
  template:
    src: claude-settings.json.j2
    dest: "{{ ansible_user_dir }}/.claude/settings.json"
    owner: "{{ ansible_user }}"
    mode: '0644'
```

```json
// ansible/roles/rind/templates/claude-settings.json.j2
{
  "hooks": {
    "PreToolUse": [{"type": "command", "command": "/usr/local/bin/rind-hook"}],
    "PostToolUse": [{"type": "command", "command": "/usr/local/bin/rind-event"}]
  }
}
```

#### Cross-platform — Puppet

```puppet
# manifests/rind.pp
file { "${::homedir}/.claude/settings.json":
  ensure  => present,
  owner   => $::id,
  mode    => '0644',
  content => template('rind/claude-settings.json.erb'),
  require => File["${::homedir}/.claude"],
}
```

---

### Tamper Resistance: Can Users Remove Rind?

Honest answer: **it depends on the user's admin rights and which layer you rely on.**

| Approach | Can determined user bypass? | Recommended for |
|----------|-----------------------------|-----------------|
| MDM writes settings file (no lock) | Yes — file is user-writable | Convenience deployment, low-sensitivity |
| File permissions (root-owned, 644) | Harder — requires sudo | Medium sensitivity |
| Watchdog service | Harder — requires killing the service | Medium sensitivity |
| Network enforcement (Strategy A) | No — network says no | High sensitivity, regulated environments |
| Both network + MDM | No | Recommended default for enterprise |

**Option 1: File Permission Lock (simple)**

```bash
# Linux/macOS: make settings owned by root, readable but not writable by user
sudo chown root:staff "$HOME/.claude/settings.json"
sudo chmod 644 "$HOME/.claude/settings.json"
```

Note: Claude Code itself also cannot modify a root-owned file. This is fine if the Rind configuration is the only config you need, but may conflict if Claude Code tries to update settings on its own.

**Option 2: Watchdog Service (stronger)**

Deploy a system service (launchd on macOS, systemd on Linux, Windows Service on Windows) that monitors the settings file and restores it if modified:

```bash
# /etc/systemd/system/rind-guardian.service (Linux)
[Unit]
Description=Rind Claude Code Settings Guardian
After=network.target

[Service]
Type=simple
ExecStart=/usr/local/bin/rind-guardian \
  --watch "$HOME/.claude/settings.json" \
  --template /etc/rind/claude-settings-template.json \
  --interval 60
Restart=always

[Install]
WantedBy=multi-user.target
```

**Option 3: Detect rather than prevent (pragmatic)**

Alert the Rind admin dashboard when hooks are removed or bypassed. Detection is often more practical than hard prevention, and surfaces shadow AI use:

```
ALERT: Developer john.smith@acme.corp
       Claude Code sessions detected without Rind hooks
       Last 3 sessions: no tool call events received
       Machine: MACBOOK-12345
       Action: [Notify IT] [Remind developer] [Escalate]
```

This approach is less invasive, maintains developer trust, and still gives security visibility.

---

## Recommended Architecture by Risk Appetite

### Standard (Most Enterprises)

> "We want visibility and policy enforcement. Developers keep their autonomy."

1. MDM deploys Rind hooks on day 1 (employee onboarding checklist)
2. Rind runs in **observe mode for 30 days** — no blocking, full logging
3. Security team reviews dashboard: what tools are used, any anomalies
4. After 30 days: enable policies incrementally (start with cost limits, then destructive action approval)
5. Audit log exports to existing SIEM (Splunk, Datadog, Elastic)

### High-Control (Regulated industries: finance, healthcare, defense)

> "We need to guarantee no unauthorized AI tool calls. Compliance requires it."

1. Network enforcement via firewall: block all AI vendor APIs, allow only Rind proxy
2. MDM deploys Rind on all developer machines (defense in depth)
3. New employee: Rind configured before first login, enforced from day one
4. Default-deny policy: all tool calls blocked until explicitly allowed by security team
5. SOC 2 / HIPAA audit trail: all AI tool calls logged for 365 days, exportable
6. Separate policies per team/environment: `dev` vs `staging` vs `production` access

### Gradual Rollout (Enterprises with developer pushback concerns)

> "We want buy-in before enforcement. Start with visibility, earn trust."

1. Start with **optional install** — offer Rind to volunteers, show value in dashboard
2. Share metrics with the broader team: "Here's what our AI agents are doing"
3. After 60 days: make Rind a requirement for new projects
4. After 90 days: MDM rollout to all existing developers
5. Network enforcement: only after developers understand and accept the policy

---

## FAQ for CISOs

**Q: Does Rind see the content of AI conversations?**

Rind captures tool call metadata: which tool was called, with what parameters, and the result. The content of user prompts can be optionally captured (via the `UserPromptSubmit` hook) but is off by default. You choose what Rind logs.

**Q: Does Rind add latency to AI tool calls?**

The hook evaluation path adds ~10-20ms. This is below the threshold of perception for interactive use. For batch/automated workloads, latency can be configured to run async (observe-only mode) for near-zero impact.

**Q: What if a developer uses a personal AI tool (mobile app, web browser)?**

Rind covers developer AI tooling (Claude Code, Cursor, IDE extensions, MCP-connected tools). It does not intercept browser-based ChatGPT or mobile apps. If that coverage is required, pair Rind with a DLP solution (e.g., Nightfall, Symantec DLP) at the browser/network layer.

**Q: Can Rind integrate with our existing SIEM?**

Yes. Rind exports structured audit events to Splunk, Datadog, Elasticsearch, and any webhook-compatible SIEM. Events include: session ID, user identity, tool name, parameters, action taken (allow/block/approve), timestamp.

**Q: What happens if the Rind proxy goes down?**

Configurable per org. Options:
- **Fail open** (default for dev): if Rind is unreachable, tool calls proceed unblocked — never blocks a developer due to infrastructure issues.
- **Fail closed** (for production environments): if Rind is unreachable, tool calls are blocked — zero trust posture.
- **Fail to cache**: Rind proxy caches the last-known policy and enforces locally for up to 4 hours without cloud connectivity.

**Q: How is Rind licensed for enterprise?**

Per-seat, per month. Team plan covers up to 25 developers. Enterprise plan includes SSO, SIEM integration, self-hosted proxy option, SLA, and dedicated support. See [pricing-strategy.md](../strategy/pricing-strategy.md).

**Q: Can we self-host Rind?**

Yes. The Rind proxy is available as a Docker image and Helm chart. Data never leaves your infrastructure. The dashboard is also self-hostable. See the Enterprise plan.

```bash
# Self-hosted install
helm install rind rind/rind-proxy \
  --set auth.provider=okta \
  --set audit.siem=splunk \
  --set failMode=closed
```

---

## One-Page Summary for IT Admins

```
RIND DEPLOYMENT — QUICK REFERENCE

SINGLE DEVELOPER
  curl -sSL https://get.rind.dev/install | sh

MDM DEPLOYMENT (push to all machines)
  macOS:   Jamf policy script → write ~/.claude/settings.json
  Windows: Intune PowerShell → write %USERPROFILE%\.claude\settings.json
  Linux:   Ansible/Puppet → write ~/.claude/settings.json
  Binary:  /usr/local/bin/rind-hook, /usr/local/bin/rind-event

NETWORK ENFORCEMENT (block direct AI API access)
  Block:  api.anthropic.com, api.openai.com, generativelanguage.googleapis.com
  Allow:  rind.internal.corp (your Rind instance)
  Env:    ANTHROPIC_BASE_URL=https://rind.internal.corp:8443/anthropic

SIEM INTEGRATION
  Splunk:      https://rind.internal.corp/settings → Export → Splunk HEC
  Datadog:     Export → Datadog Logs API
  Webhook:     Export → Custom webhook endpoint

SUPPORT
  Enterprise support: support@rind.dev
  Slack shared channel: available on Enterprise plan
```
