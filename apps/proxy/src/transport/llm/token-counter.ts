// LLM token counter — extract token usage from raw API response bodies.
//
// The provider layer (anthropic.ts, openai.ts) handles parsing for proxied
// requests. This module provides standalone extraction for use cases where
// the raw response body is available but a provider instance is not
// (e.g. callback/webhook ingestion mode, future Phase callback endpoint).
//
// Never throws — returns zeros on parse failure.

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  /** True if token counts could not be extracted from the response */
  missing: boolean;
}

/**
 * Extract token usage from an Anthropic Messages API response body.
 * Handles: { usage: { input_tokens, output_tokens } }
 */
export function extractAnthropicTokens(body: unknown): TokenUsage {
  try {
    if (typeof body !== 'object' || body === null) return missing();
    const b = body as Record<string, unknown>;
    const usage = b['usage'] as Record<string, unknown> | undefined;
    if (!usage) return missing();

    const inputTokens = typeof usage['input_tokens'] === 'number' ? usage['input_tokens'] : 0;
    const outputTokens = typeof usage['output_tokens'] === 'number' ? usage['output_tokens'] : 0;
    const hasCounts = typeof usage['input_tokens'] === 'number' && typeof usage['output_tokens'] === 'number';
    return { inputTokens, outputTokens, missing: !hasCounts };
  } catch {
    return missing();
  }
}

/**
 * Extract token usage from an OpenAI Chat Completions API response body.
 * Handles: { usage: { prompt_tokens, completion_tokens } }
 */
export function extractOpenAITokens(body: unknown): TokenUsage {
  try {
    if (typeof body !== 'object' || body === null) return missing();
    const b = body as Record<string, unknown>;
    const usage = b['usage'] as Record<string, unknown> | undefined;
    if (!usage) return missing();

    const inputTokens = typeof usage['prompt_tokens'] === 'number' ? usage['prompt_tokens'] : 0;
    const outputTokens = typeof usage['completion_tokens'] === 'number' ? usage['completion_tokens'] : 0;
    const hasCounts = typeof usage['prompt_tokens'] === 'number' && typeof usage['completion_tokens'] === 'number';
    return { inputTokens, outputTokens, missing: !hasCounts };
  } catch {
    return missing();
  }
}

function missing(): TokenUsage {
  return { inputTokens: 0, outputTokens: 0, missing: true };
}
