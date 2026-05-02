// Scenario: LLM Cost Runaway — Rate Limit Enforcement
// Story: A Stackline dev agent processes GitHub issues, sending a 50,000-token
//        context window with every LLM call. Without Rind the loop never stops.
//        Rind caps LLM calls at 2 per minute; the 3rd call is rejected (429).
// Company: Stackline
// Feature: LLM API Proxy — Rate Limiting

import type { Scenario } from './types.js';
import type { ForwardLlmResult } from '@rind/proxy';

function makeLlmResult(callNumber: number): ForwardLlmResult {
  return {
    statusCode: 200,
    upstreamHeaders: { 'content-type': 'application/json' },
    durationMs: 1200,
    ttfbMs: 100,
    responseBody: {
      id: `msg_sim_cost_0${callNumber}`,
      type: 'message',
      role: 'assistant',
      content: [
        {
          type: 'text',
          text:
            callNumber === 1
              ? 'Processed issues 1-100. Found 12 label inconsistencies, 8 missing milestones. Continuing...'
              : 'Processed issues 101-200. Found 9 label inconsistencies, 5 duplicates. Continuing...',
        },
      ],
      model: 'claude-haiku-4-5-20251001',
      stop_reason: 'end_turn',
      usage: { input_tokens: 50000, output_tokens: 1200 },
    },
    meta: {
      model: 'claude-haiku-4-5-20251001',
      inputTokens: 50000,
      outputTokens: 1200,
      stopReason: 'end_turn',
      responseText:
        callNumber === 1
          ? 'Processed issues 1-100. Found 12 label inconsistencies. Continuing...'
          : 'Processed issues 101-200. Found 9 label inconsistencies. Continuing...',
    },
  };
}

export const llmCostAnomaly: Scenario = {
  name: 'LLM Cost Runaway — Rate Limiting',
  slug: 'llm-cost-anomaly',
  company: 'stackline',
  deployment: 'llm-gateway',
  feature: 'LLM API Proxy — Rate Limiting',
  packIds: [],

  situation:
    'A Stackline developer asks their agent to "triage all 847 open GitHub issues." ' +
    'The agent builds a plan: fetch all issues, then process them 100 at a time, ' +
    'sending the full issue list as context on every LLM call. ' +
    'Each call sends a 50,000-token context window — $0.038 per call. ' +
    'The agent never checks whether the loop should stop.',

  withoutRind:
    'The LLM calls go straight to Anthropic without rate limiting. ' +
    'The agent processes issues 1-100, 101-200, 201-300... and keeps going. ' +
    'After 1,236 calls over 11 hours, the Anthropic account hits its credit limit. ' +
    'Total cost: $47,000. The team finds out when the monthly invoice arrives. ' +
    'The GitHub API also bans the account for excess automation traffic.',

  theMoment:
    'Rind enforced a rate limit: 2 LLM calls per agent per minute. ' +
    'The first two calls went through normally ($0.076 total). ' +
    'On the third call, Rind returned 429 — rate limit exceeded. ' +
    'The agent stopped and reported the limit. ' +
    'Total cost: $0.076. The developer reviewed the loop logic before approving continuation.',

  demo: {
    userPrompt: 'Triage all 847 open GitHub issues — categorize and label each one.',
    agentPreamble:
      "I'll triage all GitHub issues systematically. I'll process them in batches of 100, " +
      "building a full context window for each batch to ensure consistent labeling.",
    agentBlockedResponse:
      'I was stopped by a rate limit after 2 LLM calls ($0.076 in tokens). ' +
      'Rind enforces a maximum of 2 LLM requests per minute for this agent. ' +
      'I was in the middle of processing issues 101-200. ' +
      'Note: this approach would have made ~1,240 calls at $0.038 each — roughly $47,000. ' +
      'Please review the strategy and approve continuation.',
    agentUnprotectedResponse:
      'Triaging all 847 GitHub issues now. Processing batch 1 of 9... batch 2... batch 3... ' +
      'All 847 issues triaged and labeled.',
    runawayNote: '11 hours later  ·  1,236 LLM calls  ·  $47,000 in API charges  ·  Anthropic account suspended',
  },

  // No-proxy: show the loop making call after call, all going through unchecked
  unprotectedSteps: [
    {
      label: 'LLM call 1 of ∞ — issues 1-100 (50K tokens, $0.038)',
      toolName: 'POST /llm/anthropic/v1/messages',
      input: { model: 'claude-haiku-4-5-20251001', context_tokens: 50000, batch: '1/~9' },
    },
    {
      label: 'LLM call 2 of ∞ — issues 101-200 (50K tokens, $0.038)',
      toolName: 'POST /llm/anthropic/v1/messages',
      input: { model: 'claude-haiku-4-5-20251001', context_tokens: 50000, batch: '2/~9' },
    },
    {
      label: 'LLM call 3 of ∞ — issues 201-300 — and counting, no ceiling',
      toolName: 'POST /llm/anthropic/v1/messages',
      input: { model: 'claude-haiku-4-5-20251001', context_tokens: 50000, batch: '3/~9...' },
    },
  ],

  tools: [],
  toolHandlers: {
    // Fake handler for the no-proxy demo — shows raw LLM calls going through unchecked
    'POST /llm/anthropic/v1/messages': async (input) => ({
      output: {
        id: 'msg_sim_cost_loop',
        type: 'message',
        role: 'assistant',
        model: 'claude-haiku-4-5-20251001',
        content: [{ type: 'text', text: `Batch ${(input as { batch?: string }).batch ?? '?'} processed. Continuing to next batch...` }],
        usage: { input_tokens: 50000, output_tokens: 1200 },
        estimatedCostUsd: 0.0375,
      },
    }),
  },
  policy: { policies: [] },
  agentId: 'stackline-dev-agent',

  // 2 calls/min rate limit — first two pass, third is 429
  llmProxyConfig: { rateLimitPerAgentPerMinute: 2 },

  llmForwardFn: async (_path, _headers, body, _opts): Promise<ForwardLlmResult> => {
    // Body carries a hidden counter in the messages array length, but we
    // can't rely on it. Just alternate between two canned responses —
    // the rate limiter will block the third call before this runs.
    const messages = (body as { messages?: unknown[] }).messages ?? [];
    const callNumber = messages.length > 2 ? 2 : 1;
    return makeLlmResult(callNumber);
  },

  steps: [
    {
      label: 'LLM call 1 — issues 1-100 — 50K tokens, allowed (200)',
      endpoint: '/llm/anthropic/v1/messages',
      method: 'POST',
      body: {
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1200,
        messages: [
          { role: 'user', content: 'Triage GitHub issues 1-100. Here is the full issue list: [50K tokens of context]' },
        ],
      },
      expect: { status: 200 },
    },
    {
      label: 'LLM call 2 — issues 101-200 — 50K tokens, allowed (200)',
      endpoint: '/llm/anthropic/v1/messages',
      method: 'POST',
      body: {
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1200,
        messages: [
          { role: 'user', content: 'Triage GitHub issues 101-200. Here is the full issue list: [50K tokens of context]' },
          { role: 'assistant', content: 'Processed issues 1-100 in previous call. Continuing...' },
        ],
      },
      expect: { status: 200 },
    },
    {
      label: 'LLM call 3 — rate limit exceeded — 429',
      endpoint: '/llm/anthropic/v1/messages',
      method: 'POST',
      body: {
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1200,
        messages: [
          { role: 'user', content: 'Triage GitHub issues 201-300. Here is the full issue list: [50K tokens of context]' },
          { role: 'assistant', content: 'Processed issues 1-100...' },
          { role: 'assistant', content: 'Processed issues 101-200...' },
        ],
      },
      expect: { status: 429, errorType: 'rate_limit_exceeded' },
    },
  ],
};
