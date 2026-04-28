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
