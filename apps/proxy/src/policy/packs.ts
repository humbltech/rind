// Policy packs (D-036): curated rule bundles that enable protection in one click.
//
// Packs ship as static data co-located with the proxy. When a pack is enabled,
// its rules are expanded into the active PolicyStore with priority 100 — below
// custom rules (priority 50) so user-authored rules always take precedence.
//
// Pack rules carry `_meta.source: 'pack:<packId>'` so they can be cleanly removed
// when the pack is disabled.

import type { PolicyPack, PolicyRule, PolicyRuleWithMeta } from '../types.js';

// ─── Pack registry ────────────────────────────────────────────────────────────

const PACK_PRIORITY = 100; // pack rules evaluate after custom rules (priority 50)

const registry: PolicyPack[] = [
  {
    id: 'sql-protection',
    version: '1.0.0',
    name: 'SQL Protection',
    description: 'Blocks destructive SQL operations: DROP, TRUNCATE, DELETE, ALTER.',
    category: 'data-protection',
    tags: ['database', 'sql', 'write-protection', 'data-loss'],
    severity: 'strict',
    requiredTools: ['sql_', 'db_', 'query_', 'execute_', 'database_'],
    customizable: [
      {
        ruleIndex: 0,
        field: 'match.parameters.query.regex',
        label: 'Blocked SQL keywords (regex)',
        type: 'string',
        default: '\\b(drop|truncate|delete|alter)\\b',
      },
    ],
    rules: [
      {
        name: 'sql-protection:block-destructive',
        agent: '*',
        match: {
          toolPattern: 'sql_*',
          // regex: matches any of the destructive keywords in the query param (case-insensitive, word-boundary)
          parameters: {
            query: { regex: '\\b(drop|truncate|delete|alter)\\b' },
          },
        },
        action: 'DENY',
        failMode: 'closed',
        priority: PACK_PRIORITY,
      },
      {
        name: 'sql-protection:block-destructive-db',
        agent: '*',
        match: {
          toolPattern: 'db_*',
          parameters: {
            query: { regex: '\\b(drop|truncate|delete|alter)\\b' },
          },
        },
        action: 'DENY',
        failMode: 'closed',
        priority: PACK_PRIORITY,
      },
    ],
  },

  {
    id: 'shell-protection',
    version: '1.0.0',
    name: 'Shell Protection',
    description: 'Requires approval before any shell command execution.',
    category: 'infrastructure',
    tags: ['shell', 'exec', 'code-execution', 'infrastructure'],
    severity: 'strict',
    requiredTools: ['shell_', 'exec_', 'run_', 'bash_', 'command_'],
    customizable: [
      {
        ruleIndex: 0,
        field: 'action',
        label: 'Action on shell call',
        type: 'enum',
        options: ['DENY', 'REQUIRE_APPROVAL'],
        default: 'REQUIRE_APPROVAL',
      },
    ],
    rules: [
      {
        name: 'shell-protection:require-approval',
        agent: '*',
        match: { toolPattern: 'shell_*' },
        action: 'REQUIRE_APPROVAL',
        failMode: 'closed',
        priority: PACK_PRIORITY,
      },
      {
        name: 'shell-protection:require-approval-exec',
        agent: '*',
        match: { toolPattern: 'exec_*' },
        action: 'REQUIRE_APPROVAL',
        failMode: 'closed',
        priority: PACK_PRIORITY,
      },
      {
        name: 'shell-protection:require-approval-run',
        agent: '*',
        match: { tool: ['run_command', 'bash', 'sh', 'execute'] },
        action: 'REQUIRE_APPROVAL',
        failMode: 'closed',
        priority: PACK_PRIORITY,
      },
    ],
  },

  {
    id: 'filesystem-protection',
    version: '1.0.0',
    name: 'Filesystem Protection',
    description: 'Blocks write operations to system directories (/etc, /usr, /bin, /sys, /proc).',
    category: 'infrastructure',
    tags: ['filesystem', 'file', 'write-protection', 'system'],
    severity: 'moderate',
    requiredTools: ['file_', 'fs_', 'read_file', 'write_file', 'delete_file'],
    customizable: [
      {
        ruleIndex: 0,
        field: 'match.parameters.path.regex',
        label: 'Protected path regex',
        type: 'string',
        default: '^(/etc/|/usr/|/bin/|/sbin/|/sys/|/proc/|/boot/)',
      },
    ],
    rules: [
      {
        name: 'filesystem-protection:block-system-writes',
        agent: '*',
        match: {
          toolPattern: 'write_*',
          // regex: matches any of the protected path prefixes
          parameters: {
            path: { regex: '^(/etc/|/usr/|/bin/|/sbin/|/sys/|/proc/|/boot/)' },
          },
        },
        action: 'DENY',
        failMode: 'closed',
        priority: PACK_PRIORITY,
      },
      {
        name: 'filesystem-protection:block-delete-system',
        agent: '*',
        match: {
          toolPattern: 'delete_*',
          parameters: {
            path: { regex: '^(/etc/|/usr/|/bin/|/sbin/|/sys/|/proc/|/boot/)' },
          },
        },
        action: 'DENY',
        failMode: 'closed',
        priority: PACK_PRIORITY,
      },
    ],
  },

  {
    id: 'exfil-protection',
    version: '1.0.0',
    name: 'Data Exfiltration Protection',
    description: 'Blocks tool calls that attempt to send data to external URLs or encode large payloads.',
    category: 'data-protection',
    tags: ['exfiltration', 'data-leak', 'network', 'security'],
    severity: 'moderate',
    requiredTools: ['http_', 'fetch_', 'request_', 'send_', 'post_'],
    customizable: [],
    rules: [
      {
        name: 'exfil-protection:block-suspicious-fetch',
        agent: '*',
        match: {
          toolPattern: 'http_*',
          parameters: {
            // Block requests containing base64-encoded large payloads (classic exfil pattern)
            body: { regex: '[A-Za-z0-9+/]{200,}={0,2}' },
          },
        },
        action: 'DENY',
        failMode: 'closed',
        priority: PACK_PRIORITY,
      },
      {
        name: 'exfil-protection:block-fetch-with-base64',
        agent: '*',
        match: {
          tool: ['fetch', 'http_post', 'http_put', 'send_request'],
          parameters: {
            body: { regex: '[A-Za-z0-9+/]{200,}={0,2}' },
          },
        },
        action: 'DENY',
        failMode: 'closed',
        priority: PACK_PRIORITY,
      },
    ],
  },
];

// ─── Registry API ─────────────────────────────────────────────────────────────

/** Returns all available policy packs. */
export function listPacks(): PolicyPack[] {
  return registry;
}

/** Returns a single pack by ID, or undefined if not found. */
export function getPack(id: string): PolicyPack | undefined {
  return registry.find((p) => p.id === id);
}

/**
 * Expands a pack's rules into PolicyRuleWithMeta entries ready for the store.
 * Each rule gets `_meta.source: 'pack:<id>'` and the pack's priority (default 100).
 */
export function expandPackRules(pack: PolicyPack): PolicyRuleWithMeta[] {
  return pack.rules.map((rule) => ({
    ...rule,
    priority: rule.priority ?? PACK_PRIORITY,
    _meta: {
      source: `pack:${pack.id}` as const,
      createdAt: new Date().toISOString(),
    },
  }));
}

/**
 * Returns rules from the current config that originated from the given pack.
 * Used to detect whether a pack is already enabled and to remove it cleanly.
 */
export function rulesFromPack(
  policies: PolicyRule[],
  packId: string,
): PolicyRuleWithMeta[] {
  const prefix = `pack:${packId}`;
  return (policies as PolicyRuleWithMeta[]).filter(
    (r) => r._meta?.source === prefix,
  );
}

/**
 * Returns recommended packs based on the tool names discovered on connected MCP servers.
 * Match is prefix-based (requiredTools entries are prefixes of tool names).
 */
export function recommendPacks(discoveredToolNames: string[]): PolicyPack[] {
  return registry.filter((pack) => {
    if (!pack.requiredTools?.length) return false;
    return pack.requiredTools.some((prefix) =>
      discoveredToolNames.some((tool) => tool.startsWith(prefix) || tool.includes(prefix)),
    );
  });
}
