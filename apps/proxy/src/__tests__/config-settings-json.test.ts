// Tests for config/settings-json.ts — pure transform functions.
// No file I/O, no process references.

import { describe, it, expect } from 'vitest';
import {
  parseClaudeSettings,
  alreadyHasRindHook,
  alreadyHasRindEventHooks,
  buildHookCommand,
  buildEventHookCommand,
  mergeRindHook,
} from '../config/settings-json.js';
import type { ClaudeSettings } from '../config/settings-json.js';

const DEFAULT_URL = 'http://localhost:7777';

// ─── parseClaudeSettings ──────────────────────────────────────────────────────

describe('parseClaudeSettings', () => {
  it('returns empty object for null', () => {
    expect(parseClaudeSettings(null)).toEqual({});
  });

  it('returns empty object for undefined', () => {
    expect(parseClaudeSettings(undefined)).toEqual({});
  });

  it('returns empty object for a string', () => {
    expect(parseClaudeSettings('not-an-object')).toEqual({});
  });

  it('returns empty object for an array', () => {
    expect(parseClaudeSettings([])).toEqual({});
  });

  it('returns the object as-is for a valid settings shape', () => {
    const settings = { hooks: { PreToolUse: [] }, permissions: { allow: [] } };
    expect(parseClaudeSettings(settings)).toBe(settings);
  });

  it('accepts an empty object', () => {
    expect(parseClaudeSettings({})).toEqual({});
  });
});

// ─── alreadyHasRindHook ───────────────────────────────────────────────────────

describe('alreadyHasRindHook', () => {
  it('returns false for empty settings', () => {
    expect(alreadyHasRindHook({})).toBe(false);
  });

  it('returns false when hooks is absent', () => {
    const settings: ClaudeSettings = { permissions: { allow: [] } };
    expect(alreadyHasRindHook(settings)).toBe(false);
  });

  it('returns false when PreToolUse is empty', () => {
    const settings: ClaudeSettings = { hooks: { PreToolUse: [] } };
    expect(alreadyHasRindHook(settings)).toBe(false);
  });

  it('returns false when PreToolUse has non-Rind hooks', () => {
    const settings: ClaudeSettings = {
      hooks: {
        PreToolUse: [
          { matcher: '*', hooks: [{ type: 'command', command: 'my-other-hook' }] },
        ],
      },
    };
    expect(alreadyHasRindHook(settings)).toBe(false);
  });

  it('returns true when a hook command contains /hook/evaluate', () => {
    const settings: ClaudeSettings = {
      hooks: {
        PreToolUse: [
          {
            matcher: '*',
            hooks: [{ type: 'command', command: 'curl -s -X POST http://localhost:7777/hook/evaluate -d @-' }],
          },
        ],
      },
    };
    expect(alreadyHasRindHook(settings)).toBe(true);
  });

  it('returns true even when the Rind URL is different (checks by path signature)', () => {
    const settings: ClaudeSettings = {
      hooks: {
        PreToolUse: [
          {
            matcher: '*',
            hooks: [{ type: 'command', command: 'curl -s https://rind.example.com/hook/evaluate -d @-' }],
          },
        ],
      },
    };
    expect(alreadyHasRindHook(settings)).toBe(true);
  });
});

// ─── buildHookCommand ─────────────────────────────────────────────────────────

describe('buildHookCommand', () => {
  it('builds a curl command for the given URL', () => {
    const cmd = buildHookCommand('http://localhost:7777');
    expect(cmd).toContain('http://localhost:7777/hook/evaluate');
    expect(cmd).toContain('curl');
    expect(cmd).toContain('-X POST');
    expect(cmd).toContain('-d @-');
  });

  it('strips a trailing slash from the URL', () => {
    const cmd = buildHookCommand('http://localhost:7777/');
    expect(cmd).toContain('http://localhost:7777/hook/evaluate');
    // No double slash
    expect(cmd).not.toContain('//hook/evaluate');
  });

  it('works with a custom host and port', () => {
    const cmd = buildHookCommand('https://rind.internal:9000');
    expect(cmd).toContain('https://rind.internal:9000/hook/evaluate');
  });

  it('single-quotes the URL in the curl command', () => {
    const cmd = buildHookCommand('http://localhost:7777');
    // URL must be quoted so path components don't confuse the shell
    expect(cmd).toMatch(/'http:\/\/localhost:7777\/hook\/evaluate'/);
  });

  it('throws on a non-URL string', () => {
    expect(() => buildHookCommand('not-a-url')).toThrow(/invalid/i);
  });

  it('throws on a non-http/https protocol', () => {
    expect(() => buildHookCommand('ftp://localhost/hook')).toThrow(/http/i);
    expect(() => buildHookCommand('file:///etc/passwd')).toThrow(/http/i);
  });

  it('rejects a URL containing shell metacharacters that break URL parsing', () => {
    // Semicolons and spaces are invalid in URLs — new URL() rejects them,
    // so they cannot reach the curl command string.
    expect(() => buildHookCommand('http://localhost:7777; rm -rf /')).toThrow();
    expect(() => buildHookCommand('http://localhost:7777\' | evil')).toThrow();
  });

  it('appends /hook/evaluate correctly when the URL has a path component', () => {
    const cmd = buildHookCommand('http://localhost:7777/rind');
    expect(cmd).toContain('http://localhost:7777/rind/hook/evaluate');
    expect(cmd).not.toContain('//hook/evaluate');
  });

  it('rejects URLs with single quotes in the path (valid URL chars, unsafe in shell)', () => {
    // Single quotes are sub-delimiters in RFC 3986 — new URL() accepts them,
    // but they would break the single-quoted curl command string.
    expect(() => buildHookCommand("http://localhost:7777/path'test")).toThrow(/single quote/i);
  });
});

// ─── mergeRindHook ────────────────────────────────────────────────────────────

describe('mergeRindHook', () => {
  it('adds a PreToolUse hook to empty settings', () => {
    const result = mergeRindHook({}, DEFAULT_URL);
    expect(result.hooks?.PreToolUse).toHaveLength(1);
    expect(result.hooks?.PreToolUse?.[0]?.matcher).toBe('*');
    expect(result.hooks?.PreToolUse?.[0]?.hooks[0]?.command).toContain('/hook/evaluate');
  });

  it('prepends the Rind hook before existing PreToolUse hooks', () => {
    const existing: ClaudeSettings = {
      hooks: {
        PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'my-hook' }] }],
      },
    };
    const result = mergeRindHook(existing, DEFAULT_URL);
    const matchers = result.hooks!.PreToolUse!;

    expect(matchers).toHaveLength(2);
    // Rind hook comes first
    expect(matchers[0]!.hooks[0]!.command).toContain('/hook/evaluate');
    // Existing hook preserved second
    expect(matchers[1]!.hooks[0]!.command).toBe('my-hook');
  });

  it('preserves existing PostToolUse hooks while prepending Rind event hook', () => {
    const existing: ClaudeSettings = {
      hooks: {
        PostToolUse: [{ matcher: '*', hooks: [{ type: 'command', command: 'post-hook' }] }],
      },
    };
    const result = mergeRindHook(existing, DEFAULT_URL);
    const postToolUse = result.hooks?.PostToolUse;
    expect(postToolUse).toBeDefined();
    // Rind event hook prepended, existing hook preserved after
    expect(postToolUse!.length).toBeGreaterThanOrEqual(2);
    expect(postToolUse![0]!.hooks[0]!.command).toContain('/hook/event');
    expect(postToolUse![postToolUse!.length - 1]!.hooks[0]!.command).toBe('post-hook');
  });

  it('preserves top-level settings keys (permissions, env, etc.)', () => {
    const existing: ClaudeSettings = {
      permissions: { allow: ['Bash'] },
      env: { MY_VAR: 'hello' },
    };
    const result = mergeRindHook(existing, DEFAULT_URL);
    expect(result.permissions).toEqual({ allow: ['Bash'] });
    expect(result.env).toEqual({ MY_VAR: 'hello' });
  });

  it('is idempotent — does not add a second hook if one already exists', () => {
    const settings: ClaudeSettings = {
      hooks: {
        PreToolUse: [
          { matcher: '*', hooks: [{ type: 'command', command: `curl -s ${DEFAULT_URL}/hook/evaluate -d @-` }] },
        ],
      },
    };
    const result = mergeRindHook(settings, DEFAULT_URL);
    expect(result.hooks!.PreToolUse).toHaveLength(1);
  });

  it('produces a new object — original is not mutated', () => {
    const original: ClaudeSettings = { hooks: { PreToolUse: [] } };
    mergeRindHook(original, DEFAULT_URL);
    expect(original.hooks!.PreToolUse).toHaveLength(0); // unchanged
  });

  it('adds event hooks for PostToolUse, SubagentStart, and SubagentStop', () => {
    const result = mergeRindHook({}, DEFAULT_URL);
    expect(result.hooks?.PostToolUse).toBeDefined();
    expect(result.hooks?.SubagentStart).toBeDefined();
    expect(result.hooks?.SubagentStop).toBeDefined();
    // Each should have the event hook
    expect(result.hooks!.PostToolUse![0]!.hooks[0]!.command).toContain('/hook/event');
    expect(result.hooks!.SubagentStart![0]!.hooks[0]!.command).toContain('/hook/event');
    expect(result.hooks!.SubagentStop![0]!.hooks[0]!.command).toContain('/hook/event');
  });

  it('is idempotent for event hooks — does not add duplicates', () => {
    const first = mergeRindHook({}, DEFAULT_URL);
    const second = mergeRindHook(first, DEFAULT_URL);
    expect(second.hooks!.PostToolUse).toHaveLength(first.hooks!.PostToolUse!.length);
    expect(second.hooks!.SubagentStart).toHaveLength(first.hooks!.SubagentStart!.length);
  });
});

// ─── buildEventHookCommand ───────────────────────────────────────────────────

describe('buildEventHookCommand', () => {
  it('builds a curl command pointing to /hook/event', () => {
    const cmd = buildEventHookCommand(DEFAULT_URL);
    expect(cmd).toContain('/hook/event');
    expect(cmd).toContain('>/dev/null');
  });

  it('rejects non-HTTP URLs', () => {
    expect(() => buildEventHookCommand('ftp://evil.com')).toThrow();
  });
});

// ─── alreadyHasRindEventHooks ────────────────────────────────────────────────

describe('alreadyHasRindEventHooks', () => {
  it('returns false for empty settings', () => {
    expect(alreadyHasRindEventHooks({})).toBe(false);
  });

  it('returns true when all three event hooks are present', () => {
    const cmd = buildEventHookCommand(DEFAULT_URL);
    const entry = { matcher: '*', hooks: [{ type: 'command' as const, command: cmd }] };
    const settings: ClaudeSettings = {
      hooks: {
        PostToolUse: [entry],
        SubagentStart: [entry],
        SubagentStop: [entry],
      },
    };
    expect(alreadyHasRindEventHooks(settings)).toBe(true);
  });

  it('returns false when only some event hooks are present', () => {
    const cmd = buildEventHookCommand(DEFAULT_URL);
    const entry = { matcher: '*', hooks: [{ type: 'command' as const, command: cmd }] };
    const settings: ClaudeSettings = {
      hooks: {
        PostToolUse: [entry],
        // Missing SubagentStart and SubagentStop
      },
    };
    expect(alreadyHasRindEventHooks(settings)).toBe(false);
  });
});
