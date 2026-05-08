// Cross-path merge correlator — joins hook-path and MCP-gateway-path events
// that represent the same logical tool call.
//
// Problem: when Claude Code uses an MCP server proxied through Rind, the same
// call produces two ring-buffer rows — one from the Claude Code PreToolUse hook
// (fully enriched with session, cwd, correlationId) and one from the MCP gateway
// (sparse, has the actual response). Neither path knows about the other.
//
// Solution: the hook records a short-lived entry keyed on (serverId, tool, inputHash).
// The gateway looks it up. On a hit, the gateway skips pushing a duplicate event and
// instead attaches its response payload to the existing hook row.
//
// TTL: 5 seconds — the hook fires synchronously before the MCP HTTP request, so the
// gap between hook push and gateway receive is sub-second. 5s is ~100x headroom.

import { createHash } from 'node:crypto';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface HookEntry {
	/** The correlationId already stored on the hook row in the ring buffer. */
	correlationId: string;
	recordedAt: number;
	/** First-writer-wins: set by whichever path enriches the response first. */
	consumedBy?: 'proxy' | 'post-tool-use';
}

export interface IMergeCorrelator {
	/**
	 * Record a hook-path PreToolUse event so the gateway path can find it.
	 * Call after ringBuffer.push(enrichedEvent) for ALLOWED calls only.
	 */
	recordHook(serverId: string, tool: string, input: unknown, correlationId: string): void;

	/**
	 * Look up a pending hook entry for a gateway-path event.
	 * Returns the entry if found and not yet consumed; undefined otherwise.
	 * Does not consume — call claim() to atomically reserve it.
	 */
	tryMatchProxy(serverId: string, tool: string, input: unknown): HookEntry | undefined;

	/**
	 * Atomically claim a hook entry as consumed by one path.
	 * Returns true if this is the first claimant; false if already consumed.
	 * The loser should no-op any ring-buffer update to preserve first-writer's data.
	 */
	claim(correlationId: string, by: 'proxy' | 'post-tool-use'): boolean;

	/**
	 * Returns true only if this correlationId is registered AND was already
	 * consumed by 'proxy'. Used by the PostToolUse path to skip ring-buffer
	 * updates when the proxy already attached its response.
	 */
	wasConsumedByProxy(correlationId: string): boolean;

	/** Evict expired entries. Call from a periodic setInterval. */
	cleanup(): void;
}

// ─── Implementation ───────────────────────────────────────────────────────────

const TTL_MS = 5_000;
const MAX_PER_KEY = 16;

export class MergeCorrelator implements IMergeCorrelator {
	// joinKey → FIFO queue of unconsumed hook entries
	private readonly byJoinKey = new Map<string, HookEntry[]>();
	// correlationId → entry (for O(1) claim and cleanup)
	private readonly byCorrelationId = new Map<string, HookEntry>();

	constructor(private readonly now: () => number = Date.now) {}

	recordHook(serverId: string, tool: string, input: unknown, correlationId: string): void {
		const key = joinKey(serverId, tool, input);
		const entry: HookEntry = { correlationId, recordedAt: this.now() };

		const queue = this.byJoinKey.get(key) ?? [];
		queue.push(entry);
		// Cap queue depth per key to bound memory under repeated identical calls
		if (queue.length > MAX_PER_KEY) queue.shift();
		this.byJoinKey.set(key, queue);
		this.byCorrelationId.set(correlationId, entry);
	}

	tryMatchProxy(serverId: string, tool: string, input: unknown): HookEntry | undefined {
		const key = joinKey(serverId, tool, input);
		const queue = this.byJoinKey.get(key);
		if (!queue) return undefined;

		this.evictExpiredFromQueue(queue);
		if (queue.length === 0) {
			this.byJoinKey.delete(key);
			return undefined;
		}

		// Return the oldest unconsumed entry (FIFO — handles concurrent identical calls)
		return queue.find((e) => !e.consumedBy);
	}

	claim(correlationId: string, by: 'proxy' | 'post-tool-use'): boolean {
		const entry = this.byCorrelationId.get(correlationId);
		if (!entry || entry.consumedBy) return false;
		entry.consumedBy = by;
		return true;
	}

	wasConsumedByProxy(correlationId: string): boolean {
		return this.byCorrelationId.get(correlationId)?.consumedBy === 'proxy';
	}

	cleanup(): void {
		const cutoff = this.now() - TTL_MS;

		for (const [key, queue] of this.byJoinKey) {
			const live = queue.filter((e) => e.recordedAt >= cutoff);
			if (live.length === 0) {
				this.byJoinKey.delete(key);
			} else {
				this.byJoinKey.set(key, live);
			}
		}

		for (const [corrId, entry] of this.byCorrelationId) {
			if (entry.recordedAt < cutoff) {
				this.byCorrelationId.delete(corrId);
			}
		}
	}

	private evictExpiredFromQueue(queue: HookEntry[]): void {
		const cutoff = this.now() - TTL_MS;
		while (queue.length > 0) {
			const head = queue[0];
			if (!head || head.recordedAt >= cutoff) break;
			queue.shift();
		}
	}
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function joinKey(serverId: string, tool: string, input: unknown): string {
	const inputStr = input != null ? JSON.stringify(input) : '';
	// 16 hex chars = 64 bits — collision probability negligible within a 5s window
	const inputHash = createHash('sha256').update(inputStr).digest('hex').slice(0, 16);
	return `${serverId}|${tool}|${inputHash}`;
}
