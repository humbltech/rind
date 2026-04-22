// PolicyStore — the single source of truth for active policy configuration (D-021).
//
// The PolicyEngine reads from a PolicyStore, not from a raw PolicyConfig.
// This architecture enables real-time policy updates (Phase 2) without changing
// the engine, interceptor, or callers:
//
//   Phase 1: InMemoryPolicyStore (loaded from YAML at startup, restart to reload)
//   Phase 2: ApiBackedPolicyStore (REST API calls store.update() → cache invalidation → next request sees new policies)
//   Phase 3: PersistentPolicyStore (DB-backed, pg_notify / Redis pub/sub for invalidation)

import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import type { PolicyConfig, PolicyRule } from '../types.js';

// ─── Interface ────────────────────────────────────────────────────────────────

export interface PolicyStore {
  /** Returns the current active PolicyConfig (may be a cached snapshot). */
  get(): PolicyConfig;

  /** Atomically replaces the active config and notifies all subscribers. */
  update(config: PolicyConfig): void;

  /** Subscribe to policy changes. Returns an unsubscribe function. */
  subscribe(callback: () => void): () => void;

  // ─ Convenience mutations (D-036: CRUD API support) ───────────────────────

  /** Appends a rule. Throws if a rule with the same name already exists. */
  addRule(rule: PolicyRule): void;

  /** Replaces the rule with the matching name. Throws if not found. */
  updateRule(name: string, rule: PolicyRule): void;

  /** Removes the rule with the given name. Returns false if not found. */
  removeRule(name: string): boolean;
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
  private persistPath?: string;

  constructor(config: PolicyConfig, persistPath?: string) {
    this.persistPath = persistPath;

    // If a persist path is set, merge persisted API rules with the base config
    if (persistPath) {
      const persisted = loadPersistedRules(persistPath);
      if (persisted.length > 0) {
        // Persisted rules are API-created — merge with YAML base config
        // API rules override YAML rules with the same name
        const yamlNames = new Set(config.policies.map((r) => r.name));
        const merged = [...config.policies];
        for (const rule of persisted) {
          if (yamlNames.has(rule.name)) {
            const idx = merged.findIndex((r) => r.name === rule.name);
            if (idx !== -1) merged[idx] = rule;
          } else {
            merged.push(rule);
          }
        }
        this.config = { policies: merged };
      } else {
        this.config = config;
      }
    } else {
      this.config = config;
    }
  }

  get(): PolicyConfig {
    return this.config;
  }

  update(config: PolicyConfig): void {
    this.config = config;
    this.persist();
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

  addRule(rule: PolicyRule): void {
    const exists = this.config.policies.some((r) => r.name === rule.name);
    if (exists) throw new Error(`Rule with name "${rule.name}" already exists`);
    this.update({ policies: [...this.config.policies, rule] });
  }

  updateRule(name: string, rule: PolicyRule): void {
    const idx = this.config.policies.findIndex((r) => r.name === name);
    if (idx === -1) throw new Error(`Rule "${name}" not found`);
    const updated = [...this.config.policies];
    updated[idx] = rule;
    this.update({ policies: updated });
  }

  removeRule(name: string): boolean {
    const next = this.config.policies.filter((r) => r.name !== name);
    if (next.length === this.config.policies.length) return false;
    this.update({ policies: next });
    return true;
  }

  private persist(): void {
    if (!this.persistPath) return;
    try {
      writeFileSync(this.persistPath, JSON.stringify(this.config.policies, null, 2), 'utf-8');
    } catch {
      // Persistence failure is non-fatal — policies remain in memory
    }
  }
}

function loadPersistedRules(filePath: string): PolicyRule[] {
  if (!existsSync(filePath)) return [];
  try {
    const raw = readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed as PolicyRule[];
  } catch {
    return [];
  }
}
