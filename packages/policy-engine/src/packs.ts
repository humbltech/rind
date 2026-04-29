// Policy packs (D-036): curated rule bundles that enable protection in one click.
//
// Packs ship as static data co-located with the proxy. When a pack is enabled,
// its rules are expanded into the active PolicyStore with priority 100 — below
// custom rules (priority 50) so user-authored rules always take precedence.
//
// Pack rules carry `_meta.source: 'pack:<packId>'` so they can be cleanly removed
// when the pack is disabled.

import type { PolicyPack, PolicyRule, PolicyRuleWithMeta } from '@rind/core';

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

  {
    // cli-protection (D-040): Intercepts dangerous CLI commands executed via the
    // Bash built-in tool in Claude Code. Rules match on the `command` parameter
    // of the Bash tool using regex so they fire through the hook evaluation endpoint.
    id: 'cli-protection',
    version: '1.0.0',
    name: 'CLI Protection',
    description: 'Blocks or requires approval for dangerous CLI commands: cloud infra deletion, data exfiltration, force-push, supply chain attacks.',
    category: 'infrastructure',
    tags: ['bash', 'cli', 'shell', 'cloud', 'exfil', 'git', 'npm'],
    severity: 'strict',
    // Bash is the Claude Code built-in; also matches gh/aws/kubectl as explicit tool names
    requiredTools: ['Bash', 'bash', 'shell', 'terminal'],
    customizable: [],
    rules: [
      // ── Cloud infrastructure deletion ───────────────────────────────────────
      {
        name: 'cli-protection:block-aws-destructive',
        agent: '*',
        match: {
          tool: ['Bash', 'bash', 'shell', 'terminal', 'run_command'],
          parameters: {
            command: {
              // aws ec2 terminate-instances, aws s3 rm, aws cloudformation delete-stack,
              // aws eks delete-cluster, aws rds delete-db-instance, aws lambda delete-function
              regex: '\\baws\\b.*(terminate-instances|delete-stack|delete-cluster|delete-db|delete-function|s3\\s+rm\\b)',
            },
          },
        },
        action: 'REQUIRE_APPROVAL',
        failMode: 'closed',
        priority: PACK_PRIORITY,
      },
      {
        name: 'cli-protection:block-gcloud-destructive',
        agent: '*',
        match: {
          tool: ['Bash', 'bash', 'shell', 'terminal', 'run_command'],
          parameters: {
            command: {
              regex: '\\bgcloud\\b.*(delete|destroy|remove)\\b',
            },
          },
        },
        action: 'REQUIRE_APPROVAL',
        failMode: 'closed',
        priority: PACK_PRIORITY,
      },
      {
        name: 'cli-protection:block-kubectl-delete',
        agent: '*',
        match: {
          tool: ['Bash', 'bash', 'shell', 'terminal', 'run_command'],
          parameters: {
            command: {
              // kubectl delete deployment/pod/namespace/cluster — allow kubectl get/describe/logs
              regex: '\\bkubectl\\s+delete\\b',
            },
          },
        },
        action: 'REQUIRE_APPROVAL',
        failMode: 'closed',
        priority: PACK_PRIORITY,
      },
      {
        name: 'cli-protection:block-docker-destructive',
        agent: '*',
        match: {
          tool: ['Bash', 'bash', 'shell', 'terminal', 'run_command'],
          parameters: {
            command: {
              // docker rm -f, docker rmi -f, docker system prune
              regex: '\\bdocker\\b.*(\\brm\\s+-f|\\brmi\\s+-f|system\\s+prune)',
            },
          },
        },
        action: 'REQUIRE_APPROVAL',
        failMode: 'closed',
        priority: PACK_PRIORITY,
      },

      // ── GitHub CLI destructive operations ────────────────────────────────────
      {
        name: 'cli-protection:block-gh-destructive',
        agent: '*',
        match: {
          tool: ['Bash', 'bash', 'shell', 'terminal', 'run_command'],
          parameters: {
            command: {
              // gh repo delete, gh release delete, gh secret set
              regex: '\\bgh\\b.*(repo\\s+delete|release\\s+delete|secret\\s+set)',
            },
          },
        },
        action: 'DENY',
        failMode: 'closed',
        priority: PACK_PRIORITY,
      },

      // ── Git destructive operations ────────────────────────────────────────────
      {
        name: 'cli-protection:block-git-force-push',
        agent: '*',
        match: {
          tool: ['Bash', 'bash', 'shell', 'terminal', 'run_command'],
          parameters: {
            command: {
              // git push --force, git push -f, git push --force-with-lease to main/master
              regex: '\\bgit\\s+push\\b.*(--force|-f\\b|--force-with-lease)',
            },
          },
        },
        action: 'REQUIRE_APPROVAL',
        failMode: 'closed',
        priority: PACK_PRIORITY,
      },

      // ── SaaS CLI destructive operations ─────────────────────────────────────
      {
        name: 'cli-protection:block-supabase-destructive',
        agent: '*',
        match: {
          tool: ['Bash', 'bash', 'shell', 'terminal', 'run_command'],
          parameters: {
            command: {
              // supabase db reset, supabase migration repair
              regex: '\\bsupabase\\b.*(db\\s+reset|migration\\s+repair)',
            },
          },
        },
        action: 'DENY',
        failMode: 'closed',
        priority: PACK_PRIORITY,
      },
      {
        name: 'cli-protection:block-stripe-destructive',
        agent: '*',
        match: {
          tool: ['Bash', 'bash', 'shell', 'terminal', 'run_command'],
          parameters: {
            command: {
              // stripe refunds create, stripe payment_intents cancel
              regex: '\\bstripe\\b.*(refunds?\\s+create|cancel|delete)',
            },
          },
        },
        action: 'REQUIRE_APPROVAL',
        failMode: 'closed',
        priority: PACK_PRIORITY,
      },

      // ── Supply chain attacks ─────────────────────────────────────────────────
      {
        name: 'cli-protection:block-npm-publish',
        agent: '*',
        match: {
          tool: ['Bash', 'bash', 'shell', 'terminal', 'run_command'],
          parameters: {
            command: {
              // npm publish, npx publish
              regex: '\\bnpm\\s+publish\\b',
            },
          },
        },
        action: 'DENY',
        failMode: 'closed',
        priority: PACK_PRIORITY,
      },

      // ── Data exfiltration via curl ────────────────────────────────────────────
      {
        name: 'cli-protection:block-curl-exfil',
        agent: '*',
        match: {
          tool: ['Bash', 'bash', 'shell', 'terminal', 'run_command'],
          parameters: {
            command: {
              // curl -d @/path/to/file, curl --data @file, curl -T file (file upload)
              // Also catches curl ... | sh (remote code execution)
              regex: '\\bcurl\\b.*(-d\\s+@|--data\\s+@|-T\\s+|\\|\\s*sh\\b|\\|\\s*bash\\b)',
            },
          },
        },
        action: 'DENY',
        failMode: 'closed',
        priority: PACK_PRIORITY,
      },

      // ── Local file system destruction ─────────────────────────────────────────
      {
        // Catches rm -rf, rm -fr, rm -Rf, rm -fR, rm --recursive --force (and reverse)
        // targeting root, home, current dir, or bare wildcard (*).
        name: 'cli-protection:block-rm-rf',
        agent: '*',
        match: {
          tool: ['Bash', 'bash', 'shell', 'terminal', 'run_command'],
          parameters: {
            command: {
              regex: '\\brm\\b.*(-[^\\s]*[rR][^\\s]*[fF]|-[^\\s]*[fF][^\\s]*[rR]|--recursive.*--force|--force.*--recursive).*(/|~|\\./|\\*)',
            },
          },
        },
        action: 'DENY',
        failMode: 'closed',
        priority: PACK_PRIORITY,
      },
      {
        // Catches rm -r (without -f) targeting root, home, or current dir.
        // -r alone is still catastrophically destructive — don't require -f to block.
        // Uses (?:\s|\*|$) so `rm -r /` (path at end of command) is not bypassed.
        name: 'cli-protection:block-rm-recursive',
        agent: '*',
        match: {
          tool: ['Bash', 'bash', 'shell', 'terminal', 'run_command'],
          parameters: {
            command: {
              regex: '\\brm\\b.*(-[a-zA-Z]*[rR]\\b|--recursive).*\\s(/(?:\\s|\\*|$)|~/|~(?:\\s|\\*|$)|\\.(?:/(?:\\s|$)|(?:\\s|$)))',
            },
          },
        },
        action: 'DENY',
        failMode: 'closed',
        priority: PACK_PRIORITY,
      },
    ],
  },

  // ── LLM safety packs ────────────────────────────────────────────────────────

  {
    id: 'llm-secret-scan-v1',
    version: '1.0.0',
    name: 'LLM Secret Scanner',
    description: 'Blocks LLM requests that contain API keys, tokens, or private keys in the prompt.',
    category: 'llm-safety',
    tags: ['llm', 'secrets', 'credentials', 'data-protection'],
    severity: 'strict',
    customizable: [],
    rules: [
      {
        name: 'llm-secret-scan-v1:block-secrets-in-prompt',
        agent: '*',
        match: {
          llmProvider: ['anthropic', 'openai', 'google'],
          content: {
            scope: 'request',
            targets: ['system', 'user'],
            detectors: ['secret'],
          },
        },
        secrets: {
          // All built-in patterns — covers the major providers and generic patterns
        },
        action: 'DENY',
        failMode: 'open', // never block if scanner errors
        priority: PACK_PRIORITY,
      },
    ],
  },

  {
    id: 'llm-pii-pseudonymize-v1',
    version: '1.0.0',
    name: 'LLM PII Pseudonymizer',
    description: 'Replaces PII in outbound prompts with tokens and rehydrates the LLM response. No PII values are stored.',
    category: 'llm-safety',
    tags: ['llm', 'pii', 'privacy', 'pseudonymization', 'data-protection'],
    severity: 'moderate',
    customizable: [
      {
        ruleIndex: 0,
        field: 'pii.entities',
        label: 'PII entity types to pseudonymize',
        type: 'string',
        // PERSON_NAME requires ml_ner stage (Phase 2) — omitted from default.
        default: 'EMAIL,PHONE,SIN,CREDIT_CARD',
      },
      {
        ruleIndex: 0,
        field: 'pii.locale',
        label: 'Locale for PII detection (e.g. en-CA, en-US)',
        type: 'string',
        default: 'en-CA',
      },
    ],
    rules: [
      {
        name: 'llm-pii-pseudonymize-v1:pseudonymize-outbound',
        agent: '*',
        match: {
          llmProvider: ['anthropic', 'openai', 'google'],
          content: {
            scope: 'both',
            targets: ['system', 'user'],
            detectors: ['pii'],
          },
        },
        pii: {
          // PERSON_NAME requires ml_ner stage (Phase 2) — not in regex-only Phase 1
          entities: ['EMAIL', 'PHONE', 'SIN', 'CREDIT_CARD'],
          locale: 'en-CA',
          confidenceThreshold: 0.75,
        },
        action: 'PSEUDONYMIZE',
        failMode: 'open',
        priority: PACK_PRIORITY,
      },
    ],
  },

  {
    id: 'llm-injection-guard-v1',
    version: '1.0.0',
    name: 'LLM Injection Guard',
    description: 'Blocks prompt injection attempts in outbound LLM requests — instruction overrides, role hijacking, shell injection.',
    category: 'llm-safety',
    tags: ['llm', 'prompt-injection', 'security'],
    severity: 'strict',
    customizable: [],
    rules: [
      {
        name: 'llm-injection-guard-v1:block-injection-in-prompt',
        agent: '*',
        match: {
          llmProvider: ['anthropic', 'openai', 'google'],
          content: {
            scope: 'request',
            targets: ['user'],           // user messages are the primary injection vector
            detectors: ['prompt_injection'],
          },
        },
        injection: {},
        action: 'DENY',
        failMode: 'open',
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
  // Narrow with a type predicate rather than casting the whole array — avoids
  // treating every PolicyRule as PolicyRuleWithMeta before the guard confirms it.
  const prefix = `pack:${packId}`;
  return policies.filter(
    (r): r is PolicyRuleWithMeta =>
      '_meta' in r && (r as PolicyRuleWithMeta)._meta?.source === prefix,
  );
}

/**
 * Returns recommended packs based on the tool names discovered on connected MCP servers.
 * Match is prefix-based (requiredTools entries are prefixes of tool names).
 */
export function recommendPacks(discoveredToolNames: string[]): PolicyPack[] {
  // LLM safety packs (llm-secret-scan-v1, llm-pii-pseudonymize-v1, llm-injection-guard-v1)
  // have no requiredTools — they are manually enabled by users and never auto-recommended.
  return registry.filter((pack) => {
    if (!pack.requiredTools?.length) return false;
    return pack.requiredTools.some((prefix) =>
      discoveredToolNames.some((tool) => tool.startsWith(prefix) || tool.includes(prefix)),
    );
  });
}
