// `rind-proxy demo-init` — sets up a live demo environment for Rind.
//
// Usage:
//   rind-proxy demo-init [options]
//
// Options:
//   --local               Write .mcp.json to current directory; write hooks to .claude/settings.json
//   --global              Write hooks to ~/.claude/settings.json (default)
//   --rind-url <url>      Rind proxy URL (default: http://localhost:7777)
//   --dry-run             Print what would change without writing any files
//
// What it does:
//   1. Writes sim MCP server entries to .mcp.json (rind-threat-sim + rind-victim-service)
//   2. Writes Claude Code hooks to settings.json (PreToolUse / PostToolUse / Subagent*)
//   3. Writes ANTHROPIC_BASE_URL to settings.json so LLM calls flow through Rind

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { homedir } from 'node:os';
import { parseClaudeSettings, mergeRindHook, alreadyHasRindHook, alreadyHasRindEventHooks } from '../config/settings-json.js';

// ─── Sim server definitions ───────────────────────────────────────────────────

const SIM_SERVERS = [
  { id: 'rind-threat-sim',     url: 'http://localhost:8080/mcp' },
  { id: 'rind-victim-service', url: 'http://localhost:8081/mcp' },
] as const;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DemoInitArgs {
  rindUrl:       string;
  settingsScope: 'global' | 'local';
  dryRun:        boolean;
}

// ─── Arg parsing ──────────────────────────────────────────────────────────────

const USAGE = `Usage: rind-proxy demo-init [options]

Options:
  --local               Write hooks to .claude/settings.json in current directory
  --global              Write hooks to ~/.claude/settings.json (default)
  --rind-url <url>      Rind proxy URL (default: http://localhost:7777)
  --dry-run             Print what would change without writing any files
  --help                Show this help message
`;

export function parseDemoInitArgs(argv: string[]): DemoInitArgs | null {
  const args = argv.slice(3); // drop node, rind-proxy, demo-init

  let rindUrl = 'http://localhost:7777';
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
      case '--rind-url':
        if (!args[i + 1]) { process.stderr.write('--rind-url requires a value\n'); return null; }
        rindUrl = args[++i]!;
        break;
      default:
        process.stderr.write(`Unknown option: ${arg}\n`);
        process.stderr.write(USAGE);
        return null;
    }
  }

  return { rindUrl, settingsScope, dryRun };
}

// ─── File I/O helpers ─────────────────────────────────────────────────────────

function readJsonFile(path: string): unknown {
  if (!existsSync(path)) return null;
  const raw = readFileSync(path, 'utf-8');
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(`${path} exists but is not valid JSON — fix it before running demo-init`);
  }
}

function writeFile(path: string, content: string): void {
  mkdirSync(dirname(resolve(path)), { recursive: true });
  writeFileSync(path, content, 'utf-8');
}

// ─── Path resolution ──────────────────────────────────────────────────────────

function resolveSettingsPath(scope: 'global' | 'local'): string {
  if (scope === 'global') return join(homedir(), '.claude', 'settings.json');
  return '.claude/settings.json';
}

function resolveMcpJsonPath(scope: 'global' | 'local'): string {
  // .mcp.json always goes in the current working directory for both scopes
  // (it's a project-level file, unlike settings.json which can be global).
  // If one already exists, use it; otherwise default to CWD.
  if (existsSync('.mcp.json')) return '.mcp.json';
  if (existsSync('.claude/mcp.json')) return '.claude/mcp.json';
  return '.mcp.json';
}

// ─── Step implementations ─────────────────────────────────────────────────────

function applySimMcpServers(mcpJsonPath: string, dryRun: boolean): void {
  process.stdout.write(`Sim MCP servers  (${mcpJsonPath})\n`);

  const raw = readJsonFile(mcpJsonPath);
  const current = (raw !== null && typeof raw === 'object' && !Array.isArray(raw)) ? raw as Record<string, unknown> : {};
  const currentServers = (typeof current['mcpServers'] === 'object' && current['mcpServers'] !== null)
    ? current['mcpServers'] as Record<string, unknown>
    : {};

  let updatedServers = { ...currentServers };
  let anyAdded = false;

  for (const { id, url } of SIM_SERVERS) {
    const existing = currentServers[id];
    if (existing !== undefined) {
      process.stdout.write(`  = skip  ${id}  (already present)\n`);
    } else {
      process.stdout.write(`  + add   ${id.padEnd(20)}  → ${url}\n`);
      updatedServers = { ...updatedServers, [id]: { type: 'http', url } };
      anyAdded = true;
    }
  }

  if (anyAdded && !dryRun) {
    const updated = { ...current, mcpServers: updatedServers };
    writeFile(mcpJsonPath, JSON.stringify(updated, null, 2) + '\n');
    process.stdout.write('  ✓ written\n');
  }
}

function applyDemoHooks(settingsPath: string, rindUrl: string, dryRun: boolean): void {
  process.stdout.write(`\nClaude Code hooks  (${settingsPath})\n`);

  const raw = readJsonFile(settingsPath);
  const settings = parseClaudeSettings(raw);

  const hasPreToolUse  = alreadyHasRindHook(settings);
  const hasEventHooks  = alreadyHasRindEventHooks(settings);

  if (hasPreToolUse && hasEventHooks) {
    process.stdout.write('  = skip  All Rind hooks already present\n');
    return;
  }

  const merged = mergeRindHook(settings, rindUrl, false);

  if (!hasPreToolUse) {
    process.stdout.write(`  + add   PreToolUse     → ${rindUrl}/hook/evaluate\n`);
  } else {
    process.stdout.write('  = skip  PreToolUse hook already present\n');
  }
  if (!hasEventHooks) {
    process.stdout.write(`  + add   PostToolUse    → ${rindUrl}/hook/event\n`);
    process.stdout.write(`  + add   SubagentStart  → ${rindUrl}/hook/event\n`);
    process.stdout.write(`  + add   SubagentStop   → ${rindUrl}/hook/event\n`);
  } else {
    process.stdout.write('  = skip  PostToolUse / SubagentStart / SubagentStop already present\n');
  }

  if (!dryRun) {
    writeFile(settingsPath, JSON.stringify(merged, null, 2) + '\n');
    process.stdout.write('  ✓ written\n');
  }
}

function applyLlmProxy(settingsPath: string, rindUrl: string, dryRun: boolean): void {
  process.stdout.write(`\nLLM proxy  (${settingsPath})\n`);

  const raw = readJsonFile(settingsPath);
  const settings = parseClaudeSettings(raw);
  const existingEnv = (settings['env'] ?? {}) as Record<string, unknown>;
  const targetUrl = `${rindUrl}/llm/anthropic`;
  const key = 'ANTHROPIC_BASE_URL';

  const current = existingEnv[key];
  if (current === targetUrl) {
    process.stdout.write(`  = skip  ${key} already points to Rind\n`);
    return;
  }

  if (current !== undefined) {
    process.stdout.write(
      `  ! warn  ${key} is already set to "${String(current)}" — not overwriting\n` +
      `          To enable: set ${key}=${targetUrl} in settings.json\n`,
    );
    return;
  }

  process.stdout.write(`  + add   ${key}=${targetUrl}\n`);

  if (!dryRun) {
    const newEnv = { ...existingEnv, [key]: targetUrl };
    const updated = { ...settings, env: newEnv };
    writeFile(settingsPath, JSON.stringify(updated, null, 2) + '\n');
    process.stdout.write('  ✓ written\n');
  }
}

// ─── Main runner ──────────────────────────────────────────────────────────────

export async function runDemoInit(argv: string[]): Promise<void> {
  const args = parseDemoInitArgs(argv);
  if (!args) { process.exit(1); return; }

  const mcpJsonPath  = resolveMcpJsonPath(args.settingsScope);
  const settingsPath = resolveSettingsPath(args.settingsScope);
  const rindUrl      = args.rindUrl;
  const dryRun       = args.dryRun;

  const scopeLabel = args.settingsScope === 'global' ? 'global' : 'local';

  process.stdout.write(dryRun
    ? `\nRind demo environment [${scopeLabel}] — dry run\n\n`
    : `\nRind demo environment [${scopeLabel}]\n\n`,
  );

  try {
    applySimMcpServers(mcpJsonPath, dryRun);
    applyDemoHooks(settingsPath, rindUrl, dryRun);
    applyLlmProxy(settingsPath, rindUrl, dryRun);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(`\nError: ${message}\n`);
    process.exit(1);
    return;
  }

  process.stdout.write('\n');

  if (dryRun) {
    process.stdout.write('Dry run complete — no files were written.\n');
    return;
  }

  process.stdout.write('Done. Start the demo:\n');
  process.stdout.write('  1. Start Rind:        cd apps/proxy && pnpm dev\n');
  process.stdout.write('  2. Start sim servers: cd simulation && pnpm demo-serve\n');
  process.stdout.write('  3. Open Claude Code in this directory\n\n');
}
