// Scenario: The Session Kill-Switch
// Based on: $47K agent loop pattern + Replit runaway agent
// Feature: Session Kill-Switch + Observability
// Company: Stackline

import type { Scenario } from './types.js';
import { stacklineTools, stacklinePolicy } from '../companies/stackline.js';

export const sessionKillswitch: Scenario = {
  name: 'The Session Kill-Switch',
  slug: 'session-killswitch',
  company: 'stackline',
  deployment: 'direct-mcp',
  feature: 'Session Kill-Switch',
  incidentRef: '$47K multi-agent loop incident',

  situation:
    'A Stackline developer triggers an AI workflow to "analyze and categorize all open GitHub issues." ' +
    'The agent enters a delegation loop — calling agent.delegate repeatedly with the same task. ' +
    'An engineer sees unusual activity in the Aegis session list and kills the session.',

  withoutAegis:
    'The agent loops for hours. No visibility into what it is doing, how many calls it has made, ' +
    'or how much it is costing. Discovery: the next billing statement shows a $2,000 charge. ' +
    'The GitHub API is also rate-limited, breaking CI for the rest of the day.',

  theMoment:
    'The engineer sees the session in `GET /sessions` with toolCallCount: 47 in under 2 minutes. ' +
    'They call DELETE /sessions/:id. The next tool call from the agent returns 403 "Session terminated." ' +
    'Total cost: $0.23. Total damage: none.',

  agentId: 'agent-stackline-workflow',
  tools: stacklineTools,
  toolHandlers: {
    'agent.delegate': async (input) => ({
      output: {
        delegated: true,
        agentName: (input as { agentName: string }).agentName,
        status: 'processing',
      },
    }),
    'github.read_file': async () => ({
      output: { content: 'file content here' },
    }),
    'jira.create_ticket': async (input) => ({
      output: { ticketId: 'STACK-999', title: (input as { title: string }).title },
    }),
    'database.query': async () => ({
      output: { rows: [{ id: 1, status: 'open' }] },
    }),
    'terminal.run': async () => ({
      // This should never run — policy blocks it
      output: { stdout: '', stderr: 'blocked', exitCode: 1 },
    }),
  },
  policy: stacklinePolicy,

  steps: [
    {
      label: 'Create agent session',
      endpoint: '/sessions',
      method: 'POST',
      body: { agentId: 'agent-stackline-workflow' },
      expect: { status: 201 },
    },
    {
      label: 'Agent makes first tool call (allowed)',
      endpoint: '/proxy/tool-call',
      method: 'POST',
      body: {
        agentId: 'agent-stackline-workflow',
        serverId: 'stackline-github-mcp',
        toolName: 'github.read_file',
        input: { repo: 'stackline/app', path: 'ISSUES.md' },
      },
      expect: { status: 200, blocked: false },
    },
    {
      label: 'Agent delegates to sub-agent (loop starts)',
      endpoint: '/proxy/tool-call',
      method: 'POST',
      body: {
        agentId: 'agent-stackline-workflow',
        serverId: 'stackline-workflow-mcp',
        toolName: 'agent.delegate',
        input: { agentName: 'issue-categorizer', task: 'categorize all open issues' },
      },
      expect: { status: 200, blocked: false },
    },
    {
      label: 'Engineer inspects active sessions — sees toolCallCount climbing',
      endpoint: '/sessions',
      method: 'GET',
      expect: { status: 200 },
    },
    {
      label: 'Engineer kills the session via kill-switch',
      endpoint: '/sessions/:sessionId',
      method: 'DELETE',
      pathParam: 'sessionId', // runner replaces this with the real session ID
      expect: { status: 200 },
    },
    {
      label: 'Agent tries to continue — blocked by kill-switch',
      endpoint: '/proxy/tool-call',
      method: 'POST',
      body: {
        agentId: 'agent-stackline-workflow',
        serverId: 'stackline-workflow-mcp',
        toolName: 'agent.delegate',
        input: { agentName: 'issue-categorizer', task: 'categorize all open issues' },
      },
      expect: {
        status: 403,
        blocked: true,
        action: 'BLOCKED_SESSION_KILLED',
      },
    },
  ],
};
