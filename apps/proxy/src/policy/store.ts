// PolicyStore — the single source of truth for active policy configuration (D-021).
//
// The PolicyEngine reads from a PolicyStore, not from a raw PolicyConfig.
// This architecture enables real-time policy updates (Phase 2) without changing
// the engine, interceptor, or callers:
//
//   Phase 1: InMemoryPolicyStore (loaded from YAML at startup, restart to reload)
//   Phase 2: ApiBackedPolicyStore (REST API calls store.update() → cache invalidation → next request sees new policies)
//   Phase 3: PersistentPolicyStore (DB-backed, pg_notify / Redis pub/sub for invalidation)

import type { PolicyConfig } from '../types.js';

// ─── Interface ────────────────────────────────────────────────────────────────

export interface PolicyStore {
  /** Returns the current active PolicyConfig (may be a cached snapshot). */
  get(): PolicyConfig;

  /** Atomically replaces the active config and notifies all subscribers. */
  update(config: PolicyConfig): void;

  /** Subscribe to policy changes. Returns an unsubscribe function. */
  subscribe(callback: () => void): () => void;
}

// ─── Phase 1 implementation ───────────────────────────────────────────────────

/**
 * In-memory store backed by a PolicyConfig loaded at startup.
 *
 * Phase 1: YAML is loaded once. `update()` is wired for Phase 2 API mutations.
 * When the API calls `store.update(newConfig)`, the cached config is swapped
 * atomically and all subscribers (the PolicyEngine) are notified immediately.
 * From the next request onward, the new policies are active. No restart needed.
 */
export class InMemoryPolicyStore implements PolicyStore {
  private config: PolicyConfig;
  private subscribers: Array<() => void> = [];

  constructor(config: PolicyConfig) {
    this.config = config;
  }

  get(): PolicyConfig {
    return this.config;
  }

  update(config: PolicyConfig): void {
    this.config = config;
    for (const cb of this.subscribers) {
      try {
        cb();
      } catch {
        // Subscriber errors never crash the store or block other subscribers
      }
    }
  }

  subscribe(callback: () => void): () => void {
    this.subscribers.push(callback);
    return () => {
      const idx = this.subscribers.indexOf(callback);
      if (idx !== -1) this.subscribers.splice(idx, 1);
    };
  }
}
