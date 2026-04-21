// PackGrid — displays available policy packs as toggle cards (Level 1 experience).
// Pack state is derived: Disabled / Enabled / Customized (D-039).
// Toggling calls the proxy API to enable or disable the pack's rules in real time.

'use client';

import { useState } from 'react';
import { Database, Terminal, FolderOpen, Shield, CheckCircle2, AlertCircle } from 'lucide-react';

// ─── Types (mirrors proxy PolicyPack shape) ───────────────────────────────────

export interface PackSummary {
  id: string;
  name: string;
  description: string;
  category: 'data-protection' | 'infrastructure' | 'compliance' | 'communication';
  severity: 'strict' | 'moderate' | 'permissive';
  enabled: boolean;
  // Customized = pack is enabled but some rules were edited or removed
  customized?: boolean;
  // e.g. "3 of 5 rules active"
  activeRuleCount?: number;
  totalRuleCount?: number;
}

interface PackGridProps {
  packs: PackSummary[];
  onToggle: (packId: string, enable: boolean) => Promise<void>;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function PackGrid({ packs, onToggle }: PackGridProps) {
  if (packs.length === 0) {
    return (
      <div className="text-sm text-muted py-8 text-center">
        No packs available — proxy may be offline.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
      {packs.map((pack) => (
        <PackCard key={pack.id} pack={pack} onToggle={onToggle} />
      ))}
    </div>
  );
}

// ─── Pack card ────────────────────────────────────────────────────────────────

function PackCard({ pack, onToggle }: { pack: PackSummary; onToggle: PackGridProps['onToggle'] }) {
  const [loading, setLoading] = useState(false);

  async function handleToggle() {
    if (loading) return;
    setLoading(true);
    try {
      await onToggle(pack.id, !pack.enabled);
    } finally {
      setLoading(false);
    }
  }

  const Icon = CATEGORY_ICONS[pack.category] ?? Shield;
  const severityColor = SEVERITY_COLORS[pack.severity];

  return (
    <div
      className={[
        'relative flex flex-col gap-4 p-4 rounded-lg border transition-all duration-150',
        pack.enabled
          ? 'bg-surface border-accent/30 shadow-[0_0_0_1px_color-mix(in_srgb,var(--rind-accent)_12%,transparent)]'
          : 'bg-surface border-border hover:border-border-subtle',
      ].join(' ')}
    >
      {/* Header row: icon + toggle */}
      <div className="flex items-start justify-between gap-2">
        <div
          className={[
            'flex items-center justify-center w-8 h-8 rounded-lg shrink-0',
            pack.enabled ? 'bg-accent/10' : 'bg-overlay',
          ].join(' ')}
        >
          <Icon size={15} className={pack.enabled ? 'text-accent' : 'text-dim'} strokeWidth={1.5} />
        </div>
        <Toggle enabled={pack.enabled} loading={loading} onToggle={handleToggle} />
      </div>

      {/* Name + description */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-foreground">{pack.name}</span>
          {pack.customized && (
            <span className="text-[10px] font-medium text-warning border border-warning/30 bg-warning/8 rounded px-1.5 py-0.5 shrink-0">
              Customized
            </span>
          )}
        </div>
        <p className="mt-1 text-xs text-muted leading-relaxed">{pack.description}</p>
      </div>

      {/* Footer: severity + rule count */}
      <div className="flex items-center justify-between gap-2 pt-1 border-t border-border-subtle">
        <span className={['text-[10px] font-medium uppercase tracking-wide', severityColor].join(' ')}>
          {pack.severity}
        </span>
        {pack.enabled && pack.activeRuleCount !== undefined && pack.totalRuleCount !== undefined && (
          <span className="text-[10px] text-dim font-mono">
            {pack.activeRuleCount} of {pack.totalRuleCount} rules
          </span>
        )}
        {pack.enabled && !pack.customized && (
          <CheckCircle2 size={12} className="text-accent shrink-0" />
        )}
        {pack.customized && (
          <AlertCircle size={12} className="text-warning shrink-0" />
        )}
      </div>
    </div>
  );
}

// ─── Toggle switch ────────────────────────────────────────────────────────────

function Toggle({ enabled, loading, onToggle }: { enabled: boolean; loading: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      onClick={onToggle}
      disabled={loading}
      className={[
        'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors duration-200',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        enabled ? 'bg-accent' : 'bg-overlay border border-border',
      ].join(' ')}
    >
      <span
        className={[
          'pointer-events-none inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform duration-200',
          enabled ? 'translate-x-4' : 'translate-x-0.5',
        ].join(' ')}
      />
    </button>
  );
}

// ─── Constants ────────────────────────────────────────────────────────────────

const CATEGORY_ICONS: Record<PackSummary['category'], typeof Shield> = {
  'data-protection': Database,
  'infrastructure':  Terminal,
  'compliance':      Shield,
  'communication':   FolderOpen,
};

const SEVERITY_COLORS: Record<PackSummary['severity'], string> = {
  strict:     'text-critical',
  moderate:   'text-warning',
  permissive: 'text-accent',
};
