// The core proxy interceptor. Every tool call and response passes through here.
// Execution order for an outbound tool call:
//   1. Check session is active (kill-switch)
//   2. Run request-side inspection (prompt injection in args)
//   3. Apply policy rules (allow / deny / require-approval)
//   4. Forward to upstream MCP server
//   5. Run response-side inspection (credential leak, prompt injection in output)
//   6. Return to agent (or block + log if threats found)

import type { ToolCallEvent, ToolResponseEvent, PolicyAction } from './types.js';
import { inspectRequest } from './inspector/request.js';
import { inspectResponse } from './inspector/response.js';
import { isSessionActive, incrementToolCall } from './session.js';
import type { PolicyEngine } from './policy/engine.js';

export interface InterceptorResult {
  action: PolicyAction | 'BLOCKED_SESSION_KILLED' | 'BLOCKED_INJECTION' | 'BLOCKED_THREAT';
  reason?: string;
}

export interface ForwardFn {
  (event: ToolCallEvent): Promise<{ output: unknown; durationMs: number }>;
}

export interface InterceptorOptions {
  policyEngine: PolicyEngine;
  onToolCallEvent: (event: ToolCallEvent) => void;
  onToolResponseEvent: (event: ToolResponseEvent) => void;
  blockOnCriticalResponseThreats: boolean;
}

export async function intercept(
  event: ToolCallEvent,
  forward: ForwardFn,
  opts: InterceptorOptions,
): Promise<{ output: unknown; interceptorResult: InterceptorResult }> {
  // 1. Session kill-switch check
  if (!isSessionActive(event.sessionId)) {
    return {
      output: null,
      interceptorResult: {
        action: 'BLOCKED_SESSION_KILLED',
        reason: `Session ${event.sessionId} has been terminated. No further tool calls are permitted.`,
      },
    };
  }

  // 2. Request-side inspection (args injection)
  const requestResult = inspectRequest(event);
  if (!requestResult.allowed) {
    opts.onToolCallEvent(event);
    return {
      output: null,
      interceptorResult: {
        action: 'BLOCKED_INJECTION',
        reason: requestResult.reason,
      },
    };
  }

  // 3. Policy evaluation
  const policyResult = opts.policyEngine.evaluate(event);
  opts.onToolCallEvent(event);

  if (policyResult === 'DENY') {
    return {
      output: null,
      interceptorResult: {
        action: 'DENY',
        reason: `Tool call "${event.toolName}" denied by policy.`,
      },
    };
  }

  if (policyResult === 'REQUIRE_APPROVAL') {
    // Phase 1: log and block — Phase 2 will add async approval flow
    return {
      output: null,
      interceptorResult: {
        action: 'REQUIRE_APPROVAL',
        reason: `Tool call "${event.toolName}" requires human approval (not yet implemented — blocked for safety).`,
      },
    };
  }

  // 4. Forward to upstream MCP server
  incrementToolCall(event.sessionId);
  const { output, durationMs } = await forward(event);

  // 5. Response-side inspection
  const responseThreats = inspectResponse(output);

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

  // 6. Block on critical response threats if configured
  if (
    opts.blockOnCriticalResponseThreats &&
    responseThreats.some((t) => t.severity === 'critical')
  ) {
    return {
      output: null,
      interceptorResult: {
        action: 'BLOCKED_THREAT',
        reason: `Tool response from "${event.toolName}" contained a critical threat: ${responseThreats
          .filter((t) => t.severity === 'critical')
          .map((t) => t.pattern)
          .join(', ')}. Response blocked.`,
      },
    };
  }

  return {
    output,
    interceptorResult: { action: policyResult },
  };
}
