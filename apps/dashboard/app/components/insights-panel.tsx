// InsightsPanel — actionable observations from tool call patterns.
//
// Analyzes allowed/blocked events and generates recommendations:
//   - Frequently allowed sensitive tools → suggest adding a policy
//   - Repeated blocked calls → agent may be stuck, consider adjusting policy
//   - Unproxied MCP servers seen via hooks → suggest routing through proxy
//   - High call volume from a single agent → potential loop
//
// Each insight is dismissable. Dismissed insights are stored in localStorage
// and suppressed for 24 hours. Dismissed state persists across page reloads.
//
// Motion: insights slide in on arrival (D-033 motion discipline — data-change only).

'use client';

import { useState, useEffect } from 'react';
import { X, ShieldAlert, TrendingUp, Eye, AlertTriangle } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { ToolCallEntry } from './tool-call-table';

// ─── Types ───────────────────────────────────────────────────────────────────

export type InsightSeverity = 'critical' | 'high' | 'medium' | 'info';

export interface Insight {
  id: string;
  severity: InsightSeverity;
  icon: LucideIcon;
  title: string;
  detail: string;
  action?: string; // suggested action text
}

interface InsightsPanelProps {
  toolCalls: ToolCallEntry[];
  mcpServers?: { id: string; protectionState?: string }[];
}

// ─── Component ───────────────────────────────────────────────────────────────

export function InsightsPanel({ toolCalls, mcpServers }: InsightsPanelProps) {
  const [dismissed, setDismissed] = useState<Set<string>>(loadDismissed);
  const insights = deriveInsights(toolCalls, mcpServers ?? []);
  const visible = insights.filter((i) => !dismissed.has(i.id));

  if (visible.length === 0) return null;

  function dismiss(id: string) {
    setDismissed((prev) => {
      const next = new Set(prev);
      next.add(id);
      saveDismissed(next);
      return next;
    });
  }

  return (
    <div className="space-y-2">
      {visible.map((insight, idx) => (
        <InsightRow
          key={insight.id}
          insight={insight}
          onDismiss={() => dismiss(insight.id)}
          animationDelay={idx * 60}
        />
      ))}
    </div>
  );
}

// ─── Insight row ─────────────────────────────────────────────────────────────

function InsightRow({ insight, onDismiss, animationDelay }: {
  insight: Insight;
  onDismiss: () => void;
  animationDelay: number;
}) {
  const Icon = insight.icon;
  const severityStyles = SEVERITY_STYLES[insight.severity];

  return (
    <div
      className="flex items-start gap-3 px-4 py-3 rounded-lg border transition-all duration-150 hover:bg-overlay/40 animate-slide-in group"
      style={{
        borderColor: severityStyles.border,
        borderLeftWidth: '3px',
        borderLeftColor: severityStyles.accent,
        animationDelay: `${animationDelay}ms`,
      }}
    >
      <Icon
        size={14}
        className="shrink-0 mt-0.5"
        style={{ color: severityStyles.accent }}
        strokeWidth={2}
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <SeverityPill severity={insight.severity} />
          <span className="text-[12px] font-medium text-foreground">{insight.title}</span>
        </div>
        <p className="text-[11px] text-muted mt-1 leading-relaxed">{insight.detail}</p>
        {insight.action && (
          <p className="text-[11px] text-accent mt-1">{insight.action}</p>
        )}
      </div>
      <button
        onClick={onDismiss}
        className="shrink-0 p-1 rounded hover:bg-overlay opacity-0 group-hover:opacity-100 transition-opacity duration-150"
        title="Dismiss for 24 hours"
      >
        <X size={12} className="text-dim" />
      </button>
    </div>
  );
}

function SeverityPill({ severity }: { severity: InsightSeverity }) {
  const styles = SEVERITY_STYLES[severity];
  return (
    <span
      className="text-[9px] font-mono font-bold tracking-[0.08em] uppercase px-1.5 py-0.5 rounded border"
      style={{
        color: styles.accent,
        background: styles.bg,
        borderColor: styles.border,
      }}
    >
      {severity === 'critical' ? 'CRIT' : severity.toUpperCase()}
    </span>
  );
}

// ─── Severity palette ────────────────────────────────────────────────────────

const SEVERITY_STYLES: Record<InsightSeverity, { accent: string; bg: string; border: string }> = {
  critical: {
    accent: 'var(--rind-critical)',
    bg: 'color-mix(in srgb, var(--rind-critical) 8%, transparent)',
    border: 'color-mix(in srgb, var(--rind-critical) 20%, transparent)',
  },
  high: {
    accent: 'var(--rind-high)',
    bg: 'color-mix(in srgb, var(--rind-high) 8%, transparent)',
    border: 'color-mix(in srgb, var(--rind-high) 20%, transparent)',
  },
  medium: {
    accent: 'var(--rind-medium)',
    bg: 'color-mix(in srgb, var(--rind-medium) 8%, transparent)',
    border: 'color-mix(in srgb, var(--rind-medium) 20%, transparent)',
  },
  info: {
    accent: 'var(--rind-info)',
    bg: 'color-mix(in srgb, var(--rind-info) 8%, transparent)',
    border: 'color-mix(in srgb, var(--rind-info) 20%, transparent)',
  },
};

// ─── Insight derivation ──────────────────────────────────────────────────────

function deriveInsights(
  events: ToolCallEntry[],
  mcpServers: { id: string; protectionState?: string }[],
): Insight[] {
  const insights: Insight[] = [];

  // ── Starter insights — always present until dismissed, useful for demos ──
  insights.push({
    id: 'starter-no-policy-file',
    severity: 'medium',
    icon: ShieldAlert,
    title: 'No custom policy rules configured',
    detail: 'All tool calls are using default allow-all behavior. Add rules to control which tools agents can invoke.',
    action: 'Go to Policies → Add your first rule',
  });
  insights.push({
    id: 'starter-enable-response-inspection',
    severity: 'info',
    icon: Eye,
    title: 'Response inspection available',
    detail: 'Rind can scan MCP server responses for credential leaks, prompt injection, and PII before they reach the agent.',
    action: 'Enable in Settings → Response Inspector',
  });

  if (events.length === 0) return insights;

  // 1. Sensitive tools allowed without policy
  const sensitivePatterns = [
    { match: /^Bash$/, inputMatch: /rm\s+-rf|curl.*\|.*sh|chmod\s+777/, label: 'destructive shell commands' },
    { match: /^Bash$/, inputMatch: /docker\s+run|docker\s+exec/, label: 'Docker execution' },
    { match: /^Bash$/, inputMatch: /ssh\s+/, label: 'SSH connections' },
  ];

  for (const pattern of sensitivePatterns) {
    const matched = events.filter((e) =>
      e.outcome === 'allowed'
      && pattern.match.test(e.toolName)
      && pattern.inputMatch.test(String(e.toolLabel ?? '')),
    );
    if (matched.length >= 2) {
      insights.push({
        id: `sensitive-allowed-${pattern.label}`,
        severity: 'high',
        icon: ShieldAlert,
        title: `${pattern.label} allowed ${matched.length} times`,
        detail: `Tool calls matching "${pattern.label}" are being allowed without a policy rule. Consider adding a DENY or REQUIRE_APPROVAL rule.`,
        action: 'Go to Policies → Add Rule',
      });
    }
  }

  // 2. Repeated blocks — agent might be stuck
  const blockedByTool = new Map<string, number>();
  for (const e of events) {
    if (e.outcome === 'blocked') {
      const key = `${e.agentId}:${e.toolName}`;
      blockedByTool.set(key, (blockedByTool.get(key) ?? 0) + 1);
    }
  }
  for (const [key, count] of blockedByTool) {
    if (count >= 3) {
      const [, toolName] = key.split(':');
      insights.push({
        id: `repeated-block-${key}`,
        severity: 'medium',
        icon: AlertTriangle,
        title: `${toolName} blocked ${count} times`,
        detail: `An agent keeps hitting the same block. It may be stuck in a retry loop, or the policy might be too restrictive for this workflow.`,
        action: 'Review the policy rule or adjust the agent prompt',
      });
    }
  }

  // 3. High call volume from single agent
  const callsByAgent = new Map<string, number>();
  const recentWindow = 5 * 60_000; // last 5 min
  const now = Date.now();
  for (const e of events) {
    if (now - e.timestamp < recentWindow) {
      callsByAgent.set(e.agentId, (callsByAgent.get(e.agentId) ?? 0) + 1);
    }
  }
  for (const [agentId, count] of callsByAgent) {
    if (count >= 50) {
      insights.push({
        id: `high-volume-${agentId}`,
        severity: 'medium',
        icon: TrendingUp,
        title: `High call volume: ${count} calls in 5 min`,
        detail: `Agent "${agentId.startsWith('hook:') ? 'claude-code' : agentId}" is making an unusually high number of tool calls. This could indicate a loop.`,
        action: 'Check the loop detector or add a rate limit rule',
      });
    }
  }

  // 4. Unproxied MCP servers observed via hooks
  const observedMcpServers = new Set<string>();
  for (const e of events) {
    if (e.source === 'mcp' && e.serverId !== 'builtin' && e.serverId !== 'mcp-unknown') {
      observedMcpServers.add(e.serverId);
    }
  }
  const unproxied = mcpServers.filter(
    (s) => s.protectionState === 'registered' && observedMcpServers.has(s.id),
  );
  if (unproxied.length > 0) {
    insights.push({
      id: `unproxied-mcp-${unproxied.map((s) => s.id).join(',')}`,
      severity: 'info',
      icon: Eye,
      title: `${unproxied.length} MCP server${unproxied.length > 1 ? 's' : ''} not routed through proxy`,
      detail: `${unproxied.map((s) => s.id).join(', ')} — tool calls are observed via hooks but responses are not inspected for credential leaks or injection.`,
      action: 'Route through proxy for full response inspection',
    });
  }

  return insights;
}

// ─── Dismissed state persistence ─────────────────────────────────────────────

const STORAGE_KEY = 'rind-dismissed-insights';
const DISMISS_TTL = 24 * 60 * 60 * 1000; // 24 hours

function loadDismissed(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const entries = JSON.parse(raw) as Array<{ id: string; at: number }>;
    const now = Date.now();
    // Only keep entries within TTL
    const valid = entries.filter((e) => now - e.at < DISMISS_TTL);
    if (valid.length !== entries.length) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(valid));
    }
    return new Set(valid.map((e) => e.id));
  } catch {
    return new Set();
  }
}

function saveDismissed(ids: Set<string>): void {
  if (typeof window === 'undefined') return;
  const now = Date.now();
  const entries = [...ids].map((id) => ({ id, at: now }));
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}
