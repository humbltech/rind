// Rind Dashboard — real-time view of agent activity, policy decisions, and scan findings.
//
// Architecture: Client Component that polls the proxy API every 2s and passes
// live data to pure child components. No auth in Phase 1 — the dashboard runs
// alongside the proxy on localhost for developer use.

'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type React from 'react';
import Link from 'next/link';
import { FolderOpen } from 'lucide-react';
import { Sidebar } from './components/sidebar';
import { VolumeCard, BreakdownCard, CountDeltaCard, CountScaleCard } from './components/stat-card';
import { ToolCallTable, type ToolCallEntry } from './components/tool-call-table';
import { ScanFindings, type ServerScanResult } from './components/scan-findings';
import { HeaderBand, type BlockedIncident } from './components/header-band';
import { McpServerList, type McpServerInfo } from './components/mcp-server-list';
import { InsightsPanel } from './components/insights-panel';

// ─── Data shapes from the proxy API ───────────────────────────────────────────

interface ProxyStatus {
  sessions:  { total: number; active: number };
  toolCalls: { total: number };
  threats:   { total: number };
  servers:   { total: number };
}

interface ClaudeSession {
  sessionId: string;
  name?: string;
  cwd?: string;
  pid?: number;
  startedAt?: number;
}

interface HookContext {
  mcpServers: McpServerInfo[];
  activeSessions: ClaudeSession[];
}

// ─── Dashboard page ───────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { status, toolCalls, scanResults, hookContext, isConnected } = useProxyData();

  const sessions  = status?.sessions  ?? { total: 0, active: 0 };
  const calls     = status?.toolCalls ?? { total: 0 };
  const threats   = status?.threats   ?? { total: 0 };
  const servers   = status?.servers   ?? { total: 0 };

  // Derive the most recent blocked incident from the call log for the threat band
  const lastBlocked = toolCalls.findLast((e) => e.outcome === 'blocked');
  const incident: BlockedIncident | null = lastBlocked
    ? { toolName: lastBlocked.toolName, agentId: lastBlocked.agentId, reason: lastBlocked.reason ?? 'POLICY_VIOLATION', timestamp: lastBlocked.timestamp }
    : null;

  // Derive active working directories from sessions + tool calls
  const activeWorkDirs = deriveWorkingDirs(hookContext?.activeSessions ?? [], toolCalls);

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-auto">
        <div className="max-w-[1400px] mx-auto px-8 py-8 space-y-8">
          <PageTitle />
          <HeaderBand
            threats={threats.total}
            toolCalls={calls.total}
            sessions={sessions.total}
            servers={servers.total}
            connected={isConnected}
            incident={incident}
          />
          <StatsGrid status={status} toolCalls={toolCalls} mcpServerCount={hookContext?.mcpServers?.length ?? servers.total} />
          <InsightsSection toolCalls={toolCalls} mcpServers={hookContext?.mcpServers} />
          <ActiveSessionsSection sessions={hookContext?.activeSessions ?? []} workDirs={activeWorkDirs} />
          <ToolCallSection entries={toolCalls} />
          <McpServerSection servers={hookContext?.mcpServers ?? []} />
          <ScanSection servers={scanResults} />
        </div>
      </main>
    </div>
  );
}

// ─── Page sections ────────────────────────────────────────────────────────────

function PageTitle() {
  return (
    <div>
      <h1 className="text-xl font-semibold text-foreground tracking-tight">Overview</h1>
      <p className="mt-0.5 text-sm text-muted">Live agent activity and security posture</p>
    </div>
  );
}

function StatsGrid({ status, toolCalls, mcpServerCount }: {
  status: ProxyStatus | null;
  toolCalls: ToolCallEntry[];
  mcpServerCount: number;
}) {
  const sessions  = status?.sessions  ?? { total: 0, active: 0 };
  const calls     = status?.toolCalls ?? { total: 0 };
  const threats   = status?.threats   ?? { total: 0 };

  // Derive sparkline from tool call timestamps — bucket into 12 intervals over the last 60s
  const sparkline = deriveSparkline(toolCalls, 12);

  // Derive threat breakdown by severity from blocked events
  const blocked = toolCalls.filter((e) => e.outcome === 'blocked');
  const threatBreakdown = [
    { label: 'crit', value: blocked.filter((e) => e.reason?.includes('INJECTION') || e.reason?.includes('THREAT')).length, color: 'var(--rind-critical)' },
    { label: 'high', value: blocked.filter((e) => e.reason?.includes('DENY')).length, color: 'var(--rind-high)' },
    { label: 'med',  value: Math.max(0, blocked.length - blocked.filter((e) => e.reason?.includes('INJECTION') || e.reason?.includes('THREAT') || e.reason?.includes('DENY')).length), color: 'var(--rind-medium)' },
  ];

  // Delta: compare current session count vs previous poll (tracked via ref in parent)
  const prevCallCount = usePrevious(calls.total);
  const delta = prevCallCount != null ? calls.total - prevCallCount : 0;

  return (
    <section>
      <SectionLabel>At a glance</SectionLabel>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-3">
        <VolumeCard
          label="Tool Calls"
          value={calls.total}
          unit="/total"
          badge="60s"
          sparkline={sparkline}
        />
        <BreakdownCard
          label="Threats"
          value={threats.total}
          badge="24h"
          context={`of ${calls.total.toLocaleString()}`}
          breakdown={threatBreakdown}
        />
        <CountDeltaCard
          label="Active Sessions"
          value={sessions.active}
          unit="agents"
          badge="now"
          delta={delta}
          deltaLabel="vs last poll"
        />
        <CountScaleCard
          label="MCP Servers"
          value={mcpServerCount}
          max={Math.max(mcpServerCount, 8)}
          badge="connected"
        />
      </div>
    </section>
  );
}

function InsightsSection({ toolCalls, mcpServers }: {
  toolCalls: ToolCallEntry[];
  mcpServers?: McpServerInfo[];
}) {
  const mapped = mcpServers?.map((s) => ({ id: s.id, protectionState: s.protectionState }));
  return (
    <section>
      <InsightsPanel toolCalls={toolCalls} mcpServers={mapped} />
    </section>
  );
}

function ActiveSessionsSection({ sessions, workDirs }: { sessions: ClaudeSession[]; workDirs: WorkDir[] }) {
  if (sessions.length === 0 && workDirs.length === 0) return null;

  return (
    <section>
      <SectionLabel>Active sessions</SectionLabel>
      <div className="mt-3 space-y-2">
        {sessions.map((s) => {
          const dir = workDirs.find((w) => w.sessionId === s.sessionId);
          return (
            <div
              key={s.sessionId}
              className="flex items-center gap-4 px-4 py-3 rounded-lg border border-border hover:bg-overlay transition-colors duration-100"
            >
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <span className="w-1.5 h-1.5 rounded-full bg-accent shrink-0" />
                <span className="font-mono text-[13px] font-medium text-foreground truncate">
                  {s.name ?? `session:${s.sessionId.slice(0, 8)}`}
                </span>
              </div>
              {(s.cwd || dir?.cwd) && (
                <div className="flex items-center gap-1.5 min-w-0 shrink">
                  <FolderOpen size={12} className="text-dim shrink-0" />
                  <span className="font-mono text-[11px] text-muted truncate max-w-[400px]">
                    {shortenPath(s.cwd ?? dir?.cwd ?? '')}
                  </span>
                </div>
              )}
              {dir && dir.toolCallCount > 0 && (
                <span className="font-mono text-[10px] text-dim whitespace-nowrap">
                  {dir.toolCallCount} calls
                </span>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function ToolCallSection({ entries }: { entries: ToolCallEntry[] }) {
  const recent = useMemo(() => entries.slice(-15), [entries]);
  const hasMore = entries.length > 15;

  return (
    <section>
      <SectionLabel>
        Recent tool calls
        <span className="ml-2 text-dim font-normal normal-case">
          (last {recent.length}{hasMore ? ` of ${entries.length}` : ''})
        </span>
        {hasMore && (
          <Link
            href="/logs"
            className="ml-auto text-[11px] font-normal normal-case text-accent hover:underline"
          >
            View all in Logs
          </Link>
        )}
      </SectionLabel>
      <div className="mt-3">
        <ToolCallTable entries={recent} />
      </div>
    </section>
  );
}

function McpServerSection({ servers }: { servers: McpServerInfo[] }) {
  return (
    <section>
      <SectionLabel>
        MCP servers
        <span className="ml-2 text-dim font-normal normal-case">({servers.length} registered)</span>
      </SectionLabel>
      <div className="mt-3">
        <McpServerList servers={servers} />
      </div>
    </section>
  );
}

function ScanSection({ servers }: { servers: ServerScanResult[] }) {
  return (
    <section>
      <SectionLabel>
        MCP server scans
        <span className="ml-2 text-dim font-normal normal-case">({servers.length} scanned)</span>
      </SectionLabel>
      <div className="mt-3">
        <ScanFindings servers={servers} />
      </div>
    </section>
  );
}

// ─── Shared UI primitives ─────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-xs font-semibold uppercase tracking-[0.1em] text-muted flex items-center">
      {children}
    </h2>
  );
}

// ─── Working directory derivation ────────────────────────────────────────────

interface WorkDir {
  sessionId: string;
  cwd: string;
  toolCallCount: number;
}

function deriveWorkingDirs(sessions: ClaudeSession[], toolCalls: ToolCallEntry[]): WorkDir[] {
  const map = new Map<string, WorkDir>();

  // Initialize from sessions
  for (const s of sessions) {
    if (s.cwd) {
      map.set(s.sessionId, { sessionId: s.sessionId, cwd: s.cwd, toolCallCount: 0 });
    }
  }

  // Count tool calls per session and pick up CWD from events
  for (const call of toolCalls) {
    const existing = map.get(call.sessionId);
    if (existing) {
      existing.toolCallCount += 1;
      if (call.cwd) existing.cwd = call.cwd; // latest CWD wins
    } else if (call.cwd) {
      map.set(call.sessionId, { sessionId: call.sessionId, cwd: call.cwd, toolCallCount: 1 });
    }
  }

  return [...map.values()];
}

function shortenPath(path: string): string {
  // Replace /Users/username/ with ~/
  const homeMatch = path.match(/^\/Users\/[^/]+\/(.*)/);
  return homeMatch ? `~/${homeMatch[1]}` : path;
}

// ─── Sparkline derivation ────────────────────────────────────────────────────

function deriveSparkline(events: ToolCallEntry[], buckets: number): number[] {
  if (events.length === 0) return Array(buckets).fill(0);

  const now = Date.now();
  const windowMs = 60_000; // last 60 seconds
  const bucketMs = windowMs / buckets;
  const counts = Array(buckets).fill(0) as number[];

  for (const e of events) {
    const age = now - e.timestamp;
    if (age < 0 || age > windowMs) continue;
    const idx = Math.min(Math.floor((windowMs - age) / bucketMs), buckets - 1);
    counts[idx]++;
  }
  return counts;
}

// ─── usePrevious hook ─────────────────────────────────────────────────────────

function usePrevious(value: number): number | undefined {
  const ref = useRef<number>(undefined);
  useEffect(() => { ref.current = value; });
  return ref.current;
}

// ─── Data polling hook ────────────────────────────────────────────────────────

function useProxyData() {
  const [status, setStatus]           = useState<ProxyStatus | null>(null);
  const [toolCalls, setToolCalls]     = useState<ToolCallEntry[]>([]);
  const [scanResults, setScanResults] = useState<ServerScanResult[]>([]);
  const [hookContext, setHookContext]  = useState<HookContext | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    let active = true;

    async function poll() {
      try {
        const [statusRes, logsRes, scanRes, ctxRes, eventsRes] = await Promise.all([
          fetch('/api/proxy/status'),
          fetch('/api/proxy/logs/tool-calls'),
          fetch('/api/proxy/scan/results'),
          fetch('/api/proxy/hook/context'),
          fetch('/api/proxy/logs/hook-events?event_type=PostToolUse'),
        ]);

        if (!active) return;

        if (statusRes.ok) setStatus(await statusRes.json());
        if (logsRes.ok) {
          const calls: ToolCallEntry[] = await logsRes.json();
          // Join PostToolUse responses by correlationId
          if (eventsRes.ok) {
            const hookEvents: Array<{ correlationId?: string; timestamp: number; outputPreview?: string; outputTruncated?: boolean; outputSizeBytes?: number; outputHash?: string; threats?: Array<{ type: string; severity: string; pattern: string }> }> = await eventsRes.json();
            const eventMap = new Map<string, (typeof hookEvents)[0]>();
            for (const he of hookEvents) {
              if (he.correlationId) eventMap.set(he.correlationId, he);
            }
            const MAX_GAP = 5 * 60 * 1000;
            for (const call of calls) {
              if (call.correlationId && eventMap.has(call.correlationId)) {
                const he = eventMap.get(call.correlationId)!;
                if (Math.abs(he.timestamp - call.timestamp) <= MAX_GAP) {
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
          }
          setToolCalls(calls);
        }
        if (scanRes.ok)   setScanResults(await scanRes.json());
        if (ctxRes.ok)    setHookContext(await ctxRes.json());

        setIsConnected(statusRes.ok);
      } catch {
        if (active) setIsConnected(false);
      }
    }

    poll();
    const interval = setInterval(poll, 2000);
    return () => { active = false; clearInterval(interval); };
  }, []);

  return { status, toolCalls, scanResults, hookContext, isConnected };
}
