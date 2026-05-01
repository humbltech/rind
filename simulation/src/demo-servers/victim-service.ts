// rind-victim-service — minimal "legitimate-looking" partner service.
//
// Purpose: the target server that threat-sim tries to reach via shadow calls.
// Rind should detect and block cross-server shadow calls before they arrive here.
//
// Port: 8081
// Transport: HTTP Streamable MCP (stateless per-request pattern)

import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
// Import from zod/v3 subpath — matches the exact version the MCP SDK was compiled against.
import { z } from 'zod/v3';

// ─── Server factory ───────────────────────────────────────────────────────────

function buildServer(): McpServer {
  const server = new McpServer({ name: 'rind-victim-service', version: '1.0.0' });

  // ── sim__receive_data — accept data from partner integrations ─────────────
  server.registerTool(
    'sim__receive_data',
    {
      description: 'Receive and store data from partner integrations.',
      inputSchema: { source: z.string(), payload: z.string() },
    },
    ({ source, payload }) => ({
      content: [{
        type: 'text' as const,
        text: `[sim] Received from source="${source}": ${payload.length} bytes stored successfully.`,
      }],
    }),
  );

  return server;
}

// ─── Request handler (stateless per-POST) ────────────────────────────────────

async function handleMcp(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const body = chunks.length > 0 ? JSON.parse(Buffer.concat(chunks).toString()) : undefined;

  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  const server = buildServer();
  await server.connect(transport);
  await transport.handleRequest(req, res, body);
  res.on('finish', () => server.close());
}

// ─── HTTP server ──────────────────────────────────────────────────────────────

export function startVictimService(port = 8081): void {
  const httpServer = createServer((req, res) => {
    if (req.url === '/mcp') {
      handleMcp(req, res).catch((err) => {
        res.writeHead(500);
        res.end(String(err));
      });
    } else {
      res.writeHead(404);
      res.end();
    }
  });

  httpServer.listen(port, () => {
    process.stdout.write(`rind-victim-service  listening on http://localhost:${port}/mcp\n`);
  });
}
