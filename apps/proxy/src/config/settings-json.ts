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

/** Substring that identifies a Rind hook command — present in any variation of the URL. */
const RIND_HOOK_SIGNATURE = '/hook/evaluate';

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

// ─── Idempotency check ────────────────────────────────────────────────────────

/**
 * Returns true when settings already contain a PreToolUse hook that calls
 * Rind's /hook/evaluate endpoint. Safe to call on any settings object.
 */
export function alreadyHasRindHook(settings: ClaudeSettings): boolean {
  const matchers = settings.hooks?.PreToolUse ?? [];
  return matchers.some((m) =>
    m.hooks.some((h) => h.type === 'command' && h.command.includes(RIND_HOOK_SIGNATURE)),
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
  const url = parsed.href.replace(/\/$/, '');
  return `curl -s -X POST '${url}/hook/evaluate' -H 'Content-Type: application/json' -d @-`;
}

// ─── Merge ────────────────────────────────────────────────────────────────────

/**
 * Returns a new settings object with the Rind PreToolUse hook added.
 * Existing hooks, permissions, and env are preserved.
 * Idempotent — if the hook is already present, returns settings unchanged.
 */
export function mergeRindHook(settings: ClaudeSettings, rindUrl: string): ClaudeSettings {
  if (alreadyHasRindHook(settings)) return settings;

  const rindHookEntry: HookMatcher = {
    matcher: WILDCARD_MATCHER,
    hooks: [{ type: 'command', command: buildHookCommand(rindUrl) }],
  };

  const existingPreToolUse = settings.hooks?.PreToolUse ?? [];

  return {
    ...settings,
    hooks: {
      ...settings.hooks,
      // Prepend Rind's hook so it runs first; existing hooks follow
      PreToolUse: [rindHookEntry, ...existingPreToolUse],
    },
  };
}
