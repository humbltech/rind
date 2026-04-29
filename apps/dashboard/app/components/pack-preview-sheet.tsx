// PackPreviewSheet — read-only slide-over showing all rules in a policy pack (R-1).
// Opened from PackCard "View rules" button. Fetches full pack from proxy on demand.

'use client';

import { useEffect, useRef, useState } from 'react';
import { X, Bot, Database, Terminal, Shield, FolderOpen, ChevronDown, ChevronRight } from 'lucide-react';

// ─── API shape ────────────────────────────────────────────────────────────────

interface ApiPackRule {
  name: string;
  agent?: string;
  enabled?: boolean;
  priority?: number;
  action: string;
  failMode?: string;
  match?: {
    tool?: string[];
    toolPattern?: string;
    parameters?: Record<string, { regex?: string; contains?: string[]; startsWith?: string }>;
    subcommand?: string[];
    llmProvider?: string[];
    llmModel?: string[];
    content?: {
      scope: string;
      targets?: string[];
      detectors: string[];
    };
  };
  pii?: { entities?: string[]; locale?: string; confidenceThreshold?: number };
  secrets?: { patterns?: string[]; custom?: { name: string; regex: string }[] };
  injection?: Record<string, unknown>;
  dlp?: { patterns?: { name: string; regex: string; severity: string }[] };
}

interface ApiPackFull {
  id: string;
  name: string;
  description: string;
  category: string;
  severity: string;
  tags?: string[];
  customizable?: { field: string; label: string; type: string; default: string }[];
  rules: ApiPackRule[];
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface PackPreviewSheetProps {
  packId: string;
  onClose: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function PackPreviewSheet({ packId, onClose }: PackPreviewSheetProps) {
  const [pack, setPack]     = useState<ApiPackFull | null>(null);
  const [error, setError]   = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const dialogRef = useRef<HTMLElement>(null);

  // Move focus into the dialog when it opens
  useEffect(() => {
    dialogRef.current?.focus();
  }, []);

  // Focus trap — keep Tab/Shift+Tab inside the dialog
  function handleKeyDown(e: React.KeyboardEvent<HTMLElement>) {
    if (e.key === 'Escape') { onClose(); return; }
    if (e.key !== 'Tab') return;
    const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    if (!focusable || focusable.length === 0) {
      e.preventDefault();
      dialogRef.current?.focus();
      return;
    }
    const first = focusable[0]!;
    const last  = focusable[focusable.length - 1]!;
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);

    fetch(`/api/proxy/packs/${packId}`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<ApiPackFull>;
      })
      .then((data) => { if (active) { setPack(data); setLoading(false); } })
      .catch((e: unknown) => {
        if (active) {
          setError(e instanceof Error ? e.message : 'Failed to load pack');
          setLoading(false);
        }
      });

    return () => { active = false; };
  }, [packId]);

  // Backdrop click closes — Escape is handled by the focus trap's onKeyDown

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 z-40 animate-in fade-in duration-150"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Sheet */}
      <aside
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={pack?.name ?? 'Pack rules'}
        tabIndex={-1}
        onKeyDown={handleKeyDown}
        className="fixed right-0 top-0 h-full w-full max-w-xl bg-canvas border-l border-border z-50 flex flex-col shadow-2xl animate-in slide-in-from-right duration-200 outline-none"
      >
        {/* Header */}
        <div className="flex items-start gap-3 px-6 py-5 border-b border-border shrink-0">
          {pack && (
            <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-overlay shrink-0 mt-0.5">
              <CategoryIcon category={pack.category} />
            </div>
          )}
          <div className="flex-1 min-w-0">
            {loading && <div className="h-5 w-40 bg-overlay rounded animate-pulse" />}
            {error && <p className="text-sm text-critical">{error}</p>}
            {pack && (
              <>
                <h2 className="text-sm font-semibold text-foreground leading-tight">{pack.name}</h2>
                <p className="mt-0.5 text-xs text-muted leading-relaxed">{pack.description}</p>
                <div className="flex items-center gap-2 mt-2 flex-wrap">
                  <SeverityBadge severity={pack.severity} />
                  <CategoryBadge category={pack.category} />
                  {pack.tags?.map((tag) => (
                    <span key={tag} className="text-[10px] text-dim bg-overlay border border-border-subtle rounded px-1.5 py-0.5">
                      {tag}
                    </span>
                  ))}
                </div>
              </>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded hover:bg-overlay text-dim hover:text-foreground transition-colors shrink-0"
            aria-label="Close"
          >
            <X size={14} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-3">
          {loading && (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-20 bg-overlay rounded-lg animate-pulse" />
              ))}
            </div>
          )}

          {pack && pack.rules.length === 0 && (
            <p className="text-xs text-dim text-center py-8">No rules in this pack.</p>
          )}

          {pack?.rules.map((rule) => (
            <RuleCard key={rule.name} rule={rule} />
          ))}

          {pack && pack.customizable && pack.customizable.length > 0 && (
            <div className="mt-6 pt-5 border-t border-border-subtle">
              <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted mb-3">
                Customizable fields
              </p>
              <div className="space-y-2">
                {pack.customizable.map((c) => (
                  <div key={c.field} className="flex items-start gap-3 p-3 bg-overlay rounded-lg border border-border-subtle">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-foreground">{c.label}</p>
                      <p className="text-[10px] text-dim font-mono mt-0.5">{c.field}</p>
                    </div>
                    <span className="text-[10px] font-mono text-muted bg-canvas border border-border rounded px-1.5 py-0.5 shrink-0">
                      {c.default}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border shrink-0 flex items-center justify-between">
          <span className="text-[10px] text-dim">
            {pack ? `${pack.rules.length} rule${pack.rules.length === 1 ? '' : 's'}` : ''}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-xs font-medium text-foreground bg-overlay hover:bg-surface border border-border rounded transition-colors"
          >
            Close
          </button>
        </div>
      </aside>
    </>
  );
}

// ─── Rule card ────────────────────────────────────────────────────────────────

function RuleCard({ rule }: { rule: ApiPackRule }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-lg border border-border bg-surface overflow-hidden">
      {/* Rule header */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-overlay/50 transition-colors"
      >
        <ActionBadge action={rule.action} />
        <span className="flex-1 text-xs font-medium text-foreground truncate font-mono">
          {rule.name.split(':')[1] ?? rule.name}
        </span>
        {expanded
          ? <ChevronDown size={12} className="text-dim shrink-0" />
          : <ChevronRight size={12} className="text-dim shrink-0" />
        }
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="px-4 pb-4 space-y-3 border-t border-border-subtle pt-3">
          {/* Full rule name */}
          <div>
            <Label>Rule ID</Label>
            <code className="text-[10px] text-muted font-mono">{rule.name}</code>
          </div>

          {/* Match criteria */}
          {rule.match && (
            <div className="space-y-2">
              <Label>Match</Label>
              {rule.match.tool && (
                <MatchRow label="tool" value={rule.match.tool.join(', ')} />
              )}
              {rule.match.toolPattern && (
                <MatchRow label="toolPattern" value={rule.match.toolPattern} mono />
              )}
              {rule.match.llmProvider && (
                <MatchRow label="llmProvider" value={rule.match.llmProvider.join(', ')} />
              )}
              {rule.match.llmModel && (
                <MatchRow label="llmModel" value={rule.match.llmModel.join(', ')} />
              )}
              {rule.match.parameters && Object.entries(rule.match.parameters).map(([param, matcher]) => (
                <MatchRow
                  key={param}
                  label={`params.${param}`}
                  value={matcher.regex ? `/${matcher.regex}/` : (matcher.contains?.join(', ') ?? '')}
                  mono
                />
              ))}
              {rule.match.content && (
                <div className="pl-3 border-l border-accent/30 space-y-1">
                  <MatchRow label="scope" value={rule.match.content.scope} />
                  {rule.match.content.targets && (
                    <MatchRow label="targets" value={rule.match.content.targets.join(', ')} />
                  )}
                  <MatchRow label="detectors" value={rule.match.content.detectors.join(', ')} />
                </div>
              )}
            </div>
          )}

          {/* Detector configs */}
          {rule.pii && (
            <div>
              <Label>PII config</Label>
              {rule.pii.entities && <MatchRow label="entities" value={rule.pii.entities.join(', ')} />}
              {rule.pii.locale && <MatchRow label="locale" value={rule.pii.locale} />}
            </div>
          )}
          {rule.secrets && (
            <div>
              <Label>Secrets config</Label>
              {rule.secrets.patterns?.length
                ? <MatchRow label="patterns" value={rule.secrets.patterns.join(', ')} />
                : <MatchRow label="patterns" value="all built-in patterns" />
              }
            </div>
          )}
          {rule.dlp && rule.dlp.patterns && (
            <div>
              <Label>DLP patterns</Label>
              {rule.dlp.patterns.map((p) => (
                <MatchRow key={p.name} label={p.name} value={`/${p.regex}/  [${p.severity}]`} mono />
              ))}
            </div>
          )}

          {/* Fail mode */}
          {rule.failMode && (
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-dim">Fail mode:</span>
              <span className={[
                'text-[10px] font-medium',
                rule.failMode === 'open' ? 'text-warning' : 'text-muted',
              ].join(' ')}>
                {rule.failMode}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Micro-components ─────────────────────────────────────────────────────────

function Label({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-dim mb-1">{children}</p>
  );
}

function MatchRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start gap-2 text-[10px]">
      <span className="text-dim shrink-0 min-w-[80px]">{label}</span>
      <span className={['text-muted break-all', mono ? 'font-mono' : ''].join(' ')}>{value}</span>
    </div>
  );
}

function ActionBadge({ action }: { action: string }) {
  const styles: Record<string, string> = {
    DENY:             'bg-critical/10 text-critical border-critical/20',
    REQUIRE_APPROVAL: 'bg-warning/10 text-warning border-warning/20',
    ALLOW:            'bg-accent/10 text-accent border-accent/20',
    REDACT:           'bg-warning/10 text-warning border-warning/20',
    // PSEUDONYMIZE gets a distinct neutral style — it is not an enforcement action
    // (data flows through, just tokenized) so it should not share ALLOW's green
    PSEUDONYMIZE:     'bg-overlay text-foreground border-border',
    RATE_LIMIT:       'bg-overlay text-muted border-border',
  };
  return (
    <span className={[
      'text-[9px] font-semibold uppercase tracking-wide border rounded px-1.5 py-0.5 shrink-0',
      styles[action] ?? 'bg-overlay text-dim border-border',
    ].join(' ')}>
      {action.replace(/_/g, ' ')}
    </span>
  );
}

function SeverityBadge({ severity }: { severity: string }) {
  const colors: Record<string, string> = {
    strict:     'text-critical border-critical/20 bg-critical/8',
    moderate:   'text-warning border-warning/20 bg-warning/8',
    permissive: 'text-accent border-accent/20 bg-accent/8',
  };
  return (
    <span className={[
      'text-[10px] font-medium uppercase tracking-wide border rounded px-1.5 py-0.5',
      colors[severity] ?? 'text-dim border-border bg-overlay',
    ].join(' ')}>
      {severity}
    </span>
  );
}

function CategoryBadge({ category }: { category: string }) {
  return (
    <span className="text-[10px] text-dim bg-overlay border border-border-subtle rounded px-1.5 py-0.5">
      {category}
    </span>
  );
}

function CategoryIcon({ category }: { category: string }) {
  const icons: Record<string, React.ElementType> = {
    'data-protection': Database,
    'infrastructure':  Terminal,
    'compliance':      Shield,
    'communication':   FolderOpen,
    'llm-safety':      Bot,
  };
  const Icon = icons[category] ?? Shield;
  return <Icon size={15} className="text-dim" strokeWidth={1.5} />;
}
