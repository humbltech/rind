// Lightweight fixture MCP server for integration tests and simulation --http mode.
// Implements the same /tool-call contract as a real upstream MCP server.
// Cassette wrapping is the caller's responsibility — pass pre-wrapped handlers.

import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import type { ServerType } from '@hono/node-server';
import type { Server as HttpServer } from 'node:http';

export interface ToolHandlerMap {
  [toolName: string]: (input: unknown) => Promise<unknown>;
}

export interface FixtureMcpServerOptions {
  port?: number;  // default: 3100
  handlers: ToolHandlerMap;
}

export interface FixtureMcpServer {
  start(): Promise<{ port: number; url: string; stop: () => Promise<void> }>;
}

export function createFixtureMcpServer(opts: FixtureMcpServerOptions): FixtureMcpServer {
  return {
    start: () =>
      new Promise((resolve, reject) => {
        const app = new Hono();

        app.post('/tool-call', async (c) => {
          const { toolName, input } = await c.req.json<{ toolName: string; input: unknown }>();
          const handler = opts.handlers[toolName];
          if (!handler) {
            return c.json({ output: null, error: `Unknown tool: ${toolName}` });
          }
          try {
            const output = await handler(input);
            return c.json({ output });
          } catch (err) {
            return c.json({ output: null, error: String(err) });
          }
        });

        const port = opts.port ?? 3100;

        const server: ServerType = serve({ fetch: app.fetch, port }, (info) => {
          const stop = (): Promise<void> =>
            new Promise((res, rej) => {
              const http = server as HttpServer;
              http.closeAllConnections();
              http.close((err) => (err ? rej(err) : res()));
            });
          resolve({ port: info.port, url: `http://localhost:${info.port}`, stop });
        });

        server.on('error', reject);
      }),
  };
}
