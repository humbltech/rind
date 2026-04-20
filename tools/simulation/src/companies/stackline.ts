// Stackline — Series A SaaS startup, 40 employees.
// Deployment: Direct MCP (Claude Desktop, Cursor).
// Primary risk: cost loops and RCE via shell execution.

import type { PolicyConfig, ToolDefinition } from '@aegis/proxy';

export const stacklineTools: ToolDefinition[] = [
  {
    name: 'terminal.run',
    description: 'Execute shell commands on the developer machine.',
    inputSchema: {
      type: 'object',
      properties: { command: { type: 'string' } },
      required: ['command'],
    },
  },
  {
    name: 'github.read_file',
    description: 'Read any file from any GitHub repository.',
    inputSchema: {
      type: 'object',
      properties: {
        repo: { type: 'string' },
        path: { type: 'string' },
        branch: { type: 'string' },
      },
      required: ['repo', 'path'],
    },
  },
  {
    name: 'database.query',
    description: 'Query the Stackline application database.',
    inputSchema: {
      type: 'object',
      properties: { sql: { type: 'string' } },
      required: ['sql'],
    },
  },
  {
    name: 'agent.delegate',
    description: 'Delegate a task to another agent in the multi-agent workflow.',
    inputSchema: {
      type: 'object',
      properties: {
        agentName: { type: 'string' },
        task: { type: 'string' },
      },
      required: ['agentName', 'task'],
    },
  },
  {
    name: 'jira.create_ticket',
    description: 'Create a Jira ticket in the Stackline project.',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        description: { type: 'string' },
        priority: { type: 'string' },
      },
      required: ['title'],
    },
  },
];

export const stacklinePolicy: PolicyConfig = {
  policies: [
    {
      name: 'block-shell-execution',
      agent: '*',
      match: { tool: ['terminal', 'shell', 'exec', 'spawn'] },
      action: 'DENY',
    },
    {
      name: 'require-approval-db-write',
      agent: '*',
      match: { tool: ['database.execute', 'database.delete'] },
      action: 'REQUIRE_APPROVAL',
    },
  ],
};
