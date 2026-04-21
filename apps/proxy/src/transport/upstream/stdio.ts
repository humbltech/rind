// Stdio upstream client (D-040 Phase A3).
//
// Connects to an MCP server by spawning it as a child process and communicating
// over stdin/stdout. This is the most common pattern for local MCP servers
// (e.g. `npx @github/mcp-server`, `uvx mcp-server-sqlite`).
//
// Responsibility: speak MCP JSON-RPC to a stdio-hosted upstream process.
// Does NOT know about Rind policy, interceptors, or Hono. Pure transport.

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import type { UpstreamClient, ToolInfo } from './interface.js';
import type { StdioServerConfig } from '../types.js';

function isPlainObject(v: unknown): v is Record<string, unknown> {
  // Explicitly reject Date, RegExp, Error and other non-plain objects — they serialize
  // to empty objects during JSON.stringify/parse, silently corrupting tool output.
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return false;
  const proto = Object.getPrototypeOf(v) as unknown;
  return proto === Object.prototype || proto === null;
}

export class StdioUpstreamClient implements UpstreamClient {
  private readonly client: Client;
  private readonly transport: StdioClientTransport;
  private connected = false;

  constructor(config: StdioServerConfig) {
    this.client = new Client({ name: 'rind-proxy', version: '1.0.0' });

    this.transport = new StdioClientTransport({
      command: config.command,
      args:    config.args ?? [],
      env:     config.env,
      cwd:     config.cwd,
      // Pipe stderr so process errors don't leak to Claude Code's terminal
      stderr: 'pipe',
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
