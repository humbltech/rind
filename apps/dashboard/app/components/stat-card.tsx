// StatCards — four card variants per the design spec (D-033).
//
// Shared shell: 16px label · 32px value · 20px visual · 104px min-height.
// Every card reserves the visual slot — number-only cards fill it with
// delta pill or scale ticks. No card looks "empty."
//
// Variants:
//   Volume     — big number + unit (/min), time badge, sparkline
//   Breakdown  — big number + context (of N), severity bar
//   CountDelta — big number + unit, delta pill (▲ +N vs 1h ago)
//   CountScale — big number + context (/ max), tick bar

'use client';

import { useEffect, useRef, useState } from 'react';

// ─── Shared shell ────────────────────────────────────────────────────────────

function CardShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-surface border border-border rounded-lg px-5 py-4 flex flex-col justify-between min-h-[104px] transition-colors duration-150 hover:bg-overlay/40 overflow-hidden">
      {children}
    </div>
  );
}

function CardHeader({ label, badge }: { label: string; badge?: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[11px] font-semibold tracking-[0.12em] uppercase text-muted">{label}</span>
      {badge && (
        <span className="text-[10px] font-mono text-dim bg-overlay px-1.5 py-0.5 rounded">{badge}</span>
      )}
    </div>
  );
}

function CardValue({ value, unit, context, isAlert }: {
  value: number;
  unit?: string;
  context?: string;
  isAlert?: boolean;
}) {
  const animated = useCountUp(value);
  return (
    <div className="flex items-baseline gap-1.5 mt-1">
      <span className={`text-[32px] font-bold leading-none tabular-nums ${isAlert && value > 0 ? 'text-critical' : 'text-foreground'}`}>
        {animated.toLocaleString()}
      </span>
      {unit && <span className="text-sm text-dim">{unit}</span>}
      {context && <span className="text-sm text-muted">{context}</span>}
    </div>
  );
}

// ─── Volume card — sparkline ─────────────────────────────────────────────────

interface VolumeCardProps {
  label: string;
  value: number;
  unit: string;
  badge: string;
  sparkline?: number[];
}

export function VolumeCard({ label, value, unit, badge, sparkline }: VolumeCardProps) {
  return (
    <CardShell>
      <CardHeader label={label} badge={badge} />
      <CardValue value={value} unit={unit} />
      <div className="h-[20px] mt-1">
        {sparkline && sparkline.length > 1
          ? <Sparkline data={sparkline} color="var(--rind-accent)" />
          : <EmptySparkline />}
      </div>
    </CardShell>
  );
}

// ─── Breakdown card — severity bar ───────────────────────────────────────────

interface BreakdownCardProps {
  label: string;
  value: number;
  badge: string;
  context: string; // e.g. "of 1,284"
  breakdown: { label: string; value: number; color: string }[];
}

export function BreakdownCard({ label, value, badge, context, breakdown }: BreakdownCardProps) {
  const total = breakdown.reduce((sum, b) => sum + b.value, 0);
  return (
    <CardShell>
      <CardHeader label={label} badge={badge} />
      <CardValue value={value} context={context} isAlert={value > 0} />
      <div className="h-[20px] mt-1 flex flex-col justify-end">
        {total > 0 ? (
          <>
            <div className="flex h-[3px] rounded-full overflow-hidden gap-px">
              {breakdown.filter(b => b.value > 0).map((b) => (
                <div
                  key={b.label}
                  style={{
                    flex: b.value,
                    background: b.color,
                    borderRadius: '2px',
                  }}
                />
              ))}
            </div>
            <div className="flex gap-3 mt-1.5">
              {breakdown.map((b) => (
                <span key={b.label} className="text-[10px] font-mono text-dim">
                  <span style={{ color: b.color }}>{b.value}</span> {b.label}
                </span>
              ))}
            </div>
          </>
        ) : (
          <span className="text-[10px] font-mono text-dim">no threats</span>
        )}
      </div>
    </CardShell>
  );
}

// ─── Count + Delta card — delta pill ─────────────────────────────────────────

interface CountDeltaCardProps {
  label: string;
  value: number;
  unit: string;
  badge: string;
  delta?: number;      // +12 or -3
  deltaLabel?: string; // "vs 1h ago"
}

export function CountDeltaCard({ label, value, unit, badge, delta, deltaLabel }: CountDeltaCardProps) {
  return (
    <CardShell>
      <CardHeader label={label} badge={badge} />
      <CardValue value={value} unit={unit} />
      <div className="h-[20px] mt-1 flex items-center gap-2">
        {delta != null && delta !== 0 ? (
          <>
            <span
              className="text-[10px] font-mono font-medium px-1.5 py-0.5 rounded border"
              style={{
                color: delta > 0 ? 'var(--rind-low)' : 'var(--rind-critical)',
                borderColor: delta > 0
                  ? 'color-mix(in srgb, var(--rind-low) 24%, transparent)'
                  : 'color-mix(in srgb, var(--rind-critical) 24%, transparent)',
                background: delta > 0
                  ? 'color-mix(in srgb, var(--rind-low) 8%, transparent)'
                  : 'color-mix(in srgb, var(--rind-critical) 8%, transparent)',
              }}
            >
              {delta > 0 ? '▲' : '▼'} {delta > 0 ? '+' : ''}{delta}
            </span>
            {deltaLabel && <span className="text-[10px] text-dim">{deltaLabel}</span>}
          </>
        ) : (
          <span className="text-[10px] font-mono text-dim">—</span>
        )}
      </div>
    </CardShell>
  );
}

// ─── Count + Scale card — tick bar ───────────────────────────────────────────

interface CountScaleCardProps {
  label: string;
  value: number;
  max: number;
  badge: string;
}

export function CountScaleCard({ label, value, max, badge }: CountScaleCardProps) {
  return (
    <CardShell>
      <CardHeader label={label} badge={badge} />
      <CardValue value={value} context={`/ ${max} max`} />
      <div className="h-[20px] mt-1 flex items-end gap-[3px]">
        {Array.from({ length: max }, (_, i) => (
          <div
            key={i}
            className="rounded-sm"
            style={{
              width: '6px',
              height: '14px',
              background: i < value
                ? 'var(--rind-accent)'
                : 'var(--rind-overlay)',
              opacity: i < value ? 0.8 : 0.4,
            }}
          />
        ))}
      </div>
    </CardShell>
  );
}

// ─── Sparkline ────────────────────────────────────────────────────────────────

function Sparkline({ data, color }: { data: number[]; color: string }) {
  const max = Math.max(...data, 1);
  const w = 200;
  const h = 20;

  const points = data.map((val, i) => ({
    x: (i / (data.length - 1)) * w,
    y: h - (val / max) * (h - 2),
  }));

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  const areaPath = `${linePath} L ${w} ${h} L 0 ${h} Z`;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="w-full h-full">
      <defs>
        <linearGradient id="spark-area" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.2" />
          <stop offset="100%" stopColor={color} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill="url(#spark-area)" />
      <path d={linePath} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.7" />
    </svg>
  );
}

function EmptySparkline() {
  return (
    <div className="w-full h-full flex items-end">
      <div className="w-full h-px" style={{ background: 'var(--rind-overlay)' }} />
    </div>
  );
}

// ─── Count-up animation ──────────────────────────────────────────────────────

function useCountUp(target: number): number {
  const [displayed, setDisplayed] = useState(0);
  const hasAnimated = useRef(false);

  useEffect(() => {
    if (hasAnimated.current || target === 0) {
      setDisplayed(target);
      return;
    }

    hasAnimated.current = true;
    const duration = 600;
    const start = performance.now();

    function tick(now: number) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
      setDisplayed(Math.round(eased * target));
      if (progress < 1) requestAnimationFrame(tick);
    }

    requestAnimationFrame(tick);
  }, [target]);

  return displayed;
}
