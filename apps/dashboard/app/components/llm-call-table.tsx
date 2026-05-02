// LlmCallTable — real-time log of LLM API calls intercepted by the proxy.
// Shows provider, model, token counts, estimated cost, latency, and outcome.
// Same design language as ToolCallTable — rows sorted newest-first.

'use client';

import { Fragment, useState } from 'react';
import type React from 'react';
import Link from 'next/link';
import { ChevronDown, ChevronRight, AlertTriangle } from 'lucide-react';
import type { ContentInspectionAudit } from '@rind/core';
import type { ToolCallEntry } from './tool-call-table';

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
  outcome: 'forwarded' | 'blocked' | 'error' | 'policy-violation';
  statusCode?: number;
  errorMessage?: string;
  matchedRule?: string;
  requestThreats?: Array<{ type: string; severity: string; detail: string }>;
  responseThreats?: Array<{ type: string; severity: string; detail: string }>;
  toolUses?: Array<{ id: string; name: string; input: unknown }>;
  referencedToolUseIds?: string[];
  parentLlmCallId?: string;
  conversationId?: string;
  // Content — present when logLevel is 'full' or 'preview'
  messages?: unknown;
  responseText?: string;
  contentInspection?: ContentInspectionAudit;
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
    forwarded:          'text-accent bg-accent/10',
    blocked:            'text-critical bg-critical/10',
    error:              'text-high bg-high/10',
    'policy-violation': 'text-warning bg-warning/10',
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
      <Link
        href={`/sessions/${sessionId}`}
        className="font-mono text-[10px] text-dim hover:text-accent truncate"
        onClick={(e) => e.stopPropagation()}
      >
        {sub}
      </Link>
    </div>
  );
}

// ─── Conversation thread grouping ────────────────────────────────────────────

export interface LlmThread {
  conversationId: string;
  calls: LlmCallEntry[];      // chronological order
  root: LlmCallEntry;         // first call (model, agent, provider)
  latestTimestamp: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCostUsd: number;
  worstOutcome: LlmCallEntry['outcome'];
  /** Unique tool names called across all turns, in order of first appearance */
  toolNames: string[];
  /** tool_use_id → tool name — for resolving referencedToolUseIds to names */
  toolNameById: Map<string, string>;
  /**
   * Per-call correlation: callId → (tool_use_id → ToolCallEntry).
   * Lets the detail panel show the actual blocked/allowed outcome next to each tool_use.
   */
  toolCallsByCallId: Map<string, Map<string, ToolCallEntry>>;
}

/**
 * For each tool_use block in an LLM turn, find the matching intercepted tool call event.
 * Matches by sessionId + toolName within the turn's time window, in order.
 */
function correlateToolCalls(
  toolUses: Array<{ id: string; name: string }> | undefined,
  sessionId: string,
  afterMs: number,
  beforeMs: number,
  toolCalls: ToolCallEntry[],
): Map<string, ToolCallEntry> {
  const result = new Map<string, ToolCallEntry>();
  if (!toolUses?.length) return result;

  const candidates = toolCalls
    .filter((tc) => tc.sessionId === sessionId && tc.timestamp >= afterMs && tc.timestamp <= beforeMs)
    .sort((a, b) => a.timestamp - b.timestamp);

  const used = new Set<number>();
  for (const tu of toolUses) {
    const idx = candidates.findIndex((tc, i) => !used.has(i) && tc.toolName === tu.name);
    if (idx !== -1) {
      used.add(idx);
      result.set(tu.id, candidates[idx]!);
    }
  }
  return result;
}

export function groupByConversation(entries: LlmCallEntry[], allToolCalls: ToolCallEntry[] = []): LlmThread[] {
  const map = new Map<string, LlmCallEntry[]>();
  for (const entry of entries) {
    const key = entry.conversationId ?? entry.id;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(entry);
  }

  const outcomeRank: Record<string, number> = { forwarded: 0, error: 1, 'policy-violation': 2, blocked: 3 };

  return Array.from(map.entries())
    .map(([convId, calls]) => {
      const sorted = [...calls].sort((a, b) => a.timestamp - b.timestamp);
      const root = sorted.find((e) => e.id === e.conversationId) ?? sorted[0]!;
      const worstOutcome = calls.reduce<LlmCallEntry['outcome']>(
        (worst, e) => (outcomeRank[e.outcome] ?? 0) > (outcomeRank[worst] ?? 0) ? e.outcome : worst,
        'forwarded',
      );

      // Build id→name map and unique name list from all tool_use blocks across all turns
      const toolNameById = new Map<string, string>();
      const toolNamesSeen = new Set<string>();
      const toolNames: string[] = [];
      for (const call of sorted) {
        for (const t of call.toolUses ?? []) {
          toolNameById.set(t.id, t.name);
          if (!toolNamesSeen.has(t.name)) {
            toolNamesSeen.add(t.name);
            toolNames.push(t.name);
          }
        }
      }

      // Correlate each call's tool_uses with real intercepted tool call events.
      // Time window: from this call's timestamp to the next call's timestamp (+ 30s buffer).
      const toolCallsByCallId = new Map<string, Map<string, ToolCallEntry>>();
      for (let i = 0; i < sorted.length; i++) {
        const call = sorted[i]!;
        const nextTs = sorted[i + 1]?.timestamp ?? call.timestamp + 30_000;
        toolCallsByCallId.set(
          call.id,
          correlateToolCalls(call.toolUses, call.sessionId, call.timestamp, nextTs, allToolCalls),
        );
      }

      return {
        conversationId: convId,
        calls: sorted,
        root,
        latestTimestamp: Math.max(...calls.map((e) => e.timestamp)),
        totalInputTokens: calls.reduce((s, e) => s + (e.inputTokens ?? 0), 0),
        totalOutputTokens: calls.reduce((s, e) => s + (e.outputTokens ?? 0), 0),
        totalCostUsd: calls.reduce((s, e) => s + (e.estimatedCostUsd ?? 0), 0),
        worstOutcome,
        toolNames,
        toolNameById,
        toolCallsByCallId,
      };
    })
    .sort((a, b) => b.latestTimestamp - a.latestTimestamp);
}

// ─── Conversation flow — vertical timeline of actors ─────────────────────────

// Actor color tokens — teal for user-side, indigo for LLM, dim for results
const ACTOR_COLORS = {
  USER:        'var(--rind-accent)',
  ASSISTANT:   '#818cf8',
  TOOL:        'var(--rind-accent)',
  TOOL_RESULT: 'var(--rind-foreground-dim, #525263)',
} as const;

// Thin vertical connector between flow blocks
function FlowConnector() {
  return <div className="w-px h-3 ml-[5px]" style={{ background: 'var(--rind-border)' }} />;
}

// Bold caps actor label with a left color stripe
function ActorLabel({ color, label, children }: { color: string; label: string; children?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 min-w-0">
      <div className="w-0.5 h-3.5 rounded-full shrink-0" style={{ background: color }} />
      <span className="font-mono text-[9px] font-bold tracking-[0.1em] uppercase shrink-0" style={{ color }}>
        {label}
      </span>
      {children}
    </div>
  );
}

// Meta line shown in the ASSISTANT header: model · in↑ out↓ · $cost · latency
function AssistantMeta({ call }: { call: LlmCallEntry }) {
  const fmt = (ms: number) => ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(1)}s`;
  const parts: string[] = [];
  if (call.inputTokens != null || call.outputTokens != null) {
    parts.push(`${(call.inputTokens ?? 0).toLocaleString()}\u2191\u00a0${(call.outputTokens ?? 0).toLocaleString()}\u2193`);
  }
  if (call.estimatedCostUsd != null) {
    parts.push(call.estimatedCostUsd < 0.001 ? '<$0.001' : `$${call.estimatedCostUsd.toFixed(4)}`);
  }
  if (call.totalDurationMs != null) parts.push(fmt(call.totalDurationMs));
  else if (call.ttfbMs != null) parts.push(fmt(call.ttfbMs));
  return (
    <span className="font-mono text-[10px] text-dim ml-1">
      {call.model}
      {parts.length > 0 && <span className="ml-1 text-dim/70">\u00b7 {parts.join(' \u00b7 ')}</span>}
    </span>
  );
}

// Rind intercept verdict indented under a TOOL section
function RindVerdict({ tc }: { tc: ToolCallEntry }) {
  const blocked = tc.outcome === 'blocked';
  const allowed = tc.outcome === 'allowed' || tc.outcome === 'approved';
  if (!blocked && !allowed) return null;
  const color = blocked ? '#f87171' : '#4ade80';
  // For blocked calls: show what error was sent back to the LLM so the user understands
  // why the next assistant turn says "I was unable to..." — prefer the actual output over the reason.
  const returnedToLlm = blocked ? (tc.response?.outputPreview ?? tc.reason) : undefined;
  return (
    <div className="pl-5 mt-0.5 space-y-0.5">
      <div className="flex items-center gap-1.5 flex-wrap">
        <div className="w-0.5 h-3 rounded-full shrink-0" style={{ background: color }} />
        <span className="font-mono text-[9px] font-bold tracking-[0.1em] uppercase" style={{ color }}>RIND</span>
        <span
          className="font-mono text-[9px] px-1.5 py-0.5 rounded"
          style={{ color, background: `color-mix(in srgb, ${color} 12%, transparent)` }}
        >
          {blocked ? '\u26d4 BLOCKED' : '\u2713 ALLOWED'}
        </span>
        {tc.matchedRule && (
          <span className="font-mono text-[9px] text-dim">
            rule: <span style={{ color: '#fbbf24' }}>{tc.matchedRule}</span>
          </span>
        )}
      </div>
      {returnedToLlm && (
        <div className="pl-5 flex items-start gap-1 font-mono text-[9px]">
          <span className="text-dim shrink-0">→ returned to LLM:</span>
          <span className="text-dim break-all" style={{ color: blocked ? 'color-mix(in srgb, #f87171 70%, var(--rind-foreground-dim))' : 'var(--rind-foreground-dim)' }}>
            {returnedToLlm.slice(0, 200)}{returnedToLlm.length > 200 ? '…' : ''}
          </span>
        </div>
      )}
    </div>
  );
}

// A single tool_use block + verdict, indented under ASSISTANT
function ToolUseBlock({ tu, verdict }: {
  tu: { id: string; name: string; input: unknown };
  verdict: ToolCallEntry | undefined;
}) {
  const summary = summariseToolInput(tu.name, tu.input);
  return (
    <div className="pl-4 mt-1.5">
      <ActorLabel color={ACTOR_COLORS.TOOL} label="TOOL">
        <span className="font-mono text-[11px] font-semibold shrink-0" style={{ color: ACTOR_COLORS.TOOL }}>
          {tu.name}
        </span>
        {summary && <span className="font-mono text-[10px] text-dim truncate max-w-[280px]">{summary}</span>}
      </ActorLabel>
      {verdict && <RindVerdict tc={verdict} />}
    </div>
  );
}

// USER message block
function UserBlock({ text, annotations }: { text: string; annotations: TextAnnotation[] }) {
  const truncated = text.slice(0, 3000);
  return (
    <div className="pl-1">
      <ActorLabel color={ACTOR_COLORS.USER} label="USER" />
      <div className="mt-1 ml-3 font-mono text-[11px] text-foreground bg-[#0d0d0d] rounded border border-border p-2 max-h-36 overflow-auto leading-relaxed">
        <AnnotatedText text={truncated} annotations={annotations} />
        {text.length > 3000 && <span className="text-dim"> …</span>}
      </div>
    </div>
  );
}

// ASSISTANT response block
function AssistantBlock({ call, text, toolUses, verdictMap, annotations }: {
  call: LlmCallEntry;
  text: string | null;
  toolUses: Array<{ id: string; name: string; input: unknown }>;
  verdictMap: Map<string, ToolCallEntry>;
  annotations: TextAnnotation[];
}) {
  const truncated = text ? text.slice(0, 4000) : null;
  return (
    <div className="pl-1">
      <ActorLabel color={ACTOR_COLORS.ASSISTANT} label="ASSISTANT">
        <AssistantMeta call={call} />
        {call.outcome !== 'forwarded' && (
          <span className="ml-1"><OutcomeBadge outcome={call.outcome} /></span>
        )}
      </ActorLabel>
      {truncated ? (
        <div className="mt-1 ml-3 font-mono text-[11px] text-foreground bg-[#0d0d0d] rounded border border-border p-2 max-h-36 overflow-auto leading-relaxed">
          <AnnotatedText text={truncated} annotations={annotations} />
          {text!.length > 4000 && <span className="text-dim"> …</span>}
        </div>
      ) : !toolUses.length && (
        <span className="ml-3 font-mono text-[10px] text-dim italic">response not captured</span>
      )}
      {toolUses.map((tu) => (
        <ToolUseBlock key={tu.id} tu={tu} verdict={verdictMap.get(tu.id)} />
      ))}
    </div>
  );
}

// TOOL RESULT block
function ToolResultBlock({ toolName, content }: { toolName: string | undefined; content: string }) {
  const truncated = content.slice(0, 600);
  return (
    <div className="pl-1">
      <ActorLabel color={ACTOR_COLORS.TOOL_RESULT} label="TOOL RESULT">
        {toolName && <span className="font-mono text-[10px] text-dim">{toolName}</span>}
      </ActorLabel>
      <div className="mt-1 ml-3 font-mono text-[10px] text-dim bg-[#0d0d0d] rounded border border-border/50 p-2 max-h-20 overflow-auto">
        {truncated}
        {content.length > 600 && <span className="text-dim"> …</span>}
      </div>
    </div>
  );
}

// ─── Content parsers for Anthropic message blocks ─────────────────────────────

type ABlock = Record<string, unknown>;

function extractBlockText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return (content as ABlock[])
    .filter((b) => b['type'] === 'text' && typeof b['text'] === 'string')
    .map((b) => b['text'] as string)
    .join('');
}

function extractToolUseBlocks(content: unknown): Array<{ id: string; name: string; input: unknown }> {
  if (!Array.isArray(content)) return [];
  return (content as ABlock[]).filter(
    (b): b is { type: 'tool_use'; id: string; name: string; input: unknown } =>
      b['type'] === 'tool_use' && typeof b['id'] === 'string' && typeof b['name'] === 'string',
  );
}

function extractToolResultBlocks(content: unknown): Array<{ tool_use_id: string; content: unknown }> {
  if (!Array.isArray(content)) return [];
  return (content as ABlock[]).filter(
    (b): b is { type: 'tool_result'; tool_use_id: string; content: unknown } =>
      b['type'] === 'tool_result' && typeof b['tool_use_id'] === 'string',
  );
}

function toolResultText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return (content as ABlock[])
      .map((b) => (typeof b['text'] === 'string' ? b['text'] : ''))
      .filter(Boolean)
      .join('\n');
  }
  if (content == null) return '';
  return JSON.stringify(content).slice(0, 600);
}

// ─── Main conversation flow component ────────────────────────────────────────

/**
 * ConversationFlow — renders the full conversation timeline for an LlmThread.
 *
 * Uses the last call's messages array (cumulative history) plus the last call's
 * response to build the complete flow. Falls back to metadata-only when no
 * message content is captured (logLevel: metadata).
 */
export function ConversationFlow({ thread }: { thread: LlmThread }) {
  const { calls, toolCallsByCallId, toolNameById } = thread;

  // Flatten all per-call verdict maps into one lookup: tool_use_id → ToolCallEntry
  const globalVerdictMap = new Map<string, ToolCallEntry>();
  for (const perCall of toolCallsByCallId.values()) {
    for (const [useId, tc] of perCall) globalVerdictMap.set(useId, tc);
  }

  const annotations = calls.flatMap((c) => extractAnnotations(c.contentInspection));
  const lastCall = calls[calls.length - 1]!;
  // Use the last call's messages (it contains the full cumulative history)
  const messages = Array.isArray(lastCall.messages)
    ? (lastCall.messages as Array<Record<string, unknown>>)
    : null;

  const hasContent = messages != null || calls.some((c) => c.responseText);

  const allThreats = calls.flatMap((c) => [...(c.requestThreats ?? []), ...(c.responseThreats ?? [])]);
  const inspections = calls.filter((c) => c.contentInspection?.results.some((r) => r.matchCount > 0));

  return (
    <div className="space-y-1.5 py-2 text-[11px]">
      {hasContent ? (
        <>
          {messages ? (
            /* Full message content available — walk the Anthropic messages array */
            messages.map((msg, i) => {
              const role = typeof msg['role'] === 'string' ? msg['role'] : null;
              if (!role) return null;

              if (role === 'user') {
                const text = extractBlockText(msg['content']);
                const toolResults = extractToolResultBlocks(msg['content']);
                return (
                  <Fragment key={`msg-${i}`}>
                    {toolResults.map((tr) => (
                      <Fragment key={tr.tool_use_id}>
                        <FlowConnector />
                        <ToolResultBlock
                          toolName={toolNameById.get(tr.tool_use_id)}
                          content={toolResultText(tr.content)}
                        />
                      </Fragment>
                    ))}
                    {text.trim() && (
                      <>
                        {(i > 0 || toolResults.length > 0) && <FlowConnector />}
                        <UserBlock text={text} annotations={annotations} />
                      </>
                    )}
                  </Fragment>
                );
              }

              if (role === 'assistant') {
                const text = extractBlockText(msg['content']);
                const toolUses = extractToolUseBlocks(msg['content']);

                // Which call does this assistant turn belong to?
                // Count assistant messages before index i to get the turn index.
                const assistantIdx = messages.slice(0, i).filter((m) => (m as Record<string, unknown>)['role'] === 'assistant').length;
                const matchedCall = calls[assistantIdx] ?? lastCall;

                return (
                  <Fragment key={`msg-${i}`}>
                    <FlowConnector />
                    <AssistantBlock
                      call={matchedCall}
                      text={text || null}
                      toolUses={toolUses}
                      verdictMap={globalVerdictMap}
                      annotations={annotations}
                    />
                  </Fragment>
                );
              }

              return null;
            })
          ) : null}

          {/* Always append the last call's actual response.
              The messages array is the INPUT sent to the LLM — it never contains this
              call's response. responseText / toolUses are always additive here. */}
          {messages && <FlowConnector />}
          <AssistantBlock
            call={lastCall}
            text={lastCall.responseText ?? null}
            toolUses={lastCall.toolUses ?? []}
            verdictMap={globalVerdictMap}
            annotations={annotations}
          />
        </>
      ) : (
        /* No content — metadata-only fallback */
        <div className="space-y-1.5">
          {calls.map((call, i) => {
            const callVerdictMap = toolCallsByCallId.get(call.id) ?? new Map<string, ToolCallEntry>();
            return (
              <Fragment key={call.id}>
                {i > 0 && <FlowConnector />}
                {calls.length > 1 && (
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-mono text-[9px] font-bold text-dim uppercase tracking-wider">Turn {i + 1}</span>
                    <span className="font-mono text-[9px] text-dim"><RelTime ts={call.timestamp} /></span>
                    <div className="flex-1 h-px" style={{ background: 'var(--rind-border)' }} />
                  </div>
                )}
                <AssistantBlock
                  call={call}
                  text={call.responseText ?? null}
                  toolUses={call.toolUses ?? []}
                  verdictMap={callVerdictMap}
                  annotations={annotations}
                />
              </Fragment>
            );
          })}
          <p className="font-mono text-[9px] text-dim italic pt-1 pl-1">
            Prompt and response not captured — set{' '}
            <span className="not-italic text-muted">llmProxy.logLevel: full</span> to enable.
          </p>
        </div>
      )}

      {/* Threats */}
      {allThreats.length > 0 && (
        <div className="pt-2 space-y-0.5 pl-1 border-t border-border/30 mt-2">
          <span className="font-mono text-[9px] font-bold text-dim uppercase tracking-wider">Threats</span>
          {allThreats.map((t, i) => (
            <div key={i} className="ml-3 flex items-center gap-2 font-mono text-[10px]">
              <span className="text-high">[{t.severity}]</span>
              <span className="text-foreground">{t.type}</span>
              <span className="text-dim">{t.detail}</span>
            </div>
          ))}
        </div>
      )}

      {/* Content inspection */}
      {inspections.map((c) =>
        c.contentInspection ? (
          <div key={c.id} className="pt-1 pl-1">
            <InspectionSummary inspection={c.contentInspection} />
          </div>
        ) : null,
      )}

      {/* Errors + matched rules at LLM level */}
      {calls.some((c) => c.errorMessage || (c.matchedRule && c.outcome !== 'forwarded')) && (
        <div className="pt-1 pl-1 space-y-0.5">
          {calls.filter((c) => c.errorMessage).map((c) => (
            <div key={c.id} className="font-mono text-[10px]">
              <span className="text-dim">error: </span>
              <span className="text-critical">{c.errorMessage}</span>
            </div>
          ))}
          {calls.filter((c) => c.matchedRule && c.outcome !== 'forwarded').map((c) => (
            <div key={c.id} className="font-mono text-[10px]">
              <span className="text-dim">rule: </span>
              <span className="text-foreground">{c.matchedRule}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Thread row (one per conversation) ───────────────────────────────────────

function ThreadRow({ thread }: { thread: LlmThread }) {
  const [expanded, setExpanded] = useState(false);
  const { root, calls, toolNames } = thread;
  const multiTurn = calls.length > 1;
  const hasTokens = thread.totalInputTokens > 0 || thread.totalOutputTokens > 0;

  return (
    <>
      <tr
        className="border-b border-border hover:bg-overlay/60 transition-colors duration-75 cursor-pointer"
        onClick={() => setExpanded((e) => !e)}
      >
        <td className="pl-4 pr-2 py-2.5 w-6">
          {expanded
            ? <ChevronDown size={12} className="text-dim" />
            : <ChevronRight size={12} className="text-dim" />}
        </td>
        <td className="px-3 py-2.5 whitespace-nowrap">
          <RelTime ts={root.timestamp} />
        </td>
        <td className="px-3 py-2.5 max-w-[130px]">
          <AgentLabel agentId={root.agentId} sessionId={root.sessionId} />
        </td>
        <td className="px-3 py-2.5">
          <div className="flex flex-col gap-0.5 min-w-0">
            <div className="flex items-center gap-2">
              <ProviderBadge provider={root.provider} />
              <span className="font-mono text-[12px] text-foreground truncate max-w-[180px]" title={root.model}>
                {root.model}
              </span>
              {multiTurn && (
                <span className="text-[9px] font-mono bg-overlay text-muted px-1.5 py-0.5 rounded shrink-0">
                  {calls.length} turns
                </span>
              )}
              <ThreatIndicator entry={root} />
            </div>
            {toolNames.length > 0 && (
              <div className="flex flex-wrap gap-1 ml-7">
                {toolNames.slice(0, 8).map((name) => (
                  <span key={name} className="text-[9px] font-mono text-accent bg-accent/10 px-1 rounded">
                    {name}
                  </span>
                ))}
                {toolNames.length > 8 && (
                  <span className="text-[9px] font-mono text-dim">+{toolNames.length - 8} more</span>
                )}
              </div>
            )}
          </div>
        </td>
        <td className="px-3 py-2.5 text-center text-[11px] text-muted">
          {multiTurn
            ? calls.reduce((s, e) => s + e.messageCount, 0)
            : root.messageCount}
        </td>
        <td className="px-3 py-2.5">
          {hasTokens
            ? <span className="font-mono text-[11px] text-foreground tabular-nums">
                {thread.totalInputTokens.toLocaleString()}
                <span className="text-dim mx-0.5">/</span>
                {thread.totalOutputTokens.toLocaleString()}
              </span>
            : <span className="text-dim font-mono text-[11px]">—</span>}
        </td>
        <td className="px-3 py-2.5">
          <Cost value={thread.totalCostUsd > 0 ? thread.totalCostUsd : undefined} />
        </td>
        <td className="px-3 py-2.5">
          {multiTurn
            ? <span className="font-mono text-[11px] text-dim">
                {((thread.latestTimestamp - root.timestamp) / 1000).toFixed(1)}s total
              </span>
            : <Latency ttfbMs={root.ttfbMs} totalMs={root.totalDurationMs} />}
        </td>
        <td className="px-3 py-2.5 pr-4">
          <OutcomeBadge outcome={thread.worstOutcome} />
        </td>
      </tr>
      {expanded && (
        <tr className="bg-overlay/20 border-b border-border">
          <td colSpan={9} className="px-6 py-3">
            <ConversationFlow thread={thread} />
          </td>
        </tr>
      )}
    </>
  );
}

// ─── Annotation helpers ───────────────────────────────────────────────────────

interface TextAnnotation {
  value: string;
  entityType: string;
  /** 'synthetic' = replaced PII sent to LLM; 'rehydrated' = original restored for client */
  kind: 'synthetic' | 'rehydrated';
}

/**
 * Extract all synthetic value annotations from a ContentInspectionAudit.
 * Only PII matches with syntheticValue set produce annotations.
 */
function extractAnnotations(inspection: ContentInspectionAudit | undefined): TextAnnotation[] {
  if (!inspection) return [];
  const annotations: TextAnnotation[] = [];
  for (const result of inspection.results) {
    for (const match of result.matches) {
      if (!match.syntheticValue) continue;
      for (const val of match.syntheticValue.split(', ')) {
        if (val) annotations.push({ value: val, entityType: match.type, kind: 'synthetic' });
      }
    }
  }
  return annotations;
}

/**
 * Render text with synthetic PII placeholder values highlighted inline.
 * Synthetics are shown in amber — "this replaced real PII before going to the LLM."
 * On hover, a tooltip shows the entity type and that this is a safe placeholder.
 */
function AnnotatedText({ text, annotations }: { text: string; annotations: TextAnnotation[] }) {
  if (annotations.length === 0) {
    return <span className="text-foreground whitespace-pre-wrap break-words">{text}</span>;
  }

  // Walk the text once, finding the earliest annotation match at each step.
  const segments: Array<{ text: string; annotation?: TextAnnotation }> = [];
  let remaining = text;

  while (remaining.length > 0) {
    let earliest = -1;
    let hit: TextAnnotation | null = null;

    for (const ann of annotations) {
      const idx = remaining.indexOf(ann.value);
      if (idx !== -1 && (earliest === -1 || idx < earliest)) {
        earliest = idx;
        hit = ann;
      }
    }

    if (earliest === -1 || !hit) {
      segments.push({ text: remaining });
      break;
    }
    if (earliest > 0) segments.push({ text: remaining.slice(0, earliest) });
    segments.push({ text: hit.value, annotation: hit });
    remaining = remaining.slice(earliest + hit.value.length);
  }

  return (
    <span className="whitespace-pre-wrap break-words">
      {segments.map((seg, i) =>
        seg.annotation ? (
          <span
            key={i}
            title={`${seg.annotation.entityType} — synthetic placeholder (original PII was replaced before sending to LLM)`}
            className="rounded px-0.5 border cursor-help"
            style={{
              background: 'rgba(180,120,0,0.18)',
              color: '#fbbf24',
              borderColor: 'rgba(251,191,36,0.25)',
            }}
          >
            {seg.text}
          </span>
        ) : (
          <span key={i} className="text-foreground">{seg.text}</span>
        )
      )}
    </span>
  );
}

// ─── Inspection summary ───────────────────────────────────────────────────────

function InspectionSummary({ inspection }: { inspection: ContentInspectionAudit }) {
  // Collect per-match lines: "EMAIL × 2 in user → user1@example.com" etc.
  const lines: Array<{ entityType: string; count: number; target?: string; synthetic?: string; detector: string }> = [];

  for (const result of inspection.results) {
    for (const match of result.matches) {
      lines.push({
        detector: result.detector,
        entityType: match.type,
        count: match.occurrenceCount ?? 1,
        target: match.sourceTarget,
        synthetic: match.syntheticValue,
      });
    }
  }

  if (lines.length === 0) return null;

  return (
    <div className="space-y-0.5">
      <span className="text-dim text-[10px] uppercase tracking-wider">content inspection</span>
      {lines.map((line, i) => (
        <div key={i} className="ml-4 flex items-center gap-1.5 flex-wrap">
          {/* Entity type badge */}
          <span
            className="text-[9px] font-mono px-1 py-0.5 rounded border"
            style={{ background: 'rgba(180,120,0,0.18)', color: '#fbbf24', borderColor: 'rgba(251,191,36,0.25)' }}
          >
            {line.entityType}
          </span>
          {/* Occurrence count */}
          {line.count > 1 && (
            <span className="text-dim">×{line.count}</span>
          )}
          {/* Source target */}
          {line.target && (
            <>
              <span className="text-dim">in</span>
              <span className="text-muted font-semibold">{line.target}</span>
            </>
          )}
          {/* Synthetic value */}
          {line.synthetic && (
            <>
              <span className="text-dim">→</span>
              <span
                className="font-mono text-[10px] rounded px-0.5 border"
                style={{ background: 'rgba(180,120,0,0.18)', color: '#fbbf24', borderColor: 'rgba(251,191,36,0.25)' }}
              >
                {line.synthetic}
              </span>
            </>
          )}
          {/* Detector label */}
          <span className="text-dim text-[9px]">({line.detector})</span>
        </div>
      ))}
      {inspection.pseudonymization && (
        <div className="ml-4 text-dim text-[9px]">
          {inspection.pseudonymization.tokenCount} value{inspection.pseudonymization.tokenCount !== 1 ? 's' : ''} pseudonymized
          {inspection.pseudonymization.rehydrated ? ' · rehydrated in response' : ' · pending rehydration'}
        </div>
      )}
    </div>
  );
}

// Returns the key argument for a tool call — the one detail most useful to show at a glance.
function summariseToolInput(name: string, input: unknown): string | null {
  if (typeof input !== 'object' || input === null) return null;
  const inp = input as Record<string, unknown>;
  // File/path tools
  if (typeof inp['file_path'] === 'string') return inp['file_path'] as string;
  if (typeof inp['path'] === 'string') return inp['path'] as string;
  // Shell tools
  if (typeof inp['command'] === 'string') {
    const cmd = inp['command'] as string;
    return cmd.length > 60 ? cmd.slice(0, 60) + '…' : cmd;
  }
  // Search tools
  if (typeof inp['pattern'] === 'string') return inp['pattern'] as string;
  if (typeof inp['query'] === 'string') return inp['query'] as string;
  // URL/navigation
  if (typeof inp['url'] === 'string') return inp['url'] as string;
  // Generic: first string value
  const firstStr = Object.values(inp).find((v) => typeof v === 'string');
  if (typeof firstStr === 'string') return firstStr.length > 60 ? firstStr.slice(0, 60) + '…' : firstStr;
  return null;
}


// ─── Main component ───────────────────────────────────────────────────────────

interface LlmCallTableProps {
  entries: LlmCallEntry[];
  maxHeight?: string;
  /** Intercepted tool call events — used to show blocked/allowed outcomes inline per tool_use */
  toolCalls?: ToolCallEntry[];
}

export function LlmCallTable({ entries, maxHeight = '420px', toolCalls = [] }: LlmCallTableProps) {
  if (entries.length === 0) {
    return (
      <div className="flex items-center justify-center h-24 text-sm text-dim border border-border rounded-lg">
        No LLM calls yet — set <code className="font-mono text-accent mx-1">ANTHROPIC_BASE_URL</code> to route calls through Rind
      </div>
    );
  }

  const threads = groupByConversation(entries, toolCalls);

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
          {threads.map((thread) => (
            <ThreadRow key={thread.conversationId} thread={thread} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
