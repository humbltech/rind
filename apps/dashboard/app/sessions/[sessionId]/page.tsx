// Session timeline page — /sessions/[sessionId]
//
// Renders the full conversation flow for a session using ConversationFlow,
// the same component used in the inline LLM call table expand.

'use client';

import { useState, useEffect, useMemo, use } from 'react';
import Link from 'next/link';
import {
  ArrowLeft, Zap, Wrench, ShieldX, ShieldCheck,
  AlertTriangle, FolderOpen, DollarSign, Clock,
} from 'lucide-react';
import type { LlmCallEntry, LlmThread } from '../../components/llm-call-table';
import { groupByConversation, ConversationFlow } from '../../components/llm-call-table';
import type { ToolCallEntry } from '../../components/tool-call-table';
import { getTimeline } from '../../lib/api';
import { Sidebar } from '../../components/sidebar';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.round(ms / 60_000)}m`;
}

function shortenPath(path: string): string {
  const m = path.match(/^\/Users\/[^/]+\/(.*)/);
  return m ? `~/${m[1]}` : path;
}

// ─── Stats strip ─────────────────────────────────────────────────────────────

function StatsStrip({ threads }: { threads: LlmThread[] }) {
  const stats = useMemo(() => {
    const llmCalls = threads.reduce((s, t) => s + t.calls.length, 0);
    const toolCalls = threads.reduce((s, t) => {
      let n = 0;
      for (const m of t.toolCallsByCallId.values()) n += m.size;
      return s + n;
    }, 0);
    const blocked = threads.reduce((s, t) => {
      let n = 0;
      for (const m of t.toolCallsByCallId.values()) {
        for (const tc of m.values()) {
          if (tc.outcome === 'blocked' || tc.outcome === 'disapproved') n++;
        }
      }
      return s + n;
    }, 0);
    const totalCost = threads.reduce((s, t) => s + t.totalCostUsd, 0);
    const timestamps = threads.flatMap((t) => [t.root.timestamp, t.latestTimestamp]);
    const duration = timestamps.length > 1
      ? fmtDuration(Math.max(...timestamps) - Math.min(...timestamps))
      : null;
    return { llmCalls, toolCalls, blocked, totalCost, duration };
  }, [threads]);

  const items = [
    { icon: Zap,      label: 'LLM',     value: String(stats.llmCalls),  color: '#818cf8' },
    { icon: Wrench,   label: 'Tools',   value: String(stats.toolCalls), color: 'var(--rind-foreground-muted)' },
    { icon: ShieldX,  label: 'Blocked', value: String(stats.blocked),   color: stats.blocked > 0 ? '#f87171' : 'var(--rind-foreground-dim)' },
    ...(stats.totalCost > 0
      ? [{ icon: DollarSign, label: 'Cost', value: stats.totalCost < 0.001 ? '<$0.001' : `$${stats.totalCost.toFixed(4)}`, color: 'var(--rind-foreground-muted)' }]
      : []),
    ...(stats.duration
      ? [{ icon: Clock, label: 'Duration', value: stats.duration, color: 'var(--rind-foreground-dim)' }]
      : []),
  ] as const;

  return (
    <div className="flex flex-wrap items-center gap-4 px-4 py-2.5 rounded-lg border border-border/50 bg-surface mb-6">
      {items.map(({ icon: Icon, label, value, color }) => (
        <div key={label} className="flex items-center gap-1.5">
          <Icon size={12} style={{ color }} strokeWidth={1.5} />
          <span className="font-mono text-[11px]" style={{ color }}>
            <span className="font-semibold">{value}</span>
            <span className="text-dim ml-1">{label}</span>
          </span>
        </div>
      ))}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SessionTimelinePage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = use(params);
  const [threads, setThreads]       = useState<LlmThread[]>([]);
  const [cwd, setCwd]               = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    let active = true;

    async function poll() {
      try {
        const events = await getTimeline({ sessionId });
        if (!active) return;

        // Split into typed arrays — both are structurally compatible with their entry types
        const llmEntries = events
          .filter((e) => e.kind === 'llm')
          .map((e) => e.data as unknown as LlmCallEntry);
        const toolEntries = events
          .filter((e) => e.kind === 'tool')
          .map((e) => e.data as unknown as ToolCallEntry);

        setThreads(groupByConversation(llmEntries, toolEntries));
        setIsConnected(true);

        // CWD: grab from the first tool event that has it
        if (!cwd) {
          for (const e of events) {
            if (e.kind === 'tool' && (e.data as { cwd?: string }).cwd) {
              setCwd((e.data as { cwd?: string }).cwd!);
              break;
            }
          }
        }
      } catch {
        if (active) setIsConnected(false);
      }
    }

    void poll();
    const id = setInterval(() => { void poll(); }, 2_000);
    return () => { active = false; clearInterval(id); };
  }, [sessionId]); // eslint-disable-line react-hooks/exhaustive-deps

  const blockedCount = useMemo(() => {
    return threads.reduce((s, t) => {
      for (const m of t.toolCallsByCallId.values()) {
        for (const tc of m.values()) {
          if (tc.outcome === 'blocked' || tc.outcome === 'disapproved') s++;
        }
      }
      return s;
    }, 0);
  }, [threads]);

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-6 py-8">

          {/* ── Header ── */}
          <div className="mb-8">
            <div className="flex items-center gap-3 mb-3">
              <Link href="/" className="flex items-center gap-1.5 text-dim hover:text-foreground transition-colors text-[12px] font-mono">
                <ArrowLeft size={13} />
                Overview
              </Link>
              <span className="text-border">·</span>

              {blockedCount > 0 ? (
                <div
                  className="flex items-center gap-1 px-2 py-0.5 rounded-full font-mono text-[10px] font-semibold"
                  style={{ color: '#f87171', background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.25)' }}
                >
                  <ShieldX size={9} />
                  {blockedCount} blocked
                </div>
              ) : threads.length > 0 ? (
                <div
                  className="flex items-center gap-1 px-2 py-0.5 rounded-full font-mono text-[10px] font-semibold"
                  style={{ color: '#4ade80', background: 'rgba(74,222,128,0.08)', border: '1px solid rgba(74,222,128,0.2)' }}
                >
                  <ShieldCheck size={9} />
                  clean
                </div>
              ) : null}

              <div className="ml-auto flex items-center gap-2">
                {isConnected ? (
                  <>
                    <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                    <span className="font-mono text-[9px] text-dim">live</span>
                  </>
                ) : (
                  <>
                    <AlertTriangle size={10} className="text-high" />
                    <span className="font-mono text-[9px] text-high">disconnected</span>
                  </>
                )}
              </div>
            </div>

            <h1 className="font-mono text-base font-semibold text-foreground tracking-tight">
              session:<span className="text-accent">{sessionId.slice(0, 8)}</span>
            </h1>
            <p className="font-mono text-[10px] text-dim mt-0.5">{sessionId}</p>
            {cwd && (
              <div className="flex items-center gap-1.5 mt-1">
                <FolderOpen size={11} className="text-dim" />
                <span className="font-mono text-[11px] text-muted">{shortenPath(cwd)}</span>
              </div>
            )}
          </div>

          {/* ── Stats ── */}
          {threads.length > 0 && <StatsStrip threads={threads} />}

          {/* ── Conversation threads ── */}
          {threads.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 gap-3">
              <ShieldCheck size={32} className="text-dim" strokeWidth={1} />
              <p className="text-sm text-muted">No events recorded yet</p>
              <p className="text-xs text-dim">Events appear here as tool calls and LLM calls happen</p>
            </div>
          ) : (
            <div className="space-y-6">
              {threads.map((thread, i) => (
                <div
                  key={thread.conversationId}
                  className="rounded-xl border border-border/60 bg-surface overflow-hidden"
                >
                  {threads.length > 1 && (
                    <div
                      className="flex items-center gap-2 px-4 py-2 border-b border-border/40"
                      style={{ background: 'var(--rind-overlay)' }}
                    >
                      <span className="font-mono text-[9px] font-bold text-dim uppercase tracking-wider">
                        Conversation {i + 1}
                      </span>
                      <span className="font-mono text-[9px] text-dim">
                        {thread.calls.length} turn{thread.calls.length !== 1 ? 's' : ''}
                      </span>
                    </div>
                  )}
                  <div className="px-4 py-3">
                    <ConversationFlow thread={thread} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
