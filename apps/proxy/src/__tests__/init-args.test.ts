// Tests for cli/init.ts — parseInitArgs() is a pure function.
// No file system access, no process spawning.

import { describe, it, expect } from 'vitest';
import { parseInitArgs } from '../cli/init.js';

// parseInitArgs expects argv = [node, rind-proxy, init, ...options]
function argv(...rest: string[]): string[] {
  return ['node', 'rind-proxy', 'init', ...rest];
}

describe('parseInitArgs — valid inputs', () => {
  it('enables claudeCode by default when no target flag is given', () => {
    const result = parseInitArgs(argv());
    expect(result).not.toBeNull();
    expect(result?.claudeCode).toBe(true);
  });

  it('enables claudeCode explicitly with --claude-code', () => {
    const result = parseInitArgs(argv('--claude-code'));
    expect(result?.claudeCode).toBe(true);
  });

  it('defaults rindUrl to http://localhost:7777', () => {
    const result = parseInitArgs(argv());
    expect(result?.rindUrl).toBe('http://localhost:7777');
  });

  it('accepts --rind-url', () => {
    const result = parseInitArgs(argv('--rind-url', 'https://rind.example.com'));
    expect(result?.rindUrl).toBe('https://rind.example.com');
  });

  it('accepts --mcp-json path', () => {
    const result = parseInitArgs(argv('--mcp-json', './custom-mcp.json'));
    expect(result?.mcpJsonPath).toBe('./custom-mcp.json');
  });

  it('defaults mcpJsonPath to undefined (auto-detect)', () => {
    const result = parseInitArgs(argv());
    expect(result?.mcpJsonPath).toBeUndefined();
  });

  it('accepts --settings path', () => {
    const result = parseInitArgs(argv('--settings', '.claude/settings.json'));
    expect(result?.settingsPath).toBe('.claude/settings.json');
  });

  it('defaults settingsPath to undefined (auto-detect)', () => {
    const result = parseInitArgs(argv());
    expect(result?.settingsPath).toBeUndefined();
  });

  it('accepts --write-policy with an explicit path', () => {
    const result = parseInitArgs(argv('--write-policy', './custom.policy.yaml'));
    expect(result?.writePolicy).toBe('./custom.policy.yaml');
  });

  it('accepts --write-policy without a path and defaults to ./rind.policy.yaml', () => {
    const result = parseInitArgs(argv('--write-policy'));
    expect(result?.writePolicy).toBe('./rind.policy.yaml');
  });

  it('defaults writePolicy to undefined (policy generation is opt-in)', () => {
    const result = parseInitArgs(argv());
    expect(result?.writePolicy).toBeUndefined();
  });

  it('defaults settingsScope to global', () => {
    const result = parseInitArgs(argv());
    expect(result?.settingsScope).toBe('global');
  });

  it('accepts --local flag', () => {
    const result = parseInitArgs(argv('--local'));
    expect(result?.settingsScope).toBe('local');
  });

  it('accepts --dry-run flag', () => {
    const result = parseInitArgs(argv('--dry-run'));
    expect(result?.dryRun).toBe(true);
  });

  it('defaults dryRun to false', () => {
    const result = parseInitArgs(argv());
    expect(result?.dryRun).toBe(false);
  });

  it('accepts all flags together', () => {
    const result = parseInitArgs(argv(
      '--claude-code',
      '--rind-url', 'http://rind.internal',
      '--mcp-json', './.mcp.json',
      '--settings', './.claude/settings.json',
      '--write-policy', './rind.yaml',
      '--llm-proxy',
      '--dry-run',
    ));
    expect(result).not.toBeNull();
    expect(result?.claudeCode).toBe(true);
    expect(result?.rindUrl).toBe('http://rind.internal');
    expect(result?.mcpJsonPath).toBe('./.mcp.json');
    expect(result?.settingsPath).toBe('./.claude/settings.json');
    expect(result?.writePolicy).toBe('./rind.yaml');
    expect(result?.llmProxy).toBe(true);
    expect(result?.dryRun).toBe(true);
  });
});

describe('parseInitArgs — invalid inputs', () => {
  it('returns null for --rind-url without a value', () => {
    const result = parseInitArgs(argv('--rind-url'));
    expect(result).toBeNull();
  });

  it('returns null for --mcp-json without a value', () => {
    const result = parseInitArgs(argv('--mcp-json'));
    expect(result).toBeNull();
  });

  it('returns null for --settings without a value', () => {
    const result = parseInitArgs(argv('--settings'));
    expect(result).toBeNull();
  });

  it('returns null for --policy without a value', () => {
    const result = parseInitArgs(argv('--policy'));
    expect(result).toBeNull();
  });

  it('returns null for an unknown option', () => {
    const result = parseInitArgs(argv('--unknown-flag'));
    expect(result).toBeNull();
  });
});
