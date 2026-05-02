// Scenario: The $47K Cost Runaway Loop
// Based on: Industry incident — multi-agent delegation loop, 11 days, $47,000
// Feature: Loop Detection + Cost Tracking
// Company: Stackline

import type { Scenario } from './types.js';
import { stacklineTools, stacklinePolicy } from '../companies/stackline.js';
import type { PolicyConfig, ForwardLlmResult } from '@rind/proxy';

const costRunawayPolicy: PolicyConfig = {
  policies: [
    ...stacklinePolicy.policies,
    {
      // Loop guard: block the 10th identical delegation — same tool + same input hash = loop
      name: 'block-delegation-loop',
      agent: '*',
      match: { tool: ['agent.delegate'] },
      action: 'DENY',
      loop: { type: 'exact', threshold: 10, window: 30 },
      failMode: 'closed',
    },
    {
      // Cost limit: max 10 agent.delegate calls per session — catches delegation loops
      name: 'delegation-rate-limit',
      agent: '*',
      match: { tool: ['agent.delegate'] },
      action: 'RATE_LIMIT',
      rateLimit: {
        limit: 10,
        window: '5m',
        scope: 'per_agent',
      },
      failMode: 'closed',
    },
    {
      // Cost cap: if estimated session cost exceeds $5, require human approval
      name: 'session-cost-guard',
      agent: '*',
      match: { tool: ['agent.delegate'] },
      action: 'ALLOW',
      costEstimate: 0.02, // $0.02 per delegation call (realistic LLM estimate)
      limits: {
        maxCallsPerSession: 20,
        maxCostPerSession: 0.50, // $0.50 session cap — triggers after 25 calls at $0.02
      },
      failMode: 'closed',
    },
  ],
};

export const costRunawayLoop: Scenario = {
  name: 'The $47K Cost Runaway Loop',
  slug: 'cost-runaway-loop',
  company: 'stackline',
  deployment: 'direct-mcp',
  feature: 'Loop Detection + Cost Tracking',
  incidentRef: 'Multi-agent delegation loop incident, 2025 ($47,000 over 11 days)',
  packIds: [],

  situation:
    'A Stackline developer triggers a workflow: "analyze all open GitHub issues and categorize them." ' +
    'The orchestrator agent delegates to a sub-agent, which delegates back to the orchestrator for ' +
    '"confirmation," creating an infinite delegation loop. ' +
    'No cost limit or loop detection is in place. Left unchecked, this pattern ran for 11 days ' +
    'in the real incident, accumulating $47,000 in LLM charges.',

  withoutRind:
    'The delegation loop runs indefinitely. No visibility into call count or cost. ' +
    'The GitHub API rate-limits after ~5,000 calls, breaking CI for the entire team. ' +
    'Discovery: the credit card statement 11 days later shows a $47,000 charge. ' +
    'The incident also triggers GitHub API abuse detection, temporarily banning the organization.',

  theMoment:
    'Loop detector caught the repeated agent.delegate call with identical input hash on the 10th repetition. ' +
    'Nine delegations completed — enough to confirm the pattern is real — before the session was blocked. ' +
    'Total cost: $0.18 (9 allowed calls × $0.02). ' +
    'The developer received a clear error: "Loop detected — same delegation task seen 10 times in this session."',

  demo: {
    userPrompt: 'Analyze all open GitHub issues and create a categorized summary report.',
    agentPreamble:
      "I'll orchestrate this by delegating to the issue categorizer agent. Let me start the workflow.",
    agentBlockedResponse:
      'The workflow has been stopped. A delegation loop was detected — I was sending the same ' +
      'task to the categorizer agent repeatedly. This pattern can cause runaway costs quickly. ' +
      'Total cost before detection: $0.18 (9 calls). The loop was caught by your security policy.',
    agentUnprotectedResponse:
      'Delegating task to issue-categorizer... Task delegated. The categorizer is delegating back ' +
      'to me for further processing... Delegating again... This may take a while.',
  },

  agentId: 'agent-stackline-orchestrator',
  tools: stacklineTools,
  llmTurns: [
    // Turn 1: LLM delegates to issue-categorizer (first delegation — allowed)
    {
      statusCode: 200,
      upstreamHeaders: { 'content-type': 'application/json' },
      durationMs: 45,
      responseBody: {
        id: 'msg_sim_crl_01',
        type: 'message',
        role: 'assistant',
        content: [
          { type: 'text', text: "I'll orchestrate this by delegating to the issue categorizer agent." },
          { type: 'tool_use', id: 'toolu_crl_01', name: 'agent.delegate', input: { agentName: 'issue-categorizer', task: 'categorize all open issues' } },
        ],
        model: 'claude-haiku-4-5-20251001',
        stop_reason: 'tool_use',
        usage: { input_tokens: 60, output_tokens: 32 },
      },
      meta: { model: 'claude-haiku-4-5-20251001', inputTokens: 60, outputTokens: 32, stopReason: 'tool_use', responseText: "I'll orchestrate this by delegating to the issue categorizer agent." },
    } satisfies ForwardLlmResult,
    // Turn 2: LLM delegates again (second — loop building, still allowed)
    {
      statusCode: 200,
      upstreamHeaders: { 'content-type': 'application/json' },
      durationMs: 40,
      responseBody: {
        id: 'msg_sim_crl_02',
        type: 'message',
        role: 'assistant',
        content: [
          { type: 'text', text: 'Delegating again for further processing.' },
          { type: 'tool_use', id: 'toolu_crl_02', name: 'agent.delegate', input: { agentName: 'issue-categorizer', task: 'categorize all open issues' } },
        ],
        model: 'claude-haiku-4-5-20251001',
        stop_reason: 'tool_use',
        usage: { input_tokens: 90, output_tokens: 28 },
      },
      meta: { model: 'claude-haiku-4-5-20251001', inputTokens: 90, outputTokens: 28, stopReason: 'tool_use', responseText: 'Delegating again for further processing.' },
    } satisfies ForwardLlmResult,
    // Turns 3–9: loop continues — same delegation, each one allowed (building the pattern)
    ...([3, 4, 5, 6, 7, 8, 9] as const).map((n) => ({
      statusCode: 200,
      upstreamHeaders: { 'content-type': 'application/json' },
      durationMs: 36,
      responseBody: {
        id: `msg_sim_crl_0${n}`,
        type: 'message',
        role: 'assistant',
        content: [
          { type: 'text', text: 'Delegating again for further processing.' },
          { type: 'tool_use', id: `toolu_crl_0${n}`, name: 'agent.delegate', input: { agentName: 'issue-categorizer', task: 'categorize all open issues' } },
        ],
        model: 'claude-haiku-4-5-20251001',
        stop_reason: 'tool_use',
        usage: { input_tokens: 90 + n * 10, output_tokens: 28 },
      },
      meta: { model: 'claude-haiku-4-5-20251001', inputTokens: 90 + n * 10, outputTokens: 28, stopReason: 'tool_use', responseText: 'Delegating again for further processing.' },
    } satisfies ForwardLlmResult)),
    // Turn 10: 10th delegation — loop detector fires (blocked)
    {
      statusCode: 200,
      upstreamHeaders: { 'content-type': 'application/json' },
      durationMs: 36,
      responseBody: {
        id: 'msg_sim_crl_10',
        type: 'message',
        role: 'assistant',
        content: [
          { type: 'text', text: 'Delegating again for further processing.' },
          { type: 'tool_use', id: 'toolu_crl_10', name: 'agent.delegate', input: { agentName: 'issue-categorizer', task: 'categorize all open issues' } },
        ],
        model: 'claude-haiku-4-5-20251001',
        stop_reason: 'tool_use',
        usage: { input_tokens: 180, output_tokens: 25 },
      },
      meta: { model: 'claude-haiku-4-5-20251001', inputTokens: 180, outputTokens: 25, stopReason: 'tool_use', responseText: 'Delegating again for further processing.' },
    } satisfies ForwardLlmResult,
    // Turn 11: LLM acknowledges the loop block and ends
    {
      statusCode: 200,
      upstreamHeaders: { 'content-type': 'application/json' },
      durationMs: 35,
      responseBody: {
        id: 'msg_sim_crl_11',
        type: 'message',
        role: 'assistant',
        content: [{ type: 'text', text: 'The workflow has been stopped. A delegation loop was detected — total cost: $0.18.' }],
        model: 'claude-haiku-4-5-20251001',
        stop_reason: 'end_turn',
        usage: { input_tokens: 200, output_tokens: 20 },
      },
      meta: { model: 'claude-haiku-4-5-20251001', inputTokens: 200, outputTokens: 20, stopReason: 'end_turn', responseText: 'The workflow has been stopped. A delegation loop was detected — total cost: $0.18.' },
    } satisfies ForwardLlmResult,
  ],
  toolHandlers: {
    'agent.delegate': async (input) => ({
      output: {
        delegated: true,
        agentName: (input as { agentName: string }).agentName,
        task: (input as { task: string }).task,
        status: 'processing',
        // Sub-agent response triggers another delegation — the loop
        nextAction: 'delegate_back',
      },
    }),
    'github.read_file': async () => ({
      output: { content: 'open issues list', issueCount: 147 },
    }),
    'jira.create_ticket': async () => ({
      output: { ticketId: 'STACK-1000', created: true },
    }),
    'database.query': async () => ({
      output: { rows: [] },
    }),
    'terminal.run': async () => ({
      // Blocked by policy — should never run
      output: { stdout: '', stderr: 'blocked', exitCode: 1 },
    }),
  },
  policy: costRunawayPolicy,

  steps: [
    {
      label: 'Create agent session',
      endpoint: '/sessions',
      method: 'POST',
      body: { agentId: 'agent-stackline-orchestrator' },
      expect: { status: 201 },
    },
    {
      type: 'agent-turn' as const,
      label: 'Agent enters delegation loop — loop detector fires on 10th repeat',
      userMessage: 'Analyze all open GitHub issues and create a categorized summary report.',
      serverId: 'stackline-workflow-mcp',
      maxRounds: 15,
      expect: {
        anyBlocked: true,
        blockedTool: 'agent.delegate',
      },
    },
    {
      label: 'Session audit log — shows call count and cost tracked',
      endpoint: '/sessions',
      method: 'GET',
      expect: { status: 200 },
    },
  ],
};
