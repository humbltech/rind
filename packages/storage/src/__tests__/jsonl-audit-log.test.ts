import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { JsonlAuditLog } from '../jsonl-audit-log.js';

function makeTmpFile(): { path: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), 'rind-audit-test-'));
  const path = join(dir, 'audit.jsonl');
  return { path, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

describe('JsonlAuditLog', () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => { cleanups.splice(0).forEach((fn) => fn()); });

  it('append writes one JSON line per entry', async () => {
    const { path, cleanup } = makeTmpFile();
    cleanups.push(cleanup);
    const log = new JsonlAuditLog<{ action: string }>(path);

    log.append({ action: 'ALLOW' });
    log.append({ action: 'DENY' });

    // setImmediate + async appendFile — wait for both to flush
    await new Promise((r) => setTimeout(r, 100));

    const content = await readFile(path, 'utf-8');
    const lines = content.trim().split('\n').filter(Boolean);
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0]!)).toEqual({ action: 'ALLOW' });
    expect(JSON.parse(lines[1]!)).toEqual({ action: 'DENY' });
  });

  it('creates the file if it does not exist yet', async () => {
    const { path, cleanup } = makeTmpFile();
    cleanups.push(cleanup);
    const log = new JsonlAuditLog<{ x: number }>(path);
    log.append({ x: 1 });
    await new Promise((r) => setTimeout(r, 100));
    const content = await readFile(path, 'utf-8');
    expect(content.trim()).toBe('{"x":1}');
  });

  it('calls onError on I/O failure without throwing', async () => {
    const errors: unknown[] = [];
    const log = new JsonlAuditLog<{ x: number }>(
      '/dev/null/cannot-write/audit.jsonl',
      (err) => errors.push(err),
    );
    log.append({ x: 1 });
    await new Promise((r) => setTimeout(r, 100));
    expect(errors.length).toBeGreaterThan(0);
  });
});
