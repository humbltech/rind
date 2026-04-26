// ScanFindings — displays findings from MCP server scans.
// Shows each registered server with its scan status and individual findings.
// Pure component — receives data, renders, no fetching.

'use client';

import { useState } from 'react';
import { AlertTriangle, CheckCircle, ChevronDown, ChevronRight, Server } from 'lucide-react';

export interface ScanFinding {
  category: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  toolName?: string;
  detail: string;
}

export interface ServerScanResult {
  serverId: string;
  scannedAt: number;
  passed: boolean;
  findings: ScanFinding[];
  tools: Array<{ name: string; description: string }>;
}

interface ScanFindingsProps {
  servers: ServerScanResult[];
}

export function ScanFindings({ servers }: ScanFindingsProps) {
  if (servers.length === 0) return <NoServersState />;

  return (
    <div className="space-y-3">
      {servers.map((server) => (
        <ServerBlock key={server.serverId} server={server} />
      ))}
    </div>
  );
}

function ServerBlock({ server }: { server: ServerScanResult }) {
  const hasCriticalOrHigh = server.findings.some(
    (f) => f.severity === 'critical' || f.severity === 'high',
  );
  // Default open if scan failed so the user immediately sees what's wrong
  const [expanded, setExpanded] = useState(!server.passed);

  return (
    <div className={[
      'border rounded-lg overflow-hidden',
      hasCriticalOrHigh ? 'border-high/40' : 'border-border',
    ].join(' ')}>
      <button
        type="button"
        className="w-full text-left"
        onClick={() => setExpanded((v) => !v)}
      >
        <ServerHeader
          server={server}
          hasCriticalOrHigh={hasCriticalOrHigh}
          expanded={expanded}
        />
      </button>
      {expanded && (
        <div className="divide-y divide-border-subtle">
          {server.findings.length > 0 && <FindingsList findings={server.findings} />}
          {server.tools.length > 0 && <ToolList tools={server.tools} />}
        </div>
      )}
    </div>
  );
}

function ServerHeader({
  server,
  hasCriticalOrHigh,
  expanded,
}: {
  server: ServerScanResult;
  hasCriticalOrHigh: boolean;
  expanded: boolean;
}) {
  const Chevron = expanded ? ChevronDown : ChevronRight;
  return (
    <div className="flex items-center gap-3 px-4 py-3 bg-surface hover:bg-overlay/40 transition-colors duration-100">
      <Chevron size={12} className="text-dim shrink-0" />
      <Server size={13} className="text-dim shrink-0" strokeWidth={1.5} />
      <span className="font-mono text-[12px] text-muted flex-1 truncate">{server.serverId}</span>
      <span className="text-[10px] text-dim">{server.tools.length} tools</span>
      {server.passed
        ? <ScanPassed />
        : <ScanFailed critical={hasCriticalOrHigh} count={server.findings.length} />}
    </div>
  );
}

function ScanPassed() {
  return (
    <span className="flex items-center gap-1 text-[11px] text-low font-medium">
      <CheckCircle size={11} strokeWidth={2} />
      Clean
    </span>
  );
}

function ScanFailed({ critical, count }: { critical: boolean; count: number }) {
  return (
    <span className={[
      'flex items-center gap-1 text-[11px] font-medium',
      critical ? 'text-critical' : 'text-medium',
    ].join(' ')}>
      <AlertTriangle size={11} strokeWidth={2} />
      {count} {critical ? 'critical' : 'warning'}{count !== 1 ? 's' : ''}
    </span>
  );
}

function FindingsList({ findings }: { findings: ScanFinding[] }) {
  return (
    <div>
      <div className="px-4 py-1.5 bg-canvas/80">
        <span className="text-[10px] font-medium uppercase tracking-wider text-dim">Findings</span>
      </div>
      <ul className="divide-y divide-border-subtle">
        {findings.map((finding, i) => (
          <FindingRow key={i} finding={finding} />
        ))}
      </ul>
    </div>
  );
}

function FindingRow({ finding }: { finding: ScanFinding }) {
  return (
    <li className="flex items-start gap-3 px-4 py-2.5 bg-canvas/60">
      <SeverityBadge severity={finding.severity} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[11px] font-mono text-muted">{finding.category}</span>
          {finding.toolName && (
            <span className="text-[11px] font-mono text-accent">· {finding.toolName}</span>
          )}
        </div>
        <p className="text-[11px] text-dim mt-0.5 leading-relaxed">{finding.detail}</p>
      </div>
    </li>
  );
}

function ToolList({ tools }: { tools: Array<{ name: string; description: string }> }) {
  return (
    <div>
      <div className="px-4 py-1.5 bg-canvas/80">
        <span className="text-[10px] font-medium uppercase tracking-wider text-dim">Tools ({tools.length})</span>
      </div>
      <ul className="divide-y divide-border-subtle">
        {tools.map((tool) => (
          <li key={tool.name} className="flex items-start gap-3 px-4 py-2 bg-canvas/40">
            <span className="font-mono text-[11px] text-accent shrink-0 pt-0.5">{tool.name}</span>
            <span className="text-[11px] text-dim leading-relaxed truncate" title={tool.description}>
              {tool.description || <span className="italic">No description</span>}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SeverityBadge({ severity }: { severity: ScanFinding['severity'] }) {
  const config: Record<ScanFinding['severity'], { label: string; color: string }> = {
    critical: { label: 'CRIT',  color: 'text-critical bg-critical/10 border-critical/20' },
    high:     { label: 'HIGH',  color: 'text-high bg-high/10 border-high/20' },
    medium:   { label: 'MED',   color: 'text-medium bg-medium/10 border-medium/20' },
    low:      { label: 'LOW',   color: 'text-low bg-low/10 border-low/20' },
    info:     { label: 'INFO',  color: 'text-info bg-info/10 border-info/20' },
  };

  const { label, color } = config[severity];
  return (
    <span className={`shrink-0 mt-0.5 text-[9px] font-mono font-bold tracking-wider border rounded px-1 py-0.5 ${color}`}>
      {label}
    </span>
  );
}

function NoServersState() {
  return (
    <div className="border border-border rounded-lg h-32 flex flex-col items-center justify-center gap-2">
      <p className="text-sm text-muted">No MCP servers scanned</p>
      <p className="text-xs text-dim">
        POST to <span className="font-mono text-accent">/scan</span> to register a server
      </p>
    </div>
  );
}
