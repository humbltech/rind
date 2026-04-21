// HTTP upstream client (D-040 Phase A3).
//
// Connects to an MCP server over Streamable HTTP using the official SDK.
// One instance per upstream server URL — the pool manages lifecycle.
//
// Responsibility: speak MCP JSON-RPC to an HTTP-hosted upstream server.
// Does NOT know about Rind policy, interceptors, or Hono. Pure transport.

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { UpstreamClient, ToolInfo } from './interface.js';
import type { HttpServerConfig } from '../types.js';

function isPlainObject(v: unknown): v is Record<string, unknown> {
  // Explicitly reject Date, RegExp, Error and other non-plain objects — they serialize
  // to empty objects during JSON.stringify/parse, silently corrupting tool output.
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return false;
  const proto = Object.getPrototypeOf(v) as unknown;
  return proto === Object.prototype || proto === null;
}

export class HttpUpstreamClient implements UpstreamClient {
  private readonly client: Client;
  private readonly transport: StreamableHTTPClientTransport;
  private connected = false;

  constructor(config: HttpServerConfig) {
    this.client = new Client({ name: 'rind-proxy', version: '1.0.0' });

    const headers: Record<string, string> = config.headers ?? {};
    this.transport = new StreamableHTTPClientTransport(new URL(config.url), {
      requestInit: { headers },
    });
  }

  private async ensureConnected(): Promise<void> {
    if (this.connected) return;
    await this.client.connect(this.transport);
    this.connected = true;
  }

  async listTools(): Promise<ToolInfo[]> {
    await this.ensureConnected();
    const response = await this.client.listTools();
    return response.tools.map((t) => ({
      name:        t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    }));
  }

  async callTool(name: string, input: unknown): Promise<unknown> {
    await this.ensureConnected();
    // MCP tool arguments must be a plain object. Coerce non-objects to {} rather
    // than casting — avoids sending a malformed arguments payload to the upstream.
    const args = isPlainObject(input) ? (input as Record<string, unknown>) : {};
    const result = await this.client.callTool({ name, arguments: args });
    return result;
  }

  async close(): Promise<void> {
    if (!this.connected) return;
    await this.client.close();
    this.connected = false;
  }
}
