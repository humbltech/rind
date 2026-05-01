// Sim LLM server — mock Anthropic-compatible endpoint for HTTP demo mode.
//
// Purpose: let all LLM calls route through the REAL Rind proxy (for full dashboard
// visibility) without requiring a real Anthropic API key.
//
// How it works:
//   1. Start this server before running scenarios: `pnpm sim-llm` (port 4099 by default)
//   2. Start the proxy with: RIND_ANTHROPIC_UPSTREAM=http://localhost:4099
//   3. Run scenarios: `pnpm sim --http http://localhost:7777`
//
// Flow per agent-turn step:
//   scenario runner → POST /admin/scenario { turns } → loads turns into this server
//   scenario runner → POST /proxy/tool-call → real proxy → evaluates policy (dashboard!)
//   scenario runner → POST /llm/anthropic/v1/messages → real proxy → this server → mocked response
//
// The /admin/scenario endpoint replaces the current turn queue for the next scenario.
// Turns are served in order; the last turn is repeated if the agent takes more rounds.

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { ForwardLlmResult } from '@rind/proxy';

export interface SimLlmServer {
  port: number;
  stop: () => Promise<void>;
}

/**
 * Start the sim LLM server on the given port.
 * Returns a handle with a stop() method.
 */
export async function startSimLlmServer(port = 4099): Promise<SimLlmServer> {
  // Current turn queue — replaced on each POST /admin/scenario
  let turns: ForwardLlmResult[] = [];
  let turnIndex = 0;

  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    // Parse the body
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      const body = chunks.length > 0 ? Buffer.concat(chunks).toString('utf-8') : '';
      handleRequest(req, res, body);
    });
    req.on('error', () => {
      res.writeHead(500);
      res.end(JSON.stringify({ error: 'Request read error' }));
    });
  });

  function handleRequest(req: IncomingMessage, res: ServerResponse, rawBody: string): void {
    const url = req.url ?? '/';
    const method = req.method ?? 'GET';

    // ── Health check ──────────────────────────────────────────────────────
    if (method === 'GET' && url === '/health') {
      json(res, 200, { status: 'ok', queuedTurns: turns.length - turnIndex });
      return;
    }

    // ── Load scenario turns ───────────────────────────────────────────────
    // Called by the scenario runner before each agent-turn step.
    if (method === 'POST' && url === '/admin/scenario') {
      try {
        const payload = JSON.parse(rawBody) as { turns?: ForwardLlmResult[] };
        turns = payload.turns ?? [];
        turnIndex = 0;
        json(res, 200, { loaded: turns.length });
      } catch {
        json(res, 400, { error: 'Invalid JSON' });
      }
      return;
    }

    // ── Mock LLM endpoint — accepts any POST (Anthropic /v1/messages style) ──
    // The real Rind proxy forwards /llm/anthropic/v1/messages here.
    // We don't validate the request body — just return the next pre-recorded turn.
    if (method === 'POST') {
      if (turns.length === 0) {
        // No turns loaded — return a safe end_turn response so the agent loop exits cleanly
        json(res, 200, {
          id: 'sim-no-turns',
          type: 'message',
          role: 'assistant',
          content: [{ type: 'text', text: 'No scenario turns loaded.' }],
          model: 'claude-haiku-4-5-20251001',
          stop_reason: 'end_turn',
          usage: { input_tokens: 0, output_tokens: 5 },
        });
        return;
      }

      // Pop the next turn (stay on last if index exceeds)
      const turn = turns[Math.min(turnIndex, turns.length - 1)]!;
      turnIndex++;

      res.writeHead(turn.statusCode, {
        'content-type': 'application/json',
        ...turn.upstreamHeaders,
      });
      res.end(JSON.stringify(turn.responseBody));
      return;
    }

    json(res, 404, { error: 'Not found' });
  }

  function json(res: ServerResponse, status: number, body: unknown): void {
    const payload = JSON.stringify(body);
    res.writeHead(status, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) });
    res.end(payload);
  }

  await new Promise<void>((resolve, reject) => {
    server.listen(port, '127.0.0.1', () => resolve());
    server.on('error', reject);
  });

  return {
    port,
    stop: () => new Promise<void>((resolve, reject) => server.close((err) => err ? reject(err) : resolve())),
  };
}
