// Integration tests for hook+proxy event deduplication.
//
// Verifies that when both paths observe the same MCP tool call, the ring buffer
// ends up with exactly one merged row rather than two duplicates.

import { describe, it, expect, beforeEach } from 'vitest';
import { MergeCorrelator } from '../merge-correlator.js';
import { normalizeToolName } from '../hooks/tool-name.js';

// Minimal IEventStore for test isolation
function makeRingBuffer<T>() {
  const items: T[] = [];
  return {
    push: (item: T) => items.push(item),
    update: (pred: (i: T) => boolean, fn: (i: T) => T) => {
      const idx = items.findIndex(pred);
      if (idx === -1) return false;
      items[idx] = fn(items[idx]!);
      return true;
    },
    toArray: () => [...items],
    get length() { return items.length; },
    load: async () => 0,
  };
}

type MinEvent = {
  correlationId?: string;
  agentId: string;
  source?: string;
  cwd?: string;
  observedBy?: string[];
  response?: { outputPreview?: string; threats?: unknown[]; timestamp: number };
};

describe('hook + proxy dedup integration', () => {
  let mc: MergeCorrelator;
  let mergedCorrIds: Map<string, string>;
  let ringBuffer: ReturnType<typeof makeRingBuffer<MinEvent>>;

  const HOOK_CORR_ID = 'hook-corr-abc-1';
  const GATEWAY_CORR_ID = 'gateway-uuid-xyz';
  const SERVER_ID = 'railway';
  const TOOL = 'deployment-logs';
  const MCP_TOOL_NAME = `mcp__${SERVER_ID}__${TOOL}`;
  const INPUT = { deploymentId: 'dep_abc123', tail: 50 };

  function simulateHookPush() {
    ringBuffer.push({
      correlationId: HOOK_CORR_ID,
      agentId: 'hook:session-uuid',
      source: 'mcp',
      cwd: '/workspace',
      observedBy: ['hook'],
    });
    const { serverId, tool } = normalizeToolName(MCP_TOOL_NAME);
    mc.recordHook(serverId, tool, INPUT, HOOK_CORR_ID);
  }

  function simulateGatewayToolCallEvent() {
    const { serverId, tool } = normalizeToolName(MCP_TOOL_NAME);
    const hookEntry = mc.tryMatchProxy(serverId, tool, INPUT);

    if (hookEntry && mc.claim(hookEntry.correlationId, 'proxy')) {
      mergedCorrIds.set(GATEWAY_CORR_ID, hookEntry.correlationId);
      ringBuffer.update(
        (e) => e.correlationId === hookEntry.correlationId,
        (e) => ({ ...e, observedBy: [...(e.observedBy ?? ['hook']), 'proxy'] }),
      );
    } else {
      ringBuffer.push({
        correlationId: GATEWAY_CORR_ID,
        agentId: 'agent:railway',
        source: 'proxy',
        observedBy: ['proxy'],
      });
    }
  }

  function simulateGatewayResponseEvent(outputPreview: string) {
    const targetId = mergedCorrIds.get(GATEWAY_CORR_ID) ?? GATEWAY_CORR_ID;
    if (GATEWAY_CORR_ID) mergedCorrIds.delete(GATEWAY_CORR_ID);
    ringBuffer.update(
      (e) => e.correlationId === targetId,
      (e) => ({ ...e, response: { outputPreview, threats: [], timestamp: Date.now() } }),
    );
  }

  beforeEach(() => {
    mc = new MergeCorrelator();
    mergedCorrIds = new Map();
    ringBuffer = makeRingBuffer<MinEvent>();
  });

  it('produces exactly one row when both hook and proxy fire', () => {
    simulateHookPush();
    simulateGatewayToolCallEvent();
    simulateGatewayResponseEvent('log output here');

    const rows = ringBuffer.toArray();
    expect(rows).toHaveLength(1);
    const row = rows[0]!;
    // Hook identity wins
    expect(row.agentId).toBe('hook:session-uuid');
    expect(row.cwd).toBe('/workspace');
    expect(row.source).toBe('mcp');
    expect(row.correlationId).toBe(HOOK_CORR_ID);
    // Proxy contributed observedBy and response
    expect(row.observedBy).toEqual(['hook', 'proxy']);
    expect(row.response?.outputPreview).toBe('log output here');
  });

  it('produces one row with source=proxy when only proxy fires (orphan path)', () => {
    // No hook push — simulates Cursor or non-hooked agent
    simulateGatewayToolCallEvent();
    simulateGatewayResponseEvent('cursor response');

    const rows = ringBuffer.toArray();
    expect(rows).toHaveLength(1);
    const row = rows[0]!;
    expect(row.agentId).toBe('agent:railway');
    expect(row.source).toBe('proxy');
    expect(row.observedBy).toEqual(['proxy']);
    expect(row.response?.outputPreview).toBe('cursor response');
  });

  it('handles two near-simultaneous identical calls correctly (FIFO)', () => {
    const HOOK_CORR_2 = 'hook-corr-def-2';
    const GATEWAY_CORR_2 = 'gateway-uuid-zzz';

    // Two hook PreToolUse events
    ringBuffer.push({ correlationId: 'hook-corr-abc-1', agentId: 'hook:s1', source: 'mcp', observedBy: ['hook'] });
    mc.recordHook(SERVER_ID, TOOL, INPUT, 'hook-corr-abc-1');
    ringBuffer.push({ correlationId: HOOK_CORR_2, agentId: 'hook:s2', source: 'mcp', observedBy: ['hook'] });
    mc.recordHook(SERVER_ID, TOOL, INPUT, HOOK_CORR_2);

    // Two proxy tool call events arrive
    const { serverId, tool } = normalizeToolName(MCP_TOOL_NAME);

    const entry1 = mc.tryMatchProxy(serverId, tool, INPUT)!;
    mc.claim(entry1.correlationId, 'proxy');
    mergedCorrIds.set(GATEWAY_CORR_ID, entry1.correlationId);

    const entry2 = mc.tryMatchProxy(serverId, tool, INPUT)!;
    mc.claim(entry2.correlationId, 'proxy');
    mergedCorrIds.set(GATEWAY_CORR_2, entry2.correlationId);

    // FIFO: first proxy event → first hook entry; second → second hook entry
    expect(entry1.correlationId).toBe('hook-corr-abc-1');
    expect(entry2.correlationId).toBe(HOOK_CORR_2);

    // Still exactly two rows, each properly paired
    expect(ringBuffer.toArray()).toHaveLength(2);
  });

  it('PostToolUse is a no-op after proxy already updated response', () => {
    simulateHookPush();
    simulateGatewayToolCallEvent();
    simulateGatewayResponseEvent('proxy response');

    // Simulate PostToolUse trying to update the same row
    const alreadyHandled = mc.wasConsumedByProxy(HOOK_CORR_ID);
    if (!alreadyHandled) {
      mc.claim(HOOK_CORR_ID, 'post-tool-use');
      ringBuffer.update(
        (e) => e.correlationId === HOOK_CORR_ID,
        (e) => ({ ...e, response: { outputPreview: 'post-tool-use response', threats: [], timestamp: Date.now() } }),
      );
    }

    const row = ringBuffer.toArray()[0]!;
    // Proxy response is preserved, PostToolUse was skipped
    expect(row.response?.outputPreview).toBe('proxy response');
  });
});
