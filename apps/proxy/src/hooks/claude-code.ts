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

import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { ToolCallEvent, ResponseThreat, PolicyRule } from '../types.js';
import { intercept } from '../interceptor.js';
import type { InterceptorOptions } from '../interceptor.js';
import { inspectResponse } from '../inspector/response.js';

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
  // Model name — not yet sent by Claude Code but reserved for future use
  model:            z.string().max(128).optional(),
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
  // Model name — not yet sent by Claude Code but reserved for future use
  model:            z.string().max(128).optional(),
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
  /** Deterministic correlation ID linking PostToolUse back to its PreToolUse */
  correlationId?: string;
  agentType?: string;
  toolName?: string;
  toolLabel?: string;
  toolResponse?: unknown;
  /** Truncated output preview (first 4KB) — only set for PostToolUse with large output */
  outputPreview?: string;
  /** Whether the full output was truncated */
  outputTruncated?: boolean;
  /** Full output size in bytes (before truncation) — only set for PostToolUse */
  outputSizeBytes?: number;
  /** SHA-256 hash of the full output — for deduplication and forensics */
  outputHash?: string;
  /** Threats detected in tool response — only set for PostToolUse */
  threats?: import('../types.js').ResponseThreat[];
  prompt?: string;
  stopReason?: string;
  transcriptPath?: string;
  cwd?: string;
  timestamp: number;
}

// Process a general hook event into a structured format for storage.
// For PostToolUse events: truncates large outputs and runs response inspection.
export function processHookEvent(req: HookEvent): ProcessedHookEvent {
  const isPostToolUse = req.hook_event_name === 'PostToolUse';
  const output = req.tool_response;

  // Serialize output once — reused for truncation, size, and hash
  const outputText = isPostToolUse && output != null
    ? (typeof output === 'string' ? output : JSON.stringify(output))
    : undefined;

  // Always capture a preview; truncate large outputs at 4KB
  let outputPreview: string | undefined;
  let outputTruncated = false;
  let storedResponse = output;
  const MAX_OUTPUT_BYTES = 4096;
  const PREVIEW_BYTES = 1024; // always capture first 1KB as preview

  if (outputText) {
    if (outputText.length > MAX_OUTPUT_BYTES) {
      outputPreview = outputText.slice(0, MAX_OUTPUT_BYTES);
      outputTruncated = true;
      storedResponse = outputPreview;
    } else {
      // Small output — capture first 1KB as preview for dashboard display
      outputPreview = outputText.slice(0, PREVIEW_BYTES);
    }
  }

  // Run response inspector on PostToolUse output for threat detection
  let threats: ResponseThreat[] | undefined;
  if (isPostToolUse && output != null) {
    try {
      const detected = inspectResponse(output);
      if (detected.length > 0) threats = detected;
    } catch {
      // Inspector failure is non-fatal — event is still stored
    }
  }

  // Compute response size and hash for forensics
  const outputSizeBytes = outputText ? Buffer.byteLength(outputText, 'utf-8') : undefined;
  const outputHash = outputText ? hashString(outputText) : undefined;

  return {
    eventType: req.hook_event_name,
    sessionId: req.session_id,
    agentId: req.agent_id ?? `hook:${req.session_id}`,
    agentType: req.agent_type,
    toolName: req.tool_name,
    toolLabel: req.tool_name ? deriveToolLabel(req.tool_name, req.tool_input) : undefined,
    toolResponse: storedResponse,
    outputPreview,
    outputTruncated: outputTruncated || undefined,
    outputSizeBytes,
    outputHash,
    threats,
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

export interface HookEvalOptions {
  /** Include actionable guidance in deny responses (additionalContext). Default: true. */
  sendGuidance?: boolean;
}

export interface HookEvalResult {
  response: HookResponse;
  /** The raw interceptor result — callers can check for REQUIRE_APPROVAL to trigger approval flow. */
  interceptorAction: string;
  /** The matched policy rule (if any) — used for approval metadata. */
  matchedRule?: PolicyRule;
}

export async function evaluateHook(
  req: HookRequest,
  interceptorOpts: InterceptorOptions,
  hookOpts?: HookEvalOptions,
): Promise<HookEvalResult> {
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
  const interceptOpts = { ...interceptorOpts, skipRequestInspection: true };

  const { interceptorResult } = await intercept(event, evaluateOnlyForward, interceptOpts);

  const action = interceptorResult.action;

  if (action === 'ALLOW' || action === 'RATE_LIMIT') {
    return { response: allow(), interceptorAction: action };
  }

  // DENY / BLOCKED_* / REQUIRE_APPROVAL → deny hook with optional actionable guidance
  const reason = interceptorResult.reason ?? `Blocked by Rind: ${action}`;
  const guidance = (hookOpts?.sendGuidance ?? true)
    ? deriveGuidance(action, event.toolName, reason)
    : undefined;
  return { response: deny(reason, guidance), interceptorAction: action };
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
      // Short, simple commands (no compound operators, no flags): show verbatim
      if (cmd.length <= 40 && !(/[;&|]{1,2}/.test(cmd))) return `Bash: ${cmd}`;
      // Extract sub-command summaries from compound or complex shell commands
      const subs = extractSubCommands(cmd);
      return subs.length > 0 ? `Bash: ${subs.join(', ')}` : 'Bash';
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

// Extract meaningful sub-command summaries from compound shell commands.
// "git add f1 f2 && git commit -m 'msg'" → ["git add", "git commit"]
// "cd /tmp && npm install && npm test"   → ["cd", "npm install", "npm test"]
// "git -C /repo rev-parse --show-toplevel" → ["git rev-parse"]
function extractSubCommands(cmd: string): string[] {
  // Split on shell compound operators: &&, ||, ;, |
  const parts = cmd.split(/\s*(?:&&|\|\||[;|])\s*/);
  const subs: string[] = [];

  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    subs.push(summarizeOneCommand(trimmed));
  }

  // Deduplicate adjacent identical labels (e.g., three "git status" become one)
  return dedupeAdjacent(subs);
}

// Summarize a single (non-compound) command to its meaningful parts.
// "git -C /repo rev-parse --show-toplevel" → "git rev-parse"
// "npm install --save-dev vitest"          → "npm install"
// "curl -s --max-time 2 http://..."        → "curl"
// "lsof -i :3000 -t"                       → "lsof"
function summarizeOneCommand(cmd: string): string {
  const tokens = cmd.split(/\s+/);
  if (tokens.length === 0) return cmd;

  const binary = tokens[0]!;

  // git sub-commands: skip flags/options to find the actual sub-command
  if (binary === 'git') {
    const sub = findSubCommand(tokens, 1);
    return sub ? `git ${sub}` : 'git';
  }

  // npm/npx/pnpm sub-commands
  if (binary === 'npm' || binary === 'npx' || binary === 'pnpm') {
    const sub = findSubCommand(tokens, 1);
    return sub ? `${binary} ${sub}` : binary;
  }

  // docker sub-commands
  if (binary === 'docker') {
    const sub = findSubCommand(tokens, 1);
    return sub ? `docker ${sub}` : 'docker';
  }

  // Everything else: just the binary name
  return binary;
}

// Walk tokens starting at `from`, skip flags (-x, --flag) and flag values (-C /path),
// return the first non-flag token (the sub-command).
function findSubCommand(tokens: string[], from: number): string | undefined {
  let i = from;
  while (i < tokens.length) {
    const t = tokens[i]!;
    // Skip long options (--flag, --flag=value)
    if (t.startsWith('--')) { i++; continue; }
    // Skip short options and their values (-C /path, -m "msg")
    if (t.startsWith('-') && t.length <= 3) { i += 2; continue; }
    // Skip paths and quoted strings
    if (t.startsWith('/') || t.startsWith('"') || t.startsWith("'")) { i++; continue; }
    return t;
  }
  return undefined;
}

function dedupeAdjacent(items: string[]): string[] {
  return items.filter((item, i) => i === 0 || item !== items[i - 1]);
}

function hashString(value: string): string {
  return createHash('sha256').update(value).digest('hex');
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

function deny(reason: string, guidance?: string): HookDenyResponse {
  return {
    continue: false,
    stopReason: reason,
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: reason,
      ...(guidance ? { additionalContext: guidance } : {}),
    },
  };
}

// Generate actionable guidance so Claude knows WHY the call was blocked
// and WHAT to do instead — not just a raw error string.
function deriveGuidance(
  action: string,
  toolName: string,
  reason: string,
): string {
  if (action === 'BLOCKED_LOOP') {
    return (
      `This ${toolName} call was blocked because it appears to be repeating the same operation. ` +
      `Try a different approach — change the command, use a different tool, or ask the user for guidance.`
    );
  }

  if (action === 'BLOCKED_INJECTION') {
    return (
      `This ${toolName} call was blocked because the input contains patterns that look like prompt injection. ` +
      `Review the input for suspicious content before retrying.`
    );
  }

  if (action === 'BLOCKED_COST_LIMIT') {
    return (
      `This session has reached its cost or call limit. ` +
      `Stop making tool calls and inform the user that the session limit has been reached.`
    );
  }

  if (action === 'REQUIRE_APPROVAL') {
    return (
      `This ${toolName} call requires human approval before it can proceed. ` +
      `A notification has been sent to the security team for review. ` +
      `Please inform the user that this action is pending approval, then wait 10 seconds and retry the exact same tool call. ` +
      `If approved, the retry will succeed. If denied or timed out, you will be informed.`
    );
  }

  if (action === 'DENY') {
    // Extract the policy rule name if present in the reason
    const ruleMatch = reason.match(/policy rule "([^"]+)"/);
    const ruleName = ruleMatch?.[1];
    return (
      `This ${toolName} call was denied by a Rind security policy` +
      (ruleName ? ` ("${ruleName}")` : '') +
      `. This tool or command is not permitted in this environment. ` +
      `Try an alternative approach or ask the user if this action is necessary.`
    );
  }

  return `This ${toolName} call was blocked by Rind. Try an alternative approach.`;
}
