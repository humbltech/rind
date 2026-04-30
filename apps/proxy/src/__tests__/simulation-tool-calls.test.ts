// Tool call simulation — integration tests for the hook evaluation path.
//
// Tests the full pipeline from POST /hook/evaluate through policy engine,
// event recording, and log retrieval. No mocked forwarding needed — the
// hook path is evaluate-only and never touches an upstream MCP server.

import { describe, it, expect } from 'vitest';
import { createProxyServer } from '../lib.js';
import type { PolicyRule } from '../types.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function createApp(policies: PolicyRule[]) {
  return createProxyServer({
    port: 0,
    agentId: 'sim-agent',
    upstreamMcpUrl: 'http://mock-unused',
    logLevel: 'error',
    policy: { policies },
  }).app;
}

function hookPayload(
  toolName: string,
  toolInput: Record<string, unknown> = {},
  sessionId = 'sim-session',
) {
  return {
    session_id: sessionId,
    hook_event_name: 'PreToolUse',
    tool_name: toolName,
    tool_input: toolInput,
  };
}

async function evaluate(
  app: ReturnType<typeof createApp>,
  toolName: string,
  toolInput: Record<string, unknown> = {},
  sessionId = 'sim-session',
) {
  const res = await app.request('/hook/evaluate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(hookPayload(toolName, toolInput, sessionId)),
  });
  const body = await res.json() as Record<string, unknown>;
  return { res, body };
}

async function getEvents(app: ReturnType<typeof createApp>) {
  const res = await app.request('/logs/tool-calls');
  return res.json() as Promise<Array<Record<string, unknown>>>;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('/hook/evaluate — tool call simulation', () => {
  it('ALLOW — no rules → permissionDecision: allow', async () => {
    const app = createApp([]);
    const { body } = await evaluate(app, 'Bash', { command: 'ls' });
    const out = body['hookSpecificOutput'] as Record<string, unknown>;
    expect(out['permissionDecision']).toBe('allow');
  });

  it('DENY by tool name → continue: false', async () => {
    const app = createApp([{
      name: 'block-bash', agent: '*',
      match: { tool: ['Bash'] }, action: 'DENY', priority: 10,
    }]);
    const { body } = await evaluate(app, 'Bash', { command: 'echo hello' });
    expect(body['continue']).toBe(false);
    expect(typeof body['stopReason']).toBe('string');
  });

  it('DENY by parameter contains match', async () => {
    const app = createApp([{
      name: 'block-rm-rf', agent: '*',
      match: { tool: ['Bash'], parameters: { command: { contains: ['rm -rf'] } } },
      action: 'DENY', priority: 10,
    }]);
    const { body: denied } = await evaluate(app, 'Bash', { command: 'rm -rf /tmp' });
    expect(denied['continue']).toBe(false);
  });

  it('ALLOW when parameter does not match contains rule', async () => {
    const app = createApp([{
      name: 'block-rm-rf', agent: '*',
      match: { tool: ['Bash'], parameters: { command: { contains: ['rm -rf'] } } },
      action: 'DENY', priority: 10,
    }]);
    const { body } = await evaluate(app, 'Bash', { command: 'ls -la' });
    const out = body['hookSpecificOutput'] as Record<string, unknown>;
    expect(out['permissionDecision']).toBe('allow');
  });

  it('DENY by subcommand match', async () => {
    const app = createApp([{
      name: 'block-force-push', agent: '*',
      match: { tool: ['Bash'], subcommand: ['git push --force'] },
      action: 'DENY', priority: 10,
    }]);
    const { body } = await evaluate(app, 'Bash', { command: 'git push --force origin main' });
    expect(body['continue']).toBe(false);
  });

  it('ALLOW when subcommand does not match', async () => {
    const app = createApp([{
      name: 'block-force-push', agent: '*',
      match: { tool: ['Bash'], subcommand: ['git push --force'] },
      action: 'DENY', priority: 10,
    }]);
    const { body } = await evaluate(app, 'Bash', { command: 'git status' });
    const out = body['hookSpecificOutput'] as Record<string, unknown>;
    expect(out['permissionDecision']).toBe('allow');
  });

  it('DENY by toolPattern glob', async () => {
    const app = createApp([{
      name: 'block-postgres', agent: '*',
      match: { toolPattern: 'mcp__postgres__*' },
      action: 'DENY', priority: 10,
    }]);
    const { body } = await evaluate(app, 'mcp__postgres__query', { sql: 'SELECT 1' });
    expect(body['continue']).toBe(false);
  });

  it('ALLOW tool not matching glob', async () => {
    const app = createApp([{
      name: 'block-postgres', agent: '*',
      match: { toolPattern: 'mcp__postgres__*' },
      action: 'DENY', priority: 10,
    }]);
    const { body } = await evaluate(app, 'mcp__github__create_issue', {});
    const out = body['hookSpecificOutput'] as Record<string, unknown>;
    expect(out['permissionDecision']).toBe('allow');
  });

  it('MCP tool classified as source:mcp with correct serverId', async () => {
    const app = createApp([{
      name: 'block-slack', agent: '*',
      match: { tool: ['mcp__slack__send_message'] }, action: 'DENY', priority: 10,
    }]);
    await evaluate(app, 'mcp__slack__send_message', {});
    const events = await getEvents(app);
    const event = events.find((e) => e['toolName'] === 'mcp__slack__send_message');
    expect(event?.['source']).toBe('mcp');
    expect(event?.['serverId']).toBe('slack');
  });

  it('builtin tool classified as source:builtin', async () => {
    const app = createApp([]);
    await evaluate(app, 'Bash', { command: 'ls' });
    const events = await getEvents(app);
    const event = events.find((e) => e['toolName'] === 'Bash');
    expect(event?.['source']).toBe('builtin');
  });

  it('multiple calls all appear in logs', async () => {
    const app = createApp([{
      name: 'block-bash', agent: '*',
      match: { tool: ['Bash'] }, action: 'DENY', priority: 10,
    }]);
    await evaluate(app, 'Write', { path: 'a.txt', content: 'hi' });
    await evaluate(app, 'Read', { path: 'a.txt' });
    await evaluate(app, 'Bash', { command: 'rm a.txt' });
    const events = await getEvents(app);
    expect(events.length).toBeGreaterThanOrEqual(3);
  });

  it('event has required fields', async () => {
    const app = createApp([]);
    await evaluate(app, 'Read', { path: 'file.txt' }, 'my-session');
    const events = await getEvents(app);
    const event = events.find((e) => e['toolName'] === 'Read');
    expect(event).toBeDefined();
    expect(typeof event?.['timestamp']).toBe('number');
    expect(event?.['sessionId']).toBe('my-session');
    expect(event?.['agentId']).toBeTruthy();
    expect(event?.['toolName']).toBe('Read');
  });

  it('custom session_id is propagated to event', async () => {
    const app = createApp([]);
    await evaluate(app, 'Read', {}, 'custom-session-abc');
    const events = await getEvents(app);
    const event = events.find((e) => e['sessionId'] === 'custom-session-abc');
    expect(event).toBeDefined();
  });

  it('DENY response includes stopReason', async () => {
    const app = createApp([{
      name: 'block-write', agent: '*',
      match: { tool: ['Write'] }, action: 'DENY', priority: 10,
    }]);
    const { body } = await evaluate(app, 'Write', { path: 'x', content: 'y' });
    expect(body['continue']).toBe(false);
    expect(typeof body['stopReason']).toBe('string');
    expect((body['stopReason'] as string).length).toBeGreaterThan(0);
  });
});
