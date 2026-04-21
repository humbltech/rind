// Tests for config/mcp-json.ts — pure transform functions.
// No file I/O, no network, no process.argv.

import { describe, it, expect } from 'vitest';
import {
  parseMcpJson,
  isStdioEntry,
  isHttpEntry,
  wrapWithRind,
  alreadyWrapped,
  describeWrap,
} from '../config/mcp-json.js';
import type { McpJsonConfig, StdioMcpEntry, HttpMcpEntry } from '../config/mcp-json.js';

// ─── parseMcpJson ─────────────────────────────────────────────────────────────

describe('parseMcpJson', () => {
  it('returns null for non-object input', () => {
    expect(parseMcpJson(null)).toBeNull();
    expect(parseMcpJson('string')).toBeNull();
    expect(parseMcpJson(42)).toBeNull();
    expect(parseMcpJson([])).toBeNull();
  });

  it('returns null when mcpServers is missing', () => {
    expect(parseMcpJson({})).toBeNull();
    expect(parseMcpJson({ other: 'key' })).toBeNull();
  });

  it('returns null when mcpServers is not an object', () => {
    expect(parseMcpJson({ mcpServers: null })).toBeNull();
    expect(parseMcpJson({ mcpServers: [] })).toBeNull();
    expect(parseMcpJson({ mcpServers: 'string' })).toBeNull();
  });

  it('returns a config when mcpServers is a valid object', () => {
    const raw = { mcpServers: { github: { command: 'npx', args: ['@github/mcp-server'] } } };
    const result = parseMcpJson(raw);
    expect(result).not.toBeNull();
    expect(result?.mcpServers).toHaveProperty('github');
  });

  it('accepts an empty mcpServers object', () => {
    const result = parseMcpJson({ mcpServers: {} });
    expect(result).not.toBeNull();
    expect(result?.mcpServers).toEqual({});
  });
});

// ─── isStdioEntry / isHttpEntry ───────────────────────────────────────────────

describe('isStdioEntry', () => {
  it('returns true for entries with a command field', () => {
    expect(isStdioEntry({ command: 'npx', args: [] })).toBe(true);
    expect(isStdioEntry({ command: 'python' })).toBe(true);
  });

  it('returns false for HTTP entries', () => {
    const httpEntry: HttpMcpEntry = { type: 'http', url: 'https://example.com/mcp' };
    expect(isStdioEntry(httpEntry)).toBe(false);
  });
});

describe('isHttpEntry', () => {
  it('returns true for entries with a url field', () => {
    expect(isHttpEntry({ type: 'http', url: 'https://example.com' })).toBe(true);
    expect(isHttpEntry({ type: 'sse',  url: 'https://example.com' })).toBe(true);
  });

  it('returns false for stdio entries', () => {
    const stdioEntry: StdioMcpEntry = { command: 'npx' };
    expect(isHttpEntry(stdioEntry)).toBe(false);
  });
});

// ─── alreadyWrapped ───────────────────────────────────────────────────────────

describe('alreadyWrapped', () => {
  it('returns false for an unwrapped entry', () => {
    expect(alreadyWrapped({ command: 'npx', args: ['@github/mcp-server'] })).toBe(false);
  });

  it('returns false when args is empty', () => {
    expect(alreadyWrapped({ command: 'npx', args: [] })).toBe(false);
  });

  it('returns false when args is absent', () => {
    expect(alreadyWrapped({ command: 'npx' })).toBe(false);
  });

  it('returns true when @rind/proxy is already in args', () => {
    expect(alreadyWrapped({
      command: 'npx',
      args: ['-y', '@rind/proxy', 'wrap', '--server-id', 'github', '--', 'npx', '@github/mcp-server'],
    })).toBe(true);
  });

  it('returns true when rind-proxy is in args (alternate form)', () => {
    expect(alreadyWrapped({
      command: 'rind-proxy',
      args: ['wrap', '--server-id', 'github'],
    })).toBe(false); // command is rind-proxy but args don't contain 'rind-proxy'

    expect(alreadyWrapped({
      command: 'npx',
      args: ['-y', 'rind-proxy', 'wrap', '--', 'npx', '@github/mcp-server'],
    })).toBe(true);
  });
});

// ─── wrapWithRind ─────────────────────────────────────────────────────────────

describe('wrapWithRind', () => {
  it('wraps a simple npx stdio entry', () => {
    const config: McpJsonConfig = {
      mcpServers: {
        github: { command: 'npx', args: ['-y', '@github/mcp-server'] },
      },
    };
    const result = wrapWithRind(config);
    const entry = result.mcpServers['github'] as StdioMcpEntry;

    expect(entry.command).toBe('npx');
    expect(entry.args).toEqual(
      expect.arrayContaining(['-y', '@rind/proxy', 'wrap', '--server-id', 'github', '--', 'npx', '-y', '@github/mcp-server']),
    );
  });

  it('preserves env on the wrapped entry', () => {
    const config: McpJsonConfig = {
      mcpServers: {
        stripe: {
          command: 'npx',
          args:    ['@stripe/mcp'],
          env:     { STRIPE_API_KEY: 'sk_test_123' },
        },
      },
    };
    const result = wrapWithRind(config);
    const entry = result.mcpServers['stripe'] as StdioMcpEntry;
    expect(entry.env).toEqual({ STRIPE_API_KEY: 'sk_test_123' });
  });

  it('leaves HTTP entries unchanged', () => {
    const config: McpJsonConfig = {
      mcpServers: {
        remote: { type: 'http', url: 'https://example.com/mcp' },
      },
    };
    const result = wrapWithRind(config);
    expect(result.mcpServers['remote']).toEqual({ type: 'http', url: 'https://example.com/mcp' });
  });

  it('skips already-wrapped entries (idempotency)', () => {
    const already: StdioMcpEntry = {
      command: 'npx',
      args:    ['-y', '@rind/proxy', 'wrap', '--server-id', 'github', '--', 'npx', '@github/mcp-server'],
    };
    const config: McpJsonConfig = { mcpServers: { github: already } };
    const result = wrapWithRind(config);
    // Must be identical object — no double-wrapping
    expect(result.mcpServers['github']).toEqual(already);
    expect((result.mcpServers['github'] as StdioMcpEntry).args!.filter((a) => a === '@rind/proxy')).toHaveLength(1);
  });

  it('handles mixed server types in one config', () => {
    const config: McpJsonConfig = {
      mcpServers: {
        local:  { command: 'python', args: ['-m', 'mcp_server'] },
        remote: { type: 'http', url: 'https://api.example.com/mcp' },
      },
    };
    const result = wrapWithRind(config);

    const localEntry  = result.mcpServers['local'] as StdioMcpEntry;
    const remoteEntry = result.mcpServers['remote'] as HttpMcpEntry;

    expect(localEntry.command).toBe('npx');          // wrapped
    expect(remoteEntry.url).toBe('https://api.example.com/mcp'); // untouched
  });

  it('passes --server-id using the map key, not the package name', () => {
    const config: McpJsonConfig = {
      mcpServers: { 'my-custom-id': { command: 'npx', args: ['@some/mcp-package'] } },
    };
    const result = wrapWithRind(config);
    const entry  = result.mcpServers['my-custom-id'] as StdioMcpEntry;
    expect(entry.args).toContain('my-custom-id');
  });

  it('produces a pure new object — original config is unchanged', () => {
    const original: StdioMcpEntry = { command: 'npx', args: ['@github/mcp-server'] };
    const config: McpJsonConfig = { mcpServers: { github: original } };
    wrapWithRind(config);
    expect(original.command).toBe('npx'); // not mutated
  });
});

// ─── describeWrap ─────────────────────────────────────────────────────────────

describe('describeWrap', () => {
  it('classifies unwrapped stdio servers as wrapped', () => {
    const config: McpJsonConfig = {
      mcpServers: { github: { command: 'npx', args: ['@github/mcp-server'] } },
    };
    const summary = describeWrap(config);
    expect(summary.wrapped).toContain('github');
    expect(summary.skipped).toHaveLength(0);
    expect(summary.httpOnly).toHaveLength(0);
  });

  it('classifies already-wrapped entries as skipped', () => {
    const config: McpJsonConfig = {
      mcpServers: {
        github: {
          command: 'npx',
          args: ['-y', '@rind/proxy', 'wrap', '--server-id', 'github', '--', 'npx', '@github/mcp-server'],
        },
      },
    };
    const summary = describeWrap(config);
    expect(summary.skipped).toContain('github');
    expect(summary.wrapped).toHaveLength(0);
  });

  it('classifies HTTP servers as httpOnly', () => {
    const config: McpJsonConfig = {
      mcpServers: { remote: { type: 'sse', url: 'https://example.com' } },
    };
    const summary = describeWrap(config);
    expect(summary.httpOnly).toContain('remote');
    expect(summary.wrapped).toHaveLength(0);
  });

  it('handles a mixed config', () => {
    const config: McpJsonConfig = {
      mcpServers: {
        new:     { command: 'npx', args: ['@new/mcp'] },
        old:     { command: 'npx', args: ['-y', '@rind/proxy', 'wrap', '--server-id', 'old', '--', 'npx', '@old/mcp'] },
        remote:  { type: 'http', url: 'https://example.com' },
      },
    };
    const summary = describeWrap(config);
    expect(summary.wrapped).toEqual(['new']);
    expect(summary.skipped).toEqual(['old']);
    expect(summary.httpOnly).toEqual(['remote']);
  });

  it('does not mutate the config', () => {
    const config: McpJsonConfig = {
      mcpServers: { x: { command: 'npx' } },
    };
    describeWrap(config);
    expect(config.mcpServers['x']).toEqual({ command: 'npx' });
  });
});
