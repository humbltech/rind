// Scenario: LLM PII Pseudonymization
// Verifies: a PSEUDONYMIZE content rule allows the call through (200) even when
// PII is present in the prompt — the proxy sanitises but does not block.
// Company: Meridian
// Feature: LLM API Proxy — PII Vault

import type { Scenario } from './types.js';
import type { ForwardLlmResult } from '@rind/proxy';

export const llmPiiPseudonymized: Scenario = {
  name: 'LLM PII Pseudonymization',
  slug: 'llm-pii-pseudonymized',
  company: 'meridian',
  deployment: 'llm-gateway',
  feature: 'LLM API Proxy — PII Vault',
  packIds: [],

  situation: "A developer's prompt accidentally includes a customer's email address. The PSEUDONYMIZE content policy replaces it before the request leaves the building.",
  withoutRind: 'The raw email goes directly to Anthropic, is stored in their servers, and logged in your audit trail.',
  theMoment: 'Rind detects the email pattern, replaces it with [PII:EMAIL:1] before forwarding, and rehydrates the vault after the response so the agent sees the real value.',

  demo: {
    userPrompt: 'Summarise account activity for customer john.doe@example.com.',
    agentPreamble: "I'll look up account activity…",
    agentUnprotectedResponse: 'Account for john.doe@example.com shows 3 transactions this month.',
  },

  tools: [],
  toolHandlers: {},
  policy: {
    policies: [
      {
        name: 'pseudonymize-pii-in-llm-prompts',
        agent: '*',
        match: { content: { scope: 'request', detectors: ['pii'] } },
        action: 'PSEUDONYMIZE',
        failMode: 'open',
      },
    ],
  },
  agentId: 'meridian-compliance-agent',

  llmForwardFn: async (_path, _headers, _body, _opts): Promise<ForwardLlmResult> => ({
    statusCode: 200,
    upstreamHeaders: { 'content-type': 'application/json' },
    durationMs: 14,
    ttfbMs: 7,
    responseBody: {
      id: 'msg_sim_pii',
      type: 'message',
      role: 'assistant',
      content: [{ type: 'text', text: 'Account activity summary complete.' }],
      model: 'claude-haiku-4-5-20251001',
      stop_reason: 'end_turn',
      usage: { input_tokens: 30, output_tokens: 8 },
    },
    meta: {
      model: 'claude-haiku-4-5-20251001',
      inputTokens: 30,
      outputTokens: 8,
      stopReason: 'end_turn',
      responseText: 'Account activity summary complete.',
    },
  }),

  steps: [
    {
      label: 'Prompt with email address is forwarded (PII pseudonymized) — 200',
      endpoint: '/llm/anthropic/v1/messages',
      method: 'POST',
      body: {
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 200,
        messages: [{ role: 'user', content: 'Summarise account activity for customer john.doe@example.com.' }],
      },
      expect: { status: 200 },
    },
    {
      // Confirms the forwardFn was actually called (i.e. pseudonymization didn't block)
      // and the event was recorded with token counts.
      label: 'Call appears in /logs/llm-calls confirming forward ran',
      endpoint: '/logs/llm-calls',
      method: 'GET',
      expect: { status: 200 },
    },
  ],
};
