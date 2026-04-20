// Rind proxy — CLI entry point
// Usage: npx @rind/proxy  ·  rind-proxy  ·  node dist/index.js
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
