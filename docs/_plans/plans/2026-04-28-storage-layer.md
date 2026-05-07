# Storage Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract the proxy's in-process event storage into `packages/storage` (`@rind/storage`) with clean `IEventStore<T>` and `IAuditLog<T>` interfaces so the backend can be swapped (JSONL → SQLite → cloud) without touching the proxy.

**Architecture:** `IEventStore<T>` covers push/read/update with an optional `load()` for persistence warm-up; `IAuditLog<T>` is append-only. `InMemoryEventStore<T>` implements `IEventStore<T>` using a capped circular array (ring buffer). `JsonlEventStore<T>` wraps `InMemoryEventStore<T>` with async JSONL durability. `JsonlAuditLog<T>` is the append-only JSONL writer. The proxy's `server.ts` types its storage variables as the interfaces, not the concrete classes — swapping to SQLite requires one line change per variable.

**Tech Stack:** TypeScript 5.4, tsup (ESM + `.d.ts`), vitest, `node:fs/promises`, pnpm workspaces.

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `packages/storage/package.json` | Package scaffold (`@rind/storage`) |
| Create | `packages/storage/tsconfig.json` | TypeScript config |
| Create | `packages/storage/src/interfaces.ts` | `IEventStore<T>`, `IAuditLog<T>` |
| Create | `packages/storage/src/in-memory-event-store.ts` | `InMemoryEventStore<T>` (ring buffer, no I/O) |
| Create | `packages/storage/src/jsonl-event-store.ts` | `JsonlEventStore<T>` (JSONL-backed, wraps InMemory) |
| Create | `packages/storage/src/jsonl-audit-log.ts` | `JsonlAuditLog<T>` (append-only JSONL) |
| Create | `packages/storage/src/index.ts` | Public API barrel |
| Create | `packages/storage/src/__tests__/in-memory-event-store.test.ts` | Contract tests |
| Create | `packages/storage/src/__tests__/jsonl-event-store.test.ts` | Persistence tests |
| Create | `packages/storage/src/__tests__/jsonl-audit-log.test.ts` | Audit log tests |
| Modify | `apps/proxy/package.json` | Add `@rind/storage: workspace:*` |
| Modify | `apps/proxy/src/server.ts` | Use interfaces + new concrete classes |
| Delete | `apps/proxy/src/ring-buffer.ts` | Absorbed into `InMemoryEventStore` |
| Delete | `apps/proxy/src/persistent-ring-buffer.ts` | Replaced by `JsonlEventStore` |
| Delete | `apps/proxy/src/audit-writer.ts` | Replaced by `JsonlAuditLog` |

---

## Task 1: Scaffold packages/storage

**Files:**
- Create: `packages/storage/package.json`
- Create: `packages/storage/tsconfig.json`
- Create: `packages/storage/src/index.ts` (empty stub for now)
- Modify: `apps/proxy/package.json`

- [ ] **Step 1: Create `packages/storage/package.json`**

```json
{
  "name": "@rind/storage",
  "version": "0.0.1",
  "type": "module",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "scripts": {
    "build": "tsup src/index.ts --format esm --dts",
    "dev": "tsup src/index.ts --format esm --dts --watch",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "tsup": "^8.0.0",
    "typescript": "^5.4.0",
    "vitest": "^2.0.0"
  }
}
```

- [ ] **Step 2: Create `packages/storage/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "noEmit": false,
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 3: Create empty `packages/storage/src/index.ts`**

```typescript
// @rind/storage — public API (populated in later tasks)
export {};
```

- [ ] **Step 4: Add `@rind/storage` to proxy dependencies**

Edit `apps/proxy/package.json` — add to `"dependencies"`:
```json
"@rind/storage": "workspace:*"
```

- [ ] **Step 5: Run pnpm install**

```bash
cd /Users/atinderpalsingh/projects/aegis-bundle/rind && pnpm install
```

Expected: lock file updates, workspace link created.

---

## Task 2: Create interfaces.ts

No tests needed — interfaces are pure TypeScript contracts with no runtime behaviour.

**Files:**
- Create: `packages/storage/src/interfaces.ts`

- [ ] **Step 1: Write the file**

```typescript
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
```

---

## Task 3: InMemoryEventStore with tests (TDD)

**Files:**
- Create: `packages/storage/src/in-memory-event-store.ts`
- Create: `packages/storage/src/__tests__/in-memory-event-store.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// packages/storage/src/__tests__/in-memory-event-store.test.ts
import { describe, it, expect } from 'vitest';
import { InMemoryEventStore } from '../in-memory-event-store.js';

describe('InMemoryEventStore', () => {
  it('push and toArray returns items in insertion order', () => {
    const store = new InMemoryEventStore<number>(10);
    store.push(1);
    store.push(2);
    store.push(3);
    expect(store.toArray()).toEqual([1, 2, 3]);
  });

  it('length tracks the number of stored items', () => {
    const store = new InMemoryEventStore<number>(10);
    expect(store.length).toBe(0);
    store.push(1);
    expect(store.length).toBe(1);
    store.push(2);
    expect(store.length).toBe(2);
  });

  it('overwrites oldest item when capacity is exceeded', () => {
    const store = new InMemoryEventStore<number>(3);
    store.push(1);
    store.push(2);
    store.push(3);
    store.push(4); // overwrites 1
    expect(store.toArray()).toEqual([2, 3, 4]);
    expect(store.length).toBe(3);
  });

  it('update finds and replaces the first matching item', () => {
    const store = new InMemoryEventStore<{ id: number; v: string }>(10);
    store.push({ id: 1, v: 'a' });
    store.push({ id: 2, v: 'b' });
    const found = store.update((e) => e.id === 1, (e) => ({ ...e, v: 'z' }));
    expect(found).toBe(true);
    expect(store.toArray()[0]).toEqual({ id: 1, v: 'z' });
    expect(store.toArray()[1]).toEqual({ id: 2, v: 'b' });
  });

  it('update returns false when no item matches', () => {
    const store = new InMemoryEventStore<{ id: number }>(10);
    store.push({ id: 1 });
    const found = store.update((e) => e.id === 99, (e) => e);
    expect(found).toBe(false);
  });

  it('load() resolves to 0 and is a no-op', async () => {
    const store = new InMemoryEventStore<number>(10);
    store.push(42);
    const loaded = await store.load();
    expect(loaded).toBe(0);
    expect(store.toArray()).toEqual([42]); // unchanged
  });

  it('toArray returns empty array when store is empty', () => {
    const store = new InMemoryEventStore<number>(10);
    expect(store.toArray()).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd /Users/atinderpalsingh/projects/aegis-bundle/rind && pnpm --filter @rind/storage test 2>&1 | tail -20
```

Expected: FAIL — `InMemoryEventStore` not found.

- [ ] **Step 3: Implement InMemoryEventStore**

```typescript
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
 * `load()` is a no-op — there is no persistence.
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
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd /Users/atinderpalsingh/projects/aegis-bundle/rind && pnpm --filter @rind/storage test 2>&1 | tail -10
```

Expected: `7 passed`.

---

## Task 4: JsonlEventStore with tests (TDD)

**Files:**
- Create: `packages/storage/src/jsonl-event-store.ts`
- Create: `packages/storage/src/__tests__/jsonl-event-store.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// packages/storage/src/__tests__/jsonl-event-store.test.ts
import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
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
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd /Users/atinderpalsingh/projects/aegis-bundle/rind && pnpm --filter @rind/storage test 2>&1 | tail -15
```

Expected: FAIL — `JsonlEventStore` not found.

- [ ] **Step 3: Implement JsonlEventStore**

```typescript
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

  constructor(opts: JsonlEventStoreOptions) {
    this.mem = new InMemoryEventStore<T>(opts.capacity);
    this.filePath = opts.filePath;
    this.onError = opts.onError ?? (() => undefined);
  }

  push(item: T): void {
    this.mem.push(item);
    const line = JSON.stringify(item) + '\n';
    appendFile(this.filePath, line, 'utf-8').catch((err: unknown) => this.onError(err));
  }

  update(predicate: (item: T) => boolean, updater: (item: T) => T): boolean {
    const found = this.mem.update(predicate, updater);
    if (found) {
      this.compact().catch((err: unknown) => this.onError(err));
    }
    return found;
  }

  toArray(): T[] {
    return this.mem.toArray();
  }

  get length(): number {
    return this.mem.length;
  }

  /**
   * Replay the JSONL file into memory. Call once at startup before push().
   * Malformed lines are skipped silently (partial writes from a crash).
   * Returns the number of events loaded.
   */
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

  /** Rewrite the file with current in-memory contents. Called after update(). */
  private async compact(): Promise<void> {
    const entries = this.mem.toArray();
    const content = entries.map((e) => JSON.stringify(e)).join('\n') + '\n';
    await writeFile(this.filePath, content, 'utf-8');
  }
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd /Users/atinderpalsingh/projects/aegis-bundle/rind && pnpm --filter @rind/storage test 2>&1 | tail -10
```

Expected: all tests pass (7 from Task 3 + 6 from this task = 13 total).

---

## Task 5: JsonlAuditLog with tests (TDD)

**Files:**
- Create: `packages/storage/src/jsonl-audit-log.ts`
- Create: `packages/storage/src/__tests__/jsonl-audit-log.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// packages/storage/src/__tests__/jsonl-audit-log.test.ts
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
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd /Users/atinderpalsingh/projects/aegis-bundle/rind && pnpm --filter @rind/storage test 2>&1 | tail -15
```

Expected: FAIL — `JsonlAuditLog` not found.

- [ ] **Step 3: Implement JsonlAuditLog**

```typescript
// packages/storage/src/jsonl-audit-log.ts
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
  constructor(
    private readonly filePath: string,
    private readonly onError: (err: unknown) => void = () => undefined,
  ) {}

  append(entry: T): void {
    const line = JSON.stringify(entry) + '\n';
    setImmediate(() => {
      appendFile(this.filePath, line, 'utf-8').catch((err: unknown) => {
        this.onError(err);
      });
    });
  }
}
```

- [ ] **Step 4: Run all tests to confirm they pass**

```bash
cd /Users/atinderpalsingh/projects/aegis-bundle/rind && pnpm --filter @rind/storage test 2>&1 | tail -10
```

Expected: all 16 tests pass.

---

## Task 6: Wire up index.ts and build

**Files:**
- Modify: `packages/storage/src/index.ts`

- [ ] **Step 1: Replace the empty stub**

```typescript
// @rind/storage — public API
export type { IEventStore, IAuditLog } from './interfaces.js';
export { InMemoryEventStore } from './in-memory-event-store.js';
export { JsonlEventStore } from './jsonl-event-store.js';
export { JsonlAuditLog } from './jsonl-audit-log.js';
```

- [ ] **Step 2: Build the package**

```bash
cd /Users/atinderpalsingh/projects/aegis-bundle/rind && pnpm --filter @rind/storage build
```

Expected: `dist/index.js` and `dist/index.d.ts` emitted with no errors.

- [ ] **Step 3: Commit the storage package**

```bash
cd /Users/atinderpalsingh/projects/aegis-bundle/rind
git add packages/storage/
git commit -m "Feat: add @rind/storage package with IEventStore and IAuditLog abstractions

InMemoryEventStore, JsonlEventStore, JsonlAuditLog implement the interfaces.
16 tests. Ready to wire into the proxy."
```

---

## Task 7: Wire proxy to @rind/storage + delete old files

**Files:**
- Modify: `apps/proxy/src/server.ts`
- Delete: `apps/proxy/src/ring-buffer.ts`
- Delete: `apps/proxy/src/persistent-ring-buffer.ts`
- Delete: `apps/proxy/src/audit-writer.ts`

- [ ] **Step 1: Update imports in server.ts**

Find the existing import block at the top of `apps/proxy/src/server.ts`:
```typescript
import { RingBuffer } from './ring-buffer.js';
import { PersistentRingBuffer } from './persistent-ring-buffer.js';
import { AuditWriter } from './audit-writer.js';
```

Replace those three lines with:
```typescript
import { type IEventStore, type IAuditLog, JsonlEventStore, JsonlAuditLog } from '@rind/storage';
```

- [ ] **Step 2: Update the three ring buffer instantiations**

Find:
```typescript
  const ringBuffer = new PersistentRingBuffer<ToolCallEvent>({
    capacity: config.ringBufferSize ?? 10_000,
    filePath: eventsLogPath,
    onError: (err) => logger.error({ err }, 'Event log write failed'),
  });
  // Hook events buffer — stores PostToolUse, SubagentStart/Stop for observability
  const hookEventBuffer = new PersistentRingBuffer<ProcessedHookEvent>({
    capacity: config.ringBufferSize ?? 10_000,
    filePath: hookEventsLogPath,
    onError: (err) => logger.error({ err }, 'Hook event log write failed'),
  });

  const auditWriter = new AuditWriter(auditLogPath, (err) => {
    logger.error({ err }, 'Audit write failed');
  });
```

Replace with:
```typescript
  const ringBuffer: IEventStore<ToolCallEvent> = new JsonlEventStore<ToolCallEvent>({
    capacity: config.ringBufferSize ?? 10_000,
    filePath: eventsLogPath,
    onError: (err) => logger.error({ err }, 'Event log write failed'),
  });
  // Hook events buffer — stores PostToolUse, SubagentStart/Stop for observability
  const hookEventBuffer: IEventStore<ProcessedHookEvent> = new JsonlEventStore<ProcessedHookEvent>({
    capacity: config.ringBufferSize ?? 10_000,
    filePath: hookEventsLogPath,
    onError: (err) => logger.error({ err }, 'Hook event log write failed'),
  });

  const auditWriter: IAuditLog<AuditEntry> = new JsonlAuditLog<AuditEntry>(auditLogPath, (err) => {
    logger.error({ err }, 'Audit write failed');
  });
```

- [ ] **Step 3: Update the llmRingBuffer inside the if-block**

Find:
```typescript
    const llmRingBuffer = new PersistentRingBuffer<LlmCallEvent>({
      capacity: config.ringBufferSize ?? 10_000,
```

Replace with:
```typescript
    const llmRingBuffer: IEventStore<LlmCallEvent> = new JsonlEventStore<LlmCallEvent>({
      capacity: config.ringBufferSize ?? 10_000,
```

- [ ] **Step 4: Update the recordProxyOutcome function signature**

Find (near line 1271):
```typescript
function recordProxyOutcome(
  correlationId: string,
  interceptorResult: import('./interceptor.js').InterceptorResult,
  ringBuffer: PersistentRingBuffer<ToolCallEvent>,
): void {
```

Replace with:
```typescript
function recordProxyOutcome(
  correlationId: string,
  interceptorResult: import('./interceptor.js').InterceptorResult,
  ringBuffer: IEventStore<ToolCallEvent>,
): void {
```

- [ ] **Step 5: Delete the three old files**

```bash
rm /Users/atinderpalsingh/projects/aegis-bundle/rind/apps/proxy/src/ring-buffer.ts
rm /Users/atinderpalsingh/projects/aegis-bundle/rind/apps/proxy/src/persistent-ring-buffer.ts
rm /Users/atinderpalsingh/projects/aegis-bundle/rind/apps/proxy/src/audit-writer.ts
```

- [ ] **Step 6: Typecheck the proxy**

```bash
cd /Users/atinderpalsingh/projects/aegis-bundle/rind && pnpm --filter @rind/proxy typecheck
```

Expected: zero errors. If errors appear, they will be in one of these categories:
- `PersistentRingBuffer` still referenced somewhere — search for it: `grep -r "PersistentRingBuffer\|RingBuffer\|AuditWriter" apps/proxy/src/ --include="*.ts"`
- A method missing from `IEventStore` — check the interface against the usage

---

## Task 8: Run tests, full build, commit

- [ ] **Step 1: Run proxy tests**

```bash
cd /Users/atinderpalsingh/projects/aegis-bundle/rind && pnpm --filter @rind/proxy test
```

Expected: all 370 tests pass.

- [ ] **Step 2: Full workspace build**

```bash
cd /Users/atinderpalsingh/projects/aegis-bundle/rind && pnpm build
```

Expected: all packages build cleanly.

- [ ] **Step 3: Commit**

```bash
cd /Users/atinderpalsingh/projects/aegis-bundle/rind
git add apps/proxy/ packages/storage/
git commit -m "Refactor: wire proxy to @rind/storage, delete raw storage files

server.ts now depends on IEventStore<T> and IAuditLog<T> interfaces.
JsonlEventStore and JsonlAuditLog are the JSONL-backed implementations.
ring-buffer.ts, persistent-ring-buffer.ts, audit-writer.ts deleted from proxy.
Future: swap to SqliteEventStore or SupabaseEventStore at the wiring point."
```

---

## Self-Review

**Spec coverage:**
- ✅ `IEventStore<T>` interface with push/update/toArray/length/load
- ✅ `IAuditLog<T>` interface with append
- ✅ `InMemoryEventStore<T>` — no I/O, ring-buffer semantics, load() is no-op
- ✅ `JsonlEventStore<T>` — JSONL durability, startup load, compact on update
- ✅ `JsonlAuditLog<T>` — setImmediate deferred writes, onError never throws
- ✅ Proxy wired to interfaces (not concrete classes)
- ✅ Old proxy files deleted
- ✅ Tests for all three implementations
- ✅ Build gate + commit in final task
- ✅ `@rind/storage` added to proxy's `package.json` dependencies in Task 1

**Placeholder scan:** No TBDs. All code blocks are complete.

**Type consistency:**
- `IEventStore<T>` used consistently in Task 2 (definition), Task 3 (`implements`), Task 4 (`implements`), Task 7 (server.ts variable types)
- `IAuditLog<T>` used consistently in Task 2 (definition), Task 5 (`implements`), Task 7 (server.ts)
- `JsonlEventStoreOptions` defined in Task 4 and used only in Task 4 — consistent
- `recordProxyOutcome` parameter changes from `PersistentRingBuffer<ToolCallEvent>` to `IEventStore<ToolCallEvent>` — handled in Task 7 Step 4
