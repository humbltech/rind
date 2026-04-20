// CLI startup display — the first thing a developer sees when running `npx @aegis/proxy`.
// Renders only when stdout is a TTY (interactive terminal). Production log pipelines
// (piped to Datadog, Grafana Loki, etc.) see clean JSON from pino — not this output.
//
// Design: teal accent on dark terminal, Box-drawing borders, clear information hierarchy.
// No external dependencies — ANSI escape codes only.

import type { ProxyConfig } from './types.js';

// ─── ANSI helpers ─────────────────────────────────────────────────────────────

const c = {
  teal:  '\x1b[36m',
  green: '\x1b[32m',
  yellow:'\x1b[33m',
  bold:  '\x1b[1m',
  dim:   '\x1b[2m',
  reset: '\x1b[0m',
};

const line = (s = '') => process.stdout.write(s + '\n');
const row  = (label: string, value: string) =>
  line(`   ${c.dim}${label.padEnd(11)}${c.reset}  ${value}`);

// ─── Version ──────────────────────────────────────────────────────────────────

// Bumped at release time — keeps the banner truthful without a runtime import.
const VERSION = '0.1.0';

// ─── Exported helpers (called from index.ts) ──────────────────────────────────

/**
 * Build a ProxyConfig from environment variables with safe defaults.
 * index.ts delegates all env-reading to this function so it stays clean.
 */
export function buildConfigFromEnv(): ProxyConfig {
  return {
    port:            Number(process.env['PROXY_PORT'] ?? 7777),
    agentId:         process.env['AEGIS_AGENT_ID'] ?? 'default-agent',
    // Default to localhost:3100 — the proxy will 502 on tool calls if unreachable,
    // which is the correct behavior when no upstream is configured.
    upstreamMcpUrl:  process.env['MCP_UPSTREAM_URL'] ?? 'http://localhost:3100',
    policyFile:      process.env['AEGIS_POLICY_FILE'],
    logLevel:        (process.env['LOG_LEVEL'] ?? 'info') as ProxyConfig['logLevel'],
    auditLogPath:    process.env['AEGIS_AUDIT_LOG'],
  };
}

/** True when stdout is an interactive terminal — false when piped to a log aggregator. */
export function isInteractiveTerminal(): boolean {
  return Boolean(process.stdout.isTTY);
}

/** True when no MCP upstream URL was provided via env. */
export function upstreamIsUnconfigured(): boolean {
  return !process.env['MCP_UPSTREAM_URL'];
}

// ─── Banner ───────────────────────────────────────────────────────────────────

/**
 * Print the Aegis startup banner.
 * Always print this first — before the startup summary or next-steps prompt.
 */
export function printBanner(): void {
  line();
  line(`  ${c.teal}${c.bold}╔══════════════════════════════════════════════════════╗${c.reset}`);
  line(`  ${c.teal}${c.bold}║   △  AEGIS   Control Plane for AI Agents             ║${c.reset}`);
  line(`  ${c.teal}${c.bold}║              v${VERSION.padEnd(7)} · MCP Proxy · Phase 1       ║${c.reset}`);
  line(`  ${c.teal}${c.bold}╚══════════════════════════════════════════════════════╝${c.reset}`);
  line();
}

// ─── Startup summary (upstream is configured) ─────────────────────────────────

/**
 * Print configuration summary and ready message.
 * Called when MCP_UPSTREAM_URL is set and the proxy is about to start intercepting.
 */
export function printStartupSummary(config: ProxyConfig): void {
  row('Port',       `${c.bold}${config.port}${c.reset}`);
  row('Upstream',   config.upstreamMcpUrl);
  row('Policy',     config.policyFile ? config.policyFile : `${c.dim}default rules${c.reset}`);
  row('Log level',  config.logLevel ?? 'info');
  if (config.auditLogPath) row('Audit log', config.auditLogPath);

  line();
  line(`  ${c.green}✓${c.reset}  Ready. Intercepting all tool calls on port ${c.bold}${config.port}${c.reset}.`);
  line();
  printEndpointReference(config.port);
}

// ─── Next steps (upstream not configured) ────────────────────────────────────

/**
 * Print a helpful "what to do next" prompt when no upstream MCP server is configured.
 * Shown instead of the startup summary so developers know exactly what's missing.
 */
export function printNextSteps(config: ProxyConfig): void {
  line(`  ${c.yellow}⚠${c.reset}  No upstream MCP server configured.`);
  line(`     The proxy is running but tool calls will fail until an upstream is set.`);
  line();
  line(`  ${c.dim}Set up${c.reset}`);
  line(`    1.  export MCP_UPSTREAM_URL=http://your-mcp-server:3100`);
  line(`    2.  Restart:  npx @aegis/proxy`);
  line(`    3.  Scan:     POST http://localhost:${config.port}/scan`);
  line();
  printEndpointReference(config.port);
}

// ─── Endpoint reference (shared by both paths) ────────────────────────────────

function printEndpointReference(port: number): void {
  line(`  ${c.dim}Endpoints${c.reset}`);
  line(`    POST /scan                scan your MCP server tools (scan-on-connect)`);
  line(`    POST /scan/refresh        re-scan for post-install mutations (rug pull detection)`);
  line(`    POST /sessions            create an agent session`);
  line(`    POST /proxy/tool-call     intercept and forward a tool call`);
  line(`    GET  /status              live stats — sessions, calls, threats`);
  line(`    GET  /logs/tool-calls     tool call history (ring buffer, last 10k events)`);
  line(`    GET  /policies            active policy rules`);
  line();
}
