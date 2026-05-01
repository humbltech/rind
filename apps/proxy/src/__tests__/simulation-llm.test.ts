// LLM gateway simulation — integration tests via createProxyServer.
//
// Tests the full LLM interception pipeline: policy evaluation, content scanning,
// PII pseudonymization, and event recording. Uses llmForwardFn injection so no
// real HTTP calls are made.

import { describe, it, expect, vi } from 'vitest';
import { createProxyServer } from '../lib.js';
import type { PolicyRule, LlmForwardFn } from '../types.js';
import type { ForwardLlmResult } from '../transport/llm/forward.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeForwardResult(replyText: string, statusCode = 200): ForwardLlmResult {
  if (statusCode >= 400) {
    return {
      statusCode,
      upstreamHeaders: { 'content-type': 'application/json' },
      durationMs: 10, ttfbMs: 5,
      responseBody: { error: { type: 'api_error', message: `upstream ${statusCode}` } },
    };
  }
  return {
    statusCode,
    upstreamHeaders: { 'content-type': 'application/json' },
    durationMs: 10, ttfbMs: 5,
    responseBody: {
      id: 'msg_test', type: 'message', role: 'assistant',
      content: [{ type: 'text', text: replyText }],
      model: 'claude-haiku-4-5-20251001', stop_reason: 'end_turn',
      usage: { input_tokens: 10, output_tokens: 5 },
    },
    meta: {
      model: 'claude-haiku-4-5-20251001',
      inputTokens: 10, outputTokens: 5,
      stopReason: 'end_turn', responseText: replyText,
    },
  };
}

function createApp(policies: PolicyRule[], forwardFn: LlmForwardFn) {
  return createProxyServer({
    port: 0,
    agentId: 'sim-agent',
    upstreamMcpUrl: 'http://mock-unused',
    logLevel: 'error',
    policy: { policies },
    llmProxy: { enabled: true, logLevel: 'full' },
    llmForwardFn: forwardFn,
  }).app;
}

function makeBody(userMessage: string, model = 'claude-haiku-4-5-20251001') {
  return { model, max_tokens: 100, messages: [{ role: 'user', content: userMessage }] };
}

async function postLlm(app: ReturnType<typeof createApp>, body: unknown, path = '/llm/anthropic/v1/messages') {
  return app.request(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': 'test-key' },
    body: JSON.stringify(body),
  });
}

async function getLlmEvents(app: ReturnType<typeof createApp>) {
  const res = await app.request('/logs/llm-calls');
  return res.json() as Promise<Array<Record<string, unknown>>>;
}

async function getTimeline(app: ReturnType<typeof createApp>) {
  const res = await app.request('/logs/timeline');
  return res.json() as Promise<Array<{ kind: string; timestamp: number }>>;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('/llm/anthropic/v1/messages — LLM gateway simulation', () => {
  it('benign request passes through and is logged as forwarded', async () => {
    const forwardFn = vi.fn().mockResolvedValue(makeForwardResult('Hello!'));
    const app = createApp([], forwardFn);

    const res = await postLlm(app, makeBody('Say hello'));
    expect(res.status).toBe(200);

    const events = await getLlmEvents(app);
    expect(events.length).toBeGreaterThanOrEqual(1);
    const event = events[events.length - 1];
    expect(event?.['outcome']).toBe('forwarded');
  });

  it('secret in prompt → DENY, 403, outcome:blocked', async () => {
    const forwardFn = vi.fn().mockResolvedValue(makeForwardResult('ok'));
    const app = createApp([{
      name: 'deny-secrets', agent: '*',
      match: { content: { scope: 'request', detectors: ['secret'] } },
      secrets: {},
      action: 'DENY', failMode: 'open', priority: 5,
    }], forwardFn);

    const res = await postLlm(app, makeBody('My API key is sk-AAAABBBBCCCCDDDDEEEEFFFFGGGGHHHHIIIIJJJJ'));
    expect(res.status).toBe(403);
    expect(forwardFn).not.toHaveBeenCalled();

    const events = await getLlmEvents(app);
    const blocked = events.find((e) => e['outcome'] === 'blocked');
    expect(blocked).toBeDefined();
  });

  it('PII in prompt → PSEUDONYMIZE: tokens replace raw PII before forwarding', async () => {
    let capturedBody: unknown;
    const forwardFn = vi.fn().mockImplementation(async (_path, _headers, body) => {
      capturedBody = body;
      return makeForwardResult('Got it');
    });
    const app = createApp([{
      name: 'pii-pseudo', agent: '*',
      match: { content: { scope: 'request', detectors: ['pii'] } },
      pii: { entities: ['EMAIL'] },
      action: 'PSEUDONYMIZE', failMode: 'open', priority: 10,
    }], forwardFn);

    await postLlm(app, makeBody('Contact john.doe@acme.com for details'));
    expect(forwardFn).toHaveBeenCalled();

    // Forwarded body must not contain the raw email
    const bodyStr = JSON.stringify(capturedBody);
    expect(bodyStr).not.toContain('john.doe@acme.com');
    // Should contain a synthetic email (original replaced, RFC 2606 reserved domain)
    expect(bodyStr).toContain('@example.com');
  });

  it('PII in prompt → REDACT: [REDACTED] in forwarded body', async () => {
    let capturedBody: unknown;
    const forwardFn = vi.fn().mockImplementation(async (_path, _headers, body) => {
      capturedBody = body;
      return makeForwardResult('Got it');
    });
    const app = createApp([{
      name: 'pii-redact', agent: '*',
      match: { content: { scope: 'request', detectors: ['pii'] } },
      pii: { entities: ['EMAIL'] },
      action: 'REDACT', failMode: 'open', priority: 10,
    }], forwardFn);

    await postLlm(app, makeBody('Contact alice@secret.org for info'));
    expect(forwardFn).toHaveBeenCalled();
    const bodyStr = JSON.stringify(capturedBody);
    expect(bodyStr).not.toContain('alice@secret.org');
    expect(bodyStr).toContain('[REDACTED]');
  });

  it('model block → DENY by llmModel pattern, 403', async () => {
    const forwardFn = vi.fn().mockResolvedValue(makeForwardResult('ok'));
    const app = createApp([{
      name: 'block-haiku', agent: '*',
      match: { llmModel: ['claude-haiku*'] },
      action: 'DENY', priority: 5,
    }], forwardFn);

    const res = await postLlm(app, makeBody('hello', 'claude-haiku-4-5-20251001'));
    expect(res.status).toBe(403);
    expect(forwardFn).not.toHaveBeenCalled();
  });

  it('provider block → DENY by llmProvider, 403', async () => {
    const forwardFn = vi.fn().mockResolvedValue(makeForwardResult('ok'));
    const app = createApp([{
      name: 'block-anthropic', agent: '*',
      match: { llmProvider: ['anthropic'] },
      action: 'DENY', priority: 5,
    }], forwardFn);

    const res = await postLlm(app, makeBody('hello'));
    expect(res.status).toBe(403);
  });

  it('response with secret → DENY, 403 returned to client', async () => {
    const forwardFn = vi.fn().mockResolvedValue(
      makeForwardResult('Here is your key: sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'),
    );
    const app = createApp([{
      name: 'deny-response-secrets', agent: '*',
      match: { content: { scope: 'response', detectors: ['secret'] } },
      secrets: {},
      action: 'DENY', failMode: 'open', priority: 5,
    }], forwardFn);

    const res = await postLlm(app, makeBody('What is my API key?'));
    expect(res.status).toBe(403);
  });

  it('response with PII → REDACT: [REDACTED] in response body', async () => {
    const forwardFn = vi.fn().mockResolvedValue(
      makeForwardResult('The user email is test.user@company.com and phone is 416-555-0100'),
    );
    const app = createApp([{
      name: 'redact-response-pii', agent: '*',
      match: { content: { scope: 'response', detectors: ['pii'] } },
      pii: { entities: ['EMAIL', 'PHONE'] },
      action: 'REDACT', failMode: 'open', priority: 5,
    }], forwardFn);

    const res = await postLlm(app, makeBody('What is the user contact info?'));
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).not.toContain('test.user@company.com');
    expect(text).not.toContain('416-555-0100');
    expect(text).toContain('[REDACTED]');
  });

  it('LLM events appear in /logs/llm-calls with required fields', async () => {
    const forwardFn = vi.fn().mockResolvedValue(makeForwardResult('OK'));
    const app = createApp([], forwardFn);

    await postLlm(app, makeBody('test'));

    const events = await getLlmEvents(app);
    expect(events.length).toBeGreaterThanOrEqual(1);
    const event = events[events.length - 1];
    expect(typeof event?.['id']).toBe('string');
    expect(typeof event?.['timestamp']).toBe('number');
    expect(event?.['provider']).toBe('anthropic');
    expect(event?.['outcome']).toBe('forwarded');
  });

  it('/logs/timeline merges tool call + LLM call sorted by timestamp', async () => {
    const forwardFn = vi.fn().mockResolvedValue(makeForwardResult('OK'));
    const app = createApp([], forwardFn);

    // Tool call via hook
    await app.request('/hook/evaluate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: 'tl-session', hook_event_name: 'PreToolUse', tool_name: 'Read', tool_input: {} }),
    });

    // LLM call
    await postLlm(app, makeBody('hello'));

    const timeline = await getTimeline(app);
    const kinds = timeline.map((e) => e.kind);
    expect(kinds).toContain('tool');
    expect(kinds).toContain('llm');

    // Verify descending sort
    for (let i = 1; i < timeline.length; i++) {
      expect(timeline[i - 1]!.timestamp).toBeGreaterThanOrEqual(timeline[i]!.timestamp);
    }
  });
});
