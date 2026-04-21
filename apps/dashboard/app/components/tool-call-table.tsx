// ToolCallTable — real-time log of tool calls intercepted by the proxy.
// New rows slide in from the top — motion signals "something just happened."
// Rows are keyed by timestamp so React only adds genuinely new rows.

'use client';

import { useEffect, useRef } from 'react';
import type React from 'react';

export interface ToolCallEntry {
  sessionId: string;
  agentId: string;
  serverId: string;
  toolName: string;
  timestamp: number;
  // Present when the proxy returns a decision alongside the call
  outcome?: 'allowed' | 'blocked' | 'require-approval';
  reason?: string;
}

interface ToolCallTableProps {
  entries: ToolCallEntry[];
}

export function ToolCallTable({ entries }: ToolCallTableProps) {
  const mostRecentTimestamp = entries.at(-1)?.timestamp;

  if (entries.length === 0) return <EmptyState />;

  // Most recent first — the new event is always visible at the top
  const sorted = [...entries].reverse();

  return (
    <div className="overflow-auto max-h-[420px] rounded-lg border border-border">
      <table className="w-full text-sm border-collapse">
        <TableHeader />
        <tbody>
          {sorted.map((entry) => (
            <TableRow
              key={entry.timestamp}
              entry={entry}
              isNew={entry.timestamp === mostRecentTimestamp && entries.length > 1}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TableHeader() {
  return (
    <thead className="sticky top-0 bg-surface border-b border-border z-10">
      <tr>
        {['Time', 'Agent', 'Server', 'Tool', 'Outcome'].map((h) => (
          <th
            key={h}
            className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-[0.08em] text-muted"
          >
            {h}
          </th>
        ))}
      </tr>
    </thead>
  );
}

function TableRow({ entry, isNew }: { entry: ToolCallEntry; isNew: boolean }) {
  const rowRef = useRef<HTMLTableRowElement>(null);

  // Slide-in animation on first mount — motion only on data arrival (D-033 discipline)
  useEffect(() => {
    if (!isNew || !rowRef.current) return;
    rowRef.current.classList.add('animate-slide-in');
  }, [isNew]);

  return (
    <tr
      ref={rowRef}
      className="border-b border-border-subtle last:border-0 hover:bg-overlay transition-colors duration-100"
    >
      <td className="px-4 py-3 font-mono text-[12px] text-muted whitespace-nowrap">
        {formatTimestamp(entry.timestamp)}
      </td>
      <td className="px-4 py-3 font-mono text-[12px] text-muted max-w-[120px] truncate">
        {entry.agentId}
      </td>
      <td className="px-4 py-3 font-mono text-[12px] text-muted max-w-[120px] truncate">
        {entry.serverId}
      </td>
      <td className="px-4 py-3">
        <span className="font-mono text-[12px] text-accent bg-[color-mix(in_srgb,var(--rind-accent)_8%,transparent)] px-2 py-0.5 rounded">
          {entry.toolName}
        </span>
      </td>
      <td className="px-4 py-3">
        {entry.outcome && <OutcomeBadge outcome={entry.outcome} />}
      </td>
    </tr>
  );
}

// Outcome pill — ALLOWED / BLOCKED / REQUIRE APPROVAL
// Per design spec: ALLOWED is intentionally muted (expected state);
// BLOCKED is critical-tinted (exception); REQUIRE APPROVAL is amber-tinted.
function OutcomeBadge({ outcome }: { outcome: NonNullable<ToolCallEntry['outcome']> }) {
  const config: Record<NonNullable<ToolCallEntry['outcome']>, { label: string; style: React.CSSProperties }> = {
    allowed: {
      label: 'ALLOWED',
      style: {
        color: 'var(--rind-foreground-muted)',
        background: 'var(--rind-overlay)',
        borderColor: 'var(--rind-border-subtle)',
      },
    },
    blocked: {
      label: 'BLOCKED',
      style: {
        color: 'var(--rind-critical)',
        background: 'color-mix(in srgb, var(--rind-critical) 10%, transparent)',
        borderColor: 'color-mix(in srgb, var(--rind-critical) 24%, transparent)',
      },
    },
    'require-approval': {
      label: 'REQUIRE APPROVAL',
      style: {
        color: 'var(--rind-medium)',
        background: 'color-mix(in srgb, var(--rind-medium) 10%, transparent)',
        borderColor: 'color-mix(in srgb, var(--rind-medium) 24%, transparent)',
      },
    },
  };

  const { label, style } = config[outcome];
  return (
    <span
      className="font-mono text-[10px] tracking-[0.04em] px-2 py-0.5 rounded border"
      style={style}
    >
      {label}
    </span>
  );
}

function EmptyState() {
  return (
    <div className="border border-border rounded-lg h-40 flex flex-col items-center justify-center gap-2">
      <p className="text-sm text-muted">No tool calls yet</p>
      <p className="text-xs text-dim">Tool calls appear here as agents make requests through the proxy</p>
    </div>
  );
}

function formatTimestamp(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}
