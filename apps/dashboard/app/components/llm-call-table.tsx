// LlmCallTable — real-time log of LLM API calls intercepted by the proxy.
// Shows provider, model, token counts, estimated cost, latency, and outcome.
// Same design language as ToolCallTable — rows sorted newest-first.

'use client';

import { useState } from 'react';
import type React from 'react';
import { ChevronDown, ChevronRight, AlertTriangle } from 'lucide-react';

// ─── Data shape ───────────────────────────────────────────────────────────────

export interface LlmCallEntry {
  id: string;
  sessionId: string;
  agentId: string;
  provider: 'anthropic' | 'openai' | 'google';
  model: string;
  timestamp: number;
  streaming: boolean;
  messageCount: number;
  systemPromptLength: number;
  inputTokens?: number;
  outputTokens?: number;
  estimatedCostUsd?: number;
  ttfbMs?: number;
  totalDurationMs?: number;
  outcome: 'forwarded' | 'blocked' | 'error';
  statusCode?: number;
  errorMessage?: string;
  matchedRule?: string;
  requestThreats?: Array<{ type: string; severity: string; detail: string }>;
  responseThreats?: Array<{ type: string; severity: string; detail: string }>;
  toolUses?: Array<{ id: string; name: string; input: unknown }>;
  referencedToolUseIds?: string[];
  parentLlmCallId?: string;
  conversationId?: string;
}

// ─── Provider badge ───────────────────────────────────────────────────────────

const PROVIDER_LABEL: Record<string, { abbr: string; color: string }> = {
  anthropic: { abbr: 'A', color: 'var(--rind-accent)' },
  openai:    { abbr: 'O', color: '#10a37f' },
  google:    { abbr: 'G', color: '#4285f4' },
};

function ProviderBadge({ provider }: { provider: string }) {
  const { abbr, color } = PROVIDER_LABEL[provider] ?? { abbr: '?', color: 'var(--rind-muted)' };
  return (
    <span
      className="inline-flex items-center justify-center w-5 h-5 rounded text-[10px] font-bold shrink-0"
      style={{ backgroundColor: `color-mix(in srgb, ${color} 18%, transparent)`, color }}
      title={provider}
    >
      {abbr}
    </span>
  );
}

// ─── Outcome badge ────────────────────────────────────────────────────────────

function OutcomeBadge({ outcome }: { outcome: LlmCallEntry['outcome'] }) {
  const styles: Record<string, string> = {
    forwarded: 'text-accent bg-accent/10',
    blocked:   'text-critical bg-critical/10',
    error:     'text-high bg-high/10',
  };
  return (
    <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${styles[outcome] ?? 'text-muted bg-overlay'}`}>
      {outcome}
    </span>
  );
}

// ─── Token display ────────────────────────────────────────────────────────────

function Tokens({ entry }: { entry: LlmCallEntry }) {
  if (entry.inputTokens == null && entry.outputTokens == null) {
    return <span className="text-dim font-mono text-[11px]">—</span>;
  }
  return (
    <span className="font-mono text-[11px] text-foreground tabular-nums">
      {(entry.inputTokens ?? 0).toLocaleString()}
      <span className="text-dim mx-0.5">/</span>
      {(entry.outputTokens ?? 0).toLocaleString()}
    </span>
  );
}

// ─── Cost display ────────────────────────────────────────────────────────────

function Cost({ value }: { value?: number }) {
  if (value == null) return <span className="text-dim font-mono text-[11px]">—</span>;
  const formatted = value < 0.001
    ? `<$0.001`
    : `$${value.toFixed(4)}`;
  return <span className="font-mono text-[11px] text-foreground tabular-nums">{formatted}</span>;
}

// ─── Latency display ──────────────────────────────────────────────────────────

function Latency({ ttfbMs, totalMs }: { ttfbMs?: number; totalMs?: number }) {
  if (ttfbMs == null && totalMs == null) return <span className="text-dim font-mono text-[11px]">—</span>;
  const formatMs = (ms: number) => ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(1)}s`;
  return (
    <span className="font-mono text-[11px] text-foreground tabular-nums" title={`TTFB: ${ttfbMs != null ? formatMs(ttfbMs) : '—'}`}>
      {totalMs != null ? formatMs(totalMs) : ttfbMs != null ? formatMs(ttfbMs) : '—'}
    </span>
  );
}

// ─── Relative time ────────────────────────────────────────────────────────────

function RelTime({ ts }: { ts: number }) {
  const age = Math.max(0, Date.now() - ts);
  let label: string;
  if (age < 60_000) label = `${Math.floor(age / 1000)}s ago`;
  else if (age < 3_600_000) label = `${Math.floor(age / 60_000)}m ago`;
  else label = new Date(ts).toLocaleTimeString();
  return <span className="text-[11px] font-mono text-dim">{label}</span>;
}

// ─── Threat indicator ────────────────────────────────────────────────────────

function ThreatIndicator({ entry }: { entry: LlmCallEntry }) {
  const count = (entry.requestThreats?.length ?? 0) + (entry.responseThreats?.length ?? 0);
  if (count === 0) return null;
  return (
    <span title={`${count} threat(s) detected`}><AlertTriangle size={12} className="text-high shrink-0" /></span>
  );
}

// ─── Agent label ─────────────────────────────────────────────────────────────

function AgentLabel({ agentId, sessionId }: { agentId: string; sessionId: string }) {
  // llm-anthropic / llm-openai → strip prefix for display
  const label = agentId.startsWith('llm-')
    ? agentId.slice(4)
    : agentId.length > 16
      ? agentId.slice(0, 16) + '\u2026'
      : agentId;
  const sub = sessionId.slice(0, 8);
  return (
    <div className="flex flex-col gap-0.5 min-w-0">
      <span className="font-mono text-[11px] text-foreground font-medium truncate">{label}</span>
      <span className="font-mono text-[10px] text-dim truncate">{sub}</span>
    </div>
  );
}

// ─── Table row ────────────────────────────────────────────────────────────────

function TableRow({ entry }: { entry: LlmCallEntry }) {
  const [expanded, setExpanded] = useState(false);
  const hasDetail = !!entry.matchedRule || !!entry.errorMessage ||
    (entry.requestThreats?.length ?? 0) > 0 || (entry.responseThreats?.length ?? 0) > 0;

  return (
    <>
      <tr
        className="border-b border-border hover:bg-overlay/60 transition-colors duration-75 cursor-pointer"
        onClick={() => hasDetail && setExpanded((e) => !e)}
      >
        <td className="pl-4 pr-2 py-2.5 w-6">
          {hasDetail
            ? expanded
              ? <ChevronDown size={12} className="text-dim" />
              : <ChevronRight size={12} className="text-dim" />
            : null}
        </td>
        <td className="px-3 py-2.5 whitespace-nowrap">
          <RelTime ts={entry.timestamp} />
        </td>
        <td className="px-3 py-2.5 max-w-[130px]">
          <AgentLabel agentId={entry.agentId} sessionId={entry.sessionId} />
        </td>
        <td className="px-3 py-2.5">
          <div className="flex items-center gap-2">
            <ProviderBadge provider={entry.provider} />
            <span className="font-mono text-[12px] text-foreground truncate max-w-[200px]" title={entry.model}>
              {entry.model}
            </span>
            {entry.streaming && (
              <span className="text-[9px] text-dim bg-overlay px-1 rounded">stream</span>
            )}
            <ThreatIndicator entry={entry} />
          </div>
        </td>
        <td className="px-3 py-2.5 text-center text-[11px] text-muted">{entry.messageCount}</td>
        <td className="px-3 py-2.5">
          <Tokens entry={entry} />
        </td>
        <td className="px-3 py-2.5">
          <Cost value={entry.estimatedCostUsd} />
        </td>
        <td className="px-3 py-2.5">
          <Latency ttfbMs={entry.ttfbMs} totalMs={entry.totalDurationMs} />
        </td>
        <td className="px-3 py-2.5 pr-4">
          <OutcomeBadge outcome={entry.outcome} />
        </td>
      </tr>
      {expanded && hasDetail && (
        <tr className="bg-overlay/30 border-b border-border">
          <td colSpan={9} className="px-6 py-3">
            <DetailPanel entry={entry} />
          </td>
        </tr>
      )}
    </>
  );
}

function DetailPanel({ entry }: { entry: LlmCallEntry }) {
  const allThreats = [...(entry.requestThreats ?? []), ...(entry.responseThreats ?? [])];
  return (
    <div className="space-y-2 text-[11px] font-mono text-muted">
      {entry.conversationId && (
        <div><span className="text-dim">conversation: </span><span className="text-foreground">{entry.conversationId.slice(0, 16)}</span>
          {entry.parentLlmCallId && <span className="text-dim ml-3">← {entry.parentLlmCallId.slice(0, 8)}</span>}
        </div>
      )}
      {entry.toolUses && entry.toolUses.length > 0 && (
        <div className="space-y-0.5">
          <span className="text-dim">tool_uses generated:</span>
          {entry.toolUses.map((t) => (
            <div key={t.id} className="ml-4 flex items-center gap-2">
              <span className="text-accent">{t.name}</span>
              <span className="text-dim">{t.id.slice(0, 16)}</span>
            </div>
          ))}
        </div>
      )}
      {entry.referencedToolUseIds && entry.referencedToolUseIds.length > 0 && (
        <div><span className="text-dim">consuming tool_results: </span>
          <span className="text-foreground">{entry.referencedToolUseIds.map((id) => id.slice(0, 12)).join(', ')}</span>
        </div>
      )}
      {entry.matchedRule && (
        <div><span className="text-dim">rule: </span><span className="text-foreground">{entry.matchedRule}</span></div>
      )}
      {entry.errorMessage && (
        <div><span className="text-dim">error: </span><span className="text-critical">{entry.errorMessage}</span></div>
      )}
      {allThreats.length > 0 && (
        <div className="space-y-1">
          <span className="text-dim">threats:</span>
          {allThreats.map((t, i) => (
            <div key={i} className="ml-4 flex items-center gap-2">
              <span className="text-high">[{t.severity}]</span>
              <span className="text-foreground">{t.type}</span>
              <span className="text-dim">— {t.detail}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface LlmCallTableProps {
  entries: LlmCallEntry[];
  maxHeight?: string;
}

export function LlmCallTable({ entries, maxHeight = '420px' }: LlmCallTableProps) {
  if (entries.length === 0) {
    return (
      <div className="flex items-center justify-center h-24 text-sm text-dim border border-border rounded-lg">
        No LLM calls yet — set <code className="font-mono text-accent mx-1">ANTHROPIC_BASE_URL</code> to route calls through Rind
      </div>
    );
  }

  const sorted = [...entries].sort((a, b) => b.timestamp - a.timestamp);

  return (
    <div className="overflow-auto rounded-lg border border-border" style={{ maxHeight }}>
      <table className="w-full text-sm border-collapse">
        <thead className="sticky top-0 bg-surface border-b border-border z-10">
          <tr>
            <th className="pl-4 pr-2 py-2.5 w-6" />
            <th className="px-3 py-2.5 text-left text-[10px] font-semibold tracking-[0.1em] uppercase text-muted">Time</th>
            <th className="px-3 py-2.5 text-left text-[10px] font-semibold tracking-[0.1em] uppercase text-muted">Agent</th>
            <th className="px-3 py-2.5 text-left text-[10px] font-semibold tracking-[0.1em] uppercase text-muted">Model</th>
            <th className="px-3 py-2.5 text-center text-[10px] font-semibold tracking-[0.1em] uppercase text-muted">Msgs</th>
            <th className="px-3 py-2.5 text-left text-[10px] font-semibold tracking-[0.1em] uppercase text-muted">Tokens in/out</th>
            <th className="px-3 py-2.5 text-left text-[10px] font-semibold tracking-[0.1em] uppercase text-muted">Cost</th>
            <th className="px-3 py-2.5 text-left text-[10px] font-semibold tracking-[0.1em] uppercase text-muted">Latency</th>
            <th className="px-3 py-2.5 pr-4 text-left text-[10px] font-semibold tracking-[0.1em] uppercase text-muted">Outcome</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((entry) => (
            <TableRow key={entry.id} entry={entry} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
