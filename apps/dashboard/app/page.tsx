// Aegis Dashboard — real-time view of agent activity, policy decisions, and scan findings.
//
// Architecture: Client Component that polls the proxy API every 2s and passes
// live data to pure child components. No auth in Phase 1 — the dashboard runs
// alongside the proxy on localhost for developer use.

'use client';

import { useEffect, useState } from 'react';
import { Activity, Shield, AlertTriangle, Server } from 'lucide-react';
import { Sidebar } from './components/sidebar';
import { StatCard } from './components/stat-card';
import { ToolCallTable, type ToolCallEntry } from './components/tool-call-table';
import { ScanFindings, type ServerScanResult } from './components/scan-findings';

// ─── Data shapes from the proxy API ───────────────────────────────────────────

interface ProxyStatus {
  sessions:  { total: number; active: number };
  toolCalls: { total: number };
  threats:   { total: number };
  servers:   { total: number };
}

// ─── Dashboard page ───────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { status, toolCalls, scanResults, isConnected } = useProxyData();

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-auto">
        <div className="max-w-[1400px] mx-auto px-8 py-8 space-y-8">
          <PageHeader isConnected={isConnected} />
          <StatsGrid status={status} />
          <ToolCallSection entries={toolCalls} />
          <ScanSection servers={scanResults} />
        </div>
      </main>
    </div>
  );
}

// ─── Page sections ────────────────────────────────────────────────────────────

function PageHeader({ isConnected }: { isConnected: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <h1 className="text-xl font-semibold text-foreground tracking-tight">Overview</h1>
        <p className="mt-0.5 text-sm text-muted">Live agent activity and security posture</p>
      </div>
      <ConnectionBadge connected={isConnected} />
    </div>
  );
}

function StatsGrid({ status }: { status: ProxyStatus | null }) {
  const s = status ?? { sessions: { total: 0, active: 0 }, toolCalls: { total: 0 }, threats: { total: 0 }, servers: { total: 0 } };

  return (
    <section>
      <SectionLabel>At a glance</SectionLabel>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-3">
        <StatCard
          label="Sessions"
          value={s.sessions.total}
          icon={Activity}
          subLabel={s.sessions.active > 0 ? `${s.sessions.active} active` : undefined}
        />
        <StatCard
          label="Tool Calls"
          value={s.toolCalls.total}
          icon={Activity}
        />
        <StatCard
          label="Threats"
          value={s.threats.total}
          icon={AlertTriangle}
          isAlert
        />
        <StatCard
          label="MCP Servers"
          value={s.servers.total}
          icon={Server}
        />
      </div>
    </section>
  );
}

function ToolCallSection({ entries }: { entries: ToolCallEntry[] }) {
  return (
    <section>
      <SectionLabel>
        Tool call log
        <span className="ml-2 text-dim font-normal normal-case">(last {entries.length})</span>
      </SectionLabel>
      <div className="mt-3">
        <ToolCallTable entries={entries} />
      </div>
    </section>
  );
}

function ScanSection({ servers }: { servers: ServerScanResult[] }) {
  return (
    <section>
      <SectionLabel>
        MCP server scans
        <span className="ml-2 text-dim font-normal normal-case">({servers.length} registered)</span>
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

function ConnectionBadge({ connected }: { connected: boolean }) {
  return (
    <div className="flex items-center gap-2 text-xs text-muted">
      <span
        className={[
          'w-1.5 h-1.5 rounded-full',
          connected ? 'bg-low' : 'bg-dim',
        ].join(' ')}
        style={connected ? { boxShadow: '0 0 4px var(--aegis-low)' } : undefined}
      />
      <span>{connected ? 'Connected to proxy' : 'Proxy unreachable'}</span>
      <span className="text-dim">· polls every 2s</span>
    </div>
  );
}

// ─── Data polling hook ────────────────────────────────────────────────────────

function useProxyData() {
  const [status, setStatus]       = useState<ProxyStatus | null>(null);
  const [toolCalls, setToolCalls] = useState<ToolCallEntry[]>([]);
  const [scanResults, setScanResults] = useState<ServerScanResult[]>([]);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    let active = true;

    async function poll() {
      try {
        const [statusRes, logsRes, scanRes] = await Promise.all([
          fetch('/api/proxy/status'),
          fetch('/api/proxy/logs/tool-calls'),
          fetch('/api/proxy/scan/results'),
        ]);

        if (!active) return;

        if (statusRes.ok) setStatus(await statusRes.json());
        if (logsRes.ok)   setToolCalls(await logsRes.json());
        if (scanRes.ok)   setScanResults(await scanRes.json());

        setIsConnected(statusRes.ok);
      } catch {
        // Proxy not running — show disconnected state rather than throwing
        if (active) setIsConnected(false);
      }
    }

    poll();
    const interval = setInterval(poll, 2000);
    return () => { active = false; clearInterval(interval); };
  }, []);

  return { status, toolCalls, scanResults, isConnected };
}
