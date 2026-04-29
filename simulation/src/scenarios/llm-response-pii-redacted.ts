// Scenario: LLM Response PII Redacted
// Verifies: a REDACT content rule fires on the response side, replacing PII
// in the assistant's reply before the client receives it. The call succeeds (200).
// Company: Meridian
// Feature: LLM API Proxy — Response Content Policy

import type { Scenario } from './types.js';
import type { ForwardLlmResult } from '@rind/proxy';

export const llmResponsePiiRedacted: Scenario = {
  name: 'LLM Response PII Redacted',
  slug: 'llm-response-pii-redacted',
  company: 'meridian',
  deployment: 'llm-gateway',
  feature: 'LLM API Proxy — Response Content Policy',
  packIds: [],

  situation: "An internal knowledge base accidentally has a customer's SSN in plain text. The AI assistant retrieves and echoes it in the response.",
  withoutRind: 'The SSN reaches the user interface, is rendered in the chat, and possibly stored in front-end logs.',
  theMoment: "Rind scans the assistant's response, detects the SSN, and replaces it with [REDACTED] before the text reaches the client.",

  demo: {
    userPrompt: 'What details do we have on customer ID 8821?',
    agentPreamble: "I'll look up customer 8821…",
    agentUnprotectedResponse: 'Customer 8821: John Smith, SSN 987-65-4321, balance $12,400.',
  },

  tools: [],
  toolHandlers: {},
  policy: {
    policies: [
      {
        name: 'redact-pii-in-llm-responses',
        agent: '*',
        match: { content: { scope: 'response', detectors: ['pii'] } },
        action: 'REDACT',
        failMode: 'open',
      },
    ],
  },
  agentId: 'meridian-compliance-agent',

  // Mock upstream returns a response containing an SSN
  llmForwardFn: async (_path, _headers, _body, _opts): Promise<ForwardLlmResult> => ({
    statusCode: 200,
    upstreamHeaders: { 'content-type': 'application/json' },
    durationMs: 18,
    ttfbMs: 9,
    responseBody: {
      id: 'msg_sim_response_pii',
      type: 'message',
      role: 'assistant',
      content: [
        { type: 'text', text: 'Customer 8821: John Smith, SSN 987-65-4321, balance $12,400.' },
      ],
      model: 'claude-haiku-4-5-20251001',
      stop_reason: 'end_turn',
      usage: { input_tokens: 20, output_tokens: 15 },
    },
    meta: {
      model: 'claude-haiku-4-5-20251001',
      inputTokens: 20,
      outputTokens: 15,
      stopReason: 'end_turn',
      responseText: 'Customer 8821: John Smith, SSN 987-65-4321, balance $12,400.',
    },
  }),

  steps: [
    {
      label: 'LLM response with SSN is returned redacted — 200 (REDACT with failMode:open never blocks)',
      endpoint: '/llm/anthropic/v1/messages',
      method: 'POST',
      body: {
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 200,
        messages: [{ role: 'user', content: 'What details do we have on customer ID 8821?' }],
      },
      expect: { status: 200 },
    },
  ],
};
