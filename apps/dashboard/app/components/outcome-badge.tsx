import type React from 'react';

export type ToolCallOutcome =
  | 'allowed'
  | 'blocked'
  | 'require-approval'
  | 'approved'
  | 'disapproved'
  | 'approval-timeout'
  | 'upstream-error'
  | 'upstream-timeout';

// Outcome pill — ALLOWED / BLOCKED / PENDING / APPROVED / DENIED / etc.
// Per design spec: ALLOWED is intentionally muted (expected state);
// BLOCKED and DENIED are critical-tinted (exceptions); PENDING is amber-tinted.
//
// Record<ToolCallOutcome, ...> is exhaustive: adding a new outcome variant to
// ToolCallOutcome causes a compile error here, preventing silent fallback misclassification.
export function OutcomeBadge({ outcome }: { outcome: ToolCallOutcome }): React.ReactElement {
  const config: Record<ToolCallOutcome, { label: string; style: React.CSSProperties }> = {
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
    approved: {
      label: 'APPROVED',
      style: {
        color: 'var(--rind-low)',
        background: 'color-mix(in srgb, var(--rind-low) 10%, transparent)',
        borderColor: 'color-mix(in srgb, var(--rind-low) 24%, transparent)',
      },
    },
    disapproved: {
      label: 'DENIED',
      style: {
        color: 'var(--rind-critical)',
        background: 'color-mix(in srgb, var(--rind-critical) 10%, transparent)',
        borderColor: 'color-mix(in srgb, var(--rind-critical) 24%, transparent)',
      },
    },
    'approval-timeout': {
      label: 'TIMED OUT',
      style: {
        color: 'var(--rind-medium)',
        background: 'color-mix(in srgb, var(--rind-medium) 10%, transparent)',
        borderColor: 'color-mix(in srgb, var(--rind-medium) 24%, transparent)',
      },
    },
    'upstream-error': {
      label: 'UPSTREAM ERROR',
      style: {
        color: 'var(--rind-medium)',
        background: 'color-mix(in srgb, var(--rind-medium) 10%, transparent)',
        borderColor: 'color-mix(in srgb, var(--rind-medium) 24%, transparent)',
      },
    },
    'upstream-timeout': {
      label: 'UPSTREAM TIMEOUT',
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
