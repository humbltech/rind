// ScanFindings — displays findings from MCP server scans.
// Shows each registered server with its scan status and individual findings.
// Pure component — receives data, renders, no fetching.

import { AlertTriangle, CheckCircle, Server } from 'lucide-react';

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

  return (
    <div className={[
      'border rounded-lg overflow-hidden',
      hasCriticalOrHigh ? 'border-high/40' : 'border-border',
    ].join(' ')}>
      <ServerHeader server={server} hasCriticalOrHigh={hasCriticalOrHigh} />
      {server.findings.length > 0 && <FindingsList findings={server.findings} />}
    </div>
  );
}

function ServerHeader({ server, hasCriticalOrHigh }: { server: ServerScanResult; hasCriticalOrHigh: boolean }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 bg-surface">
      <Server size={13} className="text-dim shrink-0" strokeWidth={1.5} />
      <span className="font-mono text-[12px] text-muted flex-1 truncate">{server.serverId}</span>
      <span className="text-[10px] text-dim">{server.tools.length} tools</span>
      {server.passed
        ? <ScanPassed />
        : <ScanFailed critical={hasCriticalOrHigh} />}
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

function ScanFailed({ critical }: { critical: boolean }) {
  return (
    <span className={[
      'flex items-center gap-1 text-[11px] font-medium',
      critical ? 'text-critical' : 'text-medium',
    ].join(' ')}>
      <AlertTriangle size={11} strokeWidth={2} />
      {critical ? 'Critical' : 'Warning'}
    </span>
  );
}

function FindingsList({ findings }: { findings: ScanFinding[] }) {
  return (
    <ul className="divide-y divide-border-subtle">
      {findings.map((finding, i) => (
        <FindingRow key={i} finding={finding} />
      ))}
    </ul>
  );
}

function FindingRow({ finding }: { finding: ScanFinding }) {
  return (
    <li className="flex items-start gap-3 px-4 py-2.5 bg-canvas/60">
      <SeverityBadge severity={finding.severity} />
      <div className="flex-1 min-w-0">
        <span className="text-[11px] font-mono text-muted">{finding.category}</span>
        {finding.toolName && (
          <span className="ml-2 text-[11px] font-mono text-accent">· {finding.toolName}</span>
        )}
        <p className="text-[11px] text-dim mt-0.5 leading-relaxed">{finding.detail}</p>
      </div>
    </li>
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
