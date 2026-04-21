// RuleList — table of all active policy rules with source badges and delete action.
// Rules sourced from packs show the pack name as their badge.
// Manual rules show "manual". Customized pack rules show a modified indicator.

'use client';

import { useState } from 'react';
import { Trash2, Pencil, ShieldCheck, User } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PolicyRuleRow {
  name: string;
  agent: string;
  match: {
    tool?: string[];
    toolPattern?: string;
  };
  action: 'ALLOW' | 'DENY' | 'REQUIRE_APPROVAL' | 'RATE_LIMIT';
  priority?: number;
  _meta?: {
    source: string; // 'manual' | 'yaml' | 'pack:sql-protection' | 'ai-assisted'
    modifiedFromPack?: boolean;
  };
}

interface RuleListProps {
  rules: PolicyRuleRow[];
  onDelete: (name: string) => Promise<void>;
  onEdit: (rule: PolicyRuleRow) => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function RuleList({ rules, onDelete, onEdit }: RuleListProps) {
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
            <RuleRow key={rule.name} rule={rule} onDelete={onDelete} onEdit={onEdit} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Row ─────────────────────────────────────────────────────────────────────

function RuleRow({ rule, onDelete, onEdit }: { rule: PolicyRuleRow; onDelete: RuleListProps['onDelete']; onEdit: RuleListProps['onEdit'] }) {
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    if (deleting) return;
    setDeleting(true);
    try {
      await onDelete(rule.name);
    } finally {
      setDeleting(false);
    }
  }

  const matchLabel = rule.match.toolPattern
    ? rule.match.toolPattern
    : rule.match.tool?.join(', ') ?? '*';

  return (
    <tr className="group hover:bg-overlay/40 transition-colors duration-100">
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
        <ActionBadge action={rule.action} />
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
};

function ActionBadge({ action }: { action: PolicyRuleRow['action'] }) {
  return (
    <span className={['text-[10px] font-medium border rounded px-1.5 py-0.5 whitespace-nowrap', ACTION_STYLES[action]].join(' ')}>
      {action.replace('_', ' ')}
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

const PACK_DISPLAY_NAMES: Record<string, string> = {
  'sql-protection':        'SQL',
  'shell-protection':      'Shell',
  'filesystem-protection': 'Filesystem',
  'exfil-protection':      'Exfil',
};

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
