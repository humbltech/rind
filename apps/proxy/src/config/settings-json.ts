// .claude/settings.json builder and merger for Rind PreToolUse hook (D-040 Phase A5).
//
// Pure functions only — no file I/O, no process references, no side effects.
// The init CLI reads the existing settings file (if any), passes it here,
// and writes back whatever this returns.
//
// Claude Code settings.json structure (relevant keys only):
//   hooks.PreToolUse  — array of { matcher, hooks: [{ type: 'command', command }] }
//   permissions       — allow/deny lists (left unchanged)
//   env               — environment variables (left unchanged)
//
// Merge strategy:
//   If a PreToolUse hook for '*' already points at Rind's /hook/evaluate → idempotent, no-op
//   Otherwise → prepend the Rind hook entry to hooks.PreToolUse (leave any existing hooks)

// ─── Types ────────────────────────────────────────────────────────────────────

export interface HookCommand {
  type:    'command';
  command: string;
}

export interface HookMatcher {
  matcher: string;
  hooks:   HookCommand[];
}

export interface ClaudeSettings {
  hooks?: {
    PreToolUse?: HookMatcher[];
    [key: string]: HookMatcher[] | undefined;
  };
  [key: string]: unknown;
}

// ─── Constants ────────────────────────────────────────────────────────────────

/** The matcher for the wildcard PreToolUse hook that covers all tools. */
const WILDCARD_MATCHER = '*';

/**
 * Substrings that identify a Rind PreToolUse hook command.
 * Matches both the inline-curl form (contains the URL path) and the
 * bash-script form (contains the script filename).
 */
const RIND_HOOK_SIGNATURES = ['/hook/evaluate', 'rind-hook.sh'] as const;

/**
 * Substrings that identify a Rind observability hook command.
 * Matches both the inline-curl form and the bash-script form.
 *
 * IMPORTANT: use "/hook/event'" (with closing single-quote) as the curl
 * signature, NOT "/hook/event" alone.  The evaluate-endpoint URL contains
 * "/hook/evaluate", which starts with the 11-character prefix "/hook/event".
 * The closing quote that buildEventHookCommand always emits is the shortest
 * suffix that distinguishes the event URL from the evaluate URL.
 */
const RIND_EVENT_SIGNATURES = ["/hook/event'", 'rind-event.sh'] as const;

/** Observability hooks that fire non-blocking events to /hook/event. */
const EVENT_HOOKS: readonly string[] = ['PostToolUse', 'SubagentStart', 'SubagentStop'] as const;

// ─── Parsing ──────────────────────────────────────────────────────────────────

/**
 * Parses an unknown value as a Claude Code settings object.
 * Returns an empty settings object when the input is not a plain object — the
 * caller can pass null/undefined for missing files and still get a valid result.
 */
export function parseClaudeSettings(raw: unknown): ClaudeSettings {
  if (typeof raw === 'object' && raw !== null && !Array.isArray(raw)) {
    return raw as ClaudeSettings;
  }
  return {};
}

// ─── Command classifiers ──────────────────────────────────────────────────────

/**
 * Returns true when a command string is a Rind PreToolUse hook.
 * Matches the inline-curl form (URL contains /hook/evaluate) and the
 * bash-script form (command contains rind-hook.sh).
 */
export function isRindHookCommand(cmd: string): boolean {
  return RIND_HOOK_SIGNATURES.some((sig) => cmd.includes(sig));
}

/**
 * Returns true when a command string is a Rind observability hook.
 * Matches the inline-curl form (URL contains /hook/event) and the
 * bash-script form (command contains rind-event.sh).
 */
export function isRindEventHookCommand(cmd: string): boolean {
  return RIND_EVENT_SIGNATURES.some((sig) => cmd.includes(sig));
}

// ─── Idempotency check ────────────────────────────────────────────────────────

/**
 * Returns true when settings already contain a PreToolUse hook that calls
 * Rind's /hook/evaluate endpoint. Safe to call on any settings object.
 */
export function alreadyHasRindHook(settings: ClaudeSettings): boolean {
  const matchers = settings.hooks?.PreToolUse ?? [];
  return matchers.some((m) =>
    m.hooks.some((h) => h.type === 'command' && isRindHookCommand(h.command)),
  );
}

// ─── Hook command builder ─────────────────────────────────────────────────────

/**
 * Builds the shell command string for the PreToolUse hook.
 * Uses curl to POST stdin (the hook JSON) to Rind's evaluate endpoint.
 * stdin JSON is passed via `-d @-` so the hook script stays one line.
 *
 * Throws if rindUrl is not a valid HTTP/HTTPS URL — prevents shell injection
 * from a malformed or adversarial --rind-url value being written into settings.json.
 */
export function buildHookCommand(rindUrl: string): string {
  // Parse the URL to validate it and normalise it — rejects strings containing
  // shell metacharacters that are not valid URL syntax (spaces, quotes, semicolons).
  let parsed: URL;
  try {
    parsed = new URL(rindUrl);
  } catch {
    throw new Error(`Invalid rindUrl: "${rindUrl}" is not a valid URL`);
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`Invalid rindUrl: must be http:// or https://, got "${parsed.protocol}//"`);
  }

  // Use the normalised href (trailing slash stripped) — never the raw user input.
  // Single-quote the URL so path components with hyphens or slashes don't confuse curl.
  // Single quotes are valid in URL paths per RFC 3986 (sub-delimiters), so new URL()
  // won't reject them — but they would break the single-quoted shell string and could
  // be used for injection. Reject them explicitly.
  const url = parsed.href.replace(/\/$/, '');
  if (url.includes("'")) {
    throw new Error(`Invalid rindUrl: URL must not contain single quotes`);
  }
  return `curl -s -X POST '${url}/hook/evaluate' -H 'Content-Type: application/json' -d @-`;
}

/**
 * Builds the shell command for observability hooks (PostToolUse, SubagentStart/Stop).
 * Fire-and-forget — redirects output to /dev/null so it never blocks the agent.
 */
export function buildEventHookCommand(rindUrl: string): string {
  let parsed: URL;
  try {
    parsed = new URL(rindUrl);
  } catch {
    throw new Error(`Invalid rindUrl: "${rindUrl}" is not a valid URL`);
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`Invalid rindUrl: must be http:// or https://, got "${parsed.protocol}//"`);
  }
  const url = parsed.href.replace(/\/$/, '');
  if (url.includes("'")) {
    throw new Error(`Invalid rindUrl: URL must not contain single quotes`);
  }
  return `curl -s -X POST '${url}/hook/event' -H 'Content-Type: application/json' -d @- >/dev/null 2>&1`;
}

/**
 * Returns true when settings already have observability hooks for all three
 * event types (PostToolUse, SubagentStart, SubagentStop).
 */
export function alreadyHasRindEventHooks(settings: ClaudeSettings): boolean {
  return EVENT_HOOKS.every((hookName) => {
    const matchers = settings.hooks?.[hookName] ?? [];
    return matchers.some((m) =>
      m.hooks.some((h) => h.type === 'command' && isRindEventHookCommand(h.command)),
    );
  });
}

// ─── Merge ────────────────────────────────────────────────────────────────────

/**
 * Returns a new settings object with the Rind PreToolUse hook added.
 * Existing hooks, permissions, and env are preserved.
 * Idempotent — if the hook is already present, returns settings unchanged.
 */
export function mergeRindHook(settings: ClaudeSettings, rindUrl: string): ClaudeSettings {
  let result = { ...settings };

  // Add PreToolUse (policy enforcement)
  if (!alreadyHasRindHook(result)) {
    const rindHookEntry: HookMatcher = {
      matcher: WILDCARD_MATCHER,
      hooks: [{ type: 'command', command: buildHookCommand(rindUrl) }],
    };
    const existingPreToolUse = result.hooks?.PreToolUse ?? [];
    result = {
      ...result,
      hooks: {
        ...result.hooks,
        PreToolUse: [rindHookEntry, ...existingPreToolUse],
      },
    };
  }

  // Add observability hooks (PostToolUse, SubagentStart, SubagentStop)
  if (!alreadyHasRindEventHooks(result)) {
    const eventCommand = buildEventHookCommand(rindUrl);
    const eventEntry: HookMatcher = {
      matcher: WILDCARD_MATCHER,
      hooks: [{ type: 'command', command: eventCommand }],
    };

    const hooks = { ...result.hooks };
    for (const hookName of EVENT_HOOKS) {
      const existing = hooks[hookName] ?? [];
      const alreadyPresent = existing.some((m) =>
        m.hooks.some((h) => h.type === 'command' && isRindEventHookCommand(h.command)),
      );
      if (!alreadyPresent) {
        hooks[hookName] = [eventEntry, ...existing];
      }
    }
    result = { ...result, hooks };
  }

  return result;
}
