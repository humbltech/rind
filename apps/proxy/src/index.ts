// Rind proxy — CLI entry point
// Usage:
//   npx @rind/proxy                          start the HTTP proxy server
//   rind-proxy wrap -- <command> [args...]   stdio wrapper for local MCP servers
//
// Reads configuration from environment variables (see cli.ts → buildConfigFromEnv).
// In interactive terminals: prints the Rind banner and a human-readable startup summary.
// In production pipelines (piped output): banner is suppressed; pino emits structured JSON.

import { createProxyServer } from './server.js';
import {
  buildConfigFromEnv,
  isInteractiveTerminal,
  upstreamIsUnconfigured,
  printBanner,
  printStartupSummary,
  printNextSteps,
} from './cli.js';
import { runWrap } from './cli/wrap.js';
import { runInit } from './cli/init.js';
import { runUninit } from './cli/uninit.js';

// ── Subcommand dispatch ────────────────────────────────────────────────────────

const subcommand = process.argv[2];

if (subcommand === 'wrap') {
  // stdio wrapper mode — runs entirely on stdio, no HTTP server
  runWrap(process.argv);
} else if (subcommand === 'init') {
  // auto-config generator — wraps .mcp.json + adds Claude Code hook + writes starter policy
  runInit(process.argv);
} else if (subcommand === 'uninit') {
  // remove Rind hooks and ANTHROPIC_BASE_URL from Claude Code settings
  runUninit(process.argv);
} else {
  // Default: HTTP proxy server mode
  // All flags that aren't subcommands are passed through as module toggles
  // e.g. --no-llm-proxy --no-mcp-proxy --no-hooks
  const serverArgs = process.argv.slice(2);
  const config = buildConfigFromEnv(serverArgs);

  if (isInteractiveTerminal()) {
    printBanner();

    if (upstreamIsUnconfigured()) {
      printNextSteps(config);
    } else {
      printStartupSummary(config);
    }
  }

  const { start } = createProxyServer(config);
  start().catch((err) => {
    console.error('Failed to start Rind proxy:', err);
    process.exit(1);
  });
}
