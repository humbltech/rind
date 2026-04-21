// HeaderBand — state-aware security status band.
//
// STATE A (clean): faint green wash + pulse dot + "All clear" + inline stats
// STATE B (threat): red wash + 3px left accent border + BLOCKED pill + incident detail + pulse-once animation
//
// Sits directly below the page title. The band is the fastest signal in the UI —
// an engineer glancing at their screen should know the security state in under 1 second.
//
// Below the band: stat pills strip (mono, high density) + connection badge.

'use client';

export interface BlockedIncident {
  toolName: string;
  agentId: string;
  reason: string;
  timestamp: number;
}

interface HeaderBandProps {
  threats: number;
  toolCalls: number;
  sessions: number;
  servers: number;
  connected: boolean;
  incident?: BlockedIncident | null;
}

export function HeaderBand({
  threats,
  toolCalls,
  sessions,
  servers,
  connected,
  incident,
}: HeaderBandProps) {
  const isClean = threats === 0;

  return (
    <div className="mb-6 space-y-2">
      {isClean
        ? <CleanBand toolCalls={toolCalls} threats={threats} sessions={sessions} />
        : <ThreatBand incident={incident ?? null} threats={threats} />}
      <StatsPillStrip toolCalls={toolCalls} threats={threats} sessions={sessions} servers={servers} isAlert={!isClean} />
      <ConnectionBadge connected={connected} />
    </div>
  );
}

// ─── Band variants ─────────────────────────────────────────────────────────────

function CleanBand({ toolCalls, threats, sessions }: { toolCalls: number; threats: number; sessions: number }) {
  return (
    <div
      className="flex items-center gap-3 px-4 py-3 rounded-lg border text-sm"
      style={{
        background: 'color-mix(in srgb, var(--rind-low) 8%, transparent)',
        borderColor: 'color-mix(in srgb, var(--rind-low) 18%, transparent)',
      }}
    >
      <PulseDot color="var(--rind-low)" />
      <span className="text-foreground">All clear</span>
      <Sep />
      <span className="font-mono text-[12px] text-muted">{toolCalls} calls</span>
      <Sep />
      <span className="font-mono text-[12px] text-muted">{threats} threats</span>
      <Sep />
      <span className="font-mono text-[12px] text-muted">{sessions} sessions</span>
    </div>
  );
}

function ThreatBand({ incident, threats }: { incident: BlockedIncident | null; threats: number }) {
  return (
    <div
      className="flex items-center gap-3 px-4 py-3 rounded-lg border text-sm animate-pulse-once"
      style={{
        background: 'color-mix(in srgb, var(--rind-critical) 8%, transparent)',
        borderColor: 'color-mix(in srgb, var(--rind-critical) 22%, transparent)',
        borderLeftWidth: '3px',
        borderLeftColor: 'var(--rind-critical)',
        paddingLeft: '16px',
      }}
    >
      <BlockedPill />
      {incident
        ? <IncidentDetail incident={incident} />
        : <GenericThreatDetail threats={threats} />}
    </div>
  );
}

function IncidentDetail({ incident }: { incident: BlockedIncident }) {
  return (
    <>
      <span className="font-mono text-[12px] text-accent">{incident.toolName}</span>
      <Sep />
      <span className="font-mono text-[12px] text-muted">agent: {incident.agentId}</span>
      <Sep />
      <span className="font-mono text-[12px] text-critical">{incident.reason}</span>
      <span className="font-mono text-[12px] text-muted ml-auto">
        {formatTimestamp(incident.timestamp)}
      </span>
    </>
  );
}

function GenericThreatDetail({ threats }: { threats: number }) {
  return (
    <span className="font-mono text-[12px] text-muted">
      {threats} {threats === 1 ? 'threat' : 'threats'} blocked this session
    </span>
  );
}

// ─── Stats strip ───────────────────────────────────────────────────────────────

function StatsPillStrip({
  toolCalls,
  threats,
  sessions,
  servers,
  isAlert,
}: {
  toolCalls: number;
  threats: number;
  sessions: number;
  servers: number;
  isAlert: boolean;
}) {
  return (
    <div className="flex items-center gap-5 px-0.5">
      <StatPill label="calls"    value={toolCalls} />
      <StatPill label="threats"  value={threats}   alert={isAlert && threats > 0} />
      <StatPill label="sessions" value={sessions}  />
      <StatPill label="servers"  value={servers}   />
    </div>
  );
}

function StatPill({ label, value, alert }: { label: string; value: number; alert?: boolean }) {
  return (
    <span className="font-mono text-[11px]">
      <span className="text-dim">{label} </span>
      <span className={alert ? 'text-critical' : 'text-muted'}>{value}</span>
    </span>
  );
}

// ─── Connection badge ──────────────────────────────────────────────────────────

function ConnectionBadge({ connected }: { connected: boolean }) {
  return (
    <div className="flex items-center gap-2 text-[11px] text-muted">
      <span
        className="w-1.5 h-1.5 rounded-full shrink-0"
        style={connected
          ? { background: 'var(--rind-low)', boxShadow: '0 0 4px var(--rind-low)' }
          : { background: 'var(--rind-foreground-dim)' }
        }
      />
      <span>{connected ? 'Connected to proxy' : 'Proxy unreachable'}</span>
      {connected && <span className="font-mono text-dim">· polls every 2s</span>}
    </div>
  );
}

// ─── Shared atoms ──────────────────────────────────────────────────────────────

function PulseDot({ color }: { color: string }) {
  return (
    <span
      className="w-1.5 h-1.5 rounded-full shrink-0"
      style={{ background: color, boxShadow: `0 0 4px ${color}` }}
    />
  );
}

function BlockedPill() {
  return (
    <span
      className="shrink-0 font-mono text-[9px] font-bold tracking-[0.12em] px-1.5 py-0.5 rounded border"
      style={{
        color: 'var(--rind-critical)',
        background: 'color-mix(in srgb, var(--rind-critical) 10%, transparent)',
        borderColor: 'color-mix(in srgb, var(--rind-critical) 22%, transparent)',
      }}
    >
      BLOCKED
    </span>
  );
}

const Sep = () => (
  <span className="text-dim mx-0.5">·</span>
);

function formatTimestamp(ts: number): string {
  return new Date(ts).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}
