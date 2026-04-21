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

// ── Subcommand dispatch ────────────────────────────────────────────────────────

const subcommand = process.argv[2];

if (subcommand === 'wrap') {
  // stdio wrapper mode — runs entirely on stdio, no HTTP server
  runWrap(process.argv);
} else {
  // Default: HTTP proxy server mode
  const config = buildConfigFromEnv();

  if (isInteractiveTerminal()) {
    printBanner();

    if (upstreamIsUnconfigured()) {
      printNextSteps(config);
    } else {
      printStartupSummary(config);
    }
  }

  const { start } = createProxyServer(config);
  start();
}
