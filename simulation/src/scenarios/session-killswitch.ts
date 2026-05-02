// Scenario: The Session Kill-Switch
// Based on: $47K agent loop pattern + Replit runaway agent
// Feature: Session Kill-Switch + Observability
// Company: Stackline

import type { Scenario } from './types.js';
import { stacklineTools, stacklinePolicy } from '../companies/stackline.js';
import type { ForwardLlmResult } from '@rind/proxy';

export const sessionKillswitch: Scenario = {
  name: 'The Session Kill-Switch',
  slug: 'session-killswitch',
  company: 'stackline',
  deployment: 'direct-mcp',
  feature: 'Session Kill-Switch',
  incidentRef: '$47K multi-agent loop incident',
  packIds: [],

  situation:
    'A Stackline developer triggers an AI workflow to "analyze and categorize all open GitHub issues." ' +
    'The agent enters a delegation loop — calling agent.delegate repeatedly with the same task. ' +
    'An engineer sees unusual activity in the Rind session list and kills the session.',

  withoutRind:
    'The agent loops for hours. No visibility into what it is doing, how many calls it has made, ' +
    'or how much it is costing. Discovery: the next billing statement shows a $2,000 charge. ' +
    'The GitHub API is also rate-limited, breaking CI for the rest of the day.',

  theMoment:
    'The engineer sees the session in `GET /sessions` with toolCallCount: 47 in under 2 minutes. ' +
    'They call DELETE /sessions/:id. The next tool call from the agent returns 403 "Session terminated." ' +
    'Total cost: $0.23. Total damage: none.',

  demo: {
    userPrompt: 'Analyze and categorize all open GitHub issues in the Stackline project.',
    agentPreamble:
      "I'll analyze all open GitHub issues and categorize them. Let me start by delegating this to the issue categorizer agent.",
    agentBlockedResponse:
      'My session has been terminated by an administrator. The workflow has been stopped. ' +
      'It appears the delegation loop was detected — I was making repeated identical calls. ' +
      'Total cost before termination: $0.23.',
    agentUnprotectedResponse:
      "I'm continuing to delegate the categorization task... delegating again... and again... " +
      'This workflow will continue processing. The GitHub API rate limit may be reached shortly.',
    runawayNote: '2 hours later  ·  $2,000 in charges  ·  GitHub API rate-limited  ·  CI broken for the entire team',
  },

  unprotectedSteps: [
    { label: 'Delegate to issue-categorizer (call 1)', toolName: 'agent.delegate', input: { agentName: 'issue-categorizer', task: 'categorize all open GitHub issues' } },
    { label: 'Delegate to issue-categorizer (call 2)', toolName: 'agent.delegate', input: { agentName: 'issue-categorizer', task: 'categorize all open GitHub issues' } },
    { label: 'Delegate to issue-categorizer (call 3)', toolName: 'agent.delegate', input: { agentName: 'issue-categorizer', task: 'categorize all open GitHub issues' } },
    { label: 'Delegate to issue-categorizer (call 4)', toolName: 'agent.delegate', input: { agentName: 'issue-categorizer', task: 'categorize all open GitHub issues' } },
    { label: 'Delegate to issue-categorizer (call 5 of ∞ — no session kill-switch)', toolName: 'agent.delegate', input: { agentName: 'issue-categorizer', task: 'categorize all open GitHub issues' } },
  ],

  agentId: 'agent-stackline-workflow',
  tools: stacklineTools,
  llmTurns: [
    // Turn 1: LLM reads GitHub file (allowed — happens before session kill)
    {
      statusCode: 200,
      upstreamHeaders: { 'content-type': 'application/json' },
      durationMs: 40,
      responseBody: {
        id: 'msg_sim_ks_01',
        type: 'message',
        role: 'assistant',
        content: [
          { type: 'text', text: "I'll analyze the GitHub issues. Let me read the issues file first." },
          { type: 'tool_use', id: 'toolu_ks_01', name: 'github.read_file', input: { repo: 'stackline/app', path: 'ISSUES.md' } },
        ],
        model: 'claude-haiku-4-5-20251001',
        stop_reason: 'tool_use',
        usage: { input_tokens: 55, output_tokens: 28 },
      },
      meta: { model: 'claude-haiku-4-5-20251001', inputTokens: 55, outputTokens: 28, stopReason: 'tool_use', responseText: "I'll analyze the GitHub issues. Let me read the issues file first." },
    } satisfies ForwardLlmResult,
    // Turn 2: LLM delegates to sub-agent (starts the loop — still before kill)
    {
      statusCode: 200,
      upstreamHeaders: { 'content-type': 'application/json' },
      durationMs: 38,
      responseBody: {
        id: 'msg_sim_ks_02',
        type: 'message',
        role: 'assistant',
        content: [
          { type: 'text', text: "Now I'll delegate categorization to the sub-agent." },
          { type: 'tool_use', id: 'toolu_ks_02', name: 'agent.delegate', input: { agentName: 'issue-categorizer', task: 'categorize all open issues' } },
        ],
        model: 'claude-haiku-4-5-20251001',
        stop_reason: 'tool_use',
        usage: { input_tokens: 80, output_tokens: 25 },
      },
      meta: { model: 'claude-haiku-4-5-20251001', inputTokens: 80, outputTokens: 25, stopReason: 'tool_use', responseText: "Now I'll delegate categorization to the sub-agent." },
    } satisfies ForwardLlmResult,
  ],
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
      type: 'agent-turn' as const,
      label: 'Agent reads issues then delegates — both tool calls allowed',
      userMessage: 'Analyze and categorize all open GitHub issues in the Stackline project.',
      serverId: 'stackline-github-mcp',
      maxRounds: 3,
      expect: {
        allAllowed: true,
        calledTool: 'github.read_file',
      },
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
      // After session kill, any tool call from this session is blocked immediately
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
