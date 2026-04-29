// packages/storage/src/jsonl-event-store.ts
import { appendFile, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import type { IEventStore } from './interfaces.js';
import { InMemoryEventStore } from './in-memory-event-store.js';

export interface JsonlEventStoreOptions {
  /** Max events kept in memory. Oldest is overwritten when exceeded. */
  capacity: number;
  /** Path to the JSONL file used for durability. Created if it doesn't exist. */
  filePath: string;
  /** Called on I/O errors. Never throws — errors are always reported here. */
  onError?: (err: unknown) => void;
}

/**
 * JSONL-backed event store.
 *
 * Reads:  in-memory only (fast, no I/O on hot path).
 * Writes: in-memory immediately + async JSONL append (fire-and-forget).
 * Update: in-memory immediately + async file compact (rewrites file with current state).
 * Load:   replays the JSONL file into memory at startup.
 *
 * The JSONL file grows unbounded. Future backends (SQLite, cloud) implement
 * the same IEventStore<T> interface and are swapped in one line.
 */
export class JsonlEventStore<T> implements IEventStore<T> {
  private readonly mem: InMemoryEventStore<T>;
  private readonly filePath: string;
  private readonly onError: (err: unknown) => void;
  private writeChain: Promise<void> = Promise.resolve();

  constructor(opts: JsonlEventStoreOptions) {
    this.mem = new InMemoryEventStore<T>(opts.capacity);
    this.filePath = opts.filePath;
    this.onError = opts.onError ?? (() => undefined);
  }

  push(item: T): void {
    this.mem.push(item);
    const line = JSON.stringify(item) + '\n';
    this.enqueueWrite(() => appendFile(this.filePath, line, 'utf-8'));
  }

  update(predicate: (item: T) => boolean, updater: (item: T) => T): boolean {
    const found = this.mem.update(predicate, updater);
    if (found) {
      this.enqueueWrite(() => this.compact());
    }
    return found;
  }

  toArray(): T[] {
    return this.mem.toArray();
  }

  get length(): number {
    return this.mem.length;
  }

  async load(): Promise<number> {
    if (!existsSync(this.filePath)) return 0;
    try {
      const content = await readFile(this.filePath, 'utf-8');
      const lines = content.trim().split('\n').filter(Boolean);
      let loaded = 0;
      for (const line of lines) {
        try {
          this.mem.push(JSON.parse(line) as T);
          loaded++;
        } catch {
          // Skip malformed line — partial write from crash
        }
      }
      return loaded;
    } catch {
      return 0;
    }
  }

  private enqueueWrite(fn: () => Promise<void>): void {
    this.writeChain = this.writeChain.then(fn).catch((err: unknown) => this.onError(err));
  }

  private async compact(): Promise<void> {
    const entries = this.mem.toArray();
    const content = entries.map((e) => JSON.stringify(e)).join('\n') + '\n';
    await writeFile(this.filePath, content, 'utf-8');
  }
}
