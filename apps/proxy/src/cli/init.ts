// `rind-proxy init` — auto-config generator for Claude Code (D-040 Phase A5).
//
// Usage:
//   rind-proxy init [options]
//   npx @rind/proxy init --claude-code
//
// Options:
//   --claude-code         Generate Claude Code hook config + wrapped MCP config (default)
//   --rind-url <url>      Rind proxy URL (default: http://localhost:7777)
//   --mcp-json <path>     Path to .mcp.json (default: auto-detect)
//   --settings <path>     Path to .claude/settings.json (default: auto-detect)
//   --policy <path>       Output path for rind.policy.yaml (default: ./rind.policy.yaml)
//   --dry-run             Print what would change without writing any files
//
// What it does:
//   1. Reads the existing .mcp.json (if present) and wraps every stdio server
//      so Claude Code routes MCP calls through Rind instead of the real server
//   2. Reads the existing .claude/settings.json (if present) and merges in a
//      PreToolUse hook that calls Rind's /hook/evaluate endpoint
//   3. Generates a starter rind.policy.yaml if one does not already exist
//   4. Prints a human-readable diff of every change made
//
// Responsibility: I/O orchestration only — file reading, writing, and printing.
// All transforms live in config/ modules and are independently testable.

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { parseMcpJson, wrapWithRind, describeWrap } from '../config/mcp-json.js';
import { parseClaudeSettings, mergeRindHook, alreadyHasRindHook } from '../config/settings-json.js';
import { generateStarterPolicyYaml } from '../config/policy-yaml.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface InitArgs {
  claudeCode:   boolean;
  rindUrl:      string;
  mcpJsonPath:  string | undefined;
  settingsPath: string | undefined;
  policyPath:   string;
  dryRun:       boolean;
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
  let policyPath    = './rind.policy.yaml';
  let dryRun        = false;

  const USAGE = `Usage: rind-proxy init [options]

Options:
  --claude-code           Generate Claude Code hook config + wrapped MCP config (default)
  --rind-url <url>        Rind proxy URL (default: http://localhost:7777)
  --mcp-json <path>       Path to .mcp.json (default: auto-detect)
  --settings <path>       Path to .claude/settings.json (default: auto-detect)
  --policy <path>         Output path for rind.policy.yaml (default: ./rind.policy.yaml)
  --dry-run               Print what would change without writing any files
  --help                  Show this help message
`;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case '--help':
        process.stdout.write(USAGE);
        process.exit(0);
        break;
      case '--claude-code': claudeCode = true; break;
      case '--dry-run':     dryRun = true; break;
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
      case '--policy':
        if (!args[i + 1]) { process.stderr.write('--policy requires a path\n'); return null; }
        policyPath = args[++i]!;
        break;
      default:
        process.stderr.write(`Unknown option: ${arg}\n`);
        process.stderr.write(USAGE);
        return null;
    }
  }

  // --claude-code is the default if no target is specified
  if (!claudeCode) claudeCode = true;

  return { claudeCode, rindUrl, mcpJsonPath, settingsPath, policyPath, dryRun };
}

// ─── File I/O helpers ─────────────────────────────────────────────────────────

/**
 * Reads a file as a parsed JSON value.
 * Returns null when the file is absent.
 * Throws with a clear message when the file exists but is not valid JSON —
 * so the caller can warn the user rather than silently treating it as empty.
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

// ─── Path auto-detection ──────────────────────────────────────────────────────

/**
 * Finds .mcp.json by checking common locations in priority order.
 * Returns the first path that exists, or a default path.
 */
function detectMcpJsonPath(override?: string): string {
  if (override) return override;
  const candidates = ['.mcp.json', '.claude/mcp.json'];
  return candidates.find(existsSync) ?? '.mcp.json';
}

/**
 * Finds .claude/settings.json — always at this fixed path for Claude Code.
 * Returns the override if provided.
 */
function detectSettingsPath(override?: string): string {
  return override ?? '.claude/settings.json';
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
  const settingsPath = detectSettingsPath(args.settingsPath);
  const policyPath   = args.policyPath;
  const rindUrl      = args.rindUrl;
  const dryRun       = args.dryRun;

  if (dryRun) {
    process.stdout.write('\nRind init — dry run (no files will be written)\n\n');
  } else {
    process.stdout.write('\nRind init\n\n');
  }

  try {
    // ── Step 1: Wrap MCP servers ──────────────────────────────────────────────
    applyMcpJsonWrap(mcpJsonPath, dryRun);

    // ── Step 2: Add PreToolUse hook ───────────────────────────────────────────
    applySettingsHook(settingsPath, rindUrl, dryRun);

    // ── Step 3: Generate starter policy ──────────────────────────────────────
    applyPolicyYaml(policyPath, dryRun);
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
    process.stdout.write('Done. Start Rind, then run Claude Code normally — all tool calls flow through Rind.\n');
    process.stdout.write(`\n  npx @rind/proxy            # start the proxy\n\n`);
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

  if (alreadyHasRindHook(settings)) {
    process.stdout.write('  = skip  PreToolUse hook already present\n');
    return;
  }

  const merged = mergeRindHook(settings, rindUrl);
  process.stdout.write(`  + add   PreToolUse → ${rindUrl}/hook/evaluate\n`);

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
