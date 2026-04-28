// `rind-proxy init` — auto-config generator for Claude Code.
//
// Usage:
//   rind-proxy init [options]
//
// Options:
//   --claude-code         Generate Claude Code hook config + wrapped MCP config (default)
//   --rind-url <url>      Rind proxy URL (default: http://localhost:7777)
//   --mcp-json <path>     Path to .mcp.json (default: auto-detect)
//   --settings <path>     Explicit path to settings.json (overrides --global/--local)
//   --global              Write settings to ~/.claude/settings.json (default)
//   --local               Write settings to .claude/settings.json in the current directory
//   --llm-proxy           Configure ANTHROPIC_BASE_URL so LLM calls flow through Rind
//   --write-policy <path> Generate a starter rind.policy.yaml at the given path
//   --dry-run             Print what would change without writing any files
//
// What it does:
//   1. Reads the existing .mcp.json (if present) and wraps every stdio server
//      so Claude Code routes MCP calls through Rind instead of the real server
//   2. Merges Rind hooks into the Claude Code settings.json (global by default)
//   3. Optionally: sets ANTHROPIC_BASE_URL for LLM API interception (--llm-proxy)
//   4. Optionally: generates a starter rind.policy.yaml (--write-policy)
//
// Responsibility: I/O orchestration only — file reading, writing, and printing.
// All transforms live in config/ modules and are independently testable.

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { homedir } from 'node:os';
import { parseMcpJson, wrapWithRind, describeWrap } from '../config/mcp-json.js';
import { parseClaudeSettings, mergeRindHook, alreadyHasRindHook, alreadyHasRindEventHooks } from '../config/settings-json.js';
import { generateStarterPolicyYaml } from '../config/policy-yaml.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface InitArgs {
  claudeCode:   boolean;
  rindUrl:      string;
  mcpJsonPath:  string | undefined;
  settingsPath: string | undefined; // explicit override; takes precedence over global/local
  settingsScope: 'global' | 'local'; // where to write settings when no explicit path
  dryRun:       boolean;
  llmProxy:     boolean;    // configure ANTHROPIC_BASE_URL for LLM API interception
  writePolicy:  string | undefined; // path to generate rind.policy.yaml, or undefined = skip
}

// ─── Arg parsing ──────────────────────────────────────────────────────────────

/**
 * Parses `rind-proxy init [options]` from process.argv.
 * Returns null with an error message when args are invalid.
 */
export function parseInitArgs(argv: string[]): InitArgs | null {
  // Drop 'node', 'rind-proxy', 'init'
  const args = argv.slice(3);

  let claudeCode    = false;
  let rindUrl       = 'http://localhost:7777';
  let mcpJsonPath: string | undefined;
  let settingsPath: string | undefined;
  let settingsScope: 'global' | 'local' = 'global'; // default: write to ~/.claude/settings.json
  let dryRun        = false;
  let llmProxy      = true;   // on by default — matches the always-on LLM module
  let writePolicy: string | undefined;

  const USAGE = `Usage: rind-proxy init [options]

Options:
  --claude-code              Generate Claude Code hook config + wrapped MCP config (default)
  --rind-url <url>           Rind proxy URL (default: http://localhost:7777)
  --mcp-json <path>          Path to .mcp.json (default: auto-detect)
  --global                   Write settings to ~/.claude/settings.json (default)
  --local                    Write settings to .claude/settings.json in current directory
  --settings <path>          Explicit settings.json path (overrides --global/--local)
  --no-llm-proxy             Skip writing ANTHROPIC_BASE_URL / OPENAI_BASE_URL
  --write-policy [path]      Generate starter rind.policy.yaml (default: ./rind.policy.yaml)
  --dry-run                  Print what would change without writing any files
  --help                     Show this help message
`;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case '--help':
        process.stdout.write(USAGE);
        process.exit(0);
        break;
      case '--claude-code': claudeCode = true; break;
      case '--dry-run':       dryRun = true; break;
      case '--no-llm-proxy': llmProxy = false; break;
      case '--llm-proxy':    llmProxy = true; break; // explicit opt-in still accepted
      case '--global':      settingsScope = 'global'; break;
      case '--local':       settingsScope = 'local'; break;
      case '--rind-url':
        if (!args[i + 1]) { process.stderr.write('--rind-url requires a value\n'); return null; }
        rindUrl = args[++i]!;
        break;
      case '--mcp-json':
        if (!args[i + 1]) { process.stderr.write('--mcp-json requires a path\n'); return null; }
        mcpJsonPath = args[++i];
        break;
      case '--settings':
        if (!args[i + 1]) { process.stderr.write('--settings requires a path\n'); return null; }
        settingsPath = args[++i];
        break;
      case '--write-policy': {
        // Optional value — if the next arg looks like a path use it, else use default
        const next = args[i + 1];
        if (next && !next.startsWith('--')) {
          writePolicy = args[++i];
        } else {
          writePolicy = './rind.policy.yaml';
        }
        break;
      }
      default:
        process.stderr.write(`Unknown option: ${arg}\n`);
        process.stderr.write(USAGE);
        return null;
    }
  }

  // --claude-code is the default if no target is specified
  if (!claudeCode) claudeCode = true;

  return { claudeCode, rindUrl, mcpJsonPath, settingsPath, settingsScope, dryRun, llmProxy, writePolicy };
}

// ─── File I/O helpers ─────────────────────────────────────────────────────────

/**
 * Reads a file as a parsed JSON value.
 * Returns null when the file is absent.
 * Throws with a clear message when the file exists but is not valid JSON.
 */
function readJsonFile(path: string): unknown {
  if (!existsSync(path)) return null;
  const raw = readFileSync(path, 'utf-8');
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(`${path} exists but is not valid JSON — fix it before running init`);
  }
}

/** Writes content to a file, creating parent directories as needed. */
function writeFile(path: string, content: string): void {
  mkdirSync(dirname(resolve(path)), { recursive: true });
  writeFileSync(path, content, 'utf-8');
}

// ─── Path resolution ──────────────────────────────────────────────────────────

/**
 * Resolve the settings.json path.
 *   --settings <path>  → explicit override (always wins)
 *   --global (default) → ~/.claude/settings.json
 *   --local            → .claude/settings.json (relative to CWD)
 */
function resolveSettingsPath(args: InitArgs): string {
  if (args.settingsPath) return args.settingsPath;
  if (args.settingsScope === 'global') return join(homedir(), '.claude', 'settings.json');
  return '.claude/settings.json';
}

/**
 * Finds .mcp.json by checking common locations in priority order.
 */
function detectMcpJsonPath(override?: string): string {
  if (override) return override;
  const candidates = ['.mcp.json', '.claude/mcp.json'];
  return candidates.find(existsSync) ?? '.mcp.json';
}

// ─── Init runner ──────────────────────────────────────────────────────────────

/**
 * Entry point for the `init` subcommand. Exits the process when done.
 * Accepts argv so it can be tested without real process.argv.
 */
export async function runInit(argv: string[]): Promise<void> {
  const args = parseInitArgs(argv);
  if (!args) { process.exit(1); return; }

  const mcpJsonPath  = detectMcpJsonPath(args.mcpJsonPath);
  const settingsPath = resolveSettingsPath(args);
  const rindUrl      = args.rindUrl;
  const dryRun       = args.dryRun;

  const scopeLabel = args.settingsPath
    ? args.settingsPath
    : args.settingsScope === 'global'
      ? `~/.claude/settings.json (global)`
      : `.claude/settings.json (local)`;

  if (dryRun) {
    process.stdout.write('\nRind init — dry run (no files will be written)\n\n');
  } else {
    process.stdout.write(`\nRind init  [${scopeLabel}]\n\n`);
  }

  try {
    // ── Step 1: Wrap MCP servers ──────────────────────────────────────────────
    applyMcpJsonWrap(mcpJsonPath, dryRun);

    // ── Step 2: Add Claude Code hooks ─────────────────────────────────────────
    applySettingsHook(settingsPath, rindUrl, dryRun);

    // ── Step 3: LLM proxy (opt-in via --llm-proxy) ───────────────────────────
    if (args.llmProxy) {
      applyLlmProxyConfig(settingsPath, rindUrl, dryRun);
    }

    // ── Step 4: Policy file (opt-in via --write-policy) ──────────────────────
    if (args.writePolicy) {
      applyPolicyYaml(args.writePolicy, dryRun);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(`\nError: ${message}\n`);
    process.exit(1);
    return;
  }

  // ── Done ─────────────────────────────────────────────────────────────────────
  process.stdout.write('\n');
  if (dryRun) {
    process.stdout.write('Dry run complete — no files were written.\n');
  } else {
    process.stdout.write('Done. Start Rind, then run Claude Code normally.\n');
    process.stdout.write(`\n  node dist/index.js         # start the proxy\n\n`);
  }
}

// ─── Step implementations ─────────────────────────────────────────────────────

function applyMcpJsonWrap(mcpJsonPath: string, dryRun: boolean): void {
  process.stdout.write(`MCP servers  (${mcpJsonPath})\n`);

  const raw = readJsonFile(mcpJsonPath);
  const config = parseMcpJson(raw);

  if (!config) {
    process.stdout.write(`  → No .mcp.json found — skipped (add MCP servers to ${mcpJsonPath} first)\n`);
    return;
  }

  const summary = describeWrap(config);

  if (summary.wrapped.length === 0 && summary.skipped.length === 0 && summary.httpOnly.length === 0) {
    process.stdout.write('  → No MCP servers configured — nothing to wrap\n');
    return;
  }

  for (const id of summary.wrapped) {
    process.stdout.write(`  + wrap  ${id}\n`);
  }
  for (const id of summary.skipped) {
    process.stdout.write(`  = skip  ${id}  (already wrapped)\n`);
  }
  for (const id of summary.httpOnly) {
    process.stdout.write(`  ~ http  ${id}  (HTTP server — handled by MCP gateway)\n`);
  }

  if (!dryRun && summary.wrapped.length > 0) {
    const wrapped = wrapWithRind(config);
    writeFile(mcpJsonPath, JSON.stringify(wrapped, null, 2) + '\n');
    process.stdout.write(`  ✓ written\n`);
  }
}

function applySettingsHook(settingsPath: string, rindUrl: string, dryRun: boolean): void {
  process.stdout.write(`\nClaude Code hooks  (${settingsPath})\n`);

  const raw = readJsonFile(settingsPath);
  const settings = parseClaudeSettings(raw);

  const hasPreToolUse = alreadyHasRindHook(settings);
  const hasEventHooks = alreadyHasRindEventHooks(settings);

  if (hasPreToolUse && hasEventHooks) {
    process.stdout.write('  = skip  All Rind hooks already present\n');
    return;
  }

  const merged = mergeRindHook(settings, rindUrl);

  if (!hasPreToolUse) {
    process.stdout.write(`  + add   PreToolUse     → ${rindUrl}/hook/evaluate\n`);
  } else {
    process.stdout.write('  = skip  PreToolUse hook already present\n');
  }
  if (!hasEventHooks) {
    process.stdout.write(`  + add   PostToolUse    → ${rindUrl}/hook/event\n`);
    process.stdout.write(`  + add   SubagentStart  → ${rindUrl}/hook/event\n`);
    process.stdout.write(`  + add   SubagentStop   → ${rindUrl}/hook/event\n`);
  }

  if (!dryRun) {
    writeFile(settingsPath, JSON.stringify(merged, null, 2) + '\n');
    process.stdout.write('  ✓ written\n');
  }
}

function applyPolicyYaml(policyPath: string, dryRun: boolean): void {
  process.stdout.write(`\nPolicy file  (${policyPath})\n`);

  if (existsSync(policyPath)) {
    process.stdout.write('  = skip  rind.policy.yaml already exists\n');
    return;
  }

  process.stdout.write('  + generate  starter policy (cli-protection pack enabled)\n');

  if (!dryRun) {
    writeFile(policyPath, generateStarterPolicyYaml());
    process.stdout.write('  ✓ written\n');
  }
}

function applyLlmProxyConfig(settingsPath: string, rindUrl: string, dryRun: boolean): void {
  process.stdout.write(`\nLLM proxy  (${settingsPath})\n`);

  // Read the current settings (may have been updated by applySettingsHook already)
  const raw = readJsonFile(settingsPath);
  const settings = parseClaudeSettings(raw);

  const existingEnv = (settings['env'] ?? {}) as Record<string, unknown>;

  const targets: Array<{ key: string; url: string }> = [
    { key: 'ANTHROPIC_BASE_URL', url: `${rindUrl}/llm/anthropic` },
    { key: 'OPENAI_BASE_URL',    url: `${rindUrl}/llm/openai` },
  ];

  let newEnv = { ...existingEnv };
  let anyWritten = false;

  for (const { key, url } of targets) {
    const current = existingEnv[key];

    if (current === url) {
      process.stdout.write(`  = skip  ${key} already points to Rind\n`);
      continue;
    }

    if (current !== undefined) {
      process.stdout.write(
        `  ! warn  ${key} is already set to "${String(current)}" — not overwriting\n` +
        `          To enable, set manually: ${key}=${url}\n`,
      );
      continue;
    }

    process.stdout.write(`  + add   ${key}=${url}\n`);
    newEnv = { ...newEnv, [key]: url };
    anyWritten = true;
  }

  if (anyWritten && !dryRun) {
    const updated: typeof settings = { ...settings, env: newEnv };
    writeFile(settingsPath, JSON.stringify(updated, null, 2) + '\n');
    process.stdout.write('  ✓ written\n');
  }

  process.stdout.write(
    `\n  Claude Code and OpenAI calls will now route through Rind.\n` +
    `  To bypass: remove ANTHROPIC_BASE_URL / OPENAI_BASE_URL from settings.json\n` +
    `  Start Rind before using Claude Code: node dist/index.js\n`,
  );
}
