// LLM request forwarding — HTTP reverse proxy logic.
//
// Responsibility: take an inbound request, forward it to the upstream LLM API,
// and return either a complete response (non-streaming) or a piped ReadableStream
// with an in-flight accumulator (streaming).
//
// Design principles:
//   - No Hono types — pure async function, fully testable with mocked fetch
//   - Streaming: chunks pass through to the client immediately (zero added latency)
//   - Accumulation runs in the background via a TransformStream side-channel
//   - Upstream errors (4xx/5xx) are forwarded as-is — do not intercept API errors
//   - Connection errors become 502; timeouts become 504

import { parseSseChunk } from './streaming.js';
import type { StreamAccumulator } from './streaming.js';
import type { LlmProxyProvider, LlmResponseMeta } from './providers/interface.js';
import type { LlmLogLevel } from './types.js';

// ─── Public types ─────────────────────────────────────────────────────────────

export interface ForwardLlmOptions {
  provider: LlmProxyProvider;
  upstreamBaseUrl: string;
  logLevel: LlmLogLevel;
  /** Timeout for the upstream request in milliseconds (default: 300_000 = 5 min) */
  timeoutMs?: number;
  /**
   * Factory for the SSE accumulator — injected so callers can provide provider-specific
   * accumulators without this module knowing about provider details.
   */
  createAccumulator?: () => StreamAccumulator;
}

export interface ForwardLlmResult {
  statusCode: number;
  /** Headers from the upstream response (forwarded to the client) */
  upstreamHeaders: Record<string, string>;
  /**
   * Total request duration in ms. Always set for non-streaming responses and connection errors.
   * Undefined for streaming responses — the caller computes end-to-end duration when streamMeta resolves.
   */
  durationMs?: number;
  /** Time to first byte of the response body (streaming: first SSE chunk) */
  ttfbMs?: number;

  // Non-streaming path: complete response available immediately
  responseBody?: unknown;
  meta?: LlmResponseMeta;

  // Streaming path: pipe this stream to the client
  stream?: ReadableStream<Uint8Array>;
  /**
   * Resolves after the stream has been fully consumed (or aborted).
   * Provides accumulated metadata including token counts.
   * Callers MUST read the stream to drain it — awaiting this promise before
   * consuming the stream will deadlock.
   */
  streamMeta?: Promise<LlmResponseMeta>;
}

// ─── Forward function ─────────────────────────────────────────────────────────

export async function forwardLlmRequest(
  inboundPath: string,
  inboundHeaders: Record<string, string>,
  inboundBody: unknown,
  opts: ForwardLlmOptions,
): Promise<ForwardLlmResult> {
  const { provider, upstreamBaseUrl, timeoutMs = 300_000 } = opts;

  const upstreamUrl = provider.upstreamUrl(inboundPath, upstreamBaseUrl);
  const forwardHeaders = provider.forwardHeaders(inboundHeaders);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort('upstream-timeout'), timeoutMs);

  const requestStart = performance.now();

  let upstreamResponse: Response;
  try {
    upstreamResponse = await fetch(upstreamUrl, {
      method: 'POST',
      headers: { ...forwardHeaders, 'content-type': 'application/json' },
      body: JSON.stringify(inboundBody),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timeoutId);
    const isTimeout = err instanceof Error && err.name === 'AbortError';
    return {
      statusCode: isTimeout ? 504 : 502,
      upstreamHeaders: {},
      durationMs: performance.now() - requestStart,
      responseBody: {
        error: {
          type: isTimeout ? 'upstream_timeout' : 'upstream_unreachable',
          message: isTimeout
            ? `Upstream timed out after ${timeoutMs}ms`
            : `Failed to reach upstream: ${err instanceof Error ? err.message : String(err)}`,
        },
      },
    };
  } finally {
    clearTimeout(timeoutId);
  }

  const ttfbMs = performance.now() - requestStart;

  // Collect upstream response headers (for forwarding to client)
  const upstreamHeaders: Record<string, string> = {};
  upstreamResponse.headers.forEach((value, key) => {
    // Skip hop-by-hop headers
    if (!HOP_BY_HOP.has(key.toLowerCase())) {
      upstreamHeaders[key] = value;
    }
  });

  // ── Non-streaming path ────────────────────────────────────────────────────
  const isStreaming =
    upstreamResponse.headers.get('content-type')?.includes('text/event-stream') ?? false;

  if (!isStreaming) {
    let responseBody: unknown;
    try {
      responseBody = await upstreamResponse.json();
    } catch {
      responseBody = await upstreamResponse.text().catch(() => '');
    }

    const durationMs = performance.now() - requestStart;

    // Only parse metadata for successful responses
    let meta: LlmResponseMeta | undefined;
    if (upstreamResponse.ok) {
      try {
        meta = provider.parseResponse(responseBody, opts.logLevel);
      } catch {
        // Parsing failure doesn't affect the forwarded response
      }
    }

    return { statusCode: upstreamResponse.status, upstreamHeaders, durationMs, ttfbMs, responseBody, meta };
  }

  // ── Streaming path ────────────────────────────────────────────────────────
  // We need to:
  //  1. Pipe upstream chunks to the client in real-time (zero latency)
  //  2. Simultaneously feed chunks to the accumulator for metadata extraction
  //
  // Strategy: use a TransformStream that passes chunks through unchanged while
  // feeding decoded text to the SSE parser + accumulator.

  if (!upstreamResponse.body) {
    return {
      statusCode: 502,
      upstreamHeaders,
      durationMs: performance.now() - requestStart,
      responseBody: { error: { type: 'upstream_error', message: 'Streaming response has no body' } },
    };
  }

  const accumulator = opts.createAccumulator?.();
  let streamMetaResolve!: (meta: LlmResponseMeta) => void;
  let streamMetaReject!: (err: unknown) => void;
  const streamMeta = new Promise<LlmResponseMeta>((resolve, reject) => {
    streamMetaResolve = resolve;
    streamMetaReject = reject;
  });

  // Line buffer — SSE events can span multiple chunks
  let lineBuffer = '';
  // Set to true when the client disconnects before the stream ends
  let streamAborted = false;
  // Guard against double-settling streamMeta (flush then cancel, or enqueue error then cancel)
  let streamMetaSettled = false;

  const textDecoder = new TextDecoder();

  const transformStream = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      // Pass through to client immediately; reject streamMeta if the stream errors
      try {
        controller.enqueue(chunk);
      } catch (err) {
        if (!streamMetaSettled) { streamMetaSettled = true; streamMetaReject(err); }
        throw err;
      }

      // Feed to accumulator if present
      if (accumulator) {
        lineBuffer += textDecoder.decode(chunk, { stream: true });

        // Find the last complete SSE event boundary.
        // \r\n\r\n is 4 bytes; \n\n is 2 bytes — use the correct offset for each.
        const lastCrLf = lineBuffer.lastIndexOf('\r\n\r\n');
        const lastLf   = lineBuffer.lastIndexOf('\n\n');
        let sliceAt = -1;
        if (lastCrLf >= 0 && lastCrLf + 4 >= lastLf + 2) {
          sliceAt = lastCrLf + 4;
        } else if (lastLf >= 0) {
          sliceAt = lastLf + 2;
        }

        const events = parseSseChunk(sliceAt >= 0 ? lineBuffer.slice(0, sliceAt) : lineBuffer);
        lineBuffer = sliceAt >= 0 ? lineBuffer.slice(sliceAt) : lineBuffer;

        for (const event of events) {
          accumulator.onEvent(event.eventType, event.data);
        }
      }
    },
    flush() {
      // Stream ended normally — process any remaining buffered text.
      // Guard: if cancel() already settled streamMeta (client disconnected while
      // upstream was still delivering), do not double-settle.
      if (streamMetaSettled) return;
      streamMetaSettled = true;
      // Flush the TextDecoder's internal state to drain any incomplete multi-byte
      // codepoint held at the end of the stream (e.g. a UTF-8 sequence split across chunks).
      if (accumulator) {
        const tail = textDecoder.decode(); // no args = flush mode
        if (tail) lineBuffer += tail;
      }
      if (accumulator && lineBuffer.trim()) {
        const events = parseSseChunk(lineBuffer);
        for (const event of events) {
          accumulator.onEvent(event.eventType, event.data);
        }
      }
      streamMetaResolve(accumulator?.finalize(streamAborted) ?? {
        model: 'unknown',
        inputTokens: 0,
        outputTokens: 0,
        partial: streamAborted,
      });
    },
    cancel() {
      // Client disconnected before stream ended.
      // Guard: if flush() already settled (upstream closed first), do not double-settle.
      if (streamMetaSettled) return;
      streamMetaSettled = true;
      streamAborted = true;
      streamMetaResolve(accumulator?.finalize(true) ?? {
        model: 'unknown',
        inputTokens: 0,
        outputTokens: 0,
        partial: true,
      });
    },
  });

  const stream = upstreamResponse.body.pipeThrough(transformStream);

  return {
    statusCode: upstreamResponse.status,
    upstreamHeaders,
    ttfbMs,
    stream,
    streamMeta,
  };
}

// ─── Hop-by-hop headers (never forwarded) ────────────────────────────────────

const HOP_BY_HOP = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailers',
  'transfer-encoding',
  'upgrade',
]);
