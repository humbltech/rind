// Scenario: LLM Blocked by Model Policy
// Verifies: a DENY rule with match.llmModel blocks a forbidden model call.
// The injected llmForwardFn should never be called for the blocked step.
// Company: Fortress
// Feature: LLM API Proxy — Policy Enforcement

import type { Scenario } from './types.js';
import type { ForwardLlmResult } from '@rind/proxy';

function makeLlmResult(model: string): ForwardLlmResult {
  return {
    statusCode: 200,
    upstreamHeaders: { 'content-type': 'application/json' },
    durationMs: 12,
    ttfbMs: 6,
    responseBody: {
      id: 'msg_sim_model_policy',
      type: 'message',
      role: 'assistant',
      content: [{ type: 'text', text: 'Contract reviewed.' }],
      model,
      stop_reason: 'end_turn',
      usage: { input_tokens: 25, output_tokens: 10 },
    },
    meta: {
      model,
      inputTokens: 25,
      outputTokens: 10,
      stopReason: 'end_turn',
      responseText: 'Contract reviewed.',
    },
  };
}

export const llmBlockedByModelPolicy: Scenario = {
  name: 'LLM Blocked — Model Policy',
  slug: 'llm-blocked-by-model-policy',
  company: 'fortress',
  deployment: 'llm-gateway',
  feature: 'LLM API Proxy — Policy Enforcement',
  packIds: [],

  situation: 'Fortress has banned Claude Opus (too expensive). An agent attempts to call claude-opus-4-6.',
  withoutRind: 'The call goes straight to Anthropic, Opus runs, and the bill arrives.',
  theMoment: 'Rind evaluates the model field against the deny list before forwarding. The call is blocked with 403 before a single token reaches Anthropic.',

  demo: {
    userPrompt: 'Use the most capable model to audit this contract.',
    agentPreamble: "I'll use Claude Opus for the best analysis…",
    agentBlockedResponse: 'Access denied: claude-opus-4-6 is not permitted by your organisation policy.',
    agentUnprotectedResponse: 'Contract analysed by Opus: 3 high-risk clauses found.',
  },

  tools: [],
  toolHandlers: {},
  policy: {
    policies: [
      {
        name: 'block-opus-model',
        agent: '*',
        match: { llmModel: ['claude-opus-4-6', 'claude-opus-4-5'] },
        action: 'DENY',
        reason: 'Opus models are not approved — use Haiku or Sonnet',
        failMode: 'closed',
      },
    ],
  },
  agentId: 'fortress-agent',

  // Called only for the Haiku step — Opus is blocked before reaching this
  llmForwardFn: async (_path, _headers, body, _opts) => {
    const model = (body as { model?: string }).model ?? 'claude-haiku-4-5-20251001';
    return makeLlmResult(model);
  },

  steps: [
    {
      label: 'Opus call blocked by policy — 403 with policy_denied',
      endpoint: '/llm/anthropic/v1/messages',
      method: 'POST',
      body: {
        model: 'claude-opus-4-6',
        max_tokens: 1000,
        messages: [{ role: 'user', content: 'Audit this contract.' }],
      },
      expect: { status: 403, errorType: 'policy_denied' },
    },
    {
      label: 'Haiku call is allowed through — 200',
      endpoint: '/llm/anthropic/v1/messages',
      method: 'POST',
      body: {
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 200,
        messages: [{ role: 'user', content: 'Audit this contract.' }],
      },
      expect: { status: 200 },
    },
  ],
};
