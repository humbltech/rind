// In-memory ring buffer — capped circular array for the in-process event log.
// When the buffer is full, the oldest entry is overwritten.
// GET /logs/tool-calls returns toArray() — the full contents in insertion order.

export class RingBuffer<T> {
  private buf: Array<T | undefined>;
  private head = 0; // index of next write slot
  private size = 0; // number of items currently stored

  constructor(private readonly cap: number) {
    this.buf = new Array<T | undefined>(cap);
  }

  push(item: T): void {
    this.buf[this.head] = item;
    this.head = (this.head + 1) % this.cap;
    if (this.size < this.cap) this.size++;
  }

  /** Returns all items in insertion order (oldest first). */
  toArray(): T[] {
    if (this.size === 0) return [];
    if (this.size < this.cap) {
      // Buffer not yet full — items are at indices 0..size-1
      return this.buf.slice(0, this.size) as T[];
    }
    // Full: oldest item is at `head`, newest at `head - 1`
    return [
      ...(this.buf.slice(this.head) as T[]),
      ...(this.buf.slice(0, this.head) as T[]),
    ];
  }

  /** Find the first item matching a predicate and update it in-place. Returns true if found. */
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
