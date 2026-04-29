// `rind-proxy wrap` — stdio MCP server wrapper (D-040 Phase A4).
//
// Usage:
//   rind-proxy wrap [options] -- <command> [args...]
//   npx @rind/proxy wrap -- npx @some/mcp-server --flag
//
// Options:
//   --policy <path>     Path to rind.policy.yaml (default: ./rind.policy.yaml)
//   --server-id <id>    Logical server ID for audit logs (default: derived from command)
//   --agent-id <id>     Agent ID for audit logs (default: wrap)
//
// What it does:
//   1. Spawns the real MCP server as a child process
//   2. Interposes on stdin/stdout JSON-RPC messages via StdioInterposer
//   3. For tools/call: evaluates via the policy engine before forwarding
//   4. ALLOW → forwards to child; DENY/BLOCK → synthetic JSON-RPC error to stdout
//   5. Exits with the child's exit code when the child terminates
//
// Responsibility: process lifecycle only — arg parsing, process spawning,
// signal handling, exit code propagation. No JSON-RPC knowledge here.

import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import pino from 'pino';
import { loadPolicyFile, emptyPolicyConfig } from '../policy/loader.js';
import { PolicyEngine } from '../policy/engine.js';
import { InMemoryPolicyStore } from '../policy/store.js';
import { LoopDetector } from '../loop-detector.js';
import { RateLimiter } from '../rate-limiter.js';
import { InMemorySessionStore } from '../session.js';
import { StdioInterposer } from '../transport/stdio-interpose.js';

// ─── Arg parsing ──────────────────────────────────────────────────────────────

interface WrapArgs {
  policyPath: string | undefined;
  serverId:   string;
  agentId:    string;
  command:    string;
  commandArgs: string[];
}

/**
 * Parses `rind-proxy wrap [options] -- <command> [args...]`.
 * Returns null with an error message when args are invalid.
 */
export function parseWrapArgs(argv: string[]): WrapArgs | null {
  // Drop 'node', 'rind-proxy', 'wrap' from the front
  const args = argv.slice(3);

  const separatorIndex = args.indexOf('--');
  if (separatorIndex === -1) {
    process.stderr.write('rind-proxy wrap: missing "--" separator before command\n');
    process.stderr.write('Usage: rind-proxy wrap [options] -- <command> [args...]\n');
    return null;
  }

  const options = args.slice(0, separatorIndex);
  const commandParts = args.slice(separatorIndex + 1);

  if (commandParts.length === 0) {
    process.stderr.write('rind-proxy wrap: no command specified after "--"\n');
    return null;
  }

  const USAGE = `Usage: rind-proxy wrap [options] -- <command> [args...]

Options:
  --policy <path>         Path to rind.policy.yaml (default: ./rind.policy.yaml)
  --server-id <id>        Logical server ID for audit logs (default: derived from command)
  --agent-id <id>         Agent ID for audit logs (default: wrap)
  --help                  Show this help message

Examples:
  rind-proxy wrap -- npx @github/mcp-server
  rind-proxy wrap --server-id github -- npx @github/mcp-server
`;

  let policyPath: string | undefined;
  let serverId: string | undefined;
  let agentId: string | undefined;

  for (let i = 0; i < options.length; i++) {
    const opt = options[i];
    if (opt === '--help') {
      process.stdout.write(USAGE);
      process.exit(0);
    } else if (opt === '--policy' && options[i + 1]) {
      policyPath = options[++i];
    } else if (opt === '--server-id' && options[i + 1]) {
      serverId = options[++i];
    } else if (opt === '--agent-id' && options[i + 1]) {
      agentId = options[++i];
    }
  }

  const command = commandParts[0]!;
  const derivedServerId = serverId ?? deriveServerId(command, commandParts.slice(1));

  return {
    policyPath,
    serverId:    derivedServerId,
    agentId:     agentId ?? 'wrap',
    command,
    commandArgs: commandParts.slice(1),
  };
}

/** Derives a short, stable server ID from the command and args. */
function deriveServerId(command: string, args: string[]): string {
  if (command === 'npx') {
    // First non-flag arg is the package name: @scope/name → name, unscoped as-is
    const packageArg = args.find((a) => !a.startsWith('-'));
    if (packageArg) {
      return packageArg.replace(/^@[^/]+\//, '').replace(/[^a-z0-9-]/gi, '-');
    }
  }

  // python -m mcp_server_thing → mcp-server-thing
  const isPython = command === 'python' || command === 'python3';
  if (isPython) {
    const moduleArg = args.find((_, i) => args[i - 1] === '-m');
    if (moduleArg) return moduleArg.replace(/_/g, '-');
  }

  return command.replace(/[^a-z0-9-]/gi, '-');
}

// ─── Main wrap runner ─────────────────────────────────────────────────────────

/**
 * Entry point for the `wrap` subcommand. Exits the process when done.
 * Accepts argv so it can be tested without real process.argv.
 */
export async function runWrap(argv: string[]): Promise<void> {
  const args = parseWrapArgs(argv);
  if (!args) process.exit(1);

  // Logger goes to stderr so it doesn't interfere with MCP stdio on stdout
  const logger = pino({ level: 'info' }, pino.destination(2));

  // ── Policy loading ──────────────────────────────────────────────────────────
  const policyPath = args.policyPath
    ?? (existsSync('rind.policy.yaml') ? 'rind.policy.yaml' : undefined);

  const policyConfig = policyPath
    ? await loadPolicyFile(policyPath)
    : emptyPolicyConfig();

  if (policyPath) {
    logger.info({ path: policyPath }, 'Loaded policy file');
  } else {
    logger.warn('No policy file found — running with no rules (all tool calls allowed)');
  }

  // ── Policy engine ───────────────────────────────────────────────────────────
  const policyEngine = new PolicyEngine(new InMemoryPolicyStore(policyConfig));
  const loopDetector = new LoopDetector();
  const rateLimiter  = new RateLimiter();

  const interceptorOpts = {
    policyEngine,
    loopDetector,
    rateLimiter,
    sessionStore: new InMemorySessionStore(),
    onToolCallEvent: (event: import('../types.js').ToolCallEvent, rule?: import('../types.js').PolicyRule) => {
      logger.info({
        toolName: event.toolName,
        serverId: event.serverId,
        rule: rule?.name,
      }, 'Tool call evaluated');
    },
    onToolResponseEvent: () => {},
    blockOnCriticalResponseThreats: false,
  };

  // ── Spawn the real MCP server ───────────────────────────────────────────────
  logger.info({ command: args.command, args: args.commandArgs, serverId: args.serverId },
    'Spawning MCP server');

  const child = spawn(args.command, args.commandArgs, {
    stdio: ['pipe', 'pipe', 'inherit'], // pipe stdin/stdout; inherit stderr
    // Filter out undefined values — process.env is Record<string, string | undefined>
    // and spawn requires Record<string, string>. Passing undefined values would coerce
    // them to the string "undefined" in some Node.js versions.
    env: Object.fromEntries(
      Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined),
    ),
  });

  child.on('error', (err) => {
    logger.error({ err, command: args.command }, 'Failed to spawn MCP server');
    process.exit(1);
  });

  // ── Wire interposer ─────────────────────────────────────────────────────────
  const interposer = new StdioInterposer(
    {
      serverId:        args.serverId,
      sessionId:       `wrap:${randomUUID()}`,
      agentId:         args.agentId,
      interceptorOpts,
    },
    process.stdin,
    process.stdout,
    child.stdin!,
    child.stdout!,
  );

  // ── Shutdown handling ───────────────────────────────────────────────────────
  let exitCode = 0;

  child.on('exit', (code) => {
    exitCode = code ?? 0;
  });

  const shutdown = () => {
    child.kill('SIGTERM');
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT',  shutdown);

  // ── Run until child closes ──────────────────────────────────────────────────
  await interposer.start();

  logger.info({ exitCode }, 'MCP server process exited — wrap shutting down');
  process.exit(exitCode);
}
