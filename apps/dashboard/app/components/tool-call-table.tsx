// ToolCallTable — real-time log of tool calls intercepted by the proxy.
// New rows slide in from the top — motion signals "something just happened."
// Rows are keyed by timestamp so React only adds genuinely new rows.

'use client';

import { useEffect, useRef, useState } from 'react';
import type React from 'react';

export interface ToolCallEntry {
  sessionId: string;
  sessionName?: string;
  agentId: string;
  serverId: string;
  toolName: string;
  toolLabel?: string;
  timestamp: number;
  // Present when the proxy returns a decision alongside the call
  outcome?: 'allowed' | 'blocked' | 'require-approval' | 'upstream-error' | 'upstream-timeout';
  reason?: string;
  // Tool source classification
  source?: 'builtin' | 'mcp' | 'proxy';
  // Name of the policy rule that matched
  matchedRule?: string;
  // Tool input arguments (for display in expandable row)
  input?: unknown;
  // Working directory
  cwd?: string;
  // Correlation ID linking PreToolUse → PostToolUse
  correlationId?: string;
  // ─── PostToolUse response data (joined via correlationId) ───
  response?: {
    outputPreview?: string;
    outputTruncated?: boolean;
    outputSizeBytes?: number;
    outputHash?: string;
    threats?: Array<{
      type: string;
      severity: string;
      pattern: string;
    }>;
    timestamp?: number;
  };
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
          {sorted.map((entry, idx) => (
            <TableRow
              key={`${entry.timestamp}-${idx}`}
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
        {['Time', 'Agent', 'Server', 'Tool', 'Source', 'Outcome'].map((h) => (
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
  const [expanded, setExpanded] = useState(false);

  // Slide-in animation on first mount — motion only on data arrival (D-033 discipline)
  useEffect(() => {
    if (!isNew || !rowRef.current) return;
    rowRef.current.classList.add('animate-slide-in');
  }, [isNew]);

  return (
    <>
      <tr
        ref={rowRef}
        className="border-b border-border-subtle last:border-0 hover:bg-overlay transition-colors duration-100 cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <td className="px-4 py-3 font-mono text-[12px] text-muted whitespace-nowrap">
          <span className="mr-1 text-dim">{expanded ? '\u25BC' : '\u25B6'}</span>
          {formatTimestamp(entry.timestamp)}
        </td>
        <td className="px-4 py-3 max-w-[200px]" title={`${entry.agentId}\n${entry.sessionId}`}>
          <AgentSessionLabel agentId={entry.agentId} sessionName={entry.sessionName} />
        </td>
        <td className="px-4 py-3 font-mono text-[12px] text-muted max-w-[120px] truncate">
          {entry.serverId}
        </td>
        <td className="px-4 py-3">
          <span className="font-mono text-[12px] text-accent bg-[color-mix(in_srgb,var(--rind-accent)_8%,transparent)] px-2 py-0.5 rounded" title={entry.toolName}>
            {entry.toolLabel ?? clientDeriveToolLabel(entry.toolName, entry.input)}
          </span>
        </td>
        <td className="px-4 py-3">
          <SourceBadge source={entry.source} />
        </td>
        <td className="px-4 py-3">
          {entry.outcome && <OutcomeBadge outcome={entry.outcome} />}
        </td>
      </tr>
      {expanded && (
        <tr className="border-b border-border-subtle">
          <td colSpan={6} className="px-4 py-3 bg-[var(--rind-overlay)]">
            <InputDetail
              input={entry.input}
              cwd={entry.cwd}
              reason={entry.reason}
              matchedRule={entry.matchedRule}
              agentId={entry.agentId}
              sessionId={entry.sessionId}
              sessionName={entry.sessionName}
              response={entry.response}
              correlationId={entry.correlationId}
            />
          </td>
        </tr>
      )}
    </>
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
    'upstream-error': {
      label: 'UPSTREAM ERROR',
      style: {
        color: 'var(--rind-medium)',
        background: 'color-mix(in srgb, var(--rind-medium) 10%, transparent)',
        borderColor: 'color-mix(in srgb, var(--rind-medium) 24%, transparent)',
      },
    },
    'upstream-timeout': {
      label: 'TIMED OUT',
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

// Source badge — BUILTIN / MCP / PROXY
function SourceBadge({ source }: { source?: 'builtin' | 'mcp' | 'proxy' }) {
  if (!source) return null;

  const config: Record<'builtin' | 'mcp' | 'proxy', { label: string; style: React.CSSProperties }> = {
    mcp: {
      label: 'MCP',
      style: {
        color: 'var(--rind-accent)',
        background: 'color-mix(in srgb, var(--rind-accent) 10%, transparent)',
        borderColor: 'color-mix(in srgb, var(--rind-accent) 24%, transparent)',
      },
    },
    builtin: {
      label: 'BUILTIN',
      style: {
        color: 'var(--rind-foreground-muted)',
        background: 'var(--rind-overlay)',
        borderColor: 'var(--rind-border-subtle)',
      },
    },
    proxy: {
      label: 'PROXY',
      style: {
        color: 'var(--rind-foreground-muted)',
        background: 'var(--rind-overlay)',
        borderColor: 'var(--rind-border-subtle)',
      },
    },
  };

  const { label, style } = config[source];
  return (
    <span
      className="font-mono text-[10px] tracking-[0.04em] px-2 py-0.5 rounded border"
      style={style}
    >
      {label}
    </span>
  );
}

// Expandable input detail panel
function InputDetail({ input, cwd, reason, matchedRule, agentId, sessionId, sessionName, response, correlationId }: {
  input: unknown;
  cwd?: string;
  reason?: string;
  matchedRule?: string;
  agentId: string;
  sessionId: string;
  sessionName?: string;
  response?: ToolCallEntry['response'];
  correlationId?: string;
}) {
  const [tab, setTab] = useState<'input' | 'response'>('input');
  const inputStr = formatInput(input);
  const hasInput = input != null && JSON.stringify(input) !== '{}';
  const hasResponse = response != null;

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-x-6 gap-y-1">
        <DetailRow label="Agent ID" value={agentId} />
        <DetailRow label="Session ID" value={sessionId} />
        {sessionName && <DetailRow label="Session Name" value={sessionName} />}
        {cwd && <DetailRow label="Working Dir" value={cwd} />}
        {correlationId && <DetailRow label="Correlation" value={correlationId} />}
      </div>
      {reason && (
        <div className="flex gap-2 text-[11px]">
          <span className="text-dim font-medium w-20 shrink-0">Reason</span>
          <span className="font-mono text-critical">{reason}</span>
        </div>
      )}
      <DetailRow label="Matched Rule" value={matchedRule ?? '—'} />

      {/* Tabs: Input / Response */}
      {(hasInput || hasResponse) && (
        <div className="flex items-center gap-1 mt-2">
          <TabButton label="Input" active={tab === 'input'} onClick={() => setTab('input')} />
          <TabButton
            label={`Response${hasResponse ? '' : ' (pending)'}`}
            active={tab === 'response'}
            onClick={() => setTab('response')}
            disabled={!hasResponse}
          />
          {hasResponse && response.outputSizeBytes != null && (
            <span className="ml-auto text-[10px] text-dim font-mono">
              {formatBytes(response.outputSizeBytes)}
              {response.outputTruncated && ' (truncated)'}
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
        <ResponseDetail response={response} />
      )}
    </div>
  );
}

function TabButton({ label, active, onClick, disabled }: {
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

function ResponseDetail({ response }: { response: NonNullable<ToolCallEntry['response']> }) {
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

function formatInput(input: unknown): string {
  if (input == null) return '';
  try {
    const str = JSON.stringify(input, null, 2);
    // Truncate very long inputs for display
    return str.length > 2000 ? str.slice(0, 2000) + '\n... (truncated)' : str;
  } catch {
    return String(input);
  }
}

// Agent + Session label — two-line display: agent type on top, session name below
function AgentSessionLabel({ agentId, sessionName }: { agentId: string; sessionName?: string }) {
  const agentLabel = deriveAgentLabel(agentId);
  const sessionLabel = sessionName ?? deriveSessionLabel(agentId);

  return (
    <div className="flex flex-col gap-0.5">
      <span className="font-mono text-[11px] text-foreground font-medium truncate">
        {agentLabel}
      </span>
      <span className="font-mono text-[10px] text-dim truncate">
        {sessionLabel}
      </span>
    </div>
  );
}

// Derive a human-readable agent label from the agentId
function deriveAgentLabel(agentId: string): string {
  // hook:{session-uuid} → "claude-code"
  if (agentId.startsWith('hook:')) return 'claude-code';
  // Subagent IDs from Claude Code include agent_type
  // For now, just return the ID
  return agentId.length > 20 ? agentId.slice(0, 20) + '\u2026' : agentId;
}

// Derive a session label from the agentId when no session name is available
function deriveSessionLabel(agentId: string): string {
  if (agentId.startsWith('hook:')) {
    const uuid = agentId.slice(5);
    return uuid.slice(0, 8);
  }
  return agentId.slice(0, 8);
}

// Client-side fallback for old persisted events that lack toolLabel
function clientDeriveToolLabel(toolName: string, input: unknown): string {
  const inp = input as Record<string, unknown> | null | undefined;
  if (!inp || typeof inp !== 'object') return toolName;
  switch (toolName) {
    case 'Bash': {
      const cmd = typeof inp.command === 'string' ? inp.command.trim() : '';
      if (!cmd) return 'Bash';
      return cmd.length <= 60 ? `Bash: ${cmd}` : `Bash: ${cmd.split(/[\s|;&]/)[0] || cmd}`;
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
    case 'WebFetch': {
      const u = typeof inp.url === 'string' ? inp.url : '';
      return u ? `WebFetch: ${u.slice(0, 50)}` : 'WebFetch';
    }
    case 'WebSearch': {
      const q = typeof inp.query === 'string' ? inp.query : '';
      return q ? `WebSearch: ${q.slice(0, 50)}` : 'WebSearch';
    }
    default: return toolName;
  }
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
