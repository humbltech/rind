// Session timeline page — /sessions/[sessionId]
//
// Displays a chronological flow of LLM calls and tool calls for a single session.
// Events are shown as cards connected by a vertical timeline line.
// Outcome badges are color-coded: green=allowed, red=blocked, amber=approval, muted=error.

'use client';

import { useState, useEffect, useMemo, use } from 'react';
import Link from 'next/link';
import { ArrowLeft, Zap, Wrench, ShieldX, ShieldCheck, Clock, AlertTriangle, RefreshCw } from 'lucide-react';
import type { ToolCallEvent, LlmCallEvent } from '../../lib/api';
import { getTimeline } from '../../lib/api';
import { Sidebar } from '../../components/sidebar';

// ─── Types ────────────────────────────────────────────────────────────────────

type TimelineEvent =
  | { kind: 'tool'; timestamp: number; data: ToolCallEvent }
  | { kind: 'llm'; timestamp: number; data: LlmCallEvent };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function extractPromptPreview(messages: unknown): string {
  if (!Array.isArray(messages)) return '';
  // Find last user message
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i] as Record<string, unknown>;
    if (msg?.role !== 'user') continue;
    if (typeof msg.content === 'string') return msg.content;
    if (Array.isArray(msg.content)) {
      for (const block of msg.content) {
        const b = block as Record<string, unknown>;
        if (b?.type === 'text' && typeof b.text === 'string') return b.text;
      }
    }
  }
  return '';
}

function truncate(text: string, max = 120): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}…`;
}

function fmt(ms: number): string {
  return new Date(ms).toLocaleTimeString('en-US', {
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  });
}

function durationBetween(a: number, b: number): string {
  const diff = Math.abs(b - a);
  if (diff < 1000) return `${diff}ms`;
  if (diff < 60_000) return `${(diff / 1000).toFixed(1)}s`;
  return `${Math.round(diff / 60_000)}m`;
}

// ─── Outcome styling ──────────────────────────────────────────────────────────

type ToolOutcome = ToolCallEvent['outcome'];
type LlmOutcome = LlmCallEvent['outcome'];

function toolOutcomeStyle(outcome: ToolOutcome | undefined): { color: string; label: string; bg: string } {
  switch (outcome) {
    case 'allowed':
    case 'approved':
      return { color: '#4ade80', label: outcome.toUpperCase(), bg: 'rgba(74,222,128,0.08)' };
    case 'blocked':
    case 'disapproved':
      return { color: 'var(--rind-critical)', label: 'BLOCKED', bg: 'rgba(248,113,113,0.08)' };
    case 'require-approval':
      return { color: '#fbbf24', label: 'PENDING', bg: 'rgba(251,191,36,0.08)' };
    case 'approval-timeout':
      return { color: 'var(--rind-high)', label: 'TIMEOUT', bg: 'rgba(251,146,60,0.08)' };
    default:
      return { color: 'var(--rind-foreground-dim)', label: outcome?.toUpperCase() ?? '—', bg: 'transparent' };
  }
}

function llmOutcomeStyle(outcome: LlmOutcome): { color: string; label: string; bg: string } {
  switch (outcome) {
    case 'forwarded':
      return { color: '#4ade80', label: 'FORWARDED', bg: 'rgba(74,222,128,0.08)' };
    case 'blocked':
      return { color: 'var(--rind-critical)', label: 'BLOCKED', bg: 'rgba(248,113,113,0.08)' };
    case 'policy-violation':
      return { color: 'var(--rind-high)', label: 'VIOLATION', bg: 'rgba(251,146,60,0.08)' };
    case 'error':
      return { color: 'var(--rind-foreground-dim)', label: 'ERROR', bg: 'transparent' };
  }
}

const PROVIDER_COLORS: Record<string, string> = {
  anthropic: 'var(--rind-accent)',
  openai:    '#10a37f',
  google:    '#4285f4',
};

// ─── Event cards ──────────────────────────────────────────────────────────────

function LlmCard({ event }: { event: LlmCallEvent }) {
  const [expanded, setExpanded] = useState(false);
  const style = llmOutcomeStyle(event.outcome);
  const providerColor = PROVIDER_COLORS[event.provider] ?? 'var(--rind-foreground-muted)';
  const promptPreview = useMemo(() => truncate(extractPromptPreview(event.messages as unknown)), [event.messages]);
  const costStr = event.estimatedCostUsd != null
    ? (event.estimatedCostUsd < 0.001 ? '<$0.001' : `$${event.estimatedCostUsd.toFixed(4)}`)
    : null;

  return (
    <div
      className="flex-1 rounded-xl border overflow-hidden cursor-pointer hover:brightness-110 transition-all duration-150"
      style={{ borderColor: `color-mix(in srgb, ${providerColor} 25%, var(--rind-border))`, background: 'var(--rind-surface)' }}
      onClick={() => setExpanded((e) => !e)}
    >
      {/* Top bar */}
      <div className="flex items-center gap-3 px-4 py-3 border-b" style={{ borderColor: `color-mix(in srgb, ${providerColor} 15%, var(--rind-border-subtle))` }}>
        <span className="font-mono text-[9px] font-semibold tracking-widest px-2 py-0.5 rounded-full"
          style={{ color: providerColor, background: `color-mix(in srgb, ${providerColor} 14%, transparent)`, border: `1px solid color-mix(in srgb, ${providerColor} 30%, transparent)` }}>
          LLM
        </span>
        <span className="font-mono text-[11px] text-muted">{fmt(event.timestamp)}</span>
        <span className="font-mono text-[12px] font-medium flex-1 truncate" style={{ color: providerColor }}>{event.model}</span>
        {/* Outcome badge */}
        <span className="font-mono text-[10px] font-semibold px-2 py-0.5 rounded"
          style={{ color: style.color, background: style.bg }}>
          {style.label}
        </span>
      </div>

      {/* Prompt preview */}
      <div className="px-4 py-3 space-y-2">
        {promptPreview ? (
          <p className="text-[12px] text-foreground/80 leading-relaxed font-sans">{promptPreview}</p>
        ) : (
          <p className="text-[11px] text-dim italic">No prompt preview available</p>
        )}

        {/* Meta row */}
        <div className="flex items-center gap-4 pt-1">
          {event.inputTokens != null && (
            <span className="font-mono text-[10px] text-dim">{event.inputTokens.toLocaleString()} in · {event.outputTokens?.toLocaleString() ?? '?'} out</span>
          )}
          {costStr && <span className="font-mono text-[10px] text-muted">{costStr}</span>}
          {event.totalDurationMs != null && (
            <span className="font-mono text-[10px] text-dim">{event.totalDurationMs}ms</span>
          )}
          {event.matchedRule && (
            <span className="font-mono text-[10px]" style={{ color: style.color }}>rule: {event.matchedRule}</span>
          )}
        </div>

        {/* Expanded: response preview */}
        {expanded && event.responseText && (
          <div className="mt-2 pt-2 border-t" style={{ borderColor: 'var(--rind-border-subtle)' }}>
            <p className="text-[10px] text-dim mb-1 font-mono uppercase tracking-wider">Response</p>
            <p className="text-[12px] text-foreground/70 leading-relaxed">{truncate(event.responseText, 300)}</p>
          </div>
        )}
        {expanded && event.requestThreats && event.requestThreats.length > 0 && (
          <div className="mt-2 pt-2 border-t" style={{ borderColor: 'var(--rind-border-subtle)' }}>
            <p className="text-[10px] font-mono text-high mb-1">Request threats detected</p>
            {event.requestThreats.map((t, i) => (
              <p key={i} className="text-[11px] text-muted font-mono">{String(t)}</p>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ToolCard({ event }: { event: ToolCallEvent }) {
  const [expanded, setExpanded] = useState(false);
  const style = toolOutcomeStyle(event.outcome);
  const label = event.toolLabel ?? event.toolName;

  const inputPreview = useMemo(() => {
    if (typeof event.input === 'object' && event.input !== null) {
      const obj = event.input as Record<string, unknown>;
      const firstVal = Object.values(obj)[0];
      if (typeof firstVal === 'string') return truncate(firstVal, 100);
    }
    return truncate(JSON.stringify(event.input), 100);
  }, [event.input]);

  return (
    <div
      className="flex-1 rounded-xl border overflow-hidden cursor-pointer hover:brightness-110 transition-all duration-150"
      style={{ borderColor: `color-mix(in srgb, ${style.color} 20%, var(--rind-border))`, background: 'var(--rind-surface)' }}
      onClick={() => setExpanded((e) => !e)}
    >
      {/* Top bar */}
      <div className="flex items-center gap-3 px-4 py-3 border-b" style={{ borderColor: 'var(--rind-border-subtle)' }}>
        <span className="font-mono text-[9px] font-semibold tracking-widest px-2 py-0.5 rounded-full"
          style={{ color: 'var(--rind-foreground-muted)', background: 'var(--rind-overlay)', border: '1px solid var(--rind-border-subtle)' }}>
          TOOL
        </span>
        <span className="font-mono text-[11px] text-muted">{fmt(event.timestamp)}</span>
        <span className="font-mono text-[13px] font-medium flex-1 truncate text-foreground">{label}</span>
        {event.outcome && (
          <span className="font-mono text-[10px] font-semibold px-2 py-0.5 rounded"
            style={{ color: style.color, background: style.bg }}>
            {style.label}
          </span>
        )}
      </div>

      {/* Input preview */}
      <div className="px-4 py-3 space-y-2">
        <p className="text-[12px] text-foreground/70 font-mono leading-relaxed">{inputPreview}</p>

        {/* Meta row */}
        <div className="flex items-center gap-4 pt-1">
          <span className="font-mono text-[10px] text-dim">{event.serverId}</span>
          {event.matchedRule && (
            <span className="font-mono text-[10px]" style={{ color: style.color }}>
              rule: {event.matchedRule}
            </span>
          )}
          {event.reason && event.outcome === 'blocked' && (
            <span className="font-mono text-[10px] text-high truncate max-w-[300px]">{truncate(event.reason, 80)}</span>
          )}
        </div>

        {/* Expanded: full input */}
        {expanded && (
          <div className="mt-2 pt-2 border-t" style={{ borderColor: 'var(--rind-border-subtle)' }}>
            <p className="text-[10px] text-dim mb-1 font-mono uppercase tracking-wider">Full input</p>
            <pre className="text-[10px] text-foreground/60 font-mono whitespace-pre-wrap break-all">
              {JSON.stringify(event.input, null, 2)}
            </pre>
          </div>
        )}
        {expanded && event.response?.outputPreview && (
          <div className="mt-2 pt-2 border-t" style={{ borderColor: 'var(--rind-border-subtle)' }}>
            <p className="text-[10px] text-dim mb-1 font-mono uppercase tracking-wider">Output preview</p>
            <p className="text-[11px] text-foreground/60 font-mono">{truncate(event.response.outputPreview, 200)}</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Timeline connector ───────────────────────────────────────────────────────

function EventNode({ kind, outcome }: { kind: 'tool' | 'llm'; outcome: string }) {
  const isBlocked = outcome === 'blocked' || outcome === 'disapproved';
  const isAllowed = outcome === 'allowed' || outcome === 'approved' || outcome === 'forwarded';
  const bgColor = isBlocked ? 'var(--rind-critical)' : isAllowed ? '#4ade80' : '#fbbf24';

  return (
    <div
      className="relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
      style={{
        background: `color-mix(in srgb, ${bgColor} 15%, var(--rind-surface))`,
        border: `2px solid color-mix(in srgb, ${bgColor} 60%, transparent)`,
        boxShadow: `0 0 12px color-mix(in srgb, ${bgColor} 20%, transparent)`,
      }}
    >
      {kind === 'llm'
        ? <Zap size={13} style={{ color: bgColor }} strokeWidth={2} />
        : <Wrench size={12} style={{ color: bgColor }} strokeWidth={2} />
      }
    </div>
  );
}

// ─── Stats header ─────────────────────────────────────────────────────────────

function SessionStats({ events }: { events: TimelineEvent[] }) {
  const stats = useMemo(() => {
    const total = events.length;
    const blocked = events.filter((e) => {
      if (e.kind === 'tool') return e.data.outcome === 'blocked' || e.data.outcome === 'disapproved';
      return e.data.outcome === 'blocked';
    }).length;
    const llmCalls = events.filter((e) => e.kind === 'llm').length;
    const toolCalls = events.filter((e) => e.kind === 'tool').length;
    const timestamps = events.map((e) => e.timestamp);
    const first = timestamps.length ? Math.min(...timestamps) : null;
    const last  = timestamps.length ? Math.max(...timestamps) : null;
    const duration = first != null && last != null ? durationBetween(first, last) : null;
    return { total, blocked, llmCalls, toolCalls, first, last, duration };
  }, [events]);

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
      {[
        { label: 'Total events', value: stats.total, icon: Clock },
        { label: 'LLM calls', value: stats.llmCalls, icon: Zap },
        { label: 'Tool calls', value: stats.toolCalls, icon: Wrench },
        { label: 'Blocked', value: stats.blocked, icon: ShieldX, alert: stats.blocked > 0 },
      ].map(({ label, value, icon: Icon, alert }) => (
        <div key={label} className="flex items-center gap-3 px-4 py-3 rounded-xl border"
          style={{
            background: 'var(--rind-surface)',
            borderColor: alert ? 'color-mix(in srgb, var(--rind-critical) 30%, var(--rind-border))' : 'var(--rind-border-subtle)',
          }}>
          <Icon size={16} style={{ color: alert ? 'var(--rind-critical)' : 'var(--rind-foreground-dim)' }} strokeWidth={1.5} />
          <div>
            <p className="text-[22px] font-semibold font-mono leading-none" style={{ color: alert ? 'var(--rind-critical)' : 'var(--rind-foreground)' }}>
              {value}
            </p>
            <p className="text-[10px] text-dim mt-0.5">{label}</p>
          </div>
        </div>
      ))}
      {stats.duration && (
        <div className="col-span-2 sm:col-span-4 flex items-center gap-2 text-[11px] text-dim font-mono">
          <Clock size={11} />
          {stats.first ? fmt(stats.first) : '?'} → {stats.last ? fmt(stats.last) : '?'}
          <span className="text-muted">({stats.duration})</span>
        </div>
      )}
    </div>
  );
}

// ─── Main timeline ────────────────────────────────────────────────────────────

function SessionTimeline({ events }: { events: TimelineEvent[] }) {
  if (events.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <ShieldCheck size={32} className="text-dim" strokeWidth={1} />
        <p className="text-sm text-muted">No events recorded for this session</p>
        <p className="text-xs text-dim">Events appear here as tool calls and LLM calls happen</p>
      </div>
    );
  }

  // Ascending order for session view (shows the story chronologically)
  const sorted = [...events].sort((a, b) => a.timestamp - b.timestamp);

  return (
    <div className="relative">
      {/* Vertical connector line */}
      <div
        className="absolute left-3.5 top-4 bottom-4 w-px"
        style={{ background: 'linear-gradient(to bottom, transparent, var(--rind-border-subtle) 8%, var(--rind-border-subtle) 92%, transparent)' }}
      />

      <div className="space-y-4">
        {sorted.map((event, i) => {
          const outcome = event.kind === 'tool'
            ? (event.data.outcome ?? 'allowed')
            : event.data.outcome;
          // Show time delta between consecutive events
          const prevTs = i > 0 ? sorted[i - 1]!.timestamp : null;
          const delta = prevTs != null ? durationBetween(prevTs, event.timestamp) : null;

          return (
            <div key={event.kind === 'llm' ? event.data.id : `${event.data.timestamp}-${i}`}>
              {/* Time delta between events */}
              {delta && i > 0 && (
                <div className="flex items-center gap-2 ml-8 mb-2">
                  <Clock size={9} className="text-dim" />
                  <span className="font-mono text-[9px] text-dim">+{delta}</span>
                </div>
              )}

              <div className="flex items-start gap-4">
                <EventNode kind={event.kind} outcome={outcome} />
                {event.kind === 'llm'
                  ? <LlmCard event={event.data} />
                  : <ToolCard event={event.data} />
                }
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SessionTimelinePage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = use(params);
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  useEffect(() => {
    let active = true;

    async function poll() {
      try {
        const data = await getTimeline({ sessionId });
        if (active) {
          setEvents(data);
          setIsConnected(true);
          setLastUpdated(new Date());
        }
      } catch {
        if (active) setIsConnected(false);
      }
    }

    void poll();
    const id = setInterval(() => { void poll(); }, 2_000);
    return () => { active = false; clearInterval(id); };
  }, [sessionId]);

  const shortId = sessionId.slice(0, 12);
  const blocked = events.filter((e) => {
    if (e.kind === 'tool') return e.data.outcome === 'blocked';
    return e.data.outcome === 'blocked';
  }).length;

  return (
    <div className="flex h-screen overflow-hidden bg-canvas">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-6 py-8">

          {/* Header */}
          <div className="flex items-center gap-4 mb-6">
            <Link
              href="/"
              className="flex items-center gap-1.5 text-dim hover:text-foreground transition-colors text-sm"
            >
              <ArrowLeft size={14} />
              Overview
            </Link>
            <div className="h-4 w-px bg-border-subtle" />
            <div className="flex items-center gap-3 min-w-0">
              <div className="flex flex-col min-w-0">
                <div className="flex items-center gap-2">
                  <h1 className="font-mono text-sm font-semibold text-foreground truncate">
                    session:{shortId}
                  </h1>
                  {blocked > 0 && (
                    <div className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold"
                      style={{ color: 'var(--rind-critical)', background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.25)' }}>
                      <ShieldX size={9} />
                      {blocked} blocked
                    </div>
                  )}
                  {blocked === 0 && events.length > 0 && (
                    <div className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold"
                      style={{ color: '#4ade80', background: 'rgba(74,222,128,0.08)', border: '1px solid rgba(74,222,128,0.2)' }}>
                      <ShieldCheck size={9} />
                      clean
                    </div>
                  )}
                </div>
                <p className="font-mono text-[10px] text-dim mt-0.5 truncate">{sessionId}</p>
              </div>
            </div>

            {/* Connection status */}
            <div className="ml-auto flex items-center gap-2">
              {isConnected ? (
                <>
                  <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                  <span className="text-[10px] text-dim font-mono">live</span>
                </>
              ) : (
                <>
                  <AlertTriangle size={11} className="text-high" />
                  <span className="text-[10px] text-high font-mono">disconnected</span>
                </>
              )}
              {lastUpdated && (
                <span className="text-[10px] text-dim font-mono ml-1">
                  {lastUpdated.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}
                </span>
              )}
            </div>
          </div>

          {/* Stats */}
          {events.length > 0 && <SessionStats events={events} />}

          {/* Timeline */}
          <SessionTimeline events={events} />

          {/* Refresh hint when empty */}
          {events.length === 0 && isConnected && (
            <div className="flex items-center justify-center gap-2 mt-6 text-dim text-[11px] font-mono">
              <RefreshCw size={11} className="animate-spin" />
              polling every 2s...
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
