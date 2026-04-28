import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { JsonlEventStore } from '../jsonl-event-store.js';

function makeTmpFile(): { path: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), 'rind-storage-test-'));
  const path = join(dir, 'events.jsonl');
  return { path, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

describe('JsonlEventStore', () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => { cleanups.splice(0).forEach((fn) => fn()); });

  it('push stores in memory and appends to file', async () => {
    const { path, cleanup } = makeTmpFile();
    cleanups.push(cleanup);
    const store = new JsonlEventStore<{ n: number }>({ capacity: 10, filePath: path });

    store.push({ n: 1 });
    store.push({ n: 2 });

    expect(store.toArray()).toEqual([{ n: 1 }, { n: 2 }]);

    // Wait for async file writes to flush
    await new Promise((r) => setTimeout(r, 50));
    const content = await readFile(path, 'utf-8');
    const lines = content.trim().split('\n').filter(Boolean);
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0]!)).toEqual({ n: 1 });
    expect(JSON.parse(lines[1]!)).toEqual({ n: 2 });
  });

  it('load() replays events from file into memory', async () => {
    const { path, cleanup } = makeTmpFile();
    cleanups.push(cleanup);

    const storeA = new JsonlEventStore<{ n: number }>({ capacity: 10, filePath: path });
    storeA.push({ n: 10 });
    storeA.push({ n: 20 });
    await new Promise((r) => setTimeout(r, 50));

    // New store instance — simulates restart
    const storeB = new JsonlEventStore<{ n: number }>({ capacity: 10, filePath: path });
    const loaded = await storeB.load();

    expect(loaded).toBe(2);
    expect(storeB.toArray()).toEqual([{ n: 10 }, { n: 20 }]);
  });

  it('load() returns 0 and is safe when file does not exist', async () => {
    const { path, cleanup } = makeTmpFile();
    cleanups.push(cleanup);
    // Do NOT write the file
    const store = new JsonlEventStore<{ n: number }>({ capacity: 10, filePath: path });
    const loaded = await store.load();
    expect(loaded).toBe(0);
    expect(store.toArray()).toEqual([]);
  });

  it('load() skips malformed lines without throwing', async () => {
    const { path, cleanup } = makeTmpFile();
    cleanups.push(cleanup);

    const { writeFile } = await import('node:fs/promises');
    await writeFile(path, '{"n":1}\nNOT_JSON\n{"n":3}\n', 'utf-8');

    const store = new JsonlEventStore<{ n: number }>({ capacity: 10, filePath: path });
    const loaded = await store.load();
    expect(loaded).toBe(2);
    expect(store.toArray()).toEqual([{ n: 1 }, { n: 3 }]);
  });

  it('update modifies in memory and compacts the file', async () => {
    const { path, cleanup } = makeTmpFile();
    cleanups.push(cleanup);

    const store = new JsonlEventStore<{ id: number; done: boolean }>({ capacity: 10, filePath: path });
    store.push({ id: 1, done: false });
    store.push({ id: 2, done: false });
    await new Promise((r) => setTimeout(r, 50));

    const found = store.update((e) => e.id === 1, (e) => ({ ...e, done: true }));
    expect(found).toBe(true);
    expect(store.toArray()[0]).toEqual({ id: 1, done: true });

    // Wait for compact to finish
    await new Promise((r) => setTimeout(r, 100));
    const content = await readFile(path, 'utf-8');
    const lines = content.trim().split('\n').filter(Boolean);
    expect(JSON.parse(lines[0]!)).toEqual({ id: 1, done: true });
  });

  it('onError is called when file write fails, not thrown', async () => {
    const errors: unknown[] = [];
    const store = new JsonlEventStore<{ n: number }>({
      capacity: 10,
      filePath: '/dev/null/cannot-write-here/events.jsonl',
      onError: (err) => errors.push(err),
    });
    store.push({ n: 1 });
    await new Promise((r) => setTimeout(r, 100));
    expect(errors.length).toBeGreaterThan(0);
    expect(store.toArray()).toEqual([{ n: 1 }]); // in-memory still works
  });
});
