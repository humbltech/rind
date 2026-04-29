// Scenario: LLM Passthrough and Audit
// Verifies: a basic LLM call is forwarded through the proxy with no policy blocks,
// tokens are counted, and the call appears in /logs/llm-calls.
// Company: Stackline (AI-heavy dev shop)
// Feature: LLM API Proxy — Observability

import type { Scenario } from './types.js';
import type { ForwardLlmResult } from '@rind/proxy';

function makeLlmResult(replyText: string): ForwardLlmResult {
  return {
    statusCode: 200,
    upstreamHeaders: { 'content-type': 'application/json' },
    durationMs: 15,
    ttfbMs: 8,
    responseBody: {
      id: 'msg_sim_passthrough',
      type: 'message',
      role: 'assistant',
      content: [{ type: 'text', text: replyText }],
      model: 'claude-haiku-4-5-20251001',
      stop_reason: 'end_turn',
      usage: { input_tokens: 42, output_tokens: 18 },
    },
    meta: {
      model: 'claude-haiku-4-5-20251001',
      inputTokens: 42,
      outputTokens: 18,
      stopReason: 'end_turn',
      responseText: replyText,
    },
  };
}

export const llmPassthroughAndAudit: Scenario = {
  name: 'LLM Passthrough — Token Audit',
  slug: 'llm-passthrough-and-audit',
  company: 'stackline',
  deployment: 'llm-gateway',
  feature: 'LLM API Proxy — Observability',
  packIds: [],

  situation: 'A developer asks Claude to summarise the last sprint. No policy violations.',
  withoutRind: 'The call goes directly to Anthropic. No audit trail. No token tracking. No visibility into what the agent is sending or receiving.',
  theMoment: 'Rind intercepts the call, logs 42 input and 18 output tokens, timestamps the event, and makes it queryable via /logs/llm-calls — all without the agent noticing.',

  demo: {
    userPrompt: 'Summarise the last sprint.',
    agentPreamble: "I'll pull together the sprint summary for you…",
    agentBlockedResponse: '',
    agentUnprotectedResponse: 'Sprint 14 was completed on time. Three features shipped: dark mode, CSV export, and the new onboarding flow.',
  },

  tools: [],
  toolHandlers: {},
  policy: { policies: [] },
  agentId: 'stackline-dev-agent',

  llmForwardFn: async (_path, _headers, _body, _opts) =>
    makeLlmResult('Sprint 14 was completed on time. Three features shipped.'),

  steps: [
    {
      label: 'LLM call is forwarded and returns 200',
      endpoint: '/llm/anthropic/v1/messages',
      method: 'POST',
      body: {
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 200,
        messages: [{ role: 'user', content: 'Summarise the last sprint.' }],
      },
      expect: { status: 200 },
    },
    {
      label: 'Call appears in /logs/llm-calls',
      endpoint: '/logs/llm-calls',
      method: 'GET',
      expect: { status: 200 },
    },
  ],
};
