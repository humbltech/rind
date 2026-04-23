// Persistent ring buffer — wraps RingBuffer with a JSONL file for durability.
// On startup, replays the last N entries from the file into the in-memory buffer.
// On every push, appends to the file asynchronously (never blocks the hot path).
//
// The JSONL file grows unbounded but is cheap to truncate/rotate externally.
// Phase 2: add automatic rotation (keep last N lines) or switch to SQLite.

import { appendFile, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { RingBuffer } from './ring-buffer.js';

export class PersistentRingBuffer<T> {
  private readonly buffer: RingBuffer<T>;
  private readonly filePath: string;
  private readonly onError: (err: unknown) => void;

  constructor(opts: {
    capacity: number;
    filePath: string;
    onError?: (err: unknown) => void;
  }) {
    this.buffer = new RingBuffer<T>(opts.capacity);
    this.filePath = opts.filePath;
    this.onError = opts.onError ?? (() => undefined);
  }

  // Load existing entries from disk into the in-memory buffer.
  // Call once at startup before accepting requests.
  async load(): Promise<number> {
    if (!existsSync(this.filePath)) return 0;

    try {
      const content = await readFile(this.filePath, 'utf-8');
      const lines = content.trim().split('\n').filter(Boolean);
      let loaded = 0;

      for (const line of lines) {
        try {
          const entry = JSON.parse(line) as T;
          this.buffer.push(entry);
          loaded++;
        } catch {
          // Skip malformed lines — partial writes from crash
        }
      }

      return loaded;
    } catch {
      return 0;
    }
  }

  push(item: T): void {
    this.buffer.push(item);

    // Async append — never blocks
    const line = JSON.stringify(item) + '\n';
    appendFile(this.filePath, line, 'utf-8').catch((err: unknown) => {
      this.onError(err);
    });
  }

  /** Find and update an item in-memory, then compact the file so the enriched
   *  version survives restarts. Without this, the JSONL only has the unenriched
   *  push — outcome/rule/source would revert to blank after every restart. */
  update(predicate: (item: T) => boolean, updater: (item: T) => T): boolean {
    const found = this.buffer.update(predicate, updater);
    if (found) {
      this.compact().catch((err: unknown) => this.onError(err));
    }
    return found;
  }

  toArray(): T[] {
    return this.buffer.toArray();
  }

  get length(): number {
    return this.buffer.length;
  }

  // Truncate the file to only contain current buffer contents.
  // Useful for cleanup after the buffer has wrapped around.
  async compact(): Promise<void> {
    const entries = this.buffer.toArray();
    const content = entries.map((e) => JSON.stringify(e)).join('\n') + '\n';
    await writeFile(this.filePath, content, 'utf-8');
  }
}
