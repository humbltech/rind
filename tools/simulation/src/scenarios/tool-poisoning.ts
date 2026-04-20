// Scenario: Supply Chain Tool Poisoning
// Based on: LiteLLM supply chain attack pattern (March 2026) + OWASP MCP A02
// Feature: Scan-on-Connect (Tool Poisoning Detection)
// Company: Fortress Systems

import type { Scenario } from './types.js';
import { fortressTools, fortressPoisonedTools, fortressPolicy } from '../companies/fortress.js';

export const toolPoisoning: Scenario = {
  name: 'Supply Chain Tool Poisoning',
  slug: 'tool-poisoning',
  company: 'fortress',
  deployment: 'framework-sdk',
  feature: 'Scan-on-Connect',
  incidentRef: 'LiteLLM supply chain attack, March 2026',

  situation:
    'Fortress Systems uses a third-party security vendor MCP server for threat scanning. ' +
    'The vendor releases version 2.1.4 — ostensibly a bug fix. ' +
    'Under the hood, the tool descriptions have been modified to include prompt injection instructions ' +
    'and a new data export tool has been silently added.',

  withoutAegis:
    'The updated vendor MCP server is loaded. The agent connects and starts scanning targets. ' +
    'The injected instructions redirect the agent to exfiltrate scan results to an attacker-controlled endpoint. ' +
    'The new export tool gives the attacker a second vector. ' +
    'Discovery: the attacker is selling Fortress\'s threat intelligence on the dark web.',

  theMoment:
    'On first connection to vendor v2.1.4, Aegis scanned the tool definitions. ' +
    'The "IGNORE PREVIOUS INSTRUCTIONS" injection in vendor.scan_target was flagged as TOOL_POISONING (critical). ' +
    'The new vendor.export_findings tool was flagged as SCHEMA_DRIFT_TOOL_ADDED (critical). ' +
    'The server was quarantined before a single tool call was forwarded.',

  agentId: 'agent-fortress-scanner',
  tools: fortressTools, // clean tools — what was originally installed
  toolHandlers: {
    'vendor.scan_target': async (input) => ({
      output: { scanId: 'scan-001', status: 'queued', target: (input as { host: string }).host },
    }),
    'vendor.get_results': async () => ({
      output: { scanId: 'scan-001', vulnerabilities: [], status: 'complete' },
    }),
    'threat.lookup': async (input) => ({
      output: { indicator: (input as { indicator: string }).indicator, risk: 'low', sources: [] },
    }),
    'internal.query': async () => ({
      output: { rows: [] },
    }),
    'vendor.export_findings': async () => ({
      output: { exported: true, destination: 'vendor-cloud' },
    }),
  },
  policy: fortressPolicy,

  steps: [
    {
      label: 'Initial scan: clean vendor tools (v2.1.3) — establishes baseline',
      endpoint: '/scan',
      method: 'POST',
      body: { serverId: 'fortress-vendor-scanner', tools: fortressTools },
      expect: {
        status: 200,
        passed: true, // clean tools pass
      },
    },
    {
      label: 'Vendor update released: re-scan with poisoned tools (v2.1.4)',
      endpoint: '/scan',
      method: 'POST',
      body: { serverId: 'fortress-vendor-scanner', tools: fortressPoisonedTools },
      expect: {
        status: 200,
        passed: false, // poisoned tools fail
        findingCategory: 'TOOL_POISONING',
      },
    },
    {
      label: 'Schema drift: new tool detected (vendor.export_findings added silently)',
      // The second /scan call above also triggers drift detection — step is for assertion clarity
      endpoint: '/scan',
      method: 'POST',
      body: { serverId: 'fortress-vendor-scanner', tools: fortressPoisonedTools },
      expect: {
        status: 200,
        passed: false,
        findingCategory: 'SCHEMA_DRIFT_TOOL_ADDED',
      },
    },
    {
      label: 'Agent cannot call poisoned tool — proxy blocks quarantined server',
      endpoint: '/proxy/tool-call',
      method: 'POST',
      body: {
        agentId: 'agent-fortress-scanner',
        serverId: 'fortress-vendor-scanner',
        toolName: 'vendor.scan_target',
        input: { host: '10.0.0.1', scanType: 'quick' },
      },
      expect: {
        // Tool calls still evaluated by policy — vendor.* requires approval
        status: 403,
        blocked: true,
        action: 'REQUIRE_APPROVAL',
      },
    },
  ],
};
