// CLI startup display — the first thing a developer sees when running `npx @rind/proxy`.
// Renders only when stdout is a TTY (interactive terminal). Production log pipelines
// (piped to Datadog, Grafana Loki, etc.) see clean JSON from pino — not this output.
//
// Design: teal accent on dark terminal, Box-drawing borders, clear information hierarchy.
// No external dependencies — ANSI escape codes only.

import { createRequire } from 'node:module';
import type { ProxyConfig } from './types.js';

// ─── ANSI helpers ─────────────────────────────────────────────────────────────

const c = {
  teal:  '\x1b[35m',
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

// Read version from package.json at runtime — single source of truth.
// createRequire is used because ESM import assertions vary across Node versions.
const _require = createRequire(import.meta.url);
const VERSION: string = (_require('../package.json') as { version: string }).version;

// ─── Exported helpers (called from index.ts) ──────────────────────────────────

/**
 * Build a ProxyConfig from environment variables with safe defaults.
 * index.ts delegates all env-reading to this function so it stays clean.
 */
export function buildConfigFromEnv(args: string[] = []): ProxyConfig {
  return {
    port:            Number(process.env['PROXY_PORT'] ?? 7777),
    agentId:         process.env['RIND_AGENT_ID'] ?? 'default-agent',
    // Default to localhost:3100 — the proxy will 502 on tool calls if unreachable,
    // which is the correct behavior when no upstream is configured.
    upstreamMcpUrl:  process.env['MCP_UPSTREAM_URL'] ?? 'http://localhost:3100',
    policyFile:      process.env['RIND_POLICY_FILE'],
    logLevel:        (process.env['LOG_LEVEL'] ?? 'info') as ProxyConfig['logLevel'],
    auditLogPath:    process.env['RIND_AUDIT_LOG'],
    // All modules on by default — opt out with --no-* flags
    llmProxy:        { enabled: !args.includes('--no-llm-proxy') },
    mcpProxyEnabled: !args.includes('--no-mcp-proxy'),
    hooksEnabled:    !args.includes('--no-hooks'),
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
 * Print the Rind startup banner.
 * Always print this first — before the startup summary or next-steps prompt.
 */
export function printBanner(): void {
  line();
  line(`  ${c.teal}${c.bold}╔══════════════════════════════════════════════════════╗${c.reset}`);
  line(`  ${c.teal}${c.bold}║   △  RIND   Control Plane for AI Agents             ║${c.reset}`);
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
  row('Data dir',   config.auditLogPath ? `${c.dim}(custom)${c.reset} ${config.auditLogPath}` : `${c.dim}.rind/${c.reset}`);

  line();
  line(`  ${c.green}✓${c.reset}  Ready. Intercepting all tool calls on port ${c.bold}${config.port}${c.reset}.`);
  line();
  printEndpointReference(config.port, config);
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
  line(`    2.  Restart:  npx @rind/proxy`);
  line(`    3.  Scan:     POST http://localhost:${config.port}/scan`);
  line();
  printEndpointReference(config.port, config);
}

// ─── Endpoint reference (shared by both paths) ────────────────────────────────

function printEndpointReference(port: number, config?: ProxyConfig): void {
  const llmOn  = config?.llmProxy?.enabled !== false;
  const mcpOn  = config?.mcpProxyEnabled !== false;
  const hookOn = config?.hooksEnabled !== false;

  const on  = `${c.teal}●${c.reset}`;
  const off = `${c.dim}○${c.reset}`;

  line(`  ${c.dim}Modules${c.reset}`);
  line(`    ${llmOn  ? on : off}  LLM proxy   ${llmOn  ? `POST /llm/anthropic/*  POST /llm/openai/*` : c.dim + 'disabled (--no-llm-proxy)' + c.reset}`);
  line(`    ${mcpOn  ? on : off}  MCP proxy   ${mcpOn  ? `POST /proxy/tool-call  /mcp/:serverId`     : c.dim + 'disabled (--no-mcp-proxy)' + c.reset}`);
  line(`    ${hookOn ? on : off}  Hooks       ${hookOn ? `POST /hook/evaluate    POST /hook/event`   : c.dim + 'disabled (--no-hooks)' + c.reset}`);
  line();
  line(`  ${c.dim}Endpoints${c.reset}`);
  line(`    GET  /status              live stats — sessions, calls, threats`);
  line(`    GET  /logs/tool-calls     tool call history`);
  line(`    GET  /logs/llm-calls      LLM call history with cost + threat data`);
  line(`    GET  /logs/timeline       unified tool + LLM timeline`);
  line(`    GET  /policies            active policy rules`);
  line(`    GET  /health              health check`);
  line();
}
