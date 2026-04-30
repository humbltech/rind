// `rind-proxy uninit` — removes all Rind configuration from Claude Code settings.
//
// Usage:
//   rind-proxy uninit [options]
//
// Options:
//   --global              Remove from ~/.claude/settings.json (default)
//   --local               Remove from .claude/settings.json in current directory
//   --settings <path>     Explicit settings.json path
//   --dry-run             Print what would change without writing any files
//
// What it removes:
//   - PreToolUse / PostToolUse / SubagentStart / SubagentStop Rind hooks
//   - ANTHROPIC_BASE_URL and OPENAI_BASE_URL env vars (if set to a Rind URL)
//   - .mcp.json wrapping (reverts rind-proxy wrap entries to their original commands)
//
// Does NOT touch:
//   - rind.policy.yaml

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { homedir } from 'node:os';
import { parseClaudeSettings, isRindHookCommand, isRindEventHookCommand } from '../config/settings-json.js';
import { parseMcpJson, unwrapWithRind, describeUnwrap } from '../config/mcp-json.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface UninitArgs {
  settingsPath: string | undefined;
  settingsScope: 'global' | 'local';
  mcpJsonPath: string | undefined;
  dryRun: boolean;
}

// ─── Arg parsing ──────────────────────────────────────────────────────────────

export function parseUninitArgs(argv: string[]): UninitArgs | null {
  const args = argv.slice(3); // drop node, rind-proxy, uninit

  let settingsPath: string | undefined;
  let settingsScope: 'global' | 'local' = 'global';
  let mcpJsonPath: string | undefined;
  let dryRun = false;

  const USAGE = `Usage: rind-proxy uninit [options]

Options:
  --global              Remove from ~/.claude/settings.json (default)
  --local               Remove from .claude/settings.json in current directory
  --settings <path>     Explicit settings.json path
  --mcp-json <path>     Path to .mcp.json to unwrap (default: auto-detect)
  --dry-run             Print what would change without writing any files
  --help                Show this help message
`;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case '--help':
        process.stdout.write(USAGE);
        process.exit(0);
        break;
      case '--global':  settingsScope = 'global'; break;
      case '--local':   settingsScope = 'local'; break;
      case '--dry-run': dryRun = true; break;
      case '--settings':
        if (!args[i + 1]) { process.stderr.write('--settings requires a path\n'); return null; }
        settingsPath = args[++i];
        break;
      case '--mcp-json':
        if (!args[i + 1]) { process.stderr.write('--mcp-json requires a path\n'); return null; }
        mcpJsonPath = args[++i];
        break;
      default:
        process.stderr.write(`Unknown option: ${arg}\n`);
        process.stderr.write(USAGE);
        return null;
    }
  }

  return { settingsPath, settingsScope, mcpJsonPath, dryRun };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function resolveSettingsPath(args: UninitArgs): string {
  if (args.settingsPath) return args.settingsPath;
  if (args.settingsScope === 'global') return join(homedir(), '.claude', 'settings.json');
  return '.claude/settings.json';
}

// ─── Uninit runner ────────────────────────────────────────────────────────────

export async function runUninit(argv: string[]): Promise<void> {
  const args = parseUninitArgs(argv);
  if (!args) { process.exit(1); return; }

  const settingsPath = resolveSettingsPath(args);
  const dryRun = args.dryRun;

  const scopeLabel = args.settingsPath ?? (
    args.settingsScope === 'global' ? '~/.claude/settings.json (global)' : '.claude/settings.json (local)'
  );

  process.stdout.write(dryRun
    ? `\nRind uninit — dry run  [${scopeLabel}]\n\n`
    : `\nRind uninit  [${scopeLabel}]\n\n`,
  );

  if (!existsSync(settingsPath)) {
    process.stdout.write(`  → ${settingsPath} does not exist — nothing to remove\n\n`);
    return;
  }

  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(settingsPath, 'utf-8'));
  } catch {
    process.stderr.write(`Error: ${settingsPath} is not valid JSON\n`);
    process.exit(1);
    return;
  }

  const settings = parseClaudeSettings(raw) as Record<string, unknown>;
  let changed = false;

  // ── Remove Rind hooks ──────────────────────────────────────────────────────
  const hooks = settings['hooks'] as Record<string, unknown[]> | undefined;
  if (hooks) {
    const hookTypes = ['PreToolUse', 'PostToolUse', 'SubagentStart', 'SubagentStop'] as const;
    for (const type of hookTypes) {
      const list = hooks[type];
      if (!Array.isArray(list)) continue;
      let hookTypeChanged = false;
      const filtered = list
        .map((entry) => {
          if (typeof entry !== 'object' || entry === null) return entry;
          // Each entry is a HookMatcher: { matcher, hooks: [{ type, command }] }
          // Strip only the Rind inner commands; preserve any non-Rind commands
          // that share the same matcher entry so user hooks are never lost.
          const e = entry as Record<string, unknown>;
          const innerHooks = Array.isArray(e['hooks']) ? (e['hooks'] as unknown[]) : [];
          const survivingHooks = innerHooks.filter((h) => {
            if (typeof h !== 'object' || h === null) return true;
            const cmd = (h as Record<string, unknown>)['command'];
            return !(typeof cmd === 'string' && (isRindHookCommand(cmd) || isRindEventHookCommand(cmd)));
          });
          if (survivingHooks.length === innerHooks.length) return entry; // nothing removed
          hookTypeChanged = true;
          return survivingHooks.length === 0 ? null : { ...e, hooks: survivingHooks };
        })
        .filter((entry) => entry !== null);
      if (hookTypeChanged || filtered.length !== list.length) {
        process.stdout.write(`  - remove  ${type} Rind hook\n`);
        if (filtered.length === 0) {
          delete hooks[type];
        } else {
          hooks[type] = filtered;
        }
        changed = true;
      }
    }
    // Remove the hooks key entirely if now empty
    if (Object.keys(hooks).length === 0) {
      delete settings['hooks'];
    }
  }

  // ── Remove LLM proxy env vars if they point to Rind ──────────────────────
  const env = settings['env'] as Record<string, unknown> | undefined;
  if (env) {
    for (const key of ['ANTHROPIC_BASE_URL', 'OPENAI_BASE_URL'] as const) {
      const val = env[key];
      if (typeof val === 'string' && val.includes('/llm/')) {
        process.stdout.write(`  - remove  ${key}=${val}\n`);
        delete env[key];
        changed = true;
      }
    }
    if (Object.keys(env).length === 0) delete settings['env'];
  }

  if (!changed) {
    process.stdout.write('  = nothing to remove — no Rind configuration found\n\n');
  } else {
    if (!dryRun) {
      writeFileSync(resolve(settingsPath), JSON.stringify(settings, null, 2) + '\n', 'utf-8');
      process.stdout.write('  ✓ written\n');
    }
    process.stdout.write('\n');
  }

  // ── Unwrap .mcp.json ───────────────────────────────────────────────────────
  const mcpPath = args.mcpJsonPath ?? detectMcpJsonPath();
  if (mcpPath && existsSync(mcpPath)) {
    process.stdout.write(`\nMCP servers  (${mcpPath})\n`);
    let mcpRaw: unknown;
    try {
      mcpRaw = JSON.parse(readFileSync(mcpPath, 'utf-8'));
    } catch {
      process.stderr.write(`  ! warn  ${mcpPath} is not valid JSON — skipping\n`);
      mcpRaw = null;
    }
    const mcpConfig = mcpRaw ? parseMcpJson(mcpRaw) : null;
    if (mcpConfig) {
      const summary = describeUnwrap(mcpConfig);
      if (summary.unwrapped.length === 0) {
        process.stdout.write('  = nothing to unwrap — no Rind-wrapped entries found\n');
      } else {
        for (const id of summary.unwrapped) process.stdout.write(`  - unwrap  ${id}\n`);
        if (!dryRun) {
          const unwrapped = unwrapWithRind(mcpConfig);
          writeFileSync(resolve(mcpPath), JSON.stringify(unwrapped, null, 2) + '\n', 'utf-8');
          process.stdout.write('  ✓ written\n');
        }
      }
    } else {
      process.stdout.write('  = skipping — unrecognised .mcp.json format\n');
    }
    process.stdout.write('\n');
  }

  if (dryRun) {
    process.stdout.write('Dry run complete — no files were written.\n');
  } else if (changed) {
    process.stdout.write('Done. Rind configuration removed. Claude Code will use default settings.\n');
  }
}

/** Detect .mcp.json path — checks common locations used by init. */
function detectMcpJsonPath(): string | undefined {
  if (existsSync('.mcp.json')) return '.mcp.json';
  if (existsSync('.claude/mcp.json')) return '.claude/mcp.json';
  return undefined;
}
