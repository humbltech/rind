// SSE stream accumulator for LLM API streaming responses.
//
// Responsibility: parse raw SSE chunks (text/event-stream), accumulate the full
// response text and usage metadata, and expose a finalize() method once the
// stream ends.
//
// Design:
//   - Provider-agnostic interface (StreamAccumulator)
//   - Provider-specific factories (createAnthropicAccumulator, createOpenAIAccumulator)
//   - Pure in-memory accumulation — no I/O
//   - Malformed chunks are logged + skipped, never throw (streaming must not crash)

import type { LlmResponseMeta } from './providers/interface.js';
import type { ToolUseRef } from './types.js';

// ─── Interface ────────────────────────────────────────────────────────────────

export interface StreamAccumulator {
  /**
   * Feed a parsed SSE event. Called for every non-comment, non-empty SSE event.
   * Must not throw — errors are silently dropped to avoid interrupting the stream.
   */
  onEvent(eventType: string, data: string): void;

  /**
   * Call after the stream ends (or is aborted).
   * Returns the accumulated metadata. Fields with no data are left undefined.
   */
  finalize(partial?: boolean): LlmResponseMeta;
}

// ─── SSE line parser ──────────────────────────────────────────────────────────

export interface SseEvent {
  eventType: string; // default: 'message'
  data: string;      // concatenated data lines
}

/**
 * Parse a block of raw SSE text into discrete events.
 * Handles:
 *   - `event:` lines (with or without space after colon)
 *   - `data:` lines (multi-line data is concatenated with '\n')
 *   - `: ` comment lines (ignored)
 *   - blank lines as event delimiters
 *   - `data: [DONE]` sentinel (OpenAI format) — returned as-is for the factory to handle
 */
export function parseSseChunk(raw: string): SseEvent[] {
  const events: SseEvent[] = [];
  // SSE events are separated by double newlines (\n\n or \r\n\r\n)
  const blocks = raw.split(/\r?\n\r?\n/);

  for (const block of blocks) {
    if (!block.trim()) continue;

    // Two-pass parse: collect all fields first, then process.
    // This ensures 'event:' is honoured regardless of line order within the block
    // (the SSE spec permits fields in any order).
    const fields: Array<{ field: string; value: string }> = [];

    for (const line of block.split(/\r?\n/)) {
      if (line.startsWith(':')) continue; // comment line
      const colonIdx = line.indexOf(':');
      if (colonIdx === -1) continue;
      const field = line.slice(0, colonIdx).trim();
      const rawValue = line.slice(colonIdx + 1);
      // Strip one leading space per SSE spec
      const value = rawValue.startsWith(' ') ? rawValue.slice(1) : rawValue;
      fields.push({ field, value });
    }

    // Pass 1: find event type
    let eventType = 'message';
    for (const { field, value } of fields) {
      if (field === 'event') { eventType = value; break; }
    }

    // Pass 2: collect data lines
    const dataLines: string[] = [];
    for (const { field, value } of fields) {
      if (field === 'data') dataLines.push(value);
    }
    // id, retry, and other fields are ignored

    if (dataLines.length > 0) {
      events.push({ eventType, data: dataLines.join('\n') });
    }
  }

  return events;
}

// ─── Anthropic accumulator ────────────────────────────────────────────────────

/**
 * Anthropic SSE event flow:
 *   message_start       → model, usage.input_tokens
 *   content_block_start → block type (text | tool_use | ...)
 *   content_block_delta → delta.text (text) or delta.partial_json (tool_use)
 *   content_block_stop  → (ignored)
 *   message_delta       → usage.output_tokens, delta.stop_reason
 *   message_stop        → stream complete
 */
export function createAnthropicAccumulator(): StreamAccumulator {
  let model = '';
  let inputTokens = 0;
  let outputTokens = 0;
  let stopReason: string | undefined;
  const textParts: string[] = [];

  // tool_use accumulation — keyed by content block index
  // Each tool_use block arrives as: content_block_start (id+name) → N×content_block_delta (partial_json) → content_block_stop
  const toolUseByIndex = new Map<number, { id: string; name: string; jsonParts: string[] }>();
  const toolUses: ToolUseRef[] = [];

  return {
    onEvent(eventType: string, data: string): void {
      // Silently skip [DONE] and empty data
      if (data === '[DONE]' || !data.trim()) return;

      let parsed: unknown;
      try {
        parsed = JSON.parse(data);
      } catch {
        // Malformed JSON — skip silently (no crash allowed in streaming path)
        return;
      }

      if (typeof parsed !== 'object' || parsed === null) return;
      const obj = parsed as Record<string, unknown>;

      switch (eventType) {
        case 'message_start': {
          // { type: 'message_start', message: { model, usage: { input_tokens } } }
          const msg = obj['message'] as Record<string, unknown> | undefined;
          if (msg) {
            if (typeof msg['model'] === 'string') model = msg['model'];
            const usage = msg['usage'] as Record<string, unknown> | undefined;
            if (usage && typeof usage['input_tokens'] === 'number') {
              inputTokens = usage['input_tokens'];
            }
          }
          break;
        }

        case 'content_block_start': {
          // { index: N, content_block: { type: 'tool_use', id: '...', name: '...', input: {} } }
          const index = typeof obj['index'] === 'number' ? obj['index'] : -1;
          const block = obj['content_block'] as Record<string, unknown> | undefined;
          if (block?.['type'] === 'tool_use' && typeof block['id'] === 'string' && typeof block['name'] === 'string') {
            toolUseByIndex.set(index, { id: block['id'], name: block['name'], jsonParts: [] });
          }
          break;
        }

        case 'content_block_delta': {
          // { index: N, delta: { type: 'text_delta', text: '...' } }
          // or { index: N, delta: { type: 'input_json_delta', partial_json: '...' } }
          const index = typeof obj['index'] === 'number' ? obj['index'] : -1;
          const delta = obj['delta'] as Record<string, unknown> | undefined;
          if (delta) {
            if (delta['type'] === 'text_delta' && typeof delta['text'] === 'string') {
              textParts.push(delta['text']);
            } else if (delta['type'] === 'input_json_delta' && typeof delta['partial_json'] === 'string') {
              toolUseByIndex.get(index)?.jsonParts.push(delta['partial_json']);
            }
          }
          break;
        }

        case 'content_block_stop': {
          // { index: N } — finalize the tool_use at this index
          const index = typeof obj['index'] === 'number' ? obj['index'] : -1;
          const pending = toolUseByIndex.get(index);
          if (pending) {
            let input: unknown = {};
            try { input = JSON.parse(pending.jsonParts.join('')); } catch { /* keep {} */ }
            toolUses.push({ id: pending.id, name: pending.name, input });
            toolUseByIndex.delete(index);
          }
          break;
        }

        case 'message_delta': {
          // { type: 'message_delta', delta: { stop_reason: '...' }, usage: { output_tokens: N } }
          const delta = obj['delta'] as Record<string, unknown> | undefined;
          if (delta && typeof delta['stop_reason'] === 'string') {
            stopReason = delta['stop_reason'];
          }
          const usage = obj['usage'] as Record<string, unknown> | undefined;
          if (usage && typeof usage['output_tokens'] === 'number') {
            outputTokens = usage['output_tokens'];
          }
          break;
        }

        // message_stop — nothing to accumulate
        default:
          break;
      }
    },

    finalize(partial = false): LlmResponseMeta {
      return {
        model: model || 'unknown',
        inputTokens,
        outputTokens,
        stopReason,
        responseText: textParts.length > 0 ? textParts.join('') : undefined,
        toolUses: toolUses.length > 0 ? [...toolUses] : undefined,
        partial,
      };
    },
  };
}

// ─── OpenAI accumulator ───────────────────────────────────────────────────────

/**
 * OpenAI Chat Completions SSE event flow:
 *   data: { id, choices: [{ delta: { content: '...' } }], ... }   (repeated)
 *   data: { ..., usage: { prompt_tokens, completion_tokens } }    (final chunk with stream_options)
 *   data: [DONE]
 *
 * Note: usage is only included when client sends stream_options: { include_usage: true }.
 * Without it, we get token counts from the last chunk that has a usage field (some providers
 * include it in the final non-[DONE] chunk).
 */
export function createOpenAIAccumulator(): StreamAccumulator {
  let model = '';
  let inputTokens = 0;
  let outputTokens = 0;
  let stopReason: string | undefined;
  const textParts: string[] = [];

  return {
    onEvent(_eventType: string, data: string): void {
      if (data === '[DONE]' || !data.trim()) return;

      let parsed: unknown;
      try {
        parsed = JSON.parse(data);
      } catch {
        return;
      }

      if (typeof parsed !== 'object' || parsed === null) return;
      const obj = parsed as Record<string, unknown>;

      // Model
      if (typeof obj['model'] === 'string' && !model) {
        model = obj['model'];
      }

      // Usage (present in final chunk when stream_options.include_usage: true)
      const usage = obj['usage'] as Record<string, unknown> | undefined;
      if (usage) {
        if (typeof usage['prompt_tokens'] === 'number') inputTokens = usage['prompt_tokens'];
        if (typeof usage['completion_tokens'] === 'number') outputTokens = usage['completion_tokens'];
      }

      // Choices delta
      const choices = obj['choices'];
      if (Array.isArray(choices) && choices.length > 0) {
        const choice = choices[0] as Record<string, unknown>;
        const delta = choice['delta'] as Record<string, unknown> | undefined;
        if (delta) {
          if (typeof delta['content'] === 'string') {
            textParts.push(delta['content']);
          }
        }
        // Stop reason from finish_reason
        if (typeof choice['finish_reason'] === 'string' && choice['finish_reason']) {
          stopReason = choice['finish_reason'];
        }
      }
    },

    finalize(partial = false): LlmResponseMeta {
      return {
        model: model || 'unknown',
        inputTokens,
        outputTokens,
        stopReason,
        responseText: textParts.length > 0 ? textParts.join('') : undefined,
        partial,
      };
    },
  };
}
