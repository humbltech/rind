// packages/storage/src/in-memory-event-store.ts
import type { IEventStore } from './interfaces.js';

// ─── Internal ring buffer (not exported) ─────────────────────────────────────

class RingBuffer<T> {
  private buf: Array<T | undefined>;
  private head = 0;
  private size = 0;

  constructor(private readonly cap: number) {
    this.buf = new Array<T | undefined>(cap);
  }

  push(item: T): void {
    this.buf[this.head] = item;
    this.head = (this.head + 1) % this.cap;
    if (this.size < this.cap) this.size++;
  }

  toArray(): T[] {
    if (this.size === 0) return [];
    if (this.size < this.cap) return this.buf.slice(0, this.size) as T[];
    return [
      ...(this.buf.slice(this.head) as T[]),
      ...(this.buf.slice(0, this.head) as T[]),
    ];
  }

  update(predicate: (item: T) => boolean, updater: (item: T) => T): boolean {
    for (let i = 0; i < this.size; i++) {
      const idx = this.size < this.cap ? i : (this.head + i) % this.cap;
      const item = this.buf[idx];
      if (item !== undefined && predicate(item)) {
        this.buf[idx] = updater(item);
        return true;
      }
    }
    return false;
  }

  get length(): number {
    return this.size;
  }
}

// ─── Public class ─────────────────────────────────────────────────────────────

/**
 * In-memory event store backed by a capped ring buffer.
 * When capacity is exceeded, the oldest event is silently overwritten.
 * load() is a no-op — there is no persistence.
 * Use for tests and for embeddings that don't need restart durability.
 */
export class InMemoryEventStore<T> implements IEventStore<T> {
  private readonly ring: RingBuffer<T>;

  constructor(capacity: number) {
    this.ring = new RingBuffer<T>(capacity);
  }

  push(item: T): void {
    this.ring.push(item);
  }

  update(predicate: (item: T) => boolean, updater: (item: T) => T): boolean {
    return this.ring.update(predicate, updater);
  }

  toArray(): T[] {
    return this.ring.toArray();
  }

  get length(): number {
    return this.ring.length;
  }

  /** No-op — nothing to load. Returns 0. */
  async load(): Promise<number> {
    return 0;
  }
}
