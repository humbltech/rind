import { describe, it, expect, afterEach } from 'vitest';
import { createFixtureMcpServer } from '../fixture/index.js';

let stopFn: (() => Promise<void>) | undefined;

afterEach(async () => {
  if (stopFn) { await stopFn(); stopFn = undefined; }
});

describe('createFixtureMcpServer', () => {
  it('starts and responds to a known tool', async () => {
    const fixture = createFixtureMcpServer({
      handlers: {
        'db.execute': async (input) => ({ rows: [], input }),
      },
    });

    const { url, stop } = await fixture.start();
    stopFn = stop;

    const res = await fetch(`${url}/tool-call`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ toolName: 'db.execute', input: { sql: 'SELECT 1' } }),
    });

    expect(res.status).toBe(200);
    const body = await res.json() as { output: { rows: unknown[]; input: unknown } };
    expect(body.output.rows).toEqual([]);
    expect(body.output.input).toEqual({ sql: 'SELECT 1' });
  });

  it('returns an error body (not 4xx/5xx) for an unknown tool', async () => {
    const fixture = createFixtureMcpServer({ handlers: {} });
    const { url, stop } = await fixture.start();
    stopFn = stop;

    const res = await fetch(`${url}/tool-call`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ toolName: 'unknown.tool', input: {} }),
    });

    expect(res.status).toBe(200);
    const body = await res.json() as { output: null; error: string };
    expect(body.output).toBeNull();
    expect(body.error).toContain('unknown.tool');
  });

  it('starts on a custom port', async () => {
    const fixture = createFixtureMcpServer({
      port: 19877,
      handlers: { 'ping': async () => 'pong' },
    });
    const { port, url, stop } = await fixture.start();
    stopFn = stop;

    expect(port).toBe(19877);
    expect(url).toBe('http://localhost:19877');

    const res = await fetch(`${url}/tool-call`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ toolName: 'ping', input: {} }),
    });
    const body = await res.json() as { output: string };
    expect(body.output).toBe('pong');
  });

  it('stops cleanly and rejects subsequent requests', async () => {
    const fixture = createFixtureMcpServer({
      port: 19878,
      handlers: { 'ping': async () => 'pong' },
    });
    const { url, stop } = await fixture.start();
    await stop();

    await expect(
      fetch(`${url}/tool-call`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
    ).rejects.toThrow();
  });
});
