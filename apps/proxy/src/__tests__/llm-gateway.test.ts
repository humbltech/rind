// LLM gateway integration tests.
//
// Tests the full gateway pipeline end-to-end from HTTP request to event bus,
// exercising every major branch:
//   - Non-streaming PSEUDONYMIZE round-trip (tokenize body → rehydrate response)
//   - Streaming PSEUDONYMIZE round-trip (vault lives across stream boundary)
//   - Content-based DENY (secret in prompt → 403 + llm:blocked event)
//   - Content rules excluded from metadata evaluateLlm step (critical correctness guard)
//   - Upstream 4xx forwarded to client + llm:response error event emitted
//   - Streaming error (streamMeta rejects) → vault disposed + error event emitted
//   - Event ordering: llm:request fires before forward, llm:response fires after
//   - contentInspection attached to response events when detectors ran
//
// forwardLlmRequest is mocked — no real HTTP calls are made.
// The Hono app is exercised via app.fetch() — no HTTP server needed.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import pino from 'pino';
import { llmGateway } from '../transport/llm/gateway.js';
import { PolicyEngine } from '../policy/engine.js';
import { InMemoryPolicyStore } from '../policy/store.js';
import { RindEventBus } from '../event-bus.js';
import type { PolicyRule } from '../types.js';
import type { ForwardLlmResult } from '../transport/llm/forward.js';
import type { LlmCallEvent, LlmProxyConfig } from '../transport/llm/types.js';
import type { LlmResponseMeta } from '../transport/llm/providers/interface.js';

// ─── Module mock ──────────────────────────────────────────────────────────────

vi.mock('../transport/llm/forward.js', () => ({
  forwardLlmRequest: vi.fn(),
}));

import { forwardLlmRequest } from '../transport/llm/forward.js';
const mockForward = vi.mocked(forwardLlmRequest);

// ─── Shared fixtures ──────────────────────────────────────────────────────────

/** Minimal valid Anthropic messages request body. */
function makeAnthropicBody(userMessage: string, system?: string) {
  return {
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 100,
    ...(system ? { system } : {}),
    messages: [{ role: 'user', content: userMessage }],
  };
}

/** Non-streaming ForwardLlmResult with a synthetic LLM reply. */
function makeForwardResult(replyText: string, statusCode = 200): ForwardLlmResult {
  if (statusCode >= 400) {
    return {
      statusCode,
      upstreamHeaders: { 'content-type': 'application/json' },
      durationMs: 10,
      ttfbMs: 5,
      responseBody: { error: { type: 'api_error', message: `upstream ${statusCode}` } },
    };
  }
  return {
    statusCode,
    upstreamHeaders: { 'content-type': 'application/json' },
    durationMs: 10,
    ttfbMs: 5,
    responseBody: {
      id: 'msg_test',
      type: 'message',
      role: 'assistant',
      content: [{ type: 'text', text: replyText }],
      model: 'claude-haiku-4-5-20251001',
      stop_reason: 'end_turn',
      usage: { input_tokens: 10, output_tokens: 5 },
    },
    meta: {
      model: 'claude-haiku-4-5-20251001',
      inputTokens: 10,
      outputTokens: 5,
      stopReason: 'end_turn',
      responseText: replyText,
    },
  };
}

/**
 * Streaming ForwardLlmResult.
 * The ReadableStream immediately yields one data chunk and closes.
 * streamMeta resolves once the stream is set up (synchronous in start()).
 */
function makeStreamForwardResult(replyText: string, rejectMeta = false): ForwardLlmResult {
  const encoder = new TextEncoder();

  let resolveStreamMeta!: (meta: LlmResponseMeta) => void;
  let rejectStreamMeta!: (err: unknown) => void;
  const streamMeta = new Promise<LlmResponseMeta>((resolve, reject) => {
    resolveStreamMeta = resolve;
    rejectStreamMeta = reject;
  });

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(`data: {"type":"content_block_delta","delta":{"text":"${replyText}"}}\n\n`));
      controller.enqueue(encoder.encode('data: [DONE]\n\n'));
      controller.close();
      if (rejectMeta) {
        rejectStreamMeta(new Error('stream pipeline error'));
      } else {
        resolveStreamMeta({
          model: 'claude-haiku-4-5-20251001',
          inputTokens: 10,
          outputTokens: 5,
          stopReason: 'end_turn',
          responseText: replyText,
        });
      }
    },
  });

  return {
    statusCode: 200,
    upstreamHeaders: { 'content-type': 'text/event-stream; charset=utf-8' },
    ttfbMs: 5,
    stream,
    streamMeta,
  };
}

/** POST /llm/anthropic/v1/messages to the Hono app without a real HTTP server. */
async function postToGateway(app: ReturnType<typeof llmGateway>, body: unknown) {
  const req = new Request('http://localhost/llm/anthropic/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': 'sk-test-key' },
    body: JSON.stringify(body),
  });
  return app.fetch(req);
}

/**
 * Drain a streaming response and flush the microtask queue.
 * Required for streaming tests: streamMeta.then() fires as a microtask after
 * the stream is consumed; awaiting this ensures events are collected.
 */
async function drainAndFlush(res: Response): Promise<void> {
  await res.text();
  // Flush pending microtasks (streamMeta.then callbacks)
  await new Promise<void>((r) => setTimeout(r, 0));
}

// ─── Shared rule definitions ──────────────────────────────────────────────────

const PII_PSEUDONYMIZE_RULE: PolicyRule = {
  name: 'test:pii-pseudonymize',
  agent: '*',
  match: { content: { scope: 'both', detectors: ['pii'] } },
  pii: { entities: ['EMAIL', 'PHONE'] },
  action: 'PSEUDONYMIZE',
  failMode: 'open',
  priority: 10,
};

const SECRET_DENY_RULE: PolicyRule = {
  name: 'test:deny-secrets',
  agent: '*',
  match: { content: { scope: 'request', detectors: ['secret'] } },
  secrets: {},
  action: 'DENY',
  failMode: 'open',
  priority: 5,
};

// ─── Gateway factory ──────────────────────────────────────────────────────────

const BASE_CONFIG: LlmProxyConfig = {
  enabled: true,
  logLevel: 'full',
  anthropicUpstream: 'https://api.anthropic.com',
  openaiUpstream:    'https://api.openai.com',
  googleUpstream:    'https://generativelanguage.googleapis.com',
};

function makeGateway(rules: PolicyRule[] = [PII_PSEUDONYMIZE_RULE], config: Partial<LlmProxyConfig> = {}) {
  const store = new InMemoryPolicyStore({ policies: rules });
  const policyEngine = new PolicyEngine(store);
  const bus = new RindEventBus();
  const logger = pino({ level: 'silent' });
  const app = llmGateway({ config: { ...BASE_CONFIG, ...config }, bus, policyEngine, logger });
  return { app, bus, policyEngine };
}

// ─── Helper: extract forwarded body ──────────────────────────────────────────

function getForwardedBody(): unknown {
  return mockForward.mock.calls[0]![2];
}

// ─────────────────────────────────────────────────────────────────────────────
// Non-streaming PSEUDONYMIZE
// ─────────────────────────────────────────────────────────────────────────────

describe('llmGateway — non-streaming PSEUDONYMIZE round-trip', () => {
  beforeEach(() => mockForward.mockReset());

  it('tokenizes PII before forwarding and rehydrates in the response event', async () => {
    mockForward.mockResolvedValue(makeForwardResult('I will contact <EMAIL_1> shortly.'));
    const { app, bus } = makeGateway();
    const responseEvents: LlmCallEvent[] = [];
    bus.on('llm:response', (e) => responseEvents.push(e));

    const res = await postToGateway(app, makeAnthropicBody(
      'Please follow up with alice@example.com about the contract.',
    ));

    expect(res.status).toBe(200);

    // Forwarded body must contain token, not original value
    const forwarded = JSON.stringify(getForwardedBody());
    expect(forwarded).toContain('<EMAIL_1>');
    expect(forwarded).not.toContain('alice@example.com');

    // Response event must have rehydrated original value
    expect(responseEvents).toHaveLength(1);
    expect(responseEvents[0]!.responseText).toContain('alice@example.com');
    expect(responseEvents[0]!.responseText).not.toContain('<EMAIL_1>');
  });

  it('attaches contentInspection to the response event when PII is detected', async () => {
    mockForward.mockResolvedValue(makeForwardResult('ok'));
    const { app, bus } = makeGateway();
    const responseEvents: LlmCallEvent[] = [];
    bus.on('llm:response', (e) => responseEvents.push(e));

    await postToGateway(app, makeAnthropicBody('Call 416-555-1234 for details.'));

    expect(responseEvents[0]!.contentInspection?.detectorsRan).toContain('pii');
    expect(responseEvents[0]!.contentInspection?.results.length).toBeGreaterThan(0);
  });

  it('leaves clean prompt body untouched', async () => {
    const plainBody = makeAnthropicBody('What is the capital of France?');
    mockForward.mockResolvedValue(makeForwardResult('Paris.'));
    const { app, bus } = makeGateway();
    const responseEvents: LlmCallEvent[] = [];
    bus.on('llm:response', (e) => responseEvents.push(e));

    await postToGateway(app, plainBody);

    expect(getForwardedBody()).toStrictEqual(plainBody);
    expect(responseEvents[0]!.responseText).toBe('Paris.');
    // PII rule is loaded — detector ran but found nothing; action is ALLOW with 0 matches
    const inspection = responseEvents[0]!.contentInspection;
    expect(inspection).toBeDefined();
    expect(inspection!.results.every((r) => r.matchCount === 0)).toBe(true);
  });

  it('pseudonymizes system prompt when it is a content-block array', async () => {
    mockForward.mockResolvedValue(makeForwardResult('ok'));
    const { app } = makeGateway();

    const body = {
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 100,
      system: [{ type: 'text', text: 'Contact alice@example.com for support.' }],
      messages: [{ role: 'user', content: 'hello' }],
    };
    await postToGateway(app, body);

    // PII rule targets system + user (default targets), so system block is tokenized
    const forwarded = JSON.stringify(getForwardedBody());
    expect(forwarded).toContain('<EMAIL_1>');
    expect(forwarded).not.toContain('alice@example.com');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Streaming PSEUDONYMIZE
// ─────────────────────────────────────────────────────────────────────────────

describe('llmGateway — streaming PSEUDONYMIZE round-trip', () => {
  beforeEach(() => mockForward.mockReset());

  it('tokenizes PII before forwarding and rehydrates in the response event (streaming)', async () => {
    // LLM echoes the token back in its streamed reply
    mockForward.mockResolvedValue(makeStreamForwardResult('Reply to <EMAIL_1> asap.'));
    const { app, bus } = makeGateway();
    const responseEvents: LlmCallEvent[] = [];
    bus.on('llm:response', (e) => responseEvents.push(e));

    const res = await postToGateway(app, makeAnthropicBody(
      'Contact alice@example.com about the deal.',
    ));

    expect(res.status).toBe(200);

    // Forwarded body must be tokenized (same invariant as non-streaming)
    const forwarded = JSON.stringify(getForwardedBody());
    expect(forwarded).toContain('<EMAIL_1>');
    expect(forwarded).not.toContain('alice@example.com');

    // Drain stream and flush microtasks — streamMeta.then() fires here
    await drainAndFlush(res);

    expect(responseEvents).toHaveLength(1);
    expect(responseEvents[0]!.responseText).toContain('alice@example.com');
    expect(responseEvents[0]!.responseText).not.toContain('<EMAIL_1>');
  });

  it('emits error event and disposes vault when streamMeta rejects', async () => {
    mockForward.mockResolvedValue(makeStreamForwardResult('partial', /* rejectMeta */ true));
    const { app, bus } = makeGateway();
    const responseEvents: LlmCallEvent[] = [];
    bus.on('llm:response', (e) => responseEvents.push(e));

    const res = await postToGateway(app, makeAnthropicBody(
      'Contact alice@example.com.',
    ));

    expect(res.status).toBe(200); // response is already sent; error is post-stream

    await drainAndFlush(res);

    // An error event must be emitted (vault disposed in the catch path)
    expect(responseEvents).toHaveLength(1);
    expect(responseEvents[0]!.outcome).toBe('error');
    expect(responseEvents[0]!.errorMessage).toMatch(/stream/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Content-based DENY
// ─────────────────────────────────────────────────────────────────────────────

describe('llmGateway — content-based DENY', () => {
  beforeEach(() => mockForward.mockReset());

  it('returns 403 and does not forward when a secret is in the prompt', async () => {
    const { app, bus } = makeGateway([SECRET_DENY_RULE]);
    const blockedEvents: { event: LlmCallEvent; reason: string }[] = [];
    bus.on('llm:blocked', (p) => blockedEvents.push(p));

    const res = await postToGateway(
      app,
      makeAnthropicBody('Use this key: sk-abcdefghijklmnopqrstuvwxyz1234567890ab'),
    );

    expect(res.status).toBe(403);
    expect(mockForward).not.toHaveBeenCalled();
    expect(blockedEvents).toHaveLength(1);
    expect(blockedEvents[0]!.event.outcome).toBe('blocked');
    expect(blockedEvents[0]!.event.contentInspection?.detectorsRan).toContain('secret');
    expect(blockedEvents[0]!.event.contentInspection?.results.length).toBeGreaterThan(0);
  });

  it('allows requests with no secret even when the DENY rule is loaded', async () => {
    mockForward.mockResolvedValue(makeForwardResult('ok'));
    const { app } = makeGateway([SECRET_DENY_RULE]);

    const res = await postToGateway(app, makeAnthropicBody('What is 2+2?'));

    expect(res.status).toBe(200);
    expect(mockForward).toHaveBeenCalledOnce();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Critical: content rules must NOT fire in the metadata evaluateLlm step
// ─────────────────────────────────────────────────────────────────────────────

describe('llmGateway — content rules excluded from metadata policy (evaluateLlm)', () => {
  beforeEach(() => mockForward.mockReset());

  it('does not block a clean request when a content DENY rule is loaded (no provider criteria)', async () => {
    // Without the evaluateLlm fix, matchesLlmRule's agent-only fallback would return
    // true for this content rule, causing evaluateLlm to DENY every request — even
    // clean ones. This test catches that regression.
    mockForward.mockResolvedValue(makeForwardResult('ok'));
    const { app } = makeGateway([SECRET_DENY_RULE]);

    const res = await postToGateway(app, makeAnthropicBody('What is 2+2?'));

    expect(res.status).toBe(200);
    expect(mockForward).toHaveBeenCalledOnce();
  });

  it('does not block a clean request when content DENY rule has llmProvider criteria', async () => {
    // Content rule scoped to anthropic — clean request must still pass
    const providerScopedDenyRule: PolicyRule = {
      name: 'test:provider-scoped-deny',
      agent: '*',
      match: {
        llmProvider: ['anthropic'],
        content: { scope: 'request', detectors: ['secret'] },
      },
      secrets: {},
      action: 'DENY',
      failMode: 'open',
      priority: 5,
    };
    mockForward.mockResolvedValue(makeForwardResult('ok'));
    const { app } = makeGateway([providerScopedDenyRule]);

    const res = await postToGateway(app, makeAnthropicBody('What is 2+2?'));

    expect(res.status).toBe(200);
    expect(mockForward).toHaveBeenCalledOnce();
  });

  it('still fires content DENY rule when a secret IS present', async () => {
    const providerScopedDenyRule: PolicyRule = {
      name: 'test:provider-scoped-deny',
      agent: '*',
      match: {
        llmProvider: ['anthropic'],
        content: { scope: 'request', detectors: ['secret'] },
      },
      secrets: {},
      action: 'DENY',
      failMode: 'open',
      priority: 5,
    };
    const { app } = makeGateway([providerScopedDenyRule]);

    const res = await postToGateway(
      app,
      makeAnthropicBody('Key: sk-abcdefghijklmnopqrstuvwxyz1234567890ab'),
    );

    expect(res.status).toBe(403);
    expect(mockForward).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Upstream error handling
// ─────────────────────────────────────────────────────────────────────────────

describe('llmGateway — upstream error handling', () => {
  beforeEach(() => mockForward.mockReset());

  it('forwards 4xx status to client and emits llm:response with outcome:error', async () => {
    mockForward.mockResolvedValue(makeForwardResult('', 401));
    const { app, bus } = makeGateway();
    const responseEvents: LlmCallEvent[] = [];
    bus.on('llm:response', (e) => responseEvents.push(e));

    const res = await postToGateway(
      app,
      makeAnthropicBody('Contact alice@example.com.'),
    );

    // Client receives the upstream error status
    expect(res.status).toBe(401);
    // Error event emitted; vault disposed (body has PII but vault is now gone)
    expect(responseEvents).toHaveLength(1);
    expect(responseEvents[0]!.outcome).toBe('error');
    expect(responseEvents[0]!.statusCode).toBe(401);
    // No responseText — error path doesn't produce a reply
    expect(responseEvents[0]!.responseText).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Event ordering and bus guarantees
// ─────────────────────────────────────────────────────────────────────────────

describe('llmGateway — event ordering', () => {
  beforeEach(() => mockForward.mockReset());

  it('emits llm:request before forwarding and llm:response after', async () => {
    const callOrder: string[] = [];

    mockForward.mockImplementation(async () => {
      callOrder.push('forward');
      return makeForwardResult('ok');
    });

    const { app, bus } = makeGateway([]);
    bus.on('llm:request',  () => callOrder.push('llm:request'));
    bus.on('llm:response', () => callOrder.push('llm:response'));

    await postToGateway(app, makeAnthropicBody('hello'));

    expect(callOrder).toEqual(['llm:request', 'forward', 'llm:response']);
  });

  it('does not emit llm:request when content DENY fires before forwarding', async () => {
    const { app, bus } = makeGateway([SECRET_DENY_RULE]);
    const requestEvents: unknown[] = [];
    bus.on('llm:request', (e) => requestEvents.push(e));

    await postToGateway(
      app,
      makeAnthropicBody('sk-abcdefghijklmnopqrstuvwxyz1234567890ab'),
    );

    // Content policy blocks before step 5 (forward), so llm:request is never emitted
    expect(requestEvents).toHaveLength(0);
  });
});
