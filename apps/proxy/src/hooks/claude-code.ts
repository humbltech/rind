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
  session_id:       z.string().min(1).max(256).default('hook-session'),
  hook_event_name:  z.string().max(128).optional(),
  tool_name:        z.string().min(1).max(256),
  tool_input:       z.unknown().default({}),
  cwd:              z.string().max(512).optional(),
  permission_mode:  z.string().max(64).optional(),
  transcript_path:  z.string().max(512).optional(),
  // Only present when hook fires inside a subagent
  agent_id:         z.string().min(1).max(256).optional(),
  agent_type:       z.string().max(64).optional(),
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

// ─── Hook event schema (Phase 1: PostToolUse, SubagentStart, SubagentStop) ────

export const HookEventSchema = z.object({
  session_id:       z.string().min(1).max(256).default('hook-session'),
  hook_event_name:  z.string().min(1).max(128),
  tool_name:        z.string().max(256).optional(),
  tool_input:       z.unknown().optional(),
  tool_response:    z.unknown().optional(),          // PostToolUse
  agent_id:         z.string().min(1).max(256).optional(),
  agent_type:       z.string().max(64).optional(),
  cwd:              z.string().max(512).optional(),
  // SubagentStart
  prompt:           z.string().max(10_000).optional(),
  // SubagentStop
  stop_reason:      z.string().max(256).optional(),
  agent_transcript_path: z.string().max(512).optional(),
});

export type HookEvent = z.infer<typeof HookEventSchema>;

// ─── Hook event types ─────────────────────────────────────────────────────────

export type HookEventType = 'PostToolUse' | 'SubagentStart' | 'SubagentStop' | string;

export interface ProcessedHookEvent {
  eventType: HookEventType;
  sessionId: string;
  agentId: string;
  agentType?: string;
  toolName?: string;
  toolLabel?: string;
  toolResponse?: unknown;
  prompt?: string;
  stopReason?: string;
  transcriptPath?: string;
  cwd?: string;
  timestamp: number;
}

// Process a general hook event into a structured format for storage
export function processHookEvent(req: HookEvent): ProcessedHookEvent {
  return {
    eventType: req.hook_event_name,
    sessionId: req.session_id,
    agentId: req.agent_id ?? `hook:${req.session_id}`,
    agentType: req.agent_type,
    toolName: req.tool_name,
    toolLabel: req.tool_name ? deriveToolLabel(req.tool_name, req.tool_input) : undefined,
    toolResponse: req.tool_response,
    prompt: req.prompt,
    stopReason: req.stop_reason,
    transcriptPath: req.agent_transcript_path,
    cwd: req.cwd,
    timestamp: Date.now(),
  };
}

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

  // Hook tool inputs are user-initiated (the user's coding agent writing code),
  // not attacker-controlled MCP inputs. Skip injection scanning to avoid false
  // positives on legitimate code patterns (template literals, shell substitutions).
  const hookOpts = { ...interceptorOpts, skipRequestInspection: true };

  const { interceptorResult } = await intercept(event, evaluateOnlyForward, hookOpts);

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
  const isMcp = req.tool_name.startsWith('mcp__');
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
    source:    isMcp ? 'mcp' : 'builtin',
    cwd:       req.cwd,
  };
}

// Extract a human-readable label from tool name + input.
// "Bash" + {command:"git status"} → "Bash: git status"
// "Read" + {file_path:"/a/b/server.ts"} → "Read: server.ts"
// "Edit" + {file_path:"/a/b/types.ts"} → "Edit: types.ts"
// "Grep" + {pattern:"TODO"} → "Grep: TODO"
// "Agent" + {subagent_type:"Explore"} → "Agent: Explore"
export function deriveToolLabel(toolName: string, input: unknown): string {
  const inp = input as Record<string, unknown> | null | undefined;
  if (!inp || typeof inp !== 'object') return toolName;

  switch (toolName) {
    case 'Bash': {
      const cmd = typeof inp.command === 'string' ? inp.command.trim() : '';
      if (!cmd) return 'Bash';
      // Extract the first word/binary from the command
      const first = cmd.split(/[\s|;&]/)[0] || cmd;
      // For short commands show full; for long ones just the binary
      return cmd.length <= 60 ? `Bash: ${cmd}` : `Bash: ${first}`;
    }
    case 'Read': {
      const fp = typeof inp.file_path === 'string' ? inp.file_path : '';
      return fp ? `Read: ${basename(fp)}` : 'Read';
    }
    case 'Write': {
      const fp = typeof inp.file_path === 'string' ? inp.file_path : '';
      return fp ? `Write: ${basename(fp)}` : 'Write';
    }
    case 'Edit': {
      const fp = typeof inp.file_path === 'string' ? inp.file_path : '';
      return fp ? `Edit: ${basename(fp)}` : 'Edit';
    }
    case 'Grep': {
      const pat = typeof inp.pattern === 'string' ? inp.pattern : '';
      return pat ? `Grep: ${pat.slice(0, 40)}` : 'Grep';
    }
    case 'Glob': {
      const pat = typeof inp.pattern === 'string' ? inp.pattern : '';
      return pat ? `Glob: ${pat}` : 'Glob';
    }
    case 'Agent': {
      const t = typeof inp.subagent_type === 'string' ? inp.subagent_type : '';
      return t ? `Agent: ${t}` : 'Agent';
    }
    case 'WebFetch': {
      const url = typeof inp.url === 'string' ? inp.url : '';
      return url ? `WebFetch: ${url.slice(0, 50)}` : 'WebFetch';
    }
    case 'WebSearch': {
      const q = typeof inp.query === 'string' ? inp.query : '';
      return q ? `WebSearch: ${q.slice(0, 50)}` : 'WebSearch';
    }
    default:
      return toolName;
  }
}

function basename(path: string): string {
  return path.split('/').pop() || path;
}

function serverIdFromToolName(toolName: string): string {
  // MCP tools in Claude Code follow the pattern: mcp__<server>__<tool>
  if (toolName.startsWith('mcp__')) {
    const parts = toolName.split('__');
    // Use || not ?? — parts[1] may be '' (empty string) for malformed names like 'mcp__'
    return parts[1] || 'mcp-unknown';
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
