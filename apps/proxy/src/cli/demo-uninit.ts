// `rind-proxy demo-uninit` — removes the live demo environment from Claude Code.
//
// Usage:
//   rind-proxy demo-uninit [options]
//
// Options:
//   --local               Remove from .claude/settings.json in current directory
//   --global              Remove from ~/.claude/settings.json (default)
//   --dry-run             Print what would change without writing any files
//
// What it removes:
//   - rind-threat-sim and rind-victim-service entries from .mcp.json
//   - Rind hooks from settings.json (PreToolUse / PostToolUse / SubagentStart / SubagentStop)
//   - ANTHROPIC_BASE_URL from settings.json (if it points to Rind)

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { homedir } from 'node:os';
import { parseClaudeSettings, isRindHookCommand, isRindEventHookCommand } from '../config/settings-json.js';

// ─── Sim server IDs to remove ─────────────────────────────────────────────────

const SIM_SERVER_IDS = ['rind-threat-sim', 'rind-victim-service'] as const;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DemoUninitArgs {
  settingsScope: 'global' | 'local';
  dryRun:        boolean;
}

// ─── Arg parsing ──────────────────────────────────────────────────────────────

const USAGE = `Usage: rind-proxy demo-uninit [options]

Options:
  --local               Remove from .claude/settings.json in current directory
  --global              Remove from ~/.claude/settings.json (default)
  --dry-run             Print what would change without writing any files
  --help                Show this help message
`;

export function parseDemoUninitArgs(argv: string[]): DemoUninitArgs | null {
  const args = argv.slice(3); // drop node, rind-proxy, demo-uninit

  let settingsScope: 'global' | 'local' = 'global';
  let dryRun = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case '--help':
        process.stdout.write(USAGE);
        process.exit(0);
        break;
      case '--local':   settingsScope = 'local'; break;
      case '--global':  settingsScope = 'global'; break;
      case '--dry-run': dryRun = true; break;
      default:
        process.stderr.write(`Unknown option: ${arg}\n`);
        process.stderr.write(USAGE);
        return null;
    }
  }

  return { settingsScope, dryRun };
}

// ─── Path helpers ─────────────────────────────────────────────────────────────

function resolveSettingsPath(scope: 'global' | 'local'): string {
  if (scope === 'global') return join(homedir(), '.claude', 'settings.json');
  return '.claude/settings.json';
}

function detectMcpJsonPath(): string | undefined {
  if (existsSync('.mcp.json')) return '.mcp.json';
  if (existsSync('.claude/mcp.json')) return '.claude/mcp.json';
  return undefined;
}

// ─── Step implementations ─────────────────────────────────────────────────────

function removeSimMcpServers(mcpJsonPath: string, dryRun: boolean): void {
  process.stdout.write(`Sim MCP servers  (${mcpJsonPath})\n`);

  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(mcpJsonPath, 'utf-8'));
  } catch {
    process.stdout.write('  ! warn  .mcp.json is not valid JSON — skipping\n');
    return;
  }

  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    process.stdout.write('  = skipping — unrecognised .mcp.json format\n');
    return;
  }

  const config = raw as Record<string, unknown>;
  const servers = (typeof config['mcpServers'] === 'object' && config['mcpServers'] !== null)
    ? config['mcpServers'] as Record<string, unknown>
    : {};

  let updatedServers = { ...servers };
  let anyRemoved = false;

  for (const id of SIM_SERVER_IDS) {
    if (id in servers) {
      process.stdout.write(`  - remove  ${id}\n`);
      delete updatedServers[id];
      anyRemoved = true;
    } else {
      process.stdout.write(`  = skip    ${id}  (not present)\n`);
    }
  }

  if (anyRemoved && !dryRun) {
    const updated: Record<string, unknown> = { ...config, mcpServers: updatedServers };
    if (Object.keys(updatedServers).length === 0) updated['mcpServers'] = undefined;
    const final: Record<string, unknown> = Object.fromEntries(
      Object.entries(updated).filter(([, v]) => v !== undefined),
    );
    writeFileSync(resolve(mcpJsonPath), JSON.stringify(final, null, 2) + '\n', 'utf-8');
    process.stdout.write('  ✓ written\n');
  }
}

function removeDemoHooks(settingsPath: string, dryRun: boolean): void {
  process.stdout.write(`\nClaude Code hooks  (${settingsPath})\n`);

  if (!existsSync(settingsPath)) {
    process.stdout.write(`  → ${settingsPath} does not exist — nothing to remove\n`);
    return;
  }

  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(settingsPath, 'utf-8'));
  } catch {
    process.stderr.write(`  Error: ${settingsPath} is not valid JSON\n`);
    return;
  }

  const settings = parseClaudeSettings(raw) as Record<string, unknown>;
  const hooks = settings['hooks'] as Record<string, unknown[]> | undefined;
  let changed = false;

  if (hooks) {
    const hookTypes = ['PreToolUse', 'PostToolUse', 'SubagentStart', 'SubagentStop'] as const;
    for (const type of hookTypes) {
      const list = hooks[type];
      if (!Array.isArray(list)) continue;
      let hookTypeChanged = false;
      const filtered = list
        .map((entry) => {
          if (typeof entry !== 'object' || entry === null) return entry;
          const e = entry as Record<string, unknown>;
          const innerHooks = Array.isArray(e['hooks']) ? (e['hooks'] as unknown[]) : [];
          const survivingHooks = innerHooks.filter((h) => {
            if (typeof h !== 'object' || h === null) return true;
            const cmd = (h as Record<string, unknown>)['command'];
            return !(typeof cmd === 'string' && (isRindHookCommand(cmd) || isRindEventHookCommand(cmd)));
          });
          if (survivingHooks.length === innerHooks.length) return entry;
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
    if (Object.keys(hooks).length === 0) delete settings['hooks'];
  }

  if (!changed) {
    process.stdout.write('  = nothing to remove — no Rind hooks found\n');
  } else if (!dryRun) {
    writeFileSync(resolve(settingsPath), JSON.stringify(settings, null, 2) + '\n', 'utf-8');
    process.stdout.write('  ✓ written\n');
  }
}

function removeLlmProxy(settingsPath: string, dryRun: boolean): void {
  process.stdout.write(`\nLLM proxy  (${settingsPath})\n`);

  if (!existsSync(settingsPath)) {
    process.stdout.write(`  → ${settingsPath} does not exist — nothing to remove\n`);
    return;
  }

  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(settingsPath, 'utf-8'));
  } catch {
    process.stderr.write(`  Error: ${settingsPath} is not valid JSON\n`);
    return;
  }

  const settings = parseClaudeSettings(raw) as Record<string, unknown>;
  const env = settings['env'] as Record<string, unknown> | undefined;

  if (!env) {
    process.stdout.write('  = nothing to remove — no env config found\n');
    return;
  }

  let changed = false;
  const key = 'ANTHROPIC_BASE_URL';
  const val = env[key];

  if (typeof val === 'string' && val.includes('/llm/')) {
    process.stdout.write(`  - remove  ${key}=${val}\n`);
    delete env[key];
    changed = true;
  } else {
    process.stdout.write(`  = skip  ${key} not set to a Rind URL\n`);
  }

  if (Object.keys(env).length === 0) delete settings['env'];

  if (changed && !dryRun) {
    writeFileSync(resolve(settingsPath), JSON.stringify(settings, null, 2) + '\n', 'utf-8');
    process.stdout.write('  ✓ written\n');
  }
}

// ─── Main runner ──────────────────────────────────────────────────────────────

export async function runDemoUninit(argv: string[]): Promise<void> {
  const args = parseDemoUninitArgs(argv);
  if (!args) { process.exit(1); return; }

  const settingsPath = resolveSettingsPath(args.settingsScope);
  const dryRun = args.dryRun;
  const scopeLabel = args.settingsScope === 'global' ? 'global' : 'local';

  process.stdout.write(dryRun
    ? `\nRind demo teardown [${scopeLabel}] — dry run\n\n`
    : `\nRind demo teardown [${scopeLabel}]\n\n`,
  );

  try {
    const mcpPath = detectMcpJsonPath();
    if (mcpPath) {
      removeSimMcpServers(mcpPath, dryRun);
    } else {
      process.stdout.write('Sim MCP servers  (.mcp.json not found — skipping)\n');
    }

    removeDemoHooks(settingsPath, dryRun);
    removeLlmProxy(settingsPath, dryRun);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(`\nError: ${message}\n`);
    process.exit(1);
    return;
  }

  process.stdout.write('\n');

  if (dryRun) {
    process.stdout.write('Dry run complete — no files were written.\n');
  } else {
    process.stdout.write('Done. Rind demo environment removed.\n');
  }
}
