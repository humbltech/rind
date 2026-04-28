// @rind/storage — storage abstractions for the Rind event pipeline.
//
// IEventStore<T>: readable + writable capped event log.
//   Current impl: JsonlEventStore (JSONL file + in-memory ring buffer)
//   Future impl:  SqliteEventStore, SupabaseEventStore
//
// IAuditLog<T>: append-only write-through log.
//   Current impl: JsonlAuditLog
//   Future impl:  SqliteAuditLog, CloudAuditLog

// ─── Event store ─────────────────────────────────────────────────────────────

export interface IEventStore<T> {
  /** Add an event. Fire-and-forget for I/O — never blocks the caller. */
  push(item: T): void;

  /**
   * Find the first item matching the predicate and replace it with the
   * updater's return value. Returns true if an item was found and updated.
   *
   * Used to enrich events after the fact (e.g. adding outcome/threats once
   * a tool response arrives).
   */
  update(predicate: (item: T) => boolean, updater: (item: T) => T): boolean;

  /** All stored events in insertion order, oldest first. */
  toArray(): T[];

  /** Number of events currently stored. */
  get length(): number;

  /**
   * Warm up the in-memory state from the underlying store.
   * Must be called once at startup before accepting pushes.
   * In-memory-only implementations return 0 immediately.
   */
  load(): Promise<number>;
}

// ─── Audit log ───────────────────────────────────────────────────────────────

export interface IAuditLog<T> {
  /**
   * Append an entry. Fire-and-forget for I/O — never blocks the caller.
   * Errors are reported via the onError callback passed at construction,
   * never thrown.
   */
  append(entry: T): void;
}
