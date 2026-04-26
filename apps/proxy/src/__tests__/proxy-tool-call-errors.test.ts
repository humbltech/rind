import { describe, it, expect } from 'vitest';
import { createProxyServer } from '../lib.js';

async function callWithError(throwFn: () => never) {
  const { app } = createProxyServer({
    port: 0,
    agentId: 'test-agent',
    upstreamMcpUrl: 'http://mock-unused',
    forwardFn: async () => throwFn(),
    logLevel: 'error',
    policy: { policies: [] }, // prevents .rind/policies.json from being loaded
  });

  const res = await app.request('/proxy/tool-call', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionId: 'test-session',
      serverId: 'test-server',
      toolName: 'db.execute',
      input: { sql: 'SELECT 1' },
    }),
  });

  const body = await res.json() as { content: Array<{ type: string; text: string }>; isError: boolean };
  const logsRes = await app.request('/logs/tool-calls');
  const events = await logsRes.json() as Array<{ toolName: string; outcome?: string; source?: string }>;
  const entry = events.find((e) => e.toolName === 'db.execute');

  return { res, body, entry };
}

describe('/proxy/tool-call — upstream error handling', () => {
  it('returns HTTP 200 with isError:true when upstream is unreachable', async () => {
    const { res, body } = await callWithError(() => {
      throw new Error('fetch failed: connect ECONNREFUSED 127.0.0.1:3100');
    });

    expect(res.status).toBe(200);
    expect(body.isError).toBe(true);
    expect(body.content).toHaveLength(1);
    const [first] = body.content;
    expect(first?.type).toBe('text');
    expect(first?.text).toContain('db.execute');
    expect(first?.text).toContain('unavailable');
  });

  it('records outcome:upstream-error and source:proxy in ring buffer', async () => {
    const { entry } = await callWithError(() => {
      throw new Error('fetch failed');
    });

    expect(entry?.outcome).toBe('upstream-error');
    expect(entry?.source).toBe('proxy');
  });

  it('returns HTTP 200 with timed-out message when upstream times out', async () => {
    const { res, body, entry } = await callWithError(() => {
      const err = new Error('The operation was aborted');
      err.name = 'AbortError';
      throw err;
    });

    expect(res.status).toBe(200);
    expect(body.isError).toBe(true);
    const [first] = body.content;
    expect(first?.text).toContain('timed out');
    expect(entry?.outcome).toBe('upstream-timeout');
    expect(entry?.source).toBe('proxy');
  });
});

describe('/proxy/tool-call — happy path source', () => {
  it('records source:mcp in ring buffer when upstream succeeds', async () => {
    const { app } = createProxyServer({
      port: 0,
      agentId: 'test-agent',
      upstreamMcpUrl: 'http://mock-unused',
      forwardFn: async () => ({ output: { rows: [] }, durationMs: 5 }),
      logLevel: 'error',
      policy: { policies: [] },
    });

    await app.request('/proxy/tool-call', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: 'test-session',
        serverId: 'test-server',
        toolName: 'db.execute',
        input: { sql: 'SELECT 1' },
      }),
    });

    const logsRes = await app.request('/logs/tool-calls');
    const events = await logsRes.json() as Array<{ toolName: string; source?: string }>;
    const entry = events.find((e) => e.toolName === 'db.execute');
    expect(entry?.source).toBe('mcp');
  });
});
