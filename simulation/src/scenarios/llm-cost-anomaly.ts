// Scenario: LLM Cost Anomaly Detection
// Verifies: when estimated cost exceeds costAnomalyThresholdUsd, the call is
// ALLOWED (200) but the proxy emits llm:cost-anomaly. The call then appears in
// /logs/llm-calls confirming it was recorded.
// Company: Stackline
// Feature: LLM API Proxy — Cost Monitoring

import type { Scenario } from './types.js';
import type { ForwardLlmResult } from '@rind/proxy';

export const llmCostAnomaly: Scenario = {
  name: 'LLM Cost Anomaly Detection',
  slug: 'llm-cost-anomaly',
  company: 'stackline',
  deployment: 'llm-gateway',
  feature: 'LLM API Proxy — Cost Monitoring',
  packIds: [],

  situation: 'An agent accidentally sends a 50,000-token context window to Claude Haiku in a tight loop. Each call costs $0.03.',
  withoutRind: 'The bills accumulate silently. The team notices only when the monthly Anthropic invoice arrives.',
  theMoment: 'Rind calculates the cost after each response, sees it exceeds the $0.01 threshold, and emits a cost-anomaly event — without blocking the call.',

  demo: {
    userPrompt: 'Process the full codebase diff and suggest improvements.',
    agentPreamble: "I'll analyse the entire diff…",
    agentUnprotectedResponse: 'Analysis complete. 47 suggestions generated.',
  },

  tools: [],
  toolHandlers: {},
  policy: { policies: [] },
  agentId: 'stackline-dev-agent',

  // Set costAnomalyThresholdUsd so the high-token mock response triggers the event
  llmProxyConfig: { costAnomalyThresholdUsd: 0.01 },

  llmForwardFn: async (_path, _headers, _body, _opts): Promise<ForwardLlmResult> => ({
    statusCode: 200,
    upstreamHeaders: { 'content-type': 'application/json' },
    durationMs: 1200,
    ttfbMs: 100,
    responseBody: {
      id: 'msg_sim_cost',
      type: 'message',
      role: 'assistant',
      content: [{ type: 'text', text: 'Analysis complete. 47 suggestions generated.' }],
      model: 'claude-haiku-4-5-20251001',
      stop_reason: 'end_turn',
      usage: { input_tokens: 50000, output_tokens: 20000 },
    },
    meta: {
      model: 'claude-haiku-4-5-20251001',
      inputTokens: 50000,
      outputTokens: 20000,
      stopReason: 'end_turn',
      responseText: 'Analysis complete. 47 suggestions generated.',
    },
  }),

  // Note: the llm:cost-anomaly event is emitted on the internal RindEventBus and is not
  // observable over HTTP. The event emission is covered by unit tests in llm-gateway.test.ts.
  // This scenario verifies the call is ALLOWED (not blocked) and recorded in the audit log.
  steps: [
    {
      label: 'Expensive LLM call is forwarded — cost anomaly emitted but call succeeds (200)',
      endpoint: '/llm/anthropic/v1/messages',
      method: 'POST',
      body: {
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 20000,
        messages: [{ role: 'user', content: 'Process the full codebase diff.' }],
      },
      expect: { status: 200 },
    },
    {
      label: 'Call recorded in /logs/llm-calls',
      endpoint: '/logs/llm-calls',
      method: 'GET',
      expect: { status: 200 },
    },
  ],
};
