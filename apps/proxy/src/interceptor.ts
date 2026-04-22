// The core proxy interceptor. Every tool call and response passes through here.
// Execution order for an outbound tool call:
//   1. Check session is active (kill-switch)
//   2. Loop detection (D-015)
//   3. Run request-side inspection (prompt injection in args)
//   4. Apply policy rules (allow / deny / require-approval / rate-limit)
//   5. Cost/call limit check (D-014) — if the matching rule has limits
//   6. Forward to upstream MCP server
//   7. Record call for cost/hourly tracking (D-014)
//   8. Run response-side inspection (credential leak, prompt injection in output)
//   9. Return to agent (or block + log if threats found)
//
// Error handling (D-022): each step is wrapped in try/catch.
//   - Fail-closed (default): inspection/policy errors produce DENY
//   - Fail-open: allowed per-rule via failMode: 'open'

import type { ToolCallEvent, ToolResponseEvent, PolicyAction, PolicyRule } from './types.js';
import { inspectRequest } from './inspector/request.js';
import { inspectResponse } from './inspector/response.js';
import { isSessionActive, incrementToolCall, addCost, recordCall, getSession, getHourlyStats } from './session.js';
import type { PolicyEngine } from './policy/engine.js';
import type { LoopDetector } from './loop-detector.js';
import type { RateLimiter } from './rate-limiter.js';
import { parseWindowMs } from './rate-limiter.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export type InterceptedAction =
  | PolicyAction
  | 'BLOCKED_SESSION_KILLED'
  | 'BLOCKED_INJECTION'
  | 'BLOCKED_THREAT'
  | 'BLOCKED_LOOP'
  | 'BLOCKED_COST_LIMIT';

export interface InterceptorResult {
  action: InterceptedAction;
  reason?: string;
  // REQUIRE_APPROVAL metadata (D-013)
  approvalRequired?: boolean;
  callbackUrl?: null;
  inputSummary?: string;
  // RATE_LIMIT metadata
  rateLimitRemaining?: number;
  rateLimitResetMs?: number;
  // BLOCKED_COST_LIMIT metadata
  limitType?: 'calls_per_session' | 'calls_per_hour' | 'cost_per_session' | 'cost_per_hour';
}

export interface ForwardFn {
  (event: ToolCallEvent): Promise<{ output: unknown; durationMs: number }>;
}

export interface InterceptorOptions {
  policyEngine: PolicyEngine;
  loopDetector?: LoopDetector;
  rateLimiter?: RateLimiter;
  onToolCallEvent: (event: ToolCallEvent, matchedRule?: PolicyRule) => void;
  onToolResponseEvent: (event: ToolResponseEvent) => void;
  blockOnCriticalResponseThreats: boolean;
  // Skip request-side injection scanning. Set true for hook evaluate-only mode
  // where tool inputs are user-initiated (not attacker-controlled MCP inputs).
  skipRequestInspection?: boolean;
}

// ─── Interceptor ─────────────────────────────────────────────────────────────

export async function intercept(
  event: ToolCallEvent,
  forward: ForwardFn,
  opts: InterceptorOptions,
): Promise<{ output: unknown; interceptorResult: InterceptorResult }> {
  // ── 1. Session kill-switch ──────────────────────────────────────────────────
  if (!isSessionActive(event.sessionId)) {
    return blocked('BLOCKED_SESSION_KILLED', `Session ${event.sessionId} has been terminated.`);
  }

  // ── 2. Loop detection (D-015) ───────────────────────────────────────────────
  if (opts.loopDetector) {
    let loopResult: { loop: boolean; reason?: string } | undefined;
    try {
      loopResult = opts.loopDetector.check(event.sessionId, event.toolName, event.input);
    } catch (err) {
      // Loop detection error → fail closed
      return blocked('BLOCKED_LOOP', `Loop detection error: ${String(err)}`);
    }
    if (loopResult?.loop) {
      return blocked('BLOCKED_LOOP', loopResult.reason ?? 'Loop detected.');
    }
  }

  // ── 3. Request-side inspection ──────────────────────────────────────────────
  // Skipped for hook evaluate-only mode: tool inputs come from the user's own
  // coding agent, not from untrusted MCP tool definitions.
  if (!opts.skipRequestInspection) {
    let requestResult: { allowed: boolean; reason?: string } | undefined;
    try {
      requestResult = inspectRequest(event);
    } catch (err) {
      opts.onToolCallEvent(event);
      return blocked('BLOCKED_INJECTION', `Request inspection error: ${String(err)}`);
    }

    if (!requestResult.allowed) {
      opts.onToolCallEvent(event);
      return blocked('BLOCKED_INJECTION', requestResult.reason);
    }
  }

  // ── 4. Policy evaluation ────────────────────────────────────────────────────
  let evalResult: ReturnType<PolicyEngine['evaluate']> | undefined;
  try {
    evalResult = opts.policyEngine.evaluate(event);
  } catch (err) {
    // Fail mode for a crashing evaluation defaults to closed (DENY)
    opts.onToolCallEvent(event);
    return blocked('DENY', `Policy evaluation error: ${String(err)}`);
  }

  opts.onToolCallEvent(event, evalResult?.matchedRule);

  const { action, matchedRule } = evalResult ?? { action: 'ALLOW' as PolicyAction };
  // effectiveAction starts as the policy action but is normalised to ALLOW after
  // a RATE_LIMIT check passes — the tool call proceeds but we don't leak RATE_LIMIT
  // in the final interceptor result when the caller was actually allowed through.
  let effectiveAction: InterceptedAction = action;

  if (action === 'DENY') {
    return blocked('DENY', `Tool call "${event.toolName}" denied by policy rule "${matchedRule?.name ?? 'unknown'}".`);
  }

  if (action === 'REQUIRE_APPROVAL') {
    // D-013: structured DENY with approval metadata. Real async workflow is Phase 2.
    const inputSummary = summariseInput(event.input);
    return {
      output: null,
      interceptorResult: {
        action: 'REQUIRE_APPROVAL',
        reason: `Tool call "${event.toolName}" requires human approval before proceeding.`,
        approvalRequired: true,
        callbackUrl: null, // Phase 2: real callback URL
        inputSummary,
      },
    };
  }

  if (action === 'RATE_LIMIT') {
    // D-017: check rate limit counter
    if (opts.rateLimiter && matchedRule?.rateLimit) {
      let rlResult: { allowed: boolean; remaining: number; resetMs: number } | undefined;
      try {
        const windowMs = parseWindowMs(matchedRule.rateLimit.window);
        rlResult = opts.rateLimiter.check(event.agentId, event.toolName, {
          limit: matchedRule.rateLimit.limit,
          windowMs,
          scope: matchedRule.rateLimit.scope,
        });
      } catch (err) {
        return blocked('DENY', `Rate limit check error: ${String(err)}`);
      }

      if (!rlResult.allowed) {
        return {
          output: null,
          interceptorResult: {
            action: 'RATE_LIMIT',
            reason: `Rate limit exceeded for "${event.toolName}". Try again in ${Math.ceil(rlResult.resetMs / 1000)}s.`,
            rateLimitRemaining: 0,
            rateLimitResetMs: rlResult.resetMs,
          },
        };
      }
      // Rate limit check passed — normalise so the tool call proceeds as ALLOW
      effectiveAction = 'ALLOW';
    } else {
      // RATE_LIMIT action but no rate limiter or config — treat as DENY (safety)
      return blocked('DENY', `Rate limit configured but limiter not available for "${event.toolName}".`);
    }
  }

  // ── 5. Cost/call limit check (D-014) ────────────────────────────────────────
  if (matchedRule?.limits) {
    const limitBlock = checkCostLimits(event.sessionId, matchedRule.limits);
    if (limitBlock) return limitBlock;
  }

  // ── 6. Forward to upstream MCP server ───────────────────────────────────────
  incrementToolCall(event.sessionId);

  let output: unknown;
  let durationMs: number;

  try {
    ({ output, durationMs } = await forward(event));
  } catch (err) {
    // Upstream errors are re-thrown — server.ts returns 502/504
    throw err;
  }

  // ── 7. Record call for cost/hourly tracking (D-014) ─────────────────────────
  const costUsd = matchedRule?.costEstimate ?? 0;
  if (costUsd > 0) {
    addCost(event.sessionId, costUsd);
  }
  recordCall(event.sessionId, costUsd);

  // ── 8. Response-side inspection ─────────────────────────────────────────────
  let responseThreats: ReturnType<typeof inspectResponse> = [];
  try {
    responseThreats = inspectResponse(output);
  } catch {
    // Response inspection error → fail closed (block response)
    return blocked('BLOCKED_THREAT', `Response inspection failed — blocking for safety.`);
  }

  const responseEvent: ToolResponseEvent = {
    sessionId: event.sessionId,
    agentId: event.agentId,
    serverId: event.serverId,
    toolName: event.toolName,
    output,
    durationMs,
    threats: responseThreats,
  };
  opts.onToolResponseEvent(responseEvent);

  // ── 9. Block on critical response threats ────────────────────────────────────
  if (opts.blockOnCriticalResponseThreats) {
    const criticalThreats = responseThreats.filter((t) => t.severity === 'critical');
    if (criticalThreats.length > 0) {
      return blocked(
        'BLOCKED_THREAT',
        `Tool response from "${event.toolName}" contained a critical threat: ` +
          criticalThreats.map((t) => t.pattern).join(', ') +
          '. Response blocked.',
      );
    }
  }

  return {
    output,
    interceptorResult: { action: effectiveAction },
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function blocked(
  action: InterceptedAction,
  reason?: string,
): { output: null; interceptorResult: InterceptorResult } {
  return { output: null, interceptorResult: { action, reason } };
}

function checkCostLimits(
  sessionId: string,
  limits: NonNullable<PolicyRule['limits']>,
): { output: null; interceptorResult: InterceptorResult } | undefined {
  const session = getSession(sessionId);

  if (session && limits.maxCallsPerSession !== undefined) {
    if (session.toolCallCount >= limits.maxCallsPerSession) {
      return {
        output: null,
        interceptorResult: {
          action: 'BLOCKED_COST_LIMIT',
          reason: `Session call limit reached (${session.toolCallCount}/${limits.maxCallsPerSession}).`,
          limitType: 'calls_per_session',
        },
      };
    }
  }

  if (session && limits.maxCostPerSession !== undefined) {
    if (session.estimatedCostUsd >= limits.maxCostPerSession) {
      return {
        output: null,
        interceptorResult: {
          action: 'BLOCKED_COST_LIMIT',
          reason: `Session cost limit reached ($${session.estimatedCostUsd.toFixed(4)}/$${limits.maxCostPerSession}).`,
          limitType: 'cost_per_session',
        },
      };
    }
  }

  if (limits.maxCallsPerHour !== undefined || limits.maxCostPerHour !== undefined) {
    const hourly = getHourlyStats(sessionId);

    if (limits.maxCallsPerHour !== undefined && hourly.calls >= limits.maxCallsPerHour) {
      return {
        output: null,
        interceptorResult: {
          action: 'BLOCKED_COST_LIMIT',
          reason: `Hourly call limit reached (${hourly.calls}/${limits.maxCallsPerHour}).`,
          limitType: 'calls_per_hour',
        },
      };
    }

    if (limits.maxCostPerHour !== undefined && hourly.costUsd >= limits.maxCostPerHour) {
      return {
        output: null,
        interceptorResult: {
          action: 'BLOCKED_COST_LIMIT',
          reason: `Hourly cost limit reached ($${hourly.costUsd.toFixed(4)}/$${limits.maxCostPerHour}).`,
          limitType: 'cost_per_hour',
        },
      };
    }
  }

  return undefined; // no limit exceeded
}

/** Short summary of tool input for REQUIRE_APPROVAL responses. */
function summariseInput(input: unknown): string {
  try {
    const str = JSON.stringify(input);
    return str.length > 200 ? str.slice(0, 197) + '...' : str;
  } catch {
    return '[non-serializable input]';
  }
}
