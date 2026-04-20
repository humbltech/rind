// Typed event bus — in-process EventEmitter with a stable typed contract.
// AD-003: "The event system must be an event bus from day one. Alerts are events;
// delivery channels are subscribers."
//
// Phase 1 subscribers: ring buffer, audit writer, pino logger.
// Phase 2: webhook dispatcher, SSE push to dashboard.

import { EventEmitter } from 'node:events';
import type { ToolCallEvent, ToolResponseEvent, ScanResult, Session, AuditEntry } from './types.js';

// ─── Event map ───────────────────────────────────────────────────────────────

export interface AegisEventMap {
  'tool:call': ToolCallEvent;
  'tool:response': ToolResponseEvent;
  'tool:blocked': { event: ToolCallEvent; action: string; reason?: string };
  'tool:threat': ToolResponseEvent;
  'scan:complete': ScanResult;
  'session:created': Session;
  'session:killed': { sessionId: string; agentId: string };
  'audit': AuditEntry;
}

type EventHandler<K extends keyof AegisEventMap> = (payload: AegisEventMap[K]) => void;

// ─── Bus ─────────────────────────────────────────────────────────────────────

export class AegisEventBus {
  private emitter = new EventEmitter();
  private onError: (event: string, err: unknown) => void;

  constructor(onError?: (event: string, err: unknown) => void) {
    this.onError = onError ?? (() => undefined);
    this.emitter.setMaxListeners(50);
  }

  emit<K extends keyof AegisEventMap>(event: K, payload: AegisEventMap[K]): void {
    this.emitter.emit(event, payload);
  }

  /** Subscribe to an event. Returns an unsubscribe function. */
  on<K extends keyof AegisEventMap>(event: K, handler: EventHandler<K>): () => void {
    const onErr = this.onError;
    const eventStr = event;

    // Wrap to catch subscriber errors — a crashing subscriber never blocks the pipeline
    const wrapper = (payload: AegisEventMap[K]): void => {
      try {
        handler(payload);
      } catch (err) {
        onErr(eventStr, err);
      }
    };

    this.emitter.on(event, wrapper as (p: unknown) => void);
    return () => this.emitter.off(event, wrapper as (p: unknown) => void);
  }
}
