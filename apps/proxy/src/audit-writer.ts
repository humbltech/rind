// Append-only JSONL audit log — every policy decision written to disk.
// Writes are async (setImmediate) so they never block the proxy hot path.
// File survives proxy restarts, making the audit trail persistent.
//
// Format: one JSON object per line, UTF-8 encoded. Greppable via `jq`.
// On-ramp to SQLite (Phase 2) — import JSONL directly.

import { appendFile } from 'node:fs/promises';
import type { AuditEntry } from './types.js';

export class AuditWriter {
  constructor(
    private readonly filePath: string,
    private readonly onError: (err: unknown) => void = () => undefined,
  ) {}

  append(entry: AuditEntry): void {
    const line = JSON.stringify(entry) + '\n';
    // setImmediate defers the I/O past the current event-loop tick so the
    // proxy response is sent before the disk write begins.
    setImmediate(() => {
      appendFile(this.filePath, line, 'utf-8').catch((err: unknown) => {
        // Audit write failure is logged but NEVER blocks the proxy pipeline
        this.onError(err);
      });
    });
  }
}
