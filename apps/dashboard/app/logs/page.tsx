// Log Explorer — browse, filter, and analyze tool call logs.
//
// Features:
//   - Query bar with RQL (Rind Query Language) for filtering
//   - Stats summary: total, allowed, blocked, tool breakdown
//   - Sortable columns, expandable detail rows
//   - Virtual scrolling for large datasets (custom, no dependency)
//   - Polls /api/proxy/logs/tool-calls every 2s
//
// RQL syntax (KQL-inspired, client-side evaluation):
//   tool:Bash                    — tool name equals "Bash"
//   tool:Bash,Read               — tool name is Bash OR Read
//   outcome:blocked              — only blocked calls
//   agent:hook:*                 — agent ID starts with "hook:"
//   session:abc123               — session ID contains "abc123"
//   source:mcp                   — only MCP tool calls
//   server:github                — server ID contains "github"
//   "rm -rf"                     — free-text search across all fields
//   tool:Bash outcome:blocked    — AND: Bash AND blocked
//   tool:Bash "git status"       — AND: Bash tool with "git status" in input

'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type React from 'react';
import { Sidebar } from '../components/sidebar';
import type { ToolCallEntry } from '../components/tool-call-table';
import {
  Search,
  ChevronDown,
  ChevronUp,
  Filter,
  ArrowUpDown,
  X,
} from 'lucide-react';

// ─── Page ────────────────────────────────────────────────────────────────────

export default function LogsPage() {
  const { toolCalls, isConnected } = useLogData();
  const [query, setQuery] = useState('');
  const [sortField, setSortField] = useState<SortField>('timestamp');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const filtered = useMemo(() => filterEntries(toolCalls, query), [toolCalls, query]);
  const sorted = useMemo(() => sortEntries(filtered, sortField, sortDir), [filtered, sortField, sortDir]);
  const stats = useMemo(() => deriveStats(filtered), [filtered]);

  const handleSort = useCallback((field: SortField) => {
    if (field === sortField) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  }, [sortField]);

  // Quick filter chips — clicking sets the query
  const handleChip = useCallback((q: string) => {
    setQuery((prev) => (prev === q ? '' : q));
  }, []);

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-auto">
        <div className="max-w-[1400px] mx-auto px-8 py-8 space-y-6">
          <PageHeader connected={isConnected} total={toolCalls.length} filtered={sorted.length} />
          <QueryBar query={query} onChange={setQuery} />
          <QuickFilters query={query} onChip={handleChip} stats={stats} />
          <StatsBar stats={stats} />
          <LogTable
            entries={sorted}
            sortField={sortField}
            sortDir={sortDir}
            onSort={handleSort}
          />
        </div>
      </main>
    </div>
  );
}

// ─── Page header ─────────────────────────────────────────────────────────────

function PageHeader({ connected, total, filtered }: { connected: boolean; total: number; filtered: number }) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <h1 className="text-xl font-semibold text-foreground tracking-tight">Logs</h1>
        <p className="mt-0.5 text-sm text-muted">
          Browse and filter tool call history
          {total !== filtered && (
            <span className="ml-1 text-accent">
              ({filtered.toLocaleString()} of {total.toLocaleString()})
            </span>
          )}
        </p>
      </div>
      <ConnectionDot connected={connected} />
    </div>
  );
}

function ConnectionDot({ connected }: { connected: boolean }) {
  return (
    <div className="flex items-center gap-2 text-xs text-muted">
      <span
        className="w-2 h-2 rounded-full"
        style={{
          backgroundColor: connected ? 'var(--rind-accent)' : 'var(--rind-critical)',
          boxShadow: connected
            ? '0 0 6px color-mix(in srgb, var(--rind-accent) 50%, transparent)'
            : '0 0 6px color-mix(in srgb, var(--rind-critical) 50%, transparent)',
        }}
      />
      {connected ? 'Live' : 'Disconnected'}
    </div>
  );
}

// ─── Query bar ───────────────────────────────────────────────────────────────

function QueryBar({ query, onChange }: { query: string; onChange: (q: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);

  // Cmd+K to focus
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
      }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  return (
    <div className="relative">
      <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-dim" />
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => onChange(e.target.value)}
        placeholder='tool:Bash outcome:blocked "git status" — use OR between clauses'
        className="w-full pl-9 pr-20 py-2.5 rounded-lg border border-border bg-surface text-sm text-foreground font-mono placeholder:text-dim focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30 transition-colors"
      />
      {query && (
        <button
          onClick={() => onChange('')}
          className="absolute right-14 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-overlay text-dim hover:text-muted transition-colors"
        >
          <X size={13} />
        </button>
      )}
      <kbd className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-dim border border-border-subtle rounded px-1.5 py-0.5 font-sans">
        {'\u2318'}K
      </kbd>
    </div>
  );
}

// ─── Quick filter chips ──────────────────────────────────────────────────────

function QuickFilters({ query, onChip, stats }: {
  query: string;
  onChip: (q: string) => void;
  stats: LogStats;
}) {
  const chips = [
    { label: 'Blocked', q: 'outcome:blocked', count: stats.blocked, color: 'var(--rind-critical)' },
    { label: 'Bash', q: 'tool:Bash', count: stats.toolBreakdown.get('Bash') ?? 0 },
    { label: 'Read', q: 'tool:Read', count: stats.toolBreakdown.get('Read') ?? 0 },
    { label: 'Edit', q: 'tool:Edit', count: stats.toolBreakdown.get('Edit') ?? 0 },
    { label: 'Write', q: 'tool:Write', count: stats.toolBreakdown.get('Write') ?? 0 },
    { label: 'MCP', q: 'source:mcp', count: stats.mcp },
  ].filter((c) => c.count > 0);

  if (chips.length === 0) return null;

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Filter size={12} className="text-dim" />
      {chips.map((chip) => {
        const isActive = query === chip.q;
        return (
          <button
            key={chip.q}
            onClick={() => onChip(chip.q)}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-[11px] font-mono transition-colors duration-100"
            style={{
              borderColor: isActive
                ? (chip.color ?? 'var(--rind-accent)')
                : 'var(--rind-border-subtle)',
              background: isActive
                ? `color-mix(in srgb, ${chip.color ?? 'var(--rind-accent)'} 12%, transparent)`
                : 'transparent',
              color: isActive
                ? (chip.color ?? 'var(--rind-accent)')
                : 'var(--rind-foreground-muted)',
            }}
          >
            {chip.label}
            <span className="text-dim">{chip.count}</span>
          </button>
        );
      })}
    </div>
  );
}

// ─── Stats bar ───────────────────────────────────────────────────────────────

interface LogStats {
  total: number;
  allowed: number;
  blocked: number;
  mcp: number;
  builtin: number;
  toolBreakdown: Map<string, number>;
  sessions: number;
}

function StatsBar({ stats }: { stats: LogStats }) {
  return (
    <div className="flex items-center gap-6 text-[11px] text-muted font-mono">
      <StatItem label="Total" value={stats.total} />
      <StatItem label="Allowed" value={stats.allowed} color="var(--rind-accent)" />
      <StatItem label="Blocked" value={stats.blocked} color="var(--rind-critical)" />
      <StatItem label="MCP" value={stats.mcp} />
      <StatItem label="Built-in" value={stats.builtin} />
      <StatItem label="Sessions" value={stats.sessions} />
      <span className="ml-auto text-dim">
        {stats.toolBreakdown.size} tools
      </span>
    </div>
  );
}

function StatItem({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-dim">{label}</span>
      <span style={color ? { color } : undefined} className="font-medium">
        {value.toLocaleString()}
      </span>
    </div>
  );
}

// ─── Log table ───────────────────────────────────────────────────────────────

type SortField = 'timestamp' | 'toolName' | 'outcome' | 'agentId' | 'serverId' | 'source' | 'matchedRule';

const COLUMNS: { field: SortField; label: string; width: string }[] = [
  { field: 'timestamp', label: 'Time', width: 'w-[120px]' },
  { field: 'agentId', label: 'Agent', width: 'w-[160px]' },
  { field: 'serverId', label: 'Server', width: 'w-[90px]' },
  { field: 'toolName', label: 'Tool', width: 'flex-1' },
  { field: 'source', label: 'Source', width: 'w-[80px]' },
  { field: 'outcome', label: 'Outcome', width: 'w-[100px]' },
  { field: 'matchedRule', label: 'Rule', width: 'w-[130px]' },
];

function LogTable({ entries, sortField, sortDir, onSort }: {
  entries: ToolCallEntry[];
  sortField: SortField;
  sortDir: 'asc' | 'desc';
  onSort: (field: SortField) => void;
}) {
  // Virtual scrolling state
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const rowHeight = 44; // px per row
  const overscan = 5;

  const onScroll = useCallback(() => {
    if (containerRef.current) setScrollTop(containerRef.current.scrollTop);
  }, []);

  const containerHeight = 600; // visible area
  const totalHeight = entries.length * rowHeight;
  const startIdx = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
  const endIdx = Math.min(entries.length, Math.ceil((scrollTop + containerHeight) / rowHeight) + overscan);
  const visibleEntries = entries.slice(startIdx, endIdx);

  if (entries.length === 0) {
    return (
      <div className="border border-border rounded-lg h-40 flex flex-col items-center justify-center gap-2">
        <p className="text-sm text-muted">No matching logs</p>
        <p className="text-xs text-dim">Adjust your query or wait for new tool calls</p>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="overflow-auto rounded-lg border border-border"
      style={{ maxHeight: containerHeight }}
      onScroll={onScroll}
    >
      <table className="w-full text-sm border-collapse">
        <SortableHeader columns={COLUMNS} sortField={sortField} sortDir={sortDir} onSort={onSort} />
        <tbody>
          {/* Spacer for rows above viewport */}
          {startIdx > 0 && (
            <tr><td colSpan={7} style={{ height: startIdx * rowHeight, padding: 0, border: 'none' }} /></tr>
          )}
          {visibleEntries.map((entry, i) => (
            <LogRow key={`${entry.timestamp}-${startIdx + i}`} entry={entry} />
          ))}
          {/* Spacer for rows below viewport */}
          {endIdx < entries.length && (
            <tr><td colSpan={7} style={{ height: (entries.length - endIdx) * rowHeight, padding: 0, border: 'none' }} /></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function SortableHeader({ columns, sortField, sortDir, onSort }: {
  columns: typeof COLUMNS;
  sortField: SortField;
  sortDir: 'asc' | 'desc';
  onSort: (field: SortField) => void;
}) {
  return (
    <thead className="sticky top-0 bg-surface border-b border-border z-10">
      <tr>
        {columns.map((col) => {
          const isActive = sortField === col.field;
          return (
            <th
              key={col.field}
              className={`px-4 py-3 text-left text-[11px] font-medium uppercase tracking-[0.08em] text-muted cursor-pointer select-none hover:text-foreground transition-colors ${col.width}`}
              onClick={() => onSort(col.field)}
            >
              <span className="flex items-center gap-1">
                {col.label}
                {isActive ? (
                  sortDir === 'desc' ? <ChevronDown size={11} /> : <ChevronUp size={11} />
                ) : (
                  <ArrowUpDown size={10} className="text-dim opacity-0 group-hover:opacity-100" />
                )}
              </span>
            </th>
          );
        })}
      </tr>
    </thead>
  );
}

function LogRow({ entry }: { entry: ToolCallEntry }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      <tr
        className="border-b border-border-subtle last:border-0 hover:bg-overlay transition-colors duration-100 cursor-pointer"
        style={{ height: 44 }}
        onClick={() => setExpanded(!expanded)}
      >
        <td className="px-4 py-2 font-mono text-[12px] text-muted whitespace-nowrap">
          <span className="mr-1 text-dim">{expanded ? '\u25BC' : '\u25B6'}</span>
          {formatTimestamp(entry.timestamp)}
        </td>
        <td className="px-4 py-2 max-w-[180px]">
          <AgentLabel agentId={entry.agentId} sessionName={entry.sessionName} />
        </td>
        <td className="px-4 py-2 font-mono text-[12px] text-muted max-w-[100px] truncate">
          {entry.serverId}
        </td>
        <td className="px-4 py-2">
          <ToolBadge toolLabel={entry.toolLabel} toolName={entry.toolName} input={entry.input} />
        </td>
        <td className="px-4 py-2">
          <SourceBadge source={entry.source} />
        </td>
        <td className="px-4 py-2">
          {entry.outcome && <OutcomeBadge outcome={entry.outcome} />}
        </td>
        <td className="px-4 py-2">
          {entry.matchedRule && (
            <span className="font-mono text-[10px] text-muted truncate max-w-[120px] inline-block" title={entry.matchedRule}>
              {entry.matchedRule}
            </span>
          )}
          {!entry.matchedRule && entry.outcome === 'allowed' && (
            <span className="text-[10px] text-dim">default</span>
          )}
        </td>
      </tr>
      {expanded && (
        <tr className="border-b border-border-subtle">
          <td colSpan={7} className="px-4 py-3 bg-[var(--rind-overlay)]">
            <DetailPanel entry={entry} />
          </td>
        </tr>
      )}
    </>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function AgentLabel({ agentId, sessionName }: { agentId: string; sessionName?: string }) {
  const label = agentId.startsWith('hook:') ? 'claude-code' : (agentId.length > 16 ? agentId.slice(0, 16) + '\u2026' : agentId);
  const session = sessionName ?? (agentId.startsWith('hook:') ? agentId.slice(5, 13) : agentId.slice(0, 8));
  return (
    <div className="flex flex-col gap-0.5">
      <span className="font-mono text-[11px] text-foreground font-medium truncate">{label}</span>
      <span className="font-mono text-[10px] text-dim truncate">{session}</span>
    </div>
  );
}

function ToolBadge({ toolLabel, toolName, input }: { toolLabel?: string; toolName: string; input?: unknown }) {
  const label = toolLabel ?? clientToolLabel(toolName, input);
  return (
    <span
      className="font-mono text-[12px] text-accent bg-[color-mix(in_srgb,var(--rind-accent)_8%,transparent)] px-2 py-0.5 rounded inline-block max-w-[300px] truncate"
      title={toolName}
    >
      {label}
    </span>
  );
}

function SourceBadge({ source }: { source?: 'builtin' | 'mcp' }) {
  if (!source) return null;
  const isMcp = source === 'mcp';
  return (
    <span
      className="font-mono text-[10px] tracking-[0.04em] px-2 py-0.5 rounded border"
      style={{
        color: isMcp ? 'var(--rind-accent)' : 'var(--rind-foreground-muted)',
        background: isMcp ? 'color-mix(in srgb, var(--rind-accent) 10%, transparent)' : 'var(--rind-overlay)',
        borderColor: isMcp ? 'color-mix(in srgb, var(--rind-accent) 24%, transparent)' : 'var(--rind-border-subtle)',
      }}
    >
      {isMcp ? 'MCP' : 'BUILTIN'}
    </span>
  );
}

function OutcomeBadge({ outcome }: { outcome: NonNullable<ToolCallEntry['outcome']> }) {
  const styles: Record<string, { label: string; color: string; bg: string; border: string }> = {
    allowed: {
      label: 'ALLOWED',
      color: 'var(--rind-foreground-muted)',
      bg: 'var(--rind-overlay)',
      border: 'var(--rind-border-subtle)',
    },
    blocked: {
      label: 'BLOCKED',
      color: 'var(--rind-critical)',
      bg: 'color-mix(in srgb, var(--rind-critical) 10%, transparent)',
      border: 'color-mix(in srgb, var(--rind-critical) 24%, transparent)',
    },
    'require-approval': {
      label: 'PENDING',
      color: 'var(--rind-medium)',
      bg: 'color-mix(in srgb, var(--rind-medium) 10%, transparent)',
      border: 'color-mix(in srgb, var(--rind-medium) 24%, transparent)',
    },
  };
  const s = styles[outcome] ?? styles.allowed;
  return (
    <span
      className="font-mono text-[10px] tracking-[0.04em] px-2 py-0.5 rounded border"
      style={{ color: s.color, background: s.bg, borderColor: s.border }}
    >
      {s.label}
    </span>
  );
}

function DetailPanel({ entry }: { entry: ToolCallEntry }) {
  const [tab, setTab] = useState<'input' | 'response'>('input');
  const inputStr = formatInput(entry.input);
  const hasInput = entry.input != null && JSON.stringify(entry.input) !== '{}';
  const hasResponse = entry.response != null;

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-x-6 gap-y-1">
        <DetailRow label="Agent ID" value={entry.agentId} />
        <DetailRow label="Session" value={entry.sessionName ?? entry.sessionId} />
        <DetailRow label="Server" value={entry.serverId} />
        <DetailRow label="Tool" value={entry.toolName} />
        {entry.matchedRule && <DetailRow label="Policy Rule" value={entry.matchedRule} />}
        {!entry.matchedRule && <DetailRow label="Policy Rule" value="(default allow)" />}
        {entry.cwd && <DetailRow label="CWD" value={entry.cwd} />}
        {entry.source && <DetailRow label="Source" value={entry.source} />}
        {entry.correlationId && <DetailRow label="Correlation" value={entry.correlationId} />}
      </div>
      {entry.reason && (
        <div className="flex gap-2 text-[11px]">
          <span className="text-dim font-medium w-20 shrink-0">Reason</span>
          <span className="font-mono text-critical">{entry.reason}</span>
        </div>
      )}

      {/* Tabs: Input / Response */}
      {(hasInput || hasResponse) && (
        <div className="flex items-center gap-1 mt-2">
          <DetailTabButton label="Input" active={tab === 'input'} onClick={() => setTab('input')} />
          <DetailTabButton
            label={`Response${hasResponse ? '' : ' (pending)'}`}
            active={tab === 'response'}
            onClick={() => setTab('response')}
            disabled={!hasResponse}
          />
          {hasResponse && entry.response!.outputSizeBytes != null && (
            <span className="ml-auto text-[10px] text-dim font-mono">
              {formatBytes(entry.response!.outputSizeBytes!)}
              {entry.response!.outputTruncated && ' (truncated)'}
            </span>
          )}
        </div>
      )}

      {tab === 'input' && hasInput && (
        <pre className="font-mono text-[11px] text-muted whitespace-pre-wrap break-all max-h-[200px] overflow-auto mt-1 p-2 rounded bg-[var(--rind-canvas)]">
          {inputStr}
        </pre>
      )}

      {tab === 'response' && hasResponse && (
        <ResponsePanel response={entry.response!} />
      )}
    </div>
  );
}

function DetailTabButton({ label, active, onClick, disabled }: {
  label: string;
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="px-2.5 py-1 rounded text-[11px] font-mono transition-colors"
      style={{
        color: disabled ? 'var(--rind-foreground-dim)' : active ? 'var(--rind-accent)' : 'var(--rind-foreground-muted)',
        background: active ? 'color-mix(in srgb, var(--rind-accent) 10%, transparent)' : 'transparent',
        borderColor: active ? 'color-mix(in srgb, var(--rind-accent) 24%, transparent)' : 'transparent',
        borderWidth: '1px',
        borderStyle: 'solid',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {label}
    </button>
  );
}

function ResponsePanel({ response }: { response: NonNullable<ToolCallEntry['response']> }) {
  return (
    <div className="space-y-2 mt-1">
      {/* Threats */}
      {response.threats && response.threats.length > 0 && (
        <div className="space-y-1">
          {response.threats.map((t, i) => (
            <div
              key={i}
              className="flex items-center gap-2 px-2 py-1 rounded text-[11px] font-mono"
              style={{
                background: t.severity === 'critical'
                  ? 'color-mix(in srgb, var(--rind-critical) 10%, transparent)'
                  : 'color-mix(in srgb, var(--rind-high) 10%, transparent)',
                color: t.severity === 'critical' ? 'var(--rind-critical)' : 'var(--rind-high)',
              }}
            >
              <span className="uppercase text-[9px] tracking-wider font-semibold">{t.severity}</span>
              <span>{t.type}</span>
              <span className="text-dim ml-auto truncate max-w-[200px]" title={t.pattern}>{t.pattern}</span>
            </div>
          ))}
        </div>
      )}

      {/* Response metadata */}
      <div className="grid grid-cols-2 gap-x-6 gap-y-1">
        {response.outputSizeBytes != null && (
          <DetailRow label="Size" value={formatBytes(response.outputSizeBytes)} />
        )}
        {response.outputHash && (
          <DetailRow label="Hash" value={response.outputHash.slice(0, 16) + '\u2026'} />
        )}
        {response.timestamp && (
          <DetailRow label="Responded" value={new Date(response.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })} />
        )}
      </div>

      {/* Output preview */}
      {response.outputPreview && (
        <pre className="font-mono text-[11px] text-muted whitespace-pre-wrap break-all max-h-[200px] overflow-auto p-2 rounded bg-[var(--rind-canvas)]">
          {response.outputPreview}
        </pre>
      )}
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2 text-[11px]">
      <span className="text-dim font-medium w-20 shrink-0">{label}</span>
      <span className="font-mono text-muted truncate" title={value}>{value}</span>
    </div>
  );
}

// ─── RQL parser ──────────────────────────────────────────────────────────────
//
// Syntax:
//   tool:Bash                     — tool name equals Bash
//   tool:Bash,Read                — tool is Bash OR Read (comma = OR within field)
//   outcome:blocked               — blocked calls
//   rule:block_git                — matched by this policy rule
//   agent:hook:*                  — wildcard prefix match
//   source:mcp                    — MCP tools only
//   "rm -rf"                      — free-text search
//   tool:Bash outcome:blocked     — AND (default between terms)
//   tool:Bash OR outcome:blocked  — OR between clauses
//   (tool:Bash "git") OR outcome:blocked — grouped AND/OR

interface FilterClause {
  tool?: string[];
  outcome?: string[];
  agent?: string;
  session?: string;
  source?: string;
  server?: string;
  rule?: string;
  freeText: string[];
}

interface ParsedQuery {
  // Array of clause groups joined by OR. Within each group, all conditions are ANDed.
  orGroups: FilterClause[];
}

function parseQuery(raw: string): ParsedQuery {
  if (!raw.trim()) return { orGroups: [] };

  // Split on " OR " (case-sensitive, space-separated)
  const orParts = raw.split(/\s+OR\s+/);
  const orGroups = orParts.map(parseClause);
  return { orGroups };
}

function parseClause(raw: string): FilterClause {
  const result: FilterClause = { freeText: [] };

  // Tokenize: respect quoted strings
  const tokens: string[] = [];
  const re = /"([^"]+)"|(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw)) !== null) {
    tokens.push(m[1] ?? m[2] ?? '');
  }

  for (const token of tokens) {
    const colonIdx = token.indexOf(':');
    if (colonIdx > 0) {
      const key = token.slice(0, colonIdx).toLowerCase();
      const val = token.slice(colonIdx + 1);
      switch (key) {
        case 'tool':
          result.tool = val.split(',').map((t) => t.trim()).filter(Boolean);
          break;
        case 'outcome':
          result.outcome = val.split(',').map((o) => o.trim().toLowerCase()).filter(Boolean);
          break;
        case 'agent':
          result.agent = val;
          break;
        case 'session':
          result.session = val;
          break;
        case 'source':
          result.source = val.toLowerCase();
          break;
        case 'server':
          result.server = val;
          break;
        case 'rule':
          result.rule = val;
          break;
        default:
          result.freeText.push(token);
      }
    } else {
      result.freeText.push(token);
    }
  }

  return result;
}

function filterEntries(entries: ToolCallEntry[], raw: string): ToolCallEntry[] {
  const q = parseQuery(raw);
  if (q.orGroups.length === 0) return entries;

  return entries.filter((e) =>
    // OR: entry matches if ANY group matches
    q.orGroups.some((clause) => matchesClause(e, clause)),
  );
}

function matchesClause(e: ToolCallEntry, q: FilterClause): boolean {
  // AND: all conditions in the clause must match
  if (q.tool && q.tool.length > 0) {
    if (!q.tool.some((t) => e.toolName.toLowerCase() === t.toLowerCase())) return false;
  }
  if (q.outcome && q.outcome.length > 0) {
    if (!e.outcome || !q.outcome.includes(e.outcome)) return false;
  }
  if (q.agent) {
    const pattern = q.agent;
    if (pattern.endsWith('*')) {
      if (!e.agentId.startsWith(pattern.slice(0, -1))) return false;
    } else {
      if (!e.agentId.includes(pattern)) return false;
    }
  }
  if (q.session) {
    const sid = e.sessionName ?? e.sessionId;
    if (!sid.includes(q.session)) return false;
  }
  if (q.source) {
    if (e.source !== q.source) return false;
  }
  if (q.server) {
    if (!e.serverId.toLowerCase().includes(q.server.toLowerCase())) return false;
  }
  if (q.rule) {
    if (!e.matchedRule?.toLowerCase().includes(q.rule.toLowerCase())) return false;
  }
  if (q.freeText.length > 0) {
    const haystack = buildHaystack(e);
    for (const term of q.freeText) {
      if (!haystack.includes(term.toLowerCase())) return false;
    }
  }
  return true;
}

function buildHaystack(e: ToolCallEntry): string {
  const inp = e.input as Record<string, unknown> | null | undefined;
  return [
    e.toolName,
    e.toolLabel ?? '',
    e.agentId,
    e.serverId,
    e.sessionId,
    e.sessionName ?? '',
    e.reason ?? '',
    e.cwd ?? '',
    e.matchedRule ?? '',
    typeof inp?.command === 'string' ? inp.command as string : '',
    typeof inp?.file_path === 'string' ? inp.file_path as string : '',
    typeof inp?.pattern === 'string' ? inp.pattern as string : '',
  ].join(' ').toLowerCase();
}

// ─── Sorting ─────────────────────────────────────────────────────────────────

function sortEntries(entries: ToolCallEntry[], field: SortField, dir: 'asc' | 'desc'): ToolCallEntry[] {
  const mult = dir === 'asc' ? 1 : -1;
  return [...entries].sort((a, b) => {
    const va = getFieldValue(a, field);
    const vb = getFieldValue(b, field);
    if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * mult;
    return String(va).localeCompare(String(vb)) * mult;
  });
}

function getFieldValue(entry: ToolCallEntry, field: SortField): string | number {
  switch (field) {
    case 'timestamp': return entry.timestamp;
    case 'toolName': return entry.toolLabel ?? entry.toolName;
    case 'outcome': return entry.outcome ?? '';
    case 'agentId': return entry.agentId;
    case 'serverId': return entry.serverId;
    case 'source': return entry.source ?? '';
    case 'matchedRule': return entry.matchedRule ?? '';
  }
}

// ─── Stats derivation ────────────────────────────────────────────────────────

function deriveStats(entries: ToolCallEntry[]): LogStats {
  const toolBreakdown = new Map<string, number>();
  const sessionSet = new Set<string>();
  let allowed = 0;
  let blocked = 0;
  let mcp = 0;
  let builtin = 0;

  for (const e of entries) {
    if (e.outcome === 'allowed') allowed++;
    if (e.outcome === 'blocked') blocked++;
    if (e.source === 'mcp') mcp++;
    if (e.source === 'builtin') builtin++;
    toolBreakdown.set(e.toolName, (toolBreakdown.get(e.toolName) ?? 0) + 1);
    sessionSet.add(e.sessionId);
  }

  return {
    total: entries.length,
    allowed,
    blocked,
    mcp,
    builtin,
    toolBreakdown,
    sessions: sessionSet.size,
  };
}

// ─── Utilities ───────────────────────────────────────────────────────────────

function formatTimestamp(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString('en-US', {
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  });
}

function formatInput(input: unknown): string {
  if (input == null) return '';
  try {
    const str = JSON.stringify(input, null, 2);
    return str.length > 2000 ? str.slice(0, 2000) + '\n... (truncated)' : str;
  } catch {
    return String(input);
  }
}

function clientToolLabel(toolName: string, input: unknown): string {
  const inp = input as Record<string, unknown> | null | undefined;
  if (!inp || typeof inp !== 'object') return toolName;
  switch (toolName) {
    case 'Bash': {
      const cmd = typeof inp.command === 'string' ? inp.command.trim() : '';
      return cmd ? (cmd.length <= 50 ? `Bash: ${cmd}` : `Bash: ${cmd.slice(0, 47)}...`) : 'Bash';
    }
    case 'Read': case 'Write': case 'Edit': {
      const fp = typeof inp.file_path === 'string' ? inp.file_path : '';
      return fp ? `${toolName}: ${fp.split('/').pop() || fp}` : toolName;
    }
    case 'Grep': {
      const p = typeof inp.pattern === 'string' ? inp.pattern : '';
      return p ? `Grep: ${p.slice(0, 40)}` : 'Grep';
    }
    case 'Glob': {
      const p = typeof inp.pattern === 'string' ? inp.pattern : '';
      return p ? `Glob: ${p}` : 'Glob';
    }
    case 'Agent': {
      const t = typeof inp.subagent_type === 'string' ? inp.subagent_type : '';
      return t ? `Agent: ${t}` : 'Agent';
    }
    default: return toolName;
  }
}

// ─── Data polling ────────────────────────────────────────────────────────────

interface HookEvent {
  eventType: string;
  sessionId: string;
  agentId: string;
  correlationId?: string;
  toolName?: string;
  toolResponse?: unknown;
  outputPreview?: string;
  outputTruncated?: boolean;
  outputSizeBytes?: number;
  outputHash?: string;
  threats?: Array<{ type: string; severity: string; pattern: string }>;
  timestamp: number;
}

function useLogData() {
  const [toolCalls, setToolCalls] = useState<ToolCallEntry[]>([]);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    let active = true;

    async function poll() {
      try {
        // Fetch PreToolUse + PostToolUse in parallel
        const [callsRes, eventsRes] = await Promise.all([
          fetch('/api/proxy/logs/tool-calls'),
          fetch('/api/proxy/logs/hook-events?event_type=PostToolUse'),
        ]);
        if (!active) return;

        if (callsRes.ok) {
          const calls: ToolCallEntry[] = await callsRes.json();

          // Join PostToolUse events by correlationId with time proximity check
          if (eventsRes.ok) {
            const hookEvents: HookEvent[] = await eventsRes.json();
            const eventMap = new Map<string, HookEvent>();
            for (const he of hookEvents) {
              if (he.correlationId) eventMap.set(he.correlationId, he);
            }
            const MAX_CORRELATION_GAP_MS = 5 * 60 * 1000; // 5 minutes
            for (const call of calls) {
              if (call.correlationId && eventMap.has(call.correlationId)) {
                const he = eventMap.get(call.correlationId)!;
                // Only match if PostToolUse arrived within 5 minutes of PreToolUse
                const gap = Math.abs(he.timestamp - call.timestamp);
                if (gap > MAX_CORRELATION_GAP_MS) continue;
                call.response = {
                  outputPreview: he.outputPreview,
                  outputTruncated: he.outputTruncated,
                  outputSizeBytes: he.outputSizeBytes,
                  outputHash: he.outputHash,
                  threats: he.threats,
                  timestamp: he.timestamp,
                };
              }
            }
          }

          setToolCalls(calls);
          setIsConnected(true);
        } else {
          setIsConnected(false);
        }
      } catch {
        if (active) setIsConnected(false);
      }
    }

    poll();
    const interval = setInterval(poll, 2000);
    return () => { active = false; clearInterval(interval); };
  }, []);

  return { toolCalls, isConnected };
}
