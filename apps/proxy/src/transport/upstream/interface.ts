// UpstreamClient interface — the contract every upstream transport must satisfy.
//
// Keeping this in its own file means:
//  - The pool can import just the interface (no transport deps)
//  - The gateway can import just the interface (no transport deps)
//  - Concrete clients (stdio, http) implement the interface independently
//  - Tests can use any object that satisfies the interface

import type { ToolInfo } from '../mcp-message.js';

export type { ToolInfo };

export interface UpstreamClient {
  /**
   * Fetches the list of tools the upstream server exposes.
   * The first call may trigger the MCP initialization handshake.
   */
  listTools(): Promise<ToolInfo[]>;

  /**
   * Calls a tool on the upstream server and returns its output.
   * Input is the raw `arguments` object from the tools/call request.
   */
  callTool(name: string, input: unknown): Promise<unknown>;

  /**
   * Closes the connection to the upstream server.
   * After this, listTools() and callTool() must not be called.
   */
  close(): Promise<void>;
}
