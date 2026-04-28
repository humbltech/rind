import { appendFile } from 'node:fs/promises';
import type { IAuditLog } from './interfaces.js';

/**
 * Append-only JSONL audit log.
 *
 * Every append is deferred past the current event-loop tick via setImmediate
 * so the proxy response is sent before the disk write begins.
 * I/O errors are reported via onError and never thrown.
 *
 * Future backends (SQLite, cloud) implement IAuditLog<T> and are swapped
 * at the single wiring point in server.ts.
 */
export class JsonlAuditLog<T> implements IAuditLog<T> {
  private queue: Array<T> = [];
  private pending = false;

  constructor(
    private readonly filePath: string,
    private readonly onError: (err: unknown) => void = () => undefined,
  ) {}

  append(entry: T): void {
    this.queue.push(entry);
    if (!this.pending) {
      this.pending = true;
      setImmediate(() => {
        this.flush();
      });
    }
  }

  private async flush(): Promise<void> {
    const entries = this.queue.splice(0);
    const lines = entries.map((e) => JSON.stringify(e) + '\n').join('');
    try {
      await appendFile(this.filePath, lines, 'utf-8');
    } catch (err: unknown) {
      this.onError(err);
    }
    this.pending = false;
  }
}
