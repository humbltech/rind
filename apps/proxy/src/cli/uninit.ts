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
//   - ANTHROPIC_BASE_URL env var (if set to a Rind URL)
//
// Does NOT touch:
//   - .mcp.json (MCP server wrapping is a separate decision)
//   - rind.policy.yaml

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { homedir } from 'node:os';
import { parseClaudeSettings } from '../config/settings-json.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface UninitArgs {
  settingsPath: string | undefined;
  settingsScope: 'global' | 'local';
  dryRun: boolean;
}

// ─── Arg parsing ──────────────────────────────────────────────────────────────

export function parseUninitArgs(argv: string[]): UninitArgs | null {
  const args = argv.slice(3); // drop node, rind-proxy, uninit

  let settingsPath: string | undefined;
  let settingsScope: 'global' | 'local' = 'global';
  let dryRun = false;

  const USAGE = `Usage: rind-proxy uninit [options]

Options:
  --global              Remove from ~/.claude/settings.json (default)
  --local               Remove from .claude/settings.json in current directory
  --settings <path>     Explicit settings.json path
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
      default:
        process.stderr.write(`Unknown option: ${arg}\n`);
        process.stderr.write(USAGE);
        return null;
    }
  }

  return { settingsPath, settingsScope, dryRun };
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
      const filtered = list.filter((entry) => {
        if (typeof entry !== 'object' || entry === null) return true;
        const e = entry as Record<string, unknown>;
        const cmd = typeof e['command'] === 'string' ? e['command'] : '';
        return !cmd.includes('/hook/evaluate') && !cmd.includes('/hook/event');
      });
      if (filtered.length !== list.length) {
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

  // ── Remove ANTHROPIC_BASE_URL if it points to Rind ────────────────────────
  const env = settings['env'] as Record<string, unknown> | undefined;
  if (env) {
    const baseUrl = env['ANTHROPIC_BASE_URL'];
    if (typeof baseUrl === 'string' && baseUrl.includes('/llm/')) {
      process.stdout.write(`  - remove  ANTHROPIC_BASE_URL=${baseUrl}\n`);
      delete env['ANTHROPIC_BASE_URL'];
      if (Object.keys(env).length === 0) delete settings['env'];
      changed = true;
    }
  }

  if (!changed) {
    process.stdout.write('  = nothing to remove — no Rind configuration found\n\n');
    return;
  }

  if (!dryRun) {
    writeFileSync(resolve(settingsPath), JSON.stringify(settings, null, 2) + '\n', 'utf-8');
    process.stdout.write('  ✓ written\n');
  }

  process.stdout.write('\n');
  if (dryRun) {
    process.stdout.write('Dry run complete — no files were written.\n');
  } else {
    process.stdout.write('Done. Rind configuration removed. Claude Code will use default settings.\n');
  }
}
