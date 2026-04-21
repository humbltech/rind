// Tests for cli/wrap.ts — parseWrapArgs() is a pure function.
// No process spawning, no file system, no streams.

import { describe, it, expect } from 'vitest';
import { parseWrapArgs } from '../cli/wrap.js';

// parseWrapArgs expects argv = [node, rind-proxy, wrap, ...options, --, command, ...args]
function argv(...rest: string[]): string[] {
  return ['node', 'rind-proxy', 'wrap', ...rest];
}

describe('parseWrapArgs — valid inputs', () => {
  it('parses a simple npx command', () => {
    const result = parseWrapArgs(argv('--', 'npx', '@github/mcp-server'));
    expect(result).not.toBeNull();
    expect(result?.command).toBe('npx');
    expect(result?.commandArgs).toEqual(['@github/mcp-server']);
  });

  it('passes all args after the command through unchanged', () => {
    const result = parseWrapArgs(argv('--', 'npx', '@stripe/mcp', '--api-key', 'sk_test'));
    expect(result?.commandArgs).toEqual(['@stripe/mcp', '--api-key', 'sk_test']);
  });

  it('accepts --policy option before --', () => {
    const result = parseWrapArgs(argv('--policy', './custom.yaml', '--', 'npx', '@some/mcp'));
    expect(result?.policyPath).toBe('./custom.yaml');
  });

  it('accepts --server-id option before --', () => {
    const result = parseWrapArgs(argv('--server-id', 'my-server', '--', 'npx', '@some/mcp'));
    expect(result?.serverId).toBe('my-server');
  });

  it('accepts --agent-id option before --', () => {
    const result = parseWrapArgs(argv('--agent-id', 'ci-bot', '--', 'npx', '@some/mcp'));
    expect(result?.agentId).toBe('ci-bot');
  });

  it('accepts all options together', () => {
    const result = parseWrapArgs(
      argv('--policy', 'p.yaml', '--server-id', 'srv', '--agent-id', 'bot', '--', 'python', '-m', 'mcp_server'),
    );
    expect(result?.policyPath).toBe('p.yaml');
    expect(result?.serverId).toBe('srv');
    expect(result?.agentId).toBe('bot');
    expect(result?.command).toBe('python');
    expect(result?.commandArgs).toEqual(['-m', 'mcp_server']);
  });

  it('defaults agentId to "wrap" when not specified', () => {
    const result = parseWrapArgs(argv('--', 'npx', '@some/mcp'));
    expect(result?.agentId).toBe('wrap');
  });

  it('policyPath is undefined when not specified', () => {
    const result = parseWrapArgs(argv('--', 'npx', '@some/mcp'));
    expect(result?.policyPath).toBeUndefined();
  });
});

describe('parseWrapArgs — server ID derivation', () => {
  it('derives server ID from scoped npx package', () => {
    const result = parseWrapArgs(argv('--', 'npx', '@github/mcp-server'));
    // @github/mcp-server → mcp-server
    expect(result?.serverId).toBe('mcp-server');
  });

  it('derives server ID from unscoped npx package', () => {
    const result = parseWrapArgs(argv('--', 'npx', 'mcp-server-sqlite'));
    expect(result?.serverId).toBe('mcp-server-sqlite');
  });

  it('derives server ID from python -m command', () => {
    const result = parseWrapArgs(argv('--', 'python', '-m', 'mcp_server_stripe'));
    // underscores → dashes
    expect(result?.serverId).toBe('mcp-server-stripe');
  });

  it('falls back to the command name for unrecognized patterns', () => {
    const result = parseWrapArgs(argv('--', 'my-binary'));
    expect(result?.serverId).toBe('my-binary');
  });
});

describe('parseWrapArgs — invalid inputs', () => {
  it('returns null when -- separator is missing', () => {
    const result = parseWrapArgs(argv('npx', '@some/mcp'));
    expect(result).toBeNull();
  });

  it('returns null when no command follows --', () => {
    const result = parseWrapArgs(argv('--'));
    expect(result).toBeNull();
  });

  it('returns null for an empty args list', () => {
    const result = parseWrapArgs(argv());
    expect(result).toBeNull();
  });
});
