// Log query routes — tool calls and hook events.

import { Hono } from 'hono';
import type { IEventStore } from '@rind/storage';
import type { ToolCallEvent } from '../types.js';
import type { ProcessedHookEvent } from '../hooks/claude-code.js';

export interface LogRouteDeps {
  ringBuffer: IEventStore<ToolCallEvent>;
  hookEventBuffer: IEventStore<ProcessedHookEvent>;
}

export function logRoutes({ ringBuffer, hookEventBuffer }: LogRouteDeps): Hono {
  const app = new Hono();

  app.get('/logs/tool-calls', (c) => {
    const { agentId, toolName, since, until } = c.req.query();
    let events = ringBuffer.toArray();

    if (agentId) events = events.filter((e) => e.agentId === agentId);
    if (toolName) events = events.filter((e) => e.toolName === toolName);
    if (since) {
      const ts = parseInt(since, 10);
      if (!isNaN(ts)) events = events.filter((e) => e.timestamp >= ts);
    }
    if (until) {
      const ts = parseInt(until, 10);
      if (!isNaN(ts)) events = events.filter((e) => e.timestamp <= ts);
    }

    return c.json(events);
  });

  app.get('/logs/hook-events', (c) => {
    const { session_id, event_type, agent_id } = c.req.query();
    let events = hookEventBuffer.toArray();

    if (session_id) events = events.filter((e) => e.sessionId === session_id);
    if (event_type) events = events.filter((e) => e.eventType === event_type);
    if (agent_id) events = events.filter((e) => e.agentId === agent_id);

    return c.json(events);
  });

  return app;
}
