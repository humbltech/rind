// RuleList — table of all active policy rules with source badges and delete action.
// Rules sourced from packs show the pack name as their badge.
// Manual rules show "manual". Customized pack rules show a modified indicator.

'use client';

import { useState } from 'react';
import { Trash2, Pencil, ShieldCheck, User } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ParameterMatcherUI {
  contains?: string[];
  regex?: string;
  startsWith?: string;
  gt?: number;
  lt?: number;
  gte?: number;
  lte?: number;
  eq?: unknown;
  in?: unknown[];
}

export interface PolicyRuleRow {
  name: string;
  agent: string;
  enabled?: boolean; // default true
  match: {
    tool?: string[];
    toolPattern?: string;
    parameters?: Record<string, ParameterMatcherUI>;
    subcommand?: string[];
    timeWindow?: {
      daysOfWeek?: number[];
      hours?: string;
    };
  };
  action: 'ALLOW' | 'DENY' | 'REQUIRE_APPROVAL' | 'RATE_LIMIT' | 'REDACT' | 'PSEUDONYMIZE';
  priority?: number;
  rateLimit?: { limit: number; window: string; scope: 'per_agent' | 'per_tool' | 'global' };
  failMode?: 'closed' | 'open';
  loop?: { type: 'exact' | 'consecutive' | 'subcommand'; threshold: number; window?: number };
  _meta?: {
    source: string;
    modifiedFromPack?: boolean;
  };
}

interface RuleListProps {
  rules: PolicyRuleRow[];
  onDelete: (name: string) => Promise<void>;
  onEdit: (rule: PolicyRuleRow) => void;
  onToggle: (name: string) => Promise<void>;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function RuleList({ rules, onDelete, onEdit, onToggle }: RuleListProps) {
  if (rules.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-surface py-12 text-center">
        <ShieldCheck size={24} className="mx-auto mb-3 text-dim" strokeWidth={1} />
        <p className="text-sm text-muted">No active rules.</p>
        <p className="mt-1 text-xs text-dim">Enable a pack or create a rule to get started.</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-surface overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border-subtle">
            <Th><span className="sr-only">Status</span></Th>
            <Th>Rule</Th>
            <Th>Agent</Th>
            <Th>Match</Th>
            <Th>Action</Th>
            <Th>Source</Th>
            <Th align="right">Priority</Th>
            <Th align="right"><span className="sr-only">Actions</span></Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border-subtle">
          {rules.map((rule) => (
            <RuleRow key={rule.name} rule={rule} onDelete={onDelete} onEdit={onEdit} onToggle={onToggle} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Row ─────────────────────────────────────────────────────────────────────

function RuleRow({ rule, onDelete, onEdit, onToggle }: { rule: PolicyRuleRow; onDelete: RuleListProps['onDelete']; onEdit: RuleListProps['onEdit']; onToggle: RuleListProps['onToggle'] }) {
  const [deleting, setDeleting] = useState(false);
  const [toggling, setToggling] = useState(false);
  const isEnabled = rule.enabled !== false;

  async function handleDelete() {
    if (deleting) return;
    setDeleting(true);
    try { await onDelete(rule.name); } finally { setDeleting(false); }
  }

  async function handleToggle() {
    if (toggling) return;
    setToggling(true);
    try { await onToggle(rule.name); } finally { setToggling(false); }
  }

  const matchLabel = formatMatchLabel(rule.match);

  return (
    <tr className={['group transition-colors duration-100', isEnabled ? 'hover:bg-overlay/40' : 'opacity-50'].join(' ')}>
      <Td>
        <ToggleSwitch enabled={isEnabled} onToggle={handleToggle} disabled={toggling} />
      </Td>
      <Td>
        <span className="font-mono text-xs text-foreground">{rule.name}</span>
      </Td>
      <Td>
        <span className="font-mono text-xs text-muted">{rule.agent}</span>
      </Td>
      <Td>
        <span className="font-mono text-xs text-muted truncate max-w-[160px] block" title={matchLabel}>
          {matchLabel}
        </span>
      </Td>
      <Td>
        <div className="flex items-center gap-1.5">
          <ActionBadge action={rule.action} />
          {rule.loop && <LoopBadge loop={rule.loop} />}
        </div>
      </Td>
      <Td>
        <SourceBadge source={rule._meta?.source} modified={rule._meta?.modifiedFromPack} />
      </Td>
      <Td align="right">
        <span className="font-mono text-xs text-dim">{rule.priority ?? 50}</span>
      </Td>
      <Td align="right">
        <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-100">
          <IconButton onClick={() => onEdit(rule)} title="Edit rule">
            <Pencil size={12} />
          </IconButton>
          <IconButton onClick={handleDelete} title="Delete rule" destructive disabled={deleting}>
            <Trash2 size={12} />
          </IconButton>
        </div>
      </Td>
    </tr>
  );
}

// ─── Badges ───────────────────────────────────────────────────────────────────

const ACTION_STYLES: Record<PolicyRuleRow['action'], string> = {
  ALLOW:            'text-accent border-accent/30 bg-accent/8',
  DENY:             'text-critical border-critical/30 bg-critical/8',
  REQUIRE_APPROVAL: 'text-warning border-warning/30 bg-warning/8',
  RATE_LIMIT:       'text-muted border-border bg-overlay',
  REDACT:           'text-muted border-border bg-overlay',
  PSEUDONYMIZE:     'text-muted border-border bg-overlay',
};

function ActionBadge({ action }: { action: PolicyRuleRow['action'] }) {
  return (
    <span className={['text-[10px] font-medium border rounded px-1.5 py-0.5 whitespace-nowrap', ACTION_STYLES[action]].join(' ')}>
      {action.replace('_', ' ')}
    </span>
  );
}

function LoopBadge({ loop }: { loop: NonNullable<PolicyRuleRow['loop']> }) {
  return (
    <span
      title={`Loop: ${loop.type}, threshold ${loop.threshold}, window ${loop.window ?? 10}`}
      className="text-[10px] border rounded px-1.5 py-0.5 font-medium text-warning border-warning/30 bg-warning/8 whitespace-nowrap"
    >
      ↺ {loop.threshold}×
    </span>
  );
}

function SourceBadge({ source, modified }: { source?: string; modified?: boolean }) {
  if (!source || source === 'manual' || source === 'yaml') {
    return (
      <span className="flex items-center gap-1 text-[10px] text-dim">
        <User size={10} />
        manual
      </span>
    );
  }

  const packName = source.startsWith('pack:') ? source.slice(5) : source;
  const label    = PACK_DISPLAY_NAMES[packName] ?? packName;

  return (
    <span className={[
      'inline-flex items-center gap-1 text-[10px] border rounded px-1.5 py-0.5 font-medium',
      modified
        ? 'text-warning border-warning/30 bg-warning/8'
        : 'text-accent border-accent/30 bg-accent/8',
    ].join(' ')}>
      <ShieldCheck size={9} strokeWidth={2} />
      {label}
      {modified && <span className="text-warning/70">·modified</span>}
    </span>
  );
}

function formatMatchLabel(match: PolicyRuleRow['match']): string {
  const parts: string[] = [];
  if (match.toolPattern) parts.push(match.toolPattern);
  else if (match.tool?.length) parts.push(match.tool.join(', '));
  if (match.subcommand?.length) parts.push(`subcmd: ${match.subcommand.join(', ')}`);
  if (match.parameters) {
    for (const [key, matcher] of Object.entries(match.parameters)) {
      if (matcher.contains?.length) parts.push(`${key} contains ${matcher.contains.join('+')}`);
      else if (matcher.regex) parts.push(`${key} ~ /${matcher.regex}/`);
      else if (matcher.startsWith) parts.push(`${key} starts "${matcher.startsWith}"`);
      else if (matcher.gt !== undefined) parts.push(`${key} > ${matcher.gt}`);
      else if (matcher.lt !== undefined) parts.push(`${key} < ${matcher.lt}`);
    }
  }
  return parts.length > 0 ? parts.join(' + ') : '*';
}

const PACK_DISPLAY_NAMES: Record<string, string> = {
  'sql-protection':        'SQL',
  'shell-protection':      'Shell',
  'filesystem-protection': 'Filesystem',
  'exfil-protection':      'Exfil',
};

// ─── Toggle switch ───────────────────────────────────────────────────────

function ToggleSwitch({ enabled, onToggle, disabled }: { enabled: boolean; onToggle: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      title={enabled ? 'Disable rule' : 'Enable rule'}
      className={[
        'relative inline-flex h-4 w-7 items-center rounded-full transition-colors duration-200 focus:outline-none disabled:opacity-50',
        enabled ? 'bg-accent' : 'bg-border',
      ].join(' ')}
    >
      <span
        className={[
          'inline-block h-3 w-3 rounded-full bg-white transition-transform duration-200',
          enabled ? 'translate-x-3.5' : 'translate-x-0.5',
        ].join(' ')}
      />
    </button>
  );
}

// ─── Table primitives ─────────────────────────────────────────────────────────

function Th({ children, align = 'left' }: { children: React.ReactNode; align?: 'left' | 'right' }) {
  return (
    <th className={[
      'px-4 py-2.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-dim whitespace-nowrap',
      align === 'right' ? 'text-right' : 'text-left',
    ].join(' ')}>
      {children}
    </th>
  );
}

function Td({ children, align = 'left' }: { children: React.ReactNode; align?: 'left' | 'right' }) {
  return (
    <td className={[
      'px-4 py-3',
      align === 'right' ? 'text-right' : 'text-left',
    ].join(' ')}>
      {children}
    </td>
  );
}

function IconButton({ children, onClick, title, destructive, disabled }: {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
  destructive?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={[
        'p-1.5 rounded transition-colors duration-100 disabled:opacity-40',
        destructive
          ? 'text-dim hover:text-critical hover:bg-critical/10'
          : 'text-dim hover:text-foreground hover:bg-overlay',
      ].join(' ')}
    >
      {children}
    </button>
  );
}
