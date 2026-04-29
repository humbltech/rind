// Shared helpers used across route files.

import type { RindEventBus } from '../event-bus.js';
import type { IEventStore } from '@rind/storage';
import type { InterceptorResult } from '../interceptor.js';
import type { AuditEntry, ProxyConfig, ToolCallEvent } from '../types.js';

export function emitAudit(
  bus: RindEventBus,
  fields: Omit<AuditEntry, 'timestamp'>,
): void {
  const entry: AuditEntry = { timestamp: new Date().toISOString(), ...fields };
  bus.emit('audit', entry);
}

export function emitPolicyAudit(
  bus: RindEventBus,
  operation: 'rule-added' | 'rule-updated' | 'rule-removed' | 'rule-enabled' | 'rule-disabled' | 'config-replaced' | 'pack-enabled' | 'pack-disabled',
  target: string,
): void {
  bus.emit('audit', {
    timestamp: new Date().toISOString(),
    eventType: 'policy:mutation',
    sessionId: '',
    agentId: 'rind:policy-api',
    serverId: '',
    action: 'ALLOW',
    reason: `policy:${operation}:${target}`,
  } as AuditEntry);
}

/** Parse a human-readable duration string (e.g. "30s", "2m", "5m") into milliseconds. */
export function parseApprovalTimeout(timeout?: string): number | undefined {
  if (!timeout) return undefined;
  const m = timeout.match(/^(\d+)(s|m|h)$/);
  if (!m) return undefined;
  const val = parseInt(m[1]!, 10);
  switch (m[2]) {
    case 's': return val * 1000;
    case 'm': return val * 60_000;
    case 'h': return val * 3_600_000;
    default: return undefined;
  }
}

export function recordProxyOutcome(
  correlationId: string,
  interceptorResult: InterceptorResult,
  ringBuffer: IEventStore<ToolCallEvent>,
): void {
  let outcome: ToolCallEvent['outcome'];
  const ad = interceptorResult.approvalDecision;
  if (ad === 'disapproved' || ad === 'approval-timeout') {
    outcome = ad;
  } else if (ad === 'approved' && (interceptorResult.action === 'ALLOW' || interceptorResult.action === 'RATE_LIMIT')) {
    outcome = 'approved';
  } else {
    const isBlocked = interceptorResult.action !== 'ALLOW' && interceptorResult.action !== 'RATE_LIMIT';
    outcome = isBlocked ? 'blocked' : 'allowed';
  }

  ringBuffer.update(
    (e) => e.correlationId === correlationId,
    (e) => ({
      ...e,
      outcome,
      source: e.source ?? ('mcp' as const),
      matchedRule: interceptorResult.matchedRule,
      matchedRuleType: interceptorResult.matchedRule ? ('policy' as const) : undefined,
      reason: interceptorResult.reason,
    }),
  );
}
