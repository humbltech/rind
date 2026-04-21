// Bidirectional stdio interposer for MCP JSON-RPC (D-040 Phase A4).
//
// Claude Code speaks to the real MCP server via stdin/stdout.
// The interposer sits in that channel and intercepts every message:
//
//   Claude Code stdout → our stdin → [interposer] → child stdin  → child MCP server
//   Claude Code stdin  ← our stdout ← [interposer] ← child stdout ← child MCP server
//
// For tools/call: the interceptor evaluates the request (evaluate-only mode,
// same as the hook endpoint). If ALLOW → forward to child. If DENY/BLOCK →
// synthesise a JSON-RPC error and write it directly to our stdout; the child
// never sees the request.
//
// For every other method (initialize, tools/list, etc.): pass through to child
// unchanged. The child's response flows back through the outbound pipeline.
//
// Sequential processing: messages from Claude Code are processed one at a time
// via a promise chain queue. This prevents concurrent interceptor evaluations
// from interleaving writes on the outbound stream.
//
// All streams are injected — the class never touches process.stdin/stdout directly,
// which keeps it fully testable without spawning real processes.

import { createInterface } from 'node:readline';
import type { Readable, Writable } from 'node:stream';
import type { InterceptorOptions } from '../interceptor.js';
import { intercept } from '../interceptor.js';
import type { ToolCallEvent } from '../types.js';
import { parseMcpRequest, isToolsCall, extractToolCall, buildError, buildInternalError } from './mcp-message.js';
import { JSON_RPC } from './types.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface StdioInterposerConfig {
  /** Logical server ID used in ToolCallEvent — typically derived from the command name. */
  serverId:        string;
  /** Session ID for this wrap invocation — correlates all calls in the audit trail. */
  sessionId:       string;
  /** Agent ID for this wrap invocation — typically the invoking agent or 'wrap'. */
  agentId:         string;
  interceptorOpts: InterceptorOptions;
}

// ─── StdioInterposer ─────────────────────────────────────────────────────────

export class StdioInterposer {
  private readonly config:      StdioInterposerConfig;
  private readonly inbound:     Readable;  // our stdin  (Claude Code → us)
  private readonly outbound:    Writable;  // our stdout (us → Claude Code)
  private readonly upstreamIn:  Writable;  // child stdin  (us → MCP server)
  private readonly upstreamOut: Readable;  // child stdout (MCP server → us)

  // Promise-chain queue: ensures messages are processed strictly in order
  private processingQueue = Promise.resolve();

  constructor(
    config:      StdioInterposerConfig,
    inbound:     Readable,
    outbound:    Writable,
    upstreamIn:  Writable,
    upstreamOut: Readable,
  ) {
    this.config      = config;
    this.inbound     = inbound;
    this.outbound    = outbound;
    this.upstreamIn  = upstreamIn;
    this.upstreamOut = upstreamOut;
  }

  /**
   * Starts both pipelines. Returns a promise that resolves when BOTH the
   * inbound stream (Claude Code disconnects) AND the upstream stdout stream
   * (wrapped server exits) have closed.
   */
  start(): Promise<void> {
    return Promise.all([
      this.startInboundInterception(),
      this.startOutboundPassthrough(),
    ]).then(() => {});
  }

  // ── Outbound pipeline (child stdout → our stdout) ─────────────────────────
  // Pure passthrough — re-serialise each line so we maintain clean framing.

  private startOutboundPassthrough(): Promise<void> {
    return new Promise((resolve) => {
      const rl = createInterface({ input: this.upstreamOut, crlfDelay: Infinity });
      rl.on('line', (line) => {
        // Write the raw JSON line as-is — it is already serialized by the child process.
        // Do NOT pass through writeOutbound() which would JSON.stringify a second time.
        if (line.trim()) this.outbound.write(line + '\n');
      });
      rl.on('close', resolve);
    });
  }

  // ── Inbound pipeline (our stdin → interceptor → child stdin) ─────────────

  private startInboundInterception(): Promise<void> {
    return new Promise((resolve) => {
      const rl = createInterface({ input: this.inbound, crlfDelay: Infinity });

      rl.on('line', (line) => {
        // Enqueue — each message waits for the previous one to complete
        this.processingQueue = this.processingQueue.then(() => this.processLine(line));
      });

      rl.on('close', () => {
        // Wait for any in-progress evaluation before resolving
        this.processingQueue.then(resolve);
      });
    });
  }

  // ── Per-message processing ────────────────────────────────────────────────

  private async processLine(line: string): Promise<void> {
    if (!line.trim()) return;

    let body: unknown;
    try {
      body = JSON.parse(line);
    } catch {
      this.writeOutbound(buildError(null, JSON_RPC.PARSE_ERROR, 'Invalid JSON'));
      return;
    }

    const request = parseMcpRequest(body);
    if (!request) {
      this.writeOutbound(buildError(null, JSON_RPC.INVALID_REQUEST, 'Not a valid JSON-RPC 2.0 message'));
      return;
    }

    if (isToolsCall(request)) {
      await this.interceptToolCall(request);
    } else {
      // Pass all other messages (initialize, tools/list, ping, etc.) straight through
      this.writeUpstream(line);
    }
  }

  // ── Tool call interception ────────────────────────────────────────────────

  private async interceptToolCall(
    request: ReturnType<typeof parseMcpRequest> & object,
  ): Promise<void> {
    const { id } = request;

    const call = extractToolCall(request);
    if (!call) {
      this.writeOutbound(buildError(id, JSON_RPC.INVALID_REQUEST, 'tools/call params must include a "name" string'));
      return;
    }

    const event: ToolCallEvent = {
      sessionId: this.config.sessionId,
      agentId:   this.config.agentId,
      serverId:  this.config.serverId,
      toolName:  call.name,
      input:     call.input,
      timestamp: Date.now(),
    };

    // Evaluate-only: the ForwardFn returns immediately without calling any upstream.
    // If the interceptor allows the call, we forward the original request line ourselves.
    // If it blocks, we write a synthetic error and skip the child entirely.
    const evaluateOnly = async () => ({ output: null as unknown, durationMs: 0 });

    let result: Awaited<ReturnType<typeof intercept>>;
    try {
      result = await intercept(event, evaluateOnly, this.config.interceptorOpts);
    } catch (err) {
      this.writeOutbound(buildInternalError(id, err));
      return;
    }

    const { action, reason } = result.interceptorResult;

    if (action === 'ALLOW' || action === 'RATE_LIMIT') {
      // Forward the original request line to the child — child will respond naturally
      this.writeUpstream(JSON.stringify(request));
    } else {
      // DENY / BLOCKED_* / REQUIRE_APPROVAL → synthetic error, child never sees it
      const message = reason ?? `Blocked by Rind: ${action}`;
      this.writeOutbound(buildError(id, JSON_RPC.INTERNAL_ERROR, message));
    }
  }

  // ── Write helpers ─────────────────────────────────────────────────────────

  private writeOutbound(message: unknown): void {
    this.outbound.write(JSON.stringify(message) + '\n');
  }

  private writeUpstream(rawLine: string): void {
    this.upstreamIn.write(rawLine + '\n');
  }
}
