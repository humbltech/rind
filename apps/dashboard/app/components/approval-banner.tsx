// Approval banner — shows pending REQUIRE_APPROVAL requests with countdown
// and approve/deny buttons. Polls /api/proxy/approvals every 1s.

'use client';

import { useCallback, useEffect, useState } from 'react';
import { ShieldAlert, Check, X, Clock } from 'lucide-react';

interface PendingApproval {
  id: string;
  sessionId: string;
  agentId: string;
  toolName: string;
  toolLabel?: string;
  input: unknown;
  reason: string;
  ruleName?: string;
  createdAt: number;
  timeoutMs: number;
  onTimeout: 'DENY' | 'ALLOW';
}

export function ApprovalBanner() {
  const [approvals, setApprovals] = useState<PendingApproval[]>([]);
  const [resolving, setResolving] = useState<Set<string>>(new Set());

  // Poll every second for pending approvals
  useEffect(() => {
    let active = true;

    async function poll() {
      try {
        const res = await fetch('/api/proxy/approvals');
        if (!active) return;
        if (res.ok) {
          const data: PendingApproval[] = await res.json();
          setApprovals(data);
        }
      } catch {
        // Silently ignore — proxy may be down
      }
    }

    poll();
    const interval = setInterval(poll, 1000);
    return () => { active = false; clearInterval(interval); };
  }, []);

  const handleApprove = useCallback(async (id: string) => {
    setResolving((s) => new Set(s).add(id));
    try {
      await fetch(`/api/proxy/approvals/${id}/approve`, { method: 'POST' });
    } catch { /* ignore */ }
  }, []);

  const handleDeny = useCallback(async (id: string) => {
    setResolving((s) => new Set(s).add(id));
    try {
      await fetch(`/api/proxy/approvals/${id}/deny`, { method: 'POST' });
    } catch { /* ignore */ }
  }, []);

  if (approvals.length === 0) return null;

  return (
    <div className="space-y-3">
      {approvals.map((a) => (
        <ApprovalCard
          key={a.id}
          approval={a}
          isResolving={resolving.has(a.id)}
          onApprove={() => handleApprove(a.id)}
          onDeny={() => handleDeny(a.id)}
        />
      ))}
    </div>
  );
}

function ApprovalCard({ approval, isResolving, onApprove, onDeny }: {
  approval: PendingApproval;
  isResolving: boolean;
  onApprove: () => void;
  onDeny: () => void;
}) {
  const [now, setNow] = useState(Date.now());

  // Tick every second for countdown
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const elapsed = now - approval.createdAt;
  const remaining = Math.max(0, approval.timeoutMs - elapsed);
  const remainingSec = Math.ceil(remaining / 1000);
  const progress = Math.min(1, elapsed / approval.timeoutMs);
  const isUrgent = remaining < 15_000;

  const inputPreview = formatInputPreview(approval.input);

  return (
    <div
      className="relative overflow-hidden rounded-lg border"
      style={{
        borderColor: isUrgent ? 'var(--rind-critical)' : 'var(--rind-medium)',
        background: isUrgent
          ? 'color-mix(in srgb, var(--rind-critical) 6%, var(--rind-surface))'
          : 'color-mix(in srgb, var(--rind-medium) 6%, var(--rind-surface))',
      }}
    >
      {/* Progress bar */}
      <div
        className="absolute top-0 left-0 h-[2px] transition-all duration-1000"
        style={{
          width: `${(1 - progress) * 100}%`,
          background: isUrgent ? 'var(--rind-critical)' : 'var(--rind-medium)',
        }}
      />

      <div className="px-4 py-3 flex items-start gap-3">
        <ShieldAlert
          size={18}
          className="shrink-0 mt-0.5"
          style={{ color: isUrgent ? 'var(--rind-critical)' : 'var(--rind-medium)' }}
        />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-[0.08em]"
              style={{ color: isUrgent ? 'var(--rind-critical)' : 'var(--rind-medium)' }}>
              Approval Required
            </span>
            {approval.ruleName && (
              <span className="text-[10px] text-dim font-mono">
                {approval.ruleName}
              </span>
            )}
          </div>

          <div className="mt-1 flex items-center gap-3">
            <span className="font-mono text-[13px] text-foreground font-medium">
              {approval.toolLabel ?? approval.toolName}
            </span>
            <span className="font-mono text-[11px] text-muted truncate max-w-[400px]">
              {inputPreview}
            </span>
          </div>

          <div className="mt-1 flex items-center gap-2 text-[10px] text-dim">
            <Clock size={10} />
            <span className="font-mono">
              {remainingSec}s remaining
            </span>
            <span>
              {approval.onTimeout === 'ALLOW' ? '(auto-allow on timeout)' : '(auto-deny on timeout)'}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={onApprove}
            disabled={isResolving}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] font-medium transition-colors"
            style={{
              background: 'var(--rind-accent)',
              color: 'white',
              opacity: isResolving ? 0.5 : 1,
              cursor: isResolving ? 'not-allowed' : 'pointer',
            }}
          >
            <Check size={13} />
            Approve
          </button>
          <button
            onClick={onDeny}
            disabled={isResolving}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-[12px] font-medium transition-colors"
            style={{
              borderColor: 'var(--rind-critical)',
              color: 'var(--rind-critical)',
              background: 'transparent',
              opacity: isResolving ? 0.5 : 1,
              cursor: isResolving ? 'not-allowed' : 'pointer',
            }}
          >
            <X size={13} />
            Deny
          </button>
        </div>
      </div>
    </div>
  );
}

function formatInputPreview(input: unknown): string {
  if (input == null) return '';
  const inp = input as Record<string, unknown>;
  if (typeof inp.command === 'string') return inp.command.slice(0, 80);
  if (typeof inp.file_path === 'string') return inp.file_path;
  try {
    const str = JSON.stringify(input);
    return str.length > 80 ? str.slice(0, 77) + '...' : str;
  } catch {
    return '';
  }
}
