// Tests for cli/demo-init.ts — parseDemoInitArgs() is a pure function.
// No file system access, no process spawning, no network calls.

import { describe, it, expect } from 'vitest';
import { parseDemoInitArgs } from '../cli/demo-init.js';

// parseDemoInitArgs expects argv = [node, rind-proxy, demo-init, ...options]
function argv(...rest: string[]): string[] {
  return ['node', 'rind-proxy', 'demo-init', ...rest];
}

describe('parseDemoInitArgs — valid inputs', () => {
  it('defaults rindUrl to http://localhost:7777', () => {
    const result = parseDemoInitArgs(argv());
    expect(result?.rindUrl).toBe('http://localhost:7777');
  });

  it('accepts --rind-url', () => {
    const result = parseDemoInitArgs(argv('--rind-url', 'https://rind.example.com'));
    expect(result?.rindUrl).toBe('https://rind.example.com');
  });

  it('defaults settingsScope to global', () => {
    const result = parseDemoInitArgs(argv());
    expect(result?.settingsScope).toBe('global');
  });

  it('accepts --local', () => {
    const result = parseDemoInitArgs(argv('--local'));
    expect(result?.settingsScope).toBe('local');
  });

  it('accepts --global explicitly', () => {
    const result = parseDemoInitArgs(argv('--global'));
    expect(result?.settingsScope).toBe('global');
  });

  it('defaults dryRun to false', () => {
    const result = parseDemoInitArgs(argv());
    expect(result?.dryRun).toBe(false);
  });

  it('accepts --dry-run', () => {
    const result = parseDemoInitArgs(argv('--dry-run'));
    expect(result?.dryRun).toBe(true);
  });

  it('defaults enablePacks to false', () => {
    const result = parseDemoInitArgs(argv());
    expect(result?.enablePacks).toBe(false);
  });

  it('accepts --enable-packs', () => {
    const result = parseDemoInitArgs(argv('--enable-packs'));
    expect(result?.enablePacks).toBe(true);
  });

  it('accepts all flags together', () => {
    const result = parseDemoInitArgs(argv(
      '--local',
      '--rind-url', 'http://rind.internal',
      '--enable-packs',
      '--dry-run',
    ));
    expect(result).not.toBeNull();
    expect(result?.settingsScope).toBe('local');
    expect(result?.rindUrl).toBe('http://rind.internal');
    expect(result?.enablePacks).toBe(true);
    expect(result?.dryRun).toBe(true);
  });

  it('--enable-packs and --dry-run are independent', () => {
    const withDryRun  = parseDemoInitArgs(argv('--enable-packs', '--dry-run'));
    const withoutDry  = parseDemoInitArgs(argv('--enable-packs'));
    expect(withDryRun?.enablePacks).toBe(true);
    expect(withDryRun?.dryRun).toBe(true);
    expect(withoutDry?.enablePacks).toBe(true);
    expect(withoutDry?.dryRun).toBe(false);
  });
});

describe('parseDemoInitArgs — invalid inputs', () => {
  it('returns null for --rind-url without a value', () => {
    const result = parseDemoInitArgs(argv('--rind-url'));
    expect(result).toBeNull();
  });

  it('returns null for an unknown option', () => {
    const result = parseDemoInitArgs(argv('--unknown-flag'));
    expect(result).toBeNull();
  });
});
