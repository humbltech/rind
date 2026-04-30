// Tests for cli/uninit.ts — parseUninitArgs() is a pure function.
// No file system access, no process spawning.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { parseUninitArgs } from '../cli/uninit.js';

// parseUninitArgs expects argv = [node, rind-proxy, uninit, ...options]
function argv(...rest: string[]): string[] {
  return ['node', 'rind-proxy', 'uninit', ...rest];
}

describe('parseUninitArgs — valid inputs', () => {
  it('defaults to global scope', () => {
    const result = parseUninitArgs(argv());
    expect(result?.settingsScope).toBe('global');
  });

  it('accepts --global explicitly', () => {
    const result = parseUninitArgs(argv('--global'));
    expect(result?.settingsScope).toBe('global');
  });

  it('accepts --local', () => {
    const result = parseUninitArgs(argv('--local'));
    expect(result?.settingsScope).toBe('local');
  });

  it('defaults settingsPath to undefined', () => {
    const result = parseUninitArgs(argv());
    expect(result?.settingsPath).toBeUndefined();
  });

  it('accepts --settings path', () => {
    const result = parseUninitArgs(argv('--settings', '/custom/settings.json'));
    expect(result?.settingsPath).toBe('/custom/settings.json');
  });

  it('defaults mcpJsonPath to undefined (auto-detect)', () => {
    const result = parseUninitArgs(argv());
    expect(result?.mcpJsonPath).toBeUndefined();
  });

  it('accepts --mcp-json path', () => {
    const result = parseUninitArgs(argv('--mcp-json', './custom-mcp.json'));
    expect(result?.mcpJsonPath).toBe('./custom-mcp.json');
  });

  it('defaults dryRun to false', () => {
    const result = parseUninitArgs(argv());
    expect(result?.dryRun).toBe(false);
  });

  it('accepts --dry-run', () => {
    const result = parseUninitArgs(argv('--dry-run'));
    expect(result?.dryRun).toBe(true);
  });

  it('accepts combination of flags', () => {
    const result = parseUninitArgs(argv('--local', '--dry-run', '--mcp-json', '.mcp.json'));
    expect(result?.settingsScope).toBe('local');
    expect(result?.dryRun).toBe(true);
    expect(result?.mcpJsonPath).toBe('.mcp.json');
  });
});

describe('parseUninitArgs — invalid inputs', () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it('returns null for unknown flag', () => {
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const result = parseUninitArgs(argv('--unknown-flag'));
    expect(result).toBeNull();
  });

  it('returns null when --settings has no path', () => {
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const result = parseUninitArgs(argv('--settings'));
    expect(result).toBeNull();
  });

  it('returns null when --mcp-json has no path', () => {
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const result = parseUninitArgs(argv('--mcp-json'));
    expect(result).toBeNull();
  });
});
