// Claude Code PreToolUse hook integration (D-040 Phase A).
//
// Claude Code fires a PreToolUse hook before every tool execution — built-in
// (Bash, Write, Edit, Read, WebFetch, Agent, …) and MCP tools alike.
// The hook receives tool_name + tool_input on stdin, and expects a JSON response
// that either allows or denies the call.
//
// Rind implements the server side of this protocol at POST /hook/evaluate.
// The interceptor runs in evaluate-only mode: steps 1-5 (kill-switch, loop
// detection, request inspection, policy evaluation, rate limiting) without
// the forward step, so we can make a policy decision without actually calling
// any upstream.
//
// Claude Code hook input schema (verified against official docs):
//   { session_id, hook_event_name, tool_name, tool_input, cwd, permission_mode,
//     transcript_path, agent_id?, agent_type? }
//
// Rind response → Claude Code hook output schema:
//   allow:  { "hookSpecificOutput": { "hookEventName": "PreToolUse", "permissionDecision": "allow" } }
//   deny:   { "continue": false, "stopReason": "...",
//              "hookSpecificOutput": { "hookEventName": "PreToolUse", "permissionDecision": "deny",
//                                      "permissionDecisionReason": "..." } }

import { z } from 'zod';
import type { ToolCallEvent } from '../types.js';
import { intercept } from '../interceptor.js';
import type { InterceptorOptions } from '../interceptor.js';

// ─── Request schema ───────────────────────────────────────────────────────────

export const HookRequestSchema = z.object({
  session_id:       z.string().default('hook-session'),
  hook_event_name:  z.string().optional(),
  tool_name:        z.string(),
  tool_input:       z.unknown().default({}),
  cwd:              z.string().optional(),
  permission_mode:  z.string().optional(),
  transcript_path:  z.string().optional(),
  // Only present when hook fires inside a subagent
  agent_id:         z.string().optional(),
  agent_type:       z.string().optional(),
});

export type HookRequest = z.infer<typeof HookRequestSchema>;

// ─── Response types ───────────────────────────────────────────────────────────

export interface HookAllowResponse {
  hookSpecificOutput: {
    hookEventName: 'PreToolUse';
    permissionDecision: 'allow';
    additionalContext?: string;
  };
}

export interface HookDenyResponse {
  continue: false;
  stopReason: string;
  hookSpecificOutput: {
    hookEventName: 'PreToolUse';
    permissionDecision: 'deny';
    permissionDecisionReason: string;
    additionalContext?: string;
  };
}

export type HookResponse = HookAllowResponse | HookDenyResponse;

// ─── Evaluate hook request ────────────────────────────────────────────────────

// Converts a Claude Code hook request into a ToolCallEvent and runs it through
// the interceptor in evaluate-only mode. Returns a hook-compatible response.

export async function evaluateHook(
  req: HookRequest,
  interceptorOpts: InterceptorOptions,
): Promise<HookResponse> {
  const event = hookRequestToToolCallEvent(req);

  // evaluate-only forward: never called — returns immediately with a dummy result
  // if the pipeline reaches step 6. In practice the pipeline returns before step 6
  // on any DENY/BLOCK decision. If it reaches ALLOW, we return allow without
  // ever touching an upstream server.
  const evaluateOnlyForward = async () => ({
    output: null as unknown,
    durationMs: 0,
  });

  const { interceptorResult } = await intercept(event, evaluateOnlyForward, interceptorOpts);

  const action = interceptorResult.action;

  if (action === 'ALLOW' || action === 'RATE_LIMIT') {
    // RATE_LIMIT that passed the limiter check normalises to ALLOW inside interceptor
    return allow();
  }

  // DENY / BLOCKED_* / REQUIRE_APPROVAL → deny hook
  const reason = interceptorResult.reason ?? `Blocked by Rind: ${action}`;
  return deny(reason);
}

// ─── Conversions ─────────────────────────────────────────────────────────────

function hookRequestToToolCallEvent(req: HookRequest): ToolCallEvent {
  return {
    // Use agent_id from subagent context if present, otherwise derive from session
    agentId:   req.agent_id ?? `hook:${req.session_id}`,
    sessionId: req.session_id,
    // Claude Code built-in tools have no serverId — use 'builtin'
    // MCP tools are named mcp__<server>__<tool> — extract server from name
    serverId:  serverIdFromToolName(req.tool_name),
    toolName:  req.tool_name,
    input:     req.tool_input,
    timestamp: Date.now(),
  };
}

function serverIdFromToolName(toolName: string): string {
  // MCP tools in Claude Code follow the pattern: mcp__<server>__<tool>
  if (toolName.startsWith('mcp__')) {
    const parts = toolName.split('__');
    return parts[1] ?? 'mcp-unknown';
  }
  return 'builtin';
}

// ─── Response builders ────────────────────────────────────────────────────────

function allow(context?: string): HookAllowResponse {
  return {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'allow',
      ...(context ? { additionalContext: context } : {}),
    },
  };
}

function deny(reason: string): HookDenyResponse {
  return {
    continue: false,
    stopReason: reason,
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: reason,
    },
  };
}
