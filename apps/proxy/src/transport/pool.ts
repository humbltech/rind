// Upstream connection pool (D-040 Phase A3).
//
// Manages one UpstreamClient per registered server ID.
// Clients are created lazily — no connections are opened until the first request.
// The factory function is injected at construction time so tests can swap in
// mock clients without touching real network or process spawning.

import type { UpstreamClient } from './upstream/interface.js';
import type { UpstreamServerConfig, McpServerMap } from './types.js';

export type UpstreamClientFactory = (config: UpstreamServerConfig) => UpstreamClient;

export class UpstreamPool {
  private readonly servers: McpServerMap;
  private readonly createClient: UpstreamClientFactory;
  // Lazy map: serverId → connected client (created on first get())
  private readonly clients = new Map<string, UpstreamClient>();

  constructor(servers: McpServerMap, createClient: UpstreamClientFactory) {
    this.servers = servers;
    this.createClient = createClient;
  }

  /** Returns a connected client for the given server ID, or null if not configured. */
  get(serverId: string): UpstreamClient | null {
    if (this.clients.has(serverId)) {
      return this.clients.get(serverId)!;
    }

    const config = this.servers[serverId];
    if (!config) return null;

    const client = this.createClient(config);
    this.clients.set(serverId, client);
    return client;
  }

  /** Returns all server IDs that are registered in this pool. */
  serverIds(): string[] {
    return Object.keys(this.servers);
  }

  /** Returns true when the given server ID is registered. */
  has(serverId: string): boolean {
    return serverId in this.servers;
  }

  /** Closes all open upstream connections. */
  async closeAll(): Promise<void> {
    const closing = [...this.clients.values()].map((c) => c.close().catch(() => {}));
    await Promise.all(closing);
    this.clients.clear();
  }
}
