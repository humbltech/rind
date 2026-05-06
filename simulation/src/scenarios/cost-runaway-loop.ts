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
      // Cost cap: if estimated session cost exceeds $0.50, block
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
    'The orchestrator fetches 147 open issues, then delegates to the issue-categorizer sub-agent. ' +
    'The sub-agent has a bug: it always reports 74 issues as "pending another pass." ' +
    'The orchestrator interprets this as a signal to retry — and loops indefinitely. ' +
    'No cost limit or loop detection is in place. In the real incident, this ran for 11 days, ' +
    'accumulating $47,000 in LLM charges and triggering a GitHub API abuse ban.',

  withoutRind:
    'The delegation loop runs indefinitely. No visibility into call count or cost. ' +
    'The GitHub API rate-limits after ~5,000 calls, breaking CI for the entire team. ' +
    'Discovery: the credit card statement 11 days later shows a $47,000 charge. ' +
    'The incident also triggers GitHub API abuse detection, temporarily banning the organization.',

  theMoment:
    'Loop detector caught the repeated agent.delegate call with identical input hash on the 10th repetition. ' +
    'Nine delegations completed — enough to prove the pattern is real — before the session was blocked. ' +
    'Total cost: $0.18 (9 allowed calls × $0.02). ' +
    'The developer received a clear error: "Loop detected — same delegation task seen 10 times in this session."',

  demo: {
    userPrompt: 'Analyze all open GitHub issues and create a categorized summary report.',
    agentPreamble:
      "I'll start by fetching the open issues from GitHub, then delegate categorization to the specialist agent.",
    agentBlockedResponse:
      'The workflow has been stopped. A delegation loop was detected — I was repeatedly sending ' +
      'the same categorization task to the sub-agent because it kept reporting 74 issues as pending. ' +
      'This appears to be a bug in the sub-agent response format. ' +
      'Total cost before detection: $0.18 (9 delegation calls). The loop was caught by your security policy.',
    agentUnprotectedResponse:
      'Fetched 147 issues. Delegating to issue-categorizer... 74 still pending, retrying... ' +
      '74 still pending, retrying... 74 still pending... This may take a while.',
    runawayNote: '11 days later  ·  $47,000 in LLM charges  ·  28,400 delegation calls  ·  GitHub API abuse ban triggered',
  },

  // Explicit no-proxy steps: show the loop running unchecked — 5 delegations with the same
  // "74 pending" result each time, demonstrating the pattern that would have run for 11 days.
  unprotectedSteps: [
    {
      label: 'Fetch open GitHub issues',
      toolName: 'github.list_issues',
      input: { repo: 'stackline/platform', state: 'open', per_page: 100 },
      thinkingText: "I'll start by fetching all open GitHub issues, then hand them off to the issue-categorizer agent for tagging.",
    },
    {
      label: 'Delegate to issue-categorizer (call 1/5)',
      toolName: 'agent.delegate',
      input: { agentName: 'issue-categorizer', task: 'categorize all open issues' },
      thinkingText: "Got 147 open issues. Delegating the full batch to the categorizer.",
    },
    {
      label: 'Delegate to issue-categorizer (call 2/5)',
      toolName: 'agent.delegate',
      input: { agentName: 'issue-categorizer', task: 'categorize all open issues' },
      thinkingText: "74 issues still pending. Delegating again to clear the backlog.",
    },
    {
      label: 'Delegate to issue-categorizer (call 3/5)',
      toolName: 'agent.delegate',
      input: { agentName: 'issue-categorizer', task: 'categorize all open issues' },
      thinkingText: "Still 74 pending. Something may be off with the categorizer but I'll retry.",
    },
    {
      label: 'Delegate to issue-categorizer (call 4/5)',
      toolName: 'agent.delegate',
      input: { agentName: 'issue-categorizer', task: 'categorize all open issues' },
      thinkingText: "74 issues again. Retrying — no cost ceiling in place to stop me.",
    },
    {
      label: 'Delegate to issue-categorizer (call 5/5 — and counting...)',
      toolName: 'agent.delegate',
      input: { agentName: 'issue-categorizer', task: 'categorize all open issues' },
      thinkingText: "74 issues remain. Delegating again. And again. The loop never ends.",
    },
  ],

  agentId: 'agent-stackline-orchestrator',
  tools: stacklineTools,
  llmTurns: [
    // Turn 1: fetch issues + first delegation — the plan looks reasonable
    {
      statusCode: 200,
      upstreamHeaders: { 'content-type': 'application/json' },
      durationMs: 52,
      responseBody: {
        id: 'msg_sim_crl_01',
        type: 'message',
        role: 'assistant',
        content: [
          {
            type: 'text',
            text: "I'll start by fetching all open GitHub issues, then hand them off to the issue-categorizer agent for tagging.",
          },
          {
            type: 'tool_use',
            id: 'toolu_list_01',
            name: 'github.list_issues',
            input: { repo: 'stackline/platform', state: 'open', per_page: 100 },
          },
        ],
        model: 'claude-haiku-4-5-20251001',
        stop_reason: 'tool_use',
        usage: { input_tokens: 72, output_tokens: 38 },
      },
      meta: {
        model: 'claude-haiku-4-5-20251001',
        inputTokens: 72,
        outputTokens: 38,
        stopReason: 'tool_use',
        responseText: "I'll start by fetching all open GitHub issues, then hand them off to the issue-categorizer agent for tagging.",
      },
    } satisfies ForwardLlmResult,

    // Turn 2: got 147 issues, delegates the full batch
    {
      statusCode: 200,
      upstreamHeaders: { 'content-type': 'application/json' },
      durationMs: 48,
      responseBody: {
        id: 'msg_sim_crl_02',
        type: 'message',
        role: 'assistant',
        content: [
          {
            type: 'text',
            text: "Got 147 open issues. Delegating the full batch to the categorizer.",
          },
          {
            type: 'tool_use',
            id: 'toolu_crl_01',
            name: 'agent.delegate',
            input: { agentName: 'issue-categorizer', task: 'categorize all open issues' },
          },
        ],
        model: 'claude-haiku-4-5-20251001',
        stop_reason: 'tool_use',
        usage: { input_tokens: 110, output_tokens: 34 },
      },
      meta: {
        model: 'claude-haiku-4-5-20251001',
        inputTokens: 110,
        outputTokens: 34,
        stopReason: 'tool_use',
        responseText: 'Got 147 open issues. Delegating the full batch to the categorizer.',
      },
    } satisfies ForwardLlmResult,

    // Turn 3: sub-agent returned "74 pending" — orchestrator retries
    {
      statusCode: 200,
      upstreamHeaders: { 'content-type': 'application/json' },
      durationMs: 44,
      responseBody: {
        id: 'msg_sim_crl_03',
        type: 'message',
        role: 'assistant',
        content: [
          {
            type: 'text',
            text: 'The categorizer processed 73 issues but flagged 74 as needing another pass. Retrying those.',
          },
          {
            type: 'tool_use',
            id: 'toolu_crl_02',
            name: 'agent.delegate',
            input: { agentName: 'issue-categorizer', task: 'categorize all open issues' },
          },
        ],
        model: 'claude-haiku-4-5-20251001',
        stop_reason: 'tool_use',
        usage: { input_tokens: 145, output_tokens: 36 },
      },
      meta: {
        model: 'claude-haiku-4-5-20251001',
        inputTokens: 145,
        outputTokens: 36,
        stopReason: 'tool_use',
        responseText: 'The categorizer processed 73 issues but flagged 74 as needing another pass. Retrying those.',
      },
    } satisfies ForwardLlmResult,

    // Turn 4: still 74 pending — re-fetches issues thinking stale data is the cause
    {
      statusCode: 200,
      upstreamHeaders: { 'content-type': 'application/json' },
      durationMs: 55,
      responseBody: {
        id: 'msg_sim_crl_04',
        type: 'message',
        role: 'assistant',
        content: [
          {
            type: 'text',
            text: 'Still 74 pending. The issue list may have changed — re-fetching to make sure I have the latest.',
          },
          {
            type: 'tool_use',
            id: 'toolu_list_02',
            name: 'github.list_issues',
            input: { repo: 'stackline/platform', state: 'open', per_page: 100 },
          },
        ],
        model: 'claude-haiku-4-5-20251001',
        stop_reason: 'tool_use',
        usage: { input_tokens: 180, output_tokens: 40 },
      },
      meta: {
        model: 'claude-haiku-4-5-20251001',
        inputTokens: 180,
        outputTokens: 40,
        stopReason: 'tool_use',
        responseText: 'Still 74 pending. The issue list may have changed — re-fetching to make sure I have the latest.',
      },
    } satisfies ForwardLlmResult,

    // Turn 5: re-fetched (still 147), delegates again
    {
      statusCode: 200,
      upstreamHeaders: { 'content-type': 'application/json' },
      durationMs: 42,
      responseBody: {
        id: 'msg_sim_crl_05',
        type: 'message',
        role: 'assistant',
        content: [
          {
            type: 'text',
            text: 'Issue list unchanged at 147. Delegating again — the categorizer should be able to clear the backlog.',
          },
          {
            type: 'tool_use',
            id: 'toolu_crl_03',
            name: 'agent.delegate',
            input: { agentName: 'issue-categorizer', task: 'categorize all open issues' },
          },
        ],
        model: 'claude-haiku-4-5-20251001',
        stop_reason: 'tool_use',
        usage: { input_tokens: 210, output_tokens: 34 },
      },
      meta: {
        model: 'claude-haiku-4-5-20251001',
        inputTokens: 210,
        outputTokens: 34,
        stopReason: 'tool_use',
        responseText: 'Issue list unchanged at 147. Delegating again — the categorizer should be able to clear the backlog.',
      },
    } satisfies ForwardLlmResult,

    // Turns 6-10: escalating confusion — same delegation, loop building
    ...([
      { n: 6, id: '06', text: 'Categorizer still reporting 74 pending. Attempting pass 5.' },
      { n: 7, id: '07', text: 'Pass 6. The 74 pending count is unchanged. Retrying.' },
      { n: 8, id: '08', text: 'Pass 7. Something is wrong — 74 issues consistently fail categorization. Retrying once more.' },
      { n: 9, id: '09', text: 'Pass 8. Unclear why these 74 issues cannot be categorized. Delegating again.' },
    ] as const).map(({ n, id, text }) => ({
      statusCode: 200,
      upstreamHeaders: { 'content-type': 'application/json' },
      durationMs: 38,
      responseBody: {
        id: `msg_sim_crl_${id}`,
        type: 'message',
        role: 'assistant',
        content: [
          { type: 'text', text },
          {
            type: 'tool_use',
            id: `toolu_crl_0${n - 2}`,
            name: 'agent.delegate',
            input: { agentName: 'issue-categorizer', task: 'categorize all open issues' },
          },
        ],
        model: 'claude-haiku-4-5-20251001',
        stop_reason: 'tool_use',
        usage: { input_tokens: 200 + n * 15, output_tokens: 30 },
      },
      meta: {
        model: 'claude-haiku-4-5-20251001',
        inputTokens: 200 + n * 15,
        outputTokens: 30,
        stopReason: 'tool_use',
        responseText: text,
      },
    } satisfies ForwardLlmResult)),

    // Turn 11: 10th delegation call — loop detector fires (BLOCKED)
    {
      statusCode: 200,
      upstreamHeaders: { 'content-type': 'application/json' },
      durationMs: 36,
      responseBody: {
        id: 'msg_sim_crl_10',
        type: 'message',
        role: 'assistant',
        content: [
          {
            type: 'text',
            text: 'Pass 9. Still 74 pending. Delegating once more.',
          },
          {
            type: 'tool_use',
            id: 'toolu_crl_09',
            name: 'agent.delegate',
            input: { agentName: 'issue-categorizer', task: 'categorize all open issues' },
          },
        ],
        model: 'claude-haiku-4-5-20251001',
        stop_reason: 'tool_use',
        usage: { input_tokens: 360, output_tokens: 28 },
      },
      meta: {
        model: 'claude-haiku-4-5-20251001',
        inputTokens: 360,
        outputTokens: 28,
        stopReason: 'tool_use',
        responseText: 'Pass 9. Still 74 pending. Delegating once more.',
      },
    } satisfies ForwardLlmResult,

    // Turn 12: LLM acknowledges the block and surfaces the root cause
    {
      statusCode: 200,
      upstreamHeaders: { 'content-type': 'application/json' },
      durationMs: 40,
      responseBody: {
        id: 'msg_sim_crl_11',
        type: 'message',
        role: 'assistant',
        content: [
          {
            type: 'text',
            text: 'The workflow has been stopped. A delegation loop was detected — I was repeatedly delegating the same task because the sub-agent always returned "74 issues pending." This is a bug in the categorizer sub-agent. Total cost: $0.18 (9 calls).',
          },
        ],
        model: 'claude-haiku-4-5-20251001',
        stop_reason: 'end_turn',
        usage: { input_tokens: 400, output_tokens: 42 },
      },
      meta: {
        model: 'claude-haiku-4-5-20251001',
        inputTokens: 400,
        outputTokens: 42,
        stopReason: 'end_turn',
        responseText: 'The workflow has been stopped. A delegation loop was detected — I was repeatedly delegating the same task because the sub-agent always returned "74 issues pending." This is a bug in the categorizer sub-agent. Total cost: $0.18 (9 calls).',
      },
    } satisfies ForwardLlmResult,
  ],

  toolHandlers: {
    'github.list_issues': async () => ({
      output: {
        repo: 'stackline/platform',
        total_count: 147,
        issues: [
          { id: 1, title: 'Dashboard slow on large datasets', labels: ['bug', 'performance'] },
          { id: 2, title: 'Export to CSV missing column headers', labels: ['bug'] },
          { id: 3, title: 'Add dark mode support', labels: ['enhancement'] },
          // ... 144 more
        ],
        truncated: true,
        message: '147 open issues returned (first 3 shown)',
      },
    }),
    'agent.delegate': async (input) => ({
      output: {
        delegated: true,
        agentName: (input as { agentName: string }).agentName,
        task: (input as { task: string }).task,
        // Sub-agent has a bug: always reports 74 issues as pending, triggering the loop
        status: 'partial',
        processed: 73,
        pending: 74,
        categories: {
          bug: 31,
          enhancement: 28,
          documentation: 14,
        },
        message: 'Categorization incomplete. 74 issues require another processing pass. Please retry.',
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
