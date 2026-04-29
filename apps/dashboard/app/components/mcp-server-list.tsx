// MCP server list — shows all registered MCP servers with connection + protection states.
// Data source: GET /api/proxy/hook/context → mcpServers[]

'use client';

import { Shield, Eye, Server, AlertTriangle, Lock, XCircle } from 'lucide-react';
import type { McpConnectionStatus, McpServerInfo } from '../lib/api';

export type { McpConnectionStatus, McpServerInfo };

interface McpServerListProps {
  servers: McpServerInfo[];
}

// Protection state config (Rind-specific)
const protectionConfig = {
  proxied: { label: 'PROXIED', color: 'var(--rind-accent)' },
  observed: { label: 'OBSERVED', color: 'var(--rind-medium)' },
  registered: { label: 'REGISTERED', color: 'var(--rind-foreground-muted)' },
} as const;

// Connection status config (from Claude Code)
const statusConfig = {
  connected: {
    label: 'Connected',
    icon: Shield,
    color: 'var(--rind-accent)',
    dotColor: 'bg-accent',
  },
  registered: {
    label: 'Registered',
    icon: Server,
    color: 'var(--rind-foreground-muted)',
    dotColor: 'bg-muted',
  },
  'needs-auth': {
    label: 'Needs Auth',
    icon: Lock,
    color: 'var(--rind-medium)',
    dotColor: 'bg-[var(--rind-medium)]',
  },
  disabled: {
    label: 'Disabled',
    icon: XCircle,
    color: 'var(--rind-foreground-muted)',
    dotColor: 'bg-dim',
  },
  failed: {
    label: 'Failed',
    icon: AlertTriangle,
    color: 'var(--rind-critical)',
    dotColor: 'bg-[var(--rind-critical)]',
  },
} as const;

export function McpServerList({ servers }: McpServerListProps) {
  if (servers.length === 0) {
    return (
      <div className="border border-border rounded-lg h-28 flex flex-col items-center justify-center gap-1">
        <p className="text-sm text-muted">No MCP servers registered</p>
        <p className="text-xs text-dim">MCP servers appear here when configured in Claude Code</p>
      </div>
    );
  }

  // Sort: connected first, then registered, then needs-auth, then disabled
  const order: Record<McpConnectionStatus, number> = {
    connected: 0, registered: 1, 'needs-auth': 2, failed: 3, disabled: 4,
  };
  const sorted = [...servers].sort((a, b) => order[a.connectionStatus] - order[b.connectionStatus]);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
      {sorted.map((server) => (
        <ServerCard key={server.id} server={server} />
      ))}
    </div>
  );
}

function ServerCard({ server }: { server: McpServerInfo }) {
  const status = statusConfig[server.connectionStatus];
  const protection = protectionConfig[server.protectionState];
  const isInactive = server.connectionStatus === 'disabled' || server.connectionStatus === 'needs-auth';

  return (
    <div
      className={[
        'border rounded-lg p-4 transition-colors duration-100',
        isInactive
          ? 'border-border-subtle opacity-70'
          : 'border-border hover:bg-overlay',
      ].join(' ')}
    >
      {/* Header: name + status dot */}
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className={['w-2 h-2 rounded-full shrink-0', status.dotColor].join(' ')} />
          <span className="font-mono text-[13px] font-medium text-foreground">
            {server.id}
          </span>
        </div>
      </div>

      {/* Status badges */}
      <div className="flex gap-2 mb-3">
        <StatusBadge label={status.label} color={status.color} />
        <StatusBadge label={protection.label} color={protection.color} />
      </div>

      {/* Details */}
      <div className="space-y-1">
        <DetailLine label="Source" value={formatSource(server)} />
        <DetailLine label="Transport" value={server.transport.toUpperCase()} />
        {server.url && <DetailLine label="URL" value={server.url} />}
      </div>
    </div>
  );
}

function StatusBadge({ label, color }: { label: string; color: string }) {
  return (
    <span
      className="font-mono text-[9px] tracking-[0.06em] px-1.5 py-0.5 rounded border"
      style={{
        color,
        background: `color-mix(in srgb, ${color} 10%, transparent)`,
        borderColor: `color-mix(in srgb, ${color} 24%, transparent)`,
      }}
    >
      {label}
    </span>
  );
}

function DetailLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2 text-[11px]">
      <span className="text-dim w-16 shrink-0">{label}</span>
      <span className="text-muted truncate" title={value}>{value}</span>
    </div>
  );
}

function formatSource(server: McpServerInfo): string {
  if (server.source === 'cloud-ai') return 'Claude.ai';
  if (server.source === 'plugin') return `Plugin (${server.pluginName})`;
  return 'Settings';
}
