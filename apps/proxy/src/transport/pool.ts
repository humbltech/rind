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

  /**
   * Registers a new upstream server at runtime, or replaces an existing one.
   * If a client is already open for this ID it is closed before the new config takes effect.
   */
  register(id: string, config: UpstreamServerConfig): void {
    const existing = this.clients.get(id);
    if (existing) {
      existing.close().catch(() => undefined);
      this.clients.delete(id);
    }
    this.servers[id] = config;
  }

  /**
   * Removes a server and closes its upstream connection.
   * Safe to call when no client is open — no-op on the connection side in that case.
   */
  async unregister(id: string): Promise<void> {
    const client = this.clients.get(id);
    if (client) {
      await client.close();
      this.clients.delete(id);
    }
    delete this.servers[id];
  }

  /** Returns all registered server IDs and their configs (credentials not stripped here — callers must redact before exposing via API). */
  list(): Array<{ id: string; config: UpstreamServerConfig }> {
    return Object.entries(this.servers).map(([id, config]) => ({ id, config }));
  }

  /**
   * Closes all open upstream connections.
   * Errors from individual clients are collected rather than swallowed — the caller
   * receives an AggregateError if any close failed, enabling logging at the call site.
   */
  async closeAll(): Promise<void> {
    const results = await Promise.allSettled(
      [...this.clients.values()].map((c) => c.close()),
    );
    this.clients.clear();

    const errors = results
      .filter((r): r is PromiseRejectedResult => r.status === 'rejected')
      .map((r) => r.reason as unknown);

    if (errors.length > 0) {
      throw new AggregateError(errors, `${errors.length} upstream client(s) failed to close cleanly`);
    }
  }
}
