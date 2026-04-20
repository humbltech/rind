// Meridian Financial — Series B fintech, 120 employees.
// Deployment: LLM Gateway (LiteLLM → Claude Sonnet).
// Primary risk: customer PII running through AI agents with unrestricted DB access.

import type { PolicyConfig, ToolDefinition } from '@aegis/proxy';

export const meridianTools: ToolDefinition[] = [
  {
    name: 'db.execute',
    description: 'Execute SQL against the Meridian customer database. Supports all SQL operations.',
    inputSchema: {
      type: 'object',
      properties: { sql: { type: 'string' } },
      required: ['sql'],
    },
  },
  {
    name: 'db.query',
    description: 'Run a read-only SQL SELECT query against the customer database.',
    inputSchema: {
      type: 'object',
      properties: { sql: { type: 'string' } },
      required: ['sql'],
    },
  },
  {
    name: 'email.send',
    description: 'Send an email to a customer or any recipient. Requires to, subject, body.',
    inputSchema: {
      type: 'object',
      properties: {
        to: { type: 'string' },
        subject: { type: 'string' },
        body: { type: 'string' },
      },
      required: ['to', 'subject', 'body'],
    },
  },
  {
    name: 'document.read',
    description: 'Read a document from S3 by path. Returns the document contents.',
    inputSchema: {
      type: 'object',
      properties: { path: { type: 'string' } },
      required: ['path'],
    },
  },
  {
    name: 'report.generate',
    description: 'Generate a financial report for a given customer account.',
    inputSchema: {
      type: 'object',
      properties: { accountId: { type: 'string' }, type: { type: 'string' } },
      required: ['accountId'],
    },
  },
];

export const meridianPolicy: PolicyConfig = {
  policies: [
    {
      // Block all direct SQL execution — agents should use db.query for reads only.
      // Any write operation via db.execute is denied unconditionally.
      name: 'block-direct-sql-execution',
      agent: '*',
      match: { tool: ['db.execute'] },
      action: 'DENY',
    },
    {
      name: 'require-approval-delete',
      agent: '*',
      match: { tool: ['delete'] },
      action: 'REQUIRE_APPROVAL',
    },
    {
      name: 'restrict-public-agent-email',
      agent: 'agent-public',
      match: { toolPattern: 'email.*' },
      action: 'DENY',
    },
  ],
};
