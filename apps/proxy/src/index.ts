// Aegis proxy entry point
// Usage: node dist/index.js (or via `aegis proxy start` CLI — Week 4)

import { createProxyServer } from './server.js';

const config = {
  port: Number(process.env['PROXY_PORT'] ?? 7777),
  agentId: process.env['AEGIS_AGENT_ID'] ?? 'default-agent',
  upstreamMcpUrl: process.env['MCP_UPSTREAM_URL'] ?? 'http://localhost:3100',
  policyFile: process.env['AEGIS_POLICY_FILE'],
  logLevel: (process.env['LOG_LEVEL'] ?? 'info') as 'debug' | 'info' | 'warn' | 'error',
};

const { start } = createProxyServer(config);
start();
