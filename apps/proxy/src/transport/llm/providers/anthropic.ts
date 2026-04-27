// Anthropic Messages API provider implementation.
// Handles: POST /v1/messages, POST /v1/messages/count_tokens
// Reference: https://docs.anthropic.com/en/api/messages
//
// This module contains only pure functions — no I/O, no side effects.
// All request/response parsing is validated with Zod before use.

import { z } from 'zod';
import type { LlmProxyProvider, LlmRequestMeta, LlmResponseMeta } from './interface.js';
import { ProviderParseError, redactSensitiveHeaders } from './interface.js';
import type { LlmLogLevel } from '../types.js';

// ─── Zod schemas ─────────────────────────────────────────────────────────────

// Content block — text or image or tool use (non-exhaustive)
const TextBlockSchema = z.object({ type: z.literal('text'), text: z.string() });
const AnyBlockSchema = z.object({ type: z.string() }).passthrough();

// System prompt: either a plain string or an array of content blocks
const SystemSchema = z.union([
  z.string(),
  z.array(AnyBlockSchema),
]);

const MessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.union([z.string(), z.array(AnyBlockSchema)]),
});

const AnthropicRequestSchema = z.object({
  model: z.string().min(1, 'model is required'),
  messages: z.array(MessageSchema).default([]),
  system: SystemSchema.optional(),
  stream: z.boolean().optional().default(false),
  max_tokens: z.number().int().positive().optional(),
  // stream_options and other optional fields pass through unchanged
}).passthrough();

const UsageSchema = z.object({
  input_tokens: z.number().int().nonnegative(),
  output_tokens: z.number().int().nonnegative(),
});

const AnthropicResponseSchema = z.object({
  id: z.string(),
  type: z.literal('message'),
  role: z.literal('assistant'),
  model: z.string(),
  content: z.array(AnyBlockSchema),
  stop_reason: z.string().nullable().optional(),
  usage: UsageSchema,
}).passthrough();

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Compute system prompt length, handling both string and block array forms. */
function systemPromptLength(system: z.infer<typeof SystemSchema> | undefined): number {
  if (!system) return 0;
  if (typeof system === 'string') return system.length;
  // Array of content blocks — sum text block lengths only
  return system.reduce((acc, block) => {
    const parsed = TextBlockSchema.safeParse(block);
    return acc + (parsed.success ? parsed.data.text.length : 0);
  }, 0);
}

/** Extract plain text from a message content field for logging. */
function extractContentText(content: string | z.infer<typeof AnyBlockSchema>[]): string {
  if (typeof content === 'string') return content;
  return content
    .map((block) => {
      const parsed = TextBlockSchema.safeParse(block);
      return parsed.success ? parsed.data.text : '';
    })
    .join('');
}

/** Extract first 200 chars of system prompt for preview log level. */
function previewSystem(system: z.infer<typeof SystemSchema> | undefined): string {
  if (!system) return '';
  const full = typeof system === 'string' ? system : system.map((b) => {
    const p = TextBlockSchema.safeParse(b);
    return p.success ? p.data.text : '';
  }).join('');
  return full.slice(0, 200) + (full.length > 200 ? '…' : '');
}

/** Strip the provider prefix from the inbound path.
 *  '/llm/anthropic/v1/messages' → '/v1/messages'
 */
function stripProviderPrefix(path: string): string {
  // Remove leading /llm/anthropic (or /llm/anthropic/)
  return path.replace(/^\/llm\/anthropic/, '') || '/';
}

// ─── Headers to strip when forwarding ────────────────────────────────────────

// These are hop-by-hop or will be recalculated by the upstream fetch
const STRIP_HEADERS = new Set(['host', 'content-length', 'transfer-encoding', 'connection']);

// ─── Provider implementation ──────────────────────────────────────────────────

export const anthropicProvider: LlmProxyProvider = {
  name: 'anthropic',

  parseRequest(body: unknown, logLevel: LlmLogLevel): LlmRequestMeta {
    const result = AnthropicRequestSchema.safeParse(body);
    if (!result.success) {
      throw new ProviderParseError(
        'anthropic',
        `Invalid request body: ${result.error.issues[0]?.message ?? 'unknown'}`,
        result.error,
      );
    }

    const { model, messages, system, stream } = result.data;

    // Build messages for logging based on log level
    let logMessages: unknown;
    if (logLevel === 'full') {
      logMessages = messages;
    } else if (logLevel === 'preview') {
      // Last user message only, truncated
      const lastUser = [...messages].reverse().find((m) => m.role === 'user');
      logMessages = lastUser
        ? [{ role: 'user', content: extractContentText(lastUser.content as string | z.infer<typeof AnyBlockSchema>[]).slice(0, 200) }]
        : [];
    }
    // logLevel === 'metadata' → logMessages stays undefined

    return {
      model,
      messageCount: messages.length,
      systemPromptLength: systemPromptLength(system),
      isStreaming: stream === true,
      messages: logMessages,
    };
  },

  upstreamUrl(inboundPath: string, baseUrl: string): string {
    const apiPath = stripProviderPrefix(inboundPath);
    const base = baseUrl.replace(/\/$/, '');
    return `${base}${apiPath}`;
  },

  forwardHeaders(inbound: Record<string, string>): Record<string, string> {
    const result: Record<string, string> = {};
    for (const [key, value] of Object.entries(inbound)) {
      if (!STRIP_HEADERS.has(key.toLowerCase())) {
        result[key] = value;
      }
    }
    return result;
  },

  redactHeaders(headers: Record<string, string>): Record<string, string> {
    return redactSensitiveHeaders(headers);
  },

  isStreaming(body: unknown): boolean {
    if (typeof body !== 'object' || body === null) return false;
    return (body as Record<string, unknown>)['stream'] === true;
  },

  parseResponse(body: unknown, logLevel: LlmLogLevel): LlmResponseMeta {
    const result = AnthropicResponseSchema.safeParse(body);
    if (!result.success) {
      throw new ProviderParseError(
        'anthropic',
        `Invalid response body: ${result.error.issues[0]?.message ?? 'unknown'}`,
        result.error,
      );
    }

    const { model, content, stop_reason, usage } = result.data;

    // Extract response text based on log level
    let responseText: string | undefined;
    if (logLevel === 'full') {
      responseText = content
        .map((block) => {
          const p = TextBlockSchema.safeParse(block);
          return p.success ? p.data.text : '';
        })
        .join('');
    } else if (logLevel === 'preview') {
      const full = content.map((block) => {
        const p = TextBlockSchema.safeParse(block);
        return p.success ? p.data.text : '';
      }).join('');
      responseText = full.slice(0, 200) + (full.length > 200 ? '…' : '');
    }

    return {
      model,
      inputTokens: usage.input_tokens,
      outputTokens: usage.output_tokens,
      stopReason: stop_reason ?? undefined,
      responseText,
    };
  },
};

// Named export for the preview helper — used by streaming accumulator
export { previewSystem };
