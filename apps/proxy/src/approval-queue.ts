// Approval queue — holds pending REQUIRE_APPROVAL requests until a human
// approves, denies, or the request times out.
//
// Flow:
//   1. Interceptor returns REQUIRE_APPROVAL
//   2. /hook/evaluate creates a PendingApproval with a Promise
//   3. HTTP response is held (Claude Code's hook has 600s timeout)
//   4. Dashboard shows the pending approval with countdown
//   5. User clicks approve/deny → resolves the Promise → HTTP response returns
//   6. On timeout → auto-resolves with the rule's onTimeout action (default: DENY)

import { randomUUID } from 'node:crypto';

export type ApprovalDecision = 'approve' | 'deny' | 'timeout';

export interface PendingApproval {
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

export interface ApprovalResult {
  decision: ApprovalDecision;
  decidedAt: number;
  decidedBy?: string;
}

interface QueueEntry {
  approval: PendingApproval;
  resolve: (result: ApprovalResult) => void;
  timer: ReturnType<typeof setTimeout>;
}

export class ApprovalQueue {
  private readonly pending = new Map<string, QueueEntry>();

  /** Create a pending approval and return a Promise that resolves when decided. */
  enqueue(opts: {
    sessionId: string;
    agentId: string;
    toolName: string;
    toolLabel?: string;
    input: unknown;
    reason: string;
    ruleName?: string;
    timeoutMs?: number;
    onTimeout?: 'DENY' | 'ALLOW';
  }): { approval: PendingApproval; wait: Promise<ApprovalResult> } {
    const id = randomUUID().slice(0, 8);
    const timeoutMs = opts.timeoutMs ?? 120_000; // 2 minutes default
    const onTimeout = opts.onTimeout ?? 'DENY';

    const approval: PendingApproval = {
      id,
      sessionId: opts.sessionId,
      agentId: opts.agentId,
      toolName: opts.toolName,
      toolLabel: opts.toolLabel,
      input: opts.input,
      reason: opts.reason,
      ruleName: opts.ruleName,
      createdAt: Date.now(),
      timeoutMs,
      onTimeout,
    };

    const wait = new Promise<ApprovalResult>((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        resolve({ decision: 'timeout', decidedAt: Date.now() });
      }, timeoutMs);

      this.pending.set(id, { approval, resolve, timer });
    });

    return { approval, wait };
  }

  /** Approve a pending request. Returns false if not found. */
  approve(id: string, decidedBy?: string): boolean {
    return this.decide(id, 'approve', decidedBy);
  }

  /** Deny a pending request. Returns false if not found. */
  deny(id: string, decidedBy?: string): boolean {
    return this.decide(id, 'deny', decidedBy);
  }

  /** List all currently pending approvals. */
  list(): PendingApproval[] {
    return [...this.pending.values()].map((e) => e.approval);
  }

  /** Get a single pending approval by ID. */
  get(id: string): PendingApproval | undefined {
    return this.pending.get(id)?.approval;
  }

  /** Number of pending approvals. */
  get size(): number {
    return this.pending.size;
  }

  /** Clean up all timers (for graceful shutdown). */
  destroy(): void {
    for (const entry of this.pending.values()) {
      clearTimeout(entry.timer);
    }
    this.pending.clear();
  }

  private decide(id: string, decision: ApprovalDecision, decidedBy?: string): boolean {
    const entry = this.pending.get(id);
    if (!entry) return false;

    clearTimeout(entry.timer);
    this.pending.delete(id);
    entry.resolve({ decision, decidedAt: Date.now(), decidedBy });
    return true;
  }
}
