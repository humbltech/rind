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

// Actual upstream addresses where the sim servers listen.
// These go into .rind/servers.json so the proxy gateway knows where to forward.
const SIM_SERVERS = [
  { id: 'rind-threat-sim',     upstreamUrl: 'http://localhost:8080/mcp' },
  { id: 'rind-victim-service', upstreamUrl: 'http://localhost:8081/mcp' },
] as const;

// Packs that cover every attack tool in the live demo.
// sim__data_relay and sim__doc_search need manual rules/scanner — not packs.
//
// llm-injection-guard-v1 is safe to enable here. As of v1.1.0, the pack rule
// uses agent: '!llm-anthropic', which excludes Claude Code from injection
// scanning. Claude Code sessions accumulate rich history (curl commands,
// $() substitutions, config file content) that triggers injection patterns
// legitimately — the pack was never meant for coding CLIs. Custom applications
// that set x-rind-agent-id to something other than 'llm-anthropic' will
// still receive full injection scanning.
const DEMO_PACKS = [
  'sql-protection',
  'shell-protection',
  'exfil-protection',
  'cli-protection',
  'llm-response-pii-redact-v1',
  'llm-injection-guard-v1',
  'sim-demo',
] as const;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DemoInitArgs {
  rindUrl:       string;
  settingsScope: 'global' | 'local';
  dryRun:        boolean;
  enablePacks:   boolean;
}

// ─── Arg parsing ──────────────────────────────────────────────────────────────

const USAGE = `Usage: rind-proxy demo-init [options]

Options:
  --local               Write hooks to .claude/settings.json in current directory
  --global              Write hooks to ~/.claude/settings.json (default)
  --rind-url <url>      Rind proxy URL (default: http://localhost:7777)
  --enable-packs        Enable all demo policy packs on the running proxy
  --dry-run             Print what would change without writing any files
  --help                Show this help message
`;

export function parseDemoInitArgs(argv: string[]): DemoInitArgs | null {
  const args = argv.slice(3); // drop node, rind-proxy, demo-init

  let rindUrl = 'http://localhost:7777';
  let settingsScope: 'global' | 'local' = 'global';
  let dryRun = false;
  let enablePacks = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case '--help':
        process.stdout.write(USAGE);
        process.exit(0);
        break;
      case '--local':         settingsScope = 'local'; break;
      case '--global':        settingsScope = 'global'; break;
      case '--dry-run':       dryRun = true; break;
      case '--enable-packs':  enablePacks = true; break;
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

  return { rindUrl, settingsScope, dryRun, enablePacks };
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

// .mcp.json is always project-local regardless of settings scope — it lives
// in the CWD, not in ~/.claude. Use whichever path already exists.
function resolveMcpJsonPath(): string {
  if (existsSync('.mcp.json')) return '.mcp.json';
  if (existsSync('.claude/mcp.json')) return '.claude/mcp.json';
  return '.mcp.json';
}

// ─── Step implementations ─────────────────────────────────────────────────────

function applySimMcpServers(mcpJsonPath: string, rindUrl: string, dryRun: boolean): void {
  process.stdout.write(`Sim MCP servers  (${mcpJsonPath})\n`);

  const raw = readJsonFile(mcpJsonPath);
  const current = (raw !== null && typeof raw === 'object' && !Array.isArray(raw)) ? raw as Record<string, unknown> : {};
  const currentServers = (typeof current['mcpServers'] === 'object' && current['mcpServers'] !== null)
    ? current['mcpServers'] as Record<string, unknown>
    : {};

  // Claude Code must connect via the Rind gateway, not directly to the sim.
  // .mcp.json gets proxy URLs; .rind/servers.json gets the actual upstream URLs.
  // This ensures every tool call flows through the interceptor (policy, loop detection, scan).
  let updatedMcpServers = { ...currentServers };
  let anyMcpChanged = false;

  for (const { id, upstreamUrl } of SIM_SERVERS) {
    const proxyUrl = `${rindUrl}/mcp/${id}`;
    const existing = currentServers[id];
    const existingUrl = (existing !== null && typeof existing === 'object')
      ? (existing as Record<string, unknown>)['url']
      : undefined;

    if (existingUrl === proxyUrl) {
      process.stdout.write(`  = skip  ${id}  (already points to Rind proxy)\n`);
    } else {
      if (existingUrl !== undefined) {
        process.stdout.write(`  ~ update ${id.padEnd(19)}  → ${proxyUrl}  (was: ${String(existingUrl)})\n`);
      } else {
        process.stdout.write(`  + add   ${id.padEnd(20)}  → ${proxyUrl}\n`);
      }
      updatedMcpServers = { ...updatedMcpServers, [id]: { type: 'http', url: proxyUrl } };
      anyMcpChanged = true;
    }
    // Always print what the upstream is for clarity
    process.stdout.write(`           upstream          → ${upstreamUrl}  (.rind/servers.json)\n`);
  }

  if (anyMcpChanged && !dryRun) {
    const updated = { ...current, mcpServers: updatedMcpServers };
    writeFile(mcpJsonPath, JSON.stringify(updated, null, 2) + '\n');
    process.stdout.write('  ✓ written\n');
  }

  // Write .rind/servers.json — tells the proxy gateway where to forward each server.
  // The gateway only mounts when this file exists and has entries.
  const serversFilePath = '.rind/servers.json';
  const rawServers = readJsonFile(serversFilePath);
  const currentUpstreams = (rawServers !== null && typeof rawServers === 'object' && !Array.isArray(rawServers))
    ? rawServers as Record<string, unknown>
    : {};

  let updatedUpstreams = { ...currentUpstreams };
  let anyUpstreamsChanged = false;

  for (const { id, upstreamUrl } of SIM_SERVERS) {
    const entry = { transport: 'http', url: upstreamUrl };
    const existing = currentUpstreams[id];
    if (JSON.stringify(existing) === JSON.stringify(entry)) continue;
    updatedUpstreams = { ...updatedUpstreams, [id]: entry };
    anyUpstreamsChanged = true;
  }

  if (anyUpstreamsChanged && !dryRun) {
    writeFile(serversFilePath, JSON.stringify(updatedUpstreams, null, 2) + '\n');
    process.stdout.write(`  ✓ written  ${serversFilePath}\n`);
  } else if (!anyUpstreamsChanged) {
    process.stdout.write(`  = skip  ${serversFilePath}  (already up to date)\n`);
  } else {
    process.stdout.write(`  dry-run  ${serversFilePath}  would be written\n`);
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

// ─── Pack enablement ──────────────────────────────────────────────────────────

/**
 * Enables all demo policy packs on the running proxy.
 * Network errors are non-fatal — printed as warnings so that users who run
 * demo-init before starting the proxy aren't blocked.
 */
async function enableDemoPacks(rindUrl: string, dryRun: boolean): Promise<void> {
  process.stdout.write('\nPolicy packs\n');

  if (dryRun) {
    for (const id of DEMO_PACKS) {
      process.stdout.write(`  + enable  ${id}\n`);
    }
    return;
  }

  for (const id of DEMO_PACKS) {
    try {
      const res = await fetch(`${rindUrl}/packs/${id}/enable`, { method: 'POST' });
      if (res.ok) {
        process.stdout.write(`  ✓ enabled  ${id}\n`);
      } else {
        const body = await res.text().catch(() => '');
        process.stdout.write(`  ! warn    ${id}  (HTTP ${res.status}${body ? `: ${body.slice(0, 80)}` : ''})\n`);
      }
    } catch {
      // Proxy not running — warn but continue so file writes aren't rolled back
      process.stdout.write(`  ! warn    ${id}  (proxy unreachable at ${rindUrl} — enable manually after starting Rind)\n`);
      // All remaining packs will also fail, so skip them and print one final note
      const remaining = DEMO_PACKS.slice(DEMO_PACKS.indexOf(id) + 1);
      for (const r of remaining) {
        process.stdout.write(`  ! warn    ${r}  (skipped — proxy unreachable)\n`);
      }
      process.stdout.write(`\n  To enable after starting the proxy:\n`);
      for (const p of DEMO_PACKS) {
        process.stdout.write(`    curl -X POST ${rindUrl}/packs/${p}/enable\n`);
      }
      return;
    }
  }
}

// ─── Main runner ──────────────────────────────────────────────────────────────

export async function runDemoInit(argv: string[]): Promise<void> {
  const args = parseDemoInitArgs(argv);
  if (!args) { process.exit(1); return; }

  const mcpJsonPath  = resolveMcpJsonPath();
  const settingsPath = resolveSettingsPath(args.settingsScope);
  const rindUrl      = args.rindUrl;
  const dryRun       = args.dryRun;

  const scopeLabel = args.settingsScope === 'global' ? 'global' : 'local';

  process.stdout.write(dryRun
    ? `\nRind demo environment [${scopeLabel}] — dry run\n\n`
    : `\nRind demo environment [${scopeLabel}]\n\n`,
  );

  try {
    applySimMcpServers(mcpJsonPath, rindUrl, dryRun);
    applyDemoHooks(settingsPath, rindUrl, dryRun);
    applyLlmProxy(settingsPath, rindUrl, dryRun);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(`\nError: ${message}\n`);
    process.exit(1);
    return;
  }

  if (args.enablePacks) {
    await enableDemoPacks(rindUrl, dryRun);
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
