// OpenAI Chat Completions API provider implementation.
// Handles: POST /v1/chat/completions (and any other /v1/* paths for passthrough)
// Reference: https://platform.openai.com/docs/api-reference/chat
//
// This module contains only pure functions — no I/O, no side effects.
// All request/response parsing is validated with Zod before use.

import { z } from 'zod';
import type { LlmProxyProvider, LlmRequestMeta, LlmResponseMeta } from './interface.js';
import { ProviderParseError, redactSensitiveHeaders } from './interface.js';
import type { LlmLogLevel } from '../types.js';

// ─── Zod schemas ─────────────────────────────────────────────────────────────

const AnyBlockSchema = z.object({ type: z.string() }).passthrough();

const MessageSchema = z.object({
  role: z.enum(['system', 'user', 'assistant', 'tool', 'function']),
  content: z.union([
    z.string(),
    z.array(AnyBlockSchema),
    z.null(),
  ]).optional(),
  name: z.string().optional(),
}).passthrough();

const OpenAIRequestSchema = z.object({
  model: z.string().min(1, 'model is required'),
  messages: z.array(MessageSchema).default([]),
  stream: z.boolean().optional().default(false),
  stream_options: z.object({ include_usage: z.boolean().optional() }).optional(),
  max_tokens: z.number().int().positive().optional(),
  // All other fields pass through unchanged
}).passthrough();

const UsageSchema = z.object({
  prompt_tokens: z.number().int().nonnegative(),
  completion_tokens: z.number().int().nonnegative(),
  total_tokens: z.number().int().nonnegative().optional(),
});

const OpenAIResponseSchema = z.object({
  id: z.string(),
  object: z.string(),
  model: z.string(),
  choices: z.array(
    z.object({
      index: z.number().int(),
      message: z.object({
        role: z.string(),
        content: z.string().nullable().optional(),
      }),
      finish_reason: z.string().nullable().optional(),
    }).passthrough(),
  ),
  usage: UsageSchema.optional(),
}).passthrough();

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Extract the system prompt from the first system-role message, if any. */
function systemPromptLength(messages: z.infer<typeof MessageSchema>[]): number {
  const systemMsg = messages.find((m) => m.role === 'system');
  if (!systemMsg) return 0;
  const content = systemMsg.content;
  if (typeof content === 'string') return content.length;
  if (Array.isArray(content)) {
    return content.reduce((acc, block) => {
      const b = block as Record<string, unknown>;
      return acc + (typeof b['text'] === 'string' ? (b['text'] as string).length : 0);
    }, 0);
  }
  return 0;
}

/** Extract readable text from a message's content field. */
function extractContentText(content: z.infer<typeof MessageSchema>['content']): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((block) => {
        const b = block as Record<string, unknown>;
        return typeof b['text'] === 'string' ? (b['text'] as string) : '';
      })
      .join('');
  }
  return '';
}

/** Strip the /llm/openai prefix from the inbound path.
 *  '/llm/openai/v1/chat/completions' → '/v1/chat/completions'
 */
function stripProviderPrefix(path: string): string {
  return path.replace(/^\/llm\/openai/, '') || '/';
}

// ─── Headers to strip when forwarding ────────────────────────────────────────

const STRIP_HEADERS = new Set(['host', 'content-length', 'transfer-encoding', 'connection']);

// ─── Provider implementation ──────────────────────────────────────────────────

export const openaiProvider: LlmProxyProvider = {
  name: 'openai',

  parseRequest(body: unknown, logLevel: LlmLogLevel): LlmRequestMeta {
    const result = OpenAIRequestSchema.safeParse(body);
    if (!result.success) {
      throw new ProviderParseError(
        'openai',
        `Invalid request body: ${result.error.issues[0]?.message ?? 'unknown'}`,
        result.error,
      );
    }

    const { model, messages, stream } = result.data;

    // Build messages for logging based on log level
    let logMessages: unknown;
    if (logLevel === 'full') {
      logMessages = messages;
    } else if (logLevel === 'preview') {
      // Last user message only, truncated
      const lastUser = [...messages].reverse().find((m) => m.role === 'user');
      logMessages = lastUser
        ? [{ role: 'user', content: extractContentText(lastUser.content).slice(0, 200) }]
        : [];
    }
    // logLevel === 'metadata' → logMessages stays undefined

    // Extract tool_use_ids from tool messages (OpenAI uses role:'tool' with tool_call_id)
    const referencedToolUseIds: string[] = [];
    for (const message of messages) {
      if (message.role !== 'tool') continue;
      const raw = message as Record<string, unknown>;
      if (typeof raw['tool_call_id'] === 'string') {
        referencedToolUseIds.push(raw['tool_call_id']);
      }
    }

    return {
      model,
      messageCount: messages.length,
      systemPromptLength: systemPromptLength(messages),
      isStreaming: stream === true,
      messages: logMessages,
      referencedToolUseIds,
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
    const result = OpenAIResponseSchema.safeParse(body);
    if (!result.success) {
      throw new ProviderParseError(
        'openai',
        `Invalid response body: ${result.error.issues[0]?.message ?? 'unknown'}`,
        result.error,
      );
    }

    const { model, choices, usage } = result.data;
    const firstChoice = choices[0];

    // Extract response text based on log level
    let responseText: string | undefined;
    const fullText = firstChoice?.message?.content ?? '';
    if (fullText) {
      if (logLevel === 'full') {
        responseText = fullText;
      } else if (logLevel === 'preview') {
        responseText = fullText.slice(0, 200) + (fullText.length > 200 ? '…' : '');
      }
    }

    return {
      model,
      inputTokens: usage?.prompt_tokens ?? 0,
      outputTokens: usage?.completion_tokens ?? 0,
      stopReason: firstChoice?.finish_reason ?? undefined,
      responseText,
    };
  },
};
