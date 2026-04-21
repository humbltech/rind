// .mcp.json parser and Rind-wrap transformer (D-040 Phase A5).
//
// Pure functions only — no file I/O, no process.argv, no side effects.
// The init CLI reads files and passes parsed content here; results go back
// to the CLI for writing. This keeps every transform independently testable.
//
// Supported entry types (as of MCP spec 2024-11-05):
//   stdio  — command + args + env (most common: npx, uvx, python -m)
//   http   — url + optional headers (remote MCP servers)
//
// Wrap strategy:
//   stdio entries → prepend rind-proxy wrap -- so Rind interposes on the channel
//   http entries  → left unchanged with a note (the MCP gateway handles these)

// ─── Types ────────────────────────────────────────────────────────────────────

export interface StdioMcpEntry {
  type?:    'stdio';
  command:  string;
  args?:    string[];
  env?:     Record<string, string>;
}

export interface HttpMcpEntry {
  type:     'http' | 'sse';
  url:      string;
  headers?: Record<string, string>;
}

export type McpServerEntry = StdioMcpEntry | HttpMcpEntry;

export interface McpJsonConfig {
  mcpServers: Record<string, McpServerEntry>;
}

// ─── Parsing ──────────────────────────────────────────────────────────────────

/**
 * Parses an unknown value as a .mcp.json config.
 * Returns null when the shape is clearly wrong — the caller decides how to handle it.
 */
export function parseMcpJson(raw: unknown): McpJsonConfig | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;

  const obj = raw as Record<string, unknown>;
  const servers = obj['mcpServers'];
  if (typeof servers !== 'object' || servers === null || Array.isArray(servers)) return null;

  // Validate that every entry is at least an object (not a primitive or null).
  // Individual entry shape is validated later by isStdioEntry / isHttpEntry.
  const entries = servers as Record<string, unknown>;
  for (const [, entry] of Object.entries(entries)) {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
      return null; // malformed entry — caller decides how to handle
    }
    // Must have either a 'command' field (stdio) or a 'url' field (http)
    const e = entry as Record<string, unknown>;
    if (typeof e['command'] !== 'string' && typeof e['url'] !== 'string') {
      return null; // entry `id` has neither command nor url — unrecognised shape
    }
  }

  return { mcpServers: servers as Record<string, McpServerEntry> };
}

// ─── Entry type helpers ───────────────────────────────────────────────────────

export function isStdioEntry(entry: McpServerEntry): entry is StdioMcpEntry {
  // An entry is stdio when it has a command field (type is optional for stdio)
  return 'command' in entry;
}

export function isHttpEntry(entry: McpServerEntry): entry is HttpMcpEntry {
  return 'url' in entry;
}

// ─── Wrap transform ───────────────────────────────────────────────────────────

/**
 * Returns a new .mcp.json where every stdio server is wrapped with rind-proxy.
 * HTTP entries are left unchanged (the MCP gateway handles them separately).
 * Already-wrapped entries (command === 'npx' with @rind/proxy in args) are skipped.
 */
export function wrapWithRind(config: McpJsonConfig): McpJsonConfig {
  const wrapped: Record<string, McpServerEntry> = {};

  for (const [serverId, entry] of Object.entries(config.mcpServers)) {
    if (isHttpEntry(entry)) {
      wrapped[serverId] = entry;
      continue;
    }

    if (alreadyWrapped(entry)) {
      wrapped[serverId] = entry;
      continue;
    }

    wrapped[serverId] = wrapStdioEntry(serverId, entry);
  }

  return { mcpServers: wrapped };
}

/** True when the entry already runs rind-proxy (idempotency guard). */
export function alreadyWrapped(entry: StdioMcpEntry): boolean {
  const args = entry.args ?? [];
  return args.some((a) => a === '@rind/proxy' || a === 'rind-proxy');
}

/** Wraps a single stdio entry with `rind-proxy wrap --server-id <id> -- <original>`. */
function wrapStdioEntry(serverId: string, entry: StdioMcpEntry): StdioMcpEntry {
  const originalArgs = entry.args ?? [];
  return {
    ...entry,
    command: 'npx',
    args: [
      '-y', '@rind/proxy',
      'wrap', '--server-id', serverId,
      '--',
      entry.command,
      ...originalArgs,
    ],
  };
}

// ─── Diff helpers ─────────────────────────────────────────────────────────────

export type WrapSummary = {
  wrapped:   string[];  // server IDs that were newly wrapped
  skipped:   string[];  // already wrapped — left unchanged
  httpOnly:  string[];  // HTTP servers — not wrapped (use MCP gateway)
};

/**
 * Returns a summary of what wrapWithRind() did (or would do), without mutating config.
 * Used by the init CLI to print an informative diff to the user.
 */
export function describeWrap(config: McpJsonConfig): WrapSummary {
  const wrapped:  string[] = [];
  const skipped:  string[] = [];
  const httpOnly: string[] = [];

  for (const [serverId, entry] of Object.entries(config.mcpServers)) {
    if (isHttpEntry(entry)) {
      httpOnly.push(serverId);
    } else if (alreadyWrapped(entry)) {
      skipped.push(serverId);
    } else {
      wrapped.push(serverId);
    }
  }

  return { wrapped, skipped, httpOnly };
}
