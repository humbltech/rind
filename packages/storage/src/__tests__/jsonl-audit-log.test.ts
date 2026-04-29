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

  it('re-schedules flush when entries arrive during in-flight write', async () => {
    const { path, cleanup } = makeTmpFile();
    cleanups.push(cleanup);
    const log = new JsonlAuditLog<{ seq: number }>(path);

    // Append entry 1 — schedules setImmediate for flush
    log.append({ seq: 1 });

    // Yield so the setImmediate fires and flush() begins (appendFile is now in-flight)
    await new Promise((r) => setImmediate(r));

    // Append entry 2 while appendFile is still awaiting — pending is true so no new
    // setImmediate is scheduled here; the re-schedule fix picks this up after the write
    log.append({ seq: 2 });

    // Wait for both flush cycles to complete
    await new Promise((r) => setTimeout(r, 200));

    const content = await readFile(path, 'utf-8');
    const lines = content.trim().split('\n').filter(Boolean);
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0]!)).toEqual({ seq: 1 });
    expect(JSON.parse(lines[1]!)).toEqual({ seq: 2 });
  });
});
