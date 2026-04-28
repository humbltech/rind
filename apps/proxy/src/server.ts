// Rind MCP proxy server.
// Listens on a local port, accepts MCP connections from AI agents, and
// proxies every tool call through the interceptor before forwarding to
// the upstream MCP server.
//
// Phase 1: JSON-RPC passthrough over HTTP/SSE (matches @modelcontextprotocol/sdk transport)
// Phase 2: stdio transport support, connection multiplexing, cloud-hosted mode

import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import pino from 'pino';
import { randomUUID } from 'node:crypto';

const _require = createRequire(import.meta.url);
const PROXY_VERSION: string = (_require('../package.json') as { version: string }).version;
import type { ProxyConfig, ToolCallEvent, LlmCallEvent, AuditEntry } from './types.js';
import { listStoredSchemas, listAllScanResults } from './scanner/index.js';
import { PolicyEngine } from './policy/engine.js';
import { InMemoryPolicyStore } from './policy/store.js';
import { loadPolicyFile, emptyPolicyConfig } from './policy/loader.js';
import { createSession, getSession, killSession, listSessions } from './session.js';
import { RindEventBus } from './event-bus.js';
import { type IEventStore, type IAuditLog, JsonlEventStore, JsonlAuditLog } from '@rind/storage';
import { LoopDetector } from './loop-detector.js';
import { RateLimiter } from './rate-limiter.js';
import type { ProcessedHookEvent } from './hooks/claude-code.js';
import { CorrelationTracker } from './hooks/correlator.js';
import { ApprovalQueue } from './approval-queue.js';
import { discoverMcpServers } from './hooks/claude-code-context.js';
import { UpstreamPool } from './transport/pool.js';
import { createUpstreamClient } from './transport/upstream/factory.js';
import { mcpGateway } from './transport/gateway.js';
import { llmGateway } from './transport/llm/gateway.js';
import { defaultLlmProxyConfig } from './transport/llm/types.js';
import { policyRoutes } from './routes/policy.js';
import { sessionRoutes } from './routes/session.js';
import { scanRoutes } from './routes/scan.js';
import { logRoutes } from './routes/log.js';
import { hookRoutes } from './routes/hook.js';
import { toolCallRoutes } from './routes/tool-call.js';
import { emitAudit } from './routes/helpers.js';

export function createProxyServer(config: ProxyConfig) {
  const logger = pino({
    level: config.logLevel ?? 'info',
    transport:
      process.env['NODE_ENV'] !== 'production'
        ? { target: 'pino-pretty', options: { colorize: true } }
        : undefined,
  });

  // ── Policy store + engine (D-021) ────────────────────────────────────────────
  // loadPolicyFile throws synchronously on missing or malformed files. Catch here
  // so startup failures produce a structured log entry (not a raw stack trace)
  // and exit with a clear message rather than leaking internal paths.
  let policyConfig;
  try {
    policyConfig = config.policy
      ? config.policy
      : config.policyFile
        ? loadPolicyFile(config.policyFile)
        : emptyPolicyConfig();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Log to stderr directly — pino logger not initialised yet at this point
    process.stderr.write(`[rind] Failed to load policy file: ${message}\n`);
    process.exit(1);
    // TypeScript unreachable after process.exit — needed to satisfy definite assignment
    throw err;
  }

  // ── Runtime data directory ─────────────────────────────────────────────────
  // All runtime artifacts (audit logs, event logs, persisted policies) live in
  // .rind/ by default — keeping the project root clean. RIND_AUDIT_LOG overrides
  // the base path; all other paths derive from it.
  const RIND_DATA_DIR = '.rind';
  const auditLogPath = config.auditLogPath ?? join(RIND_DATA_DIR, 'audit.jsonl');
  const eventsLogPath = config.auditLogPath
    ? config.auditLogPath.replace(/\.jsonl$/, '-events.jsonl')
    : join(RIND_DATA_DIR, 'events.jsonl');
  const hookEventsLogPath = config.auditLogPath
    ? config.auditLogPath.replace(/\.jsonl$/, '-hook-events.jsonl')
    : join(RIND_DATA_DIR, 'hook-events.jsonl');
  const policyPersistPath = config.auditLogPath
    ? config.auditLogPath.replace(/\.jsonl$/, '-policies.json')
    : join(RIND_DATA_DIR, 'policies.json');

  // Ensure data directories exist for all output paths
  for (const p of [auditLogPath, eventsLogPath, hookEventsLogPath, policyPersistPath]) {
    mkdirSync(dirname(p), { recursive: true });
  }

  // Persist API-created rules to a JSON file alongside the audit log.
  // On restart, persisted rules are merged with the YAML base config.
  // Skip persisted rules when policy is provided in-memory (e.g. tests) — prevents
  // disk state from bleeding into isolated test environments.
  const policyStore = new InMemoryPolicyStore(policyConfig, config.policy ? undefined : policyPersistPath);
  // ── Runtime safety (D-015) — loop detector is shared between interceptor and policy engine
  const loopDetector = new LoopDetector();
  // ── PreToolUse ↔ PostToolUse correlation tracker
  const correlator = new CorrelationTracker();
  // ── Approval queue (D-013: REQUIRE_APPROVAL blocking flow)
  const approvalQueue = new ApprovalQueue();
  const policyEngine = new PolicyEngine(policyStore, loopDetector);

  // ── Event bus (D-019) ────────────────────────────────────────────────────────
  const bus = new RindEventBus((event, err) => {
    logger.error({ event, err }, 'Event bus subscriber error');
  });

  // ── Observability pipeline (D-018) ───────────────────────────────────────────
  // Tool call events are persisted to a JSONL file and reloaded on startup.
  const ringBuffer: IEventStore<ToolCallEvent> = new JsonlEventStore<ToolCallEvent>({
    capacity: config.ringBufferSize ?? 10_000,
    filePath: eventsLogPath,
    onError: (err) => logger.error({ err }, 'Event log write failed'),
  });
  // Hook events buffer — stores PostToolUse, SubagentStart/Stop for observability
  const hookEventBuffer: IEventStore<ProcessedHookEvent> = new JsonlEventStore<ProcessedHookEvent>({
    capacity: config.ringBufferSize ?? 10_000,
    filePath: hookEventsLogPath,
    onError: (err) => logger.error({ err }, 'Hook event log write failed'),
  });

  const auditWriter: IAuditLog<AuditEntry> = new JsonlAuditLog<AuditEntry>(auditLogPath, (err) => {
    logger.error({ err }, 'Audit write failed');
  });

  // Ring buffer subscriber (for MCP proxy path — hook path pushes directly with enrichment)
  bus.on('tool:call', (event) => ringBuffer.push(event));

  // Audit subscriber — writes every policy decision to .rind/audit.jsonl
  bus.on('audit', (entry) => auditWriter.append(entry));

  // ── Runtime safety (D-017) ────────────────────────────────────────────────────
  const rateLimiter = new RateLimiter();

  // ── Upstream pool (D-040 Phase A3) ───────────────────────────────────────────
  // Manages lazy connections to all configured MCP servers.
  const upstreamPool = new UpstreamPool(config.servers ?? {}, createUpstreamClient);

  // ── Hono app ──────────────────────────────────────────────────────────────────
  const app = new Hono();

  // ─── Health ───────────────────────────────────────────────────────────────────
  app.get('/health', (c) => c.json({ status: 'ok', version: PROXY_VERSION }));

  // ─── MCP protocol gateway (D-040 Phase A3) ───────────────────────────────────
  // /mcp/:serverId — receives MCP JSON-RPC from Claude Code, Cursor, Windsurf, etc.
  // Intercepts tools/call through the policy engine; proxies everything else.
  if (config.mcpProxyEnabled !== false && Object.keys(config.servers ?? {}).length > 0) {
    const gatewayInterceptorOpts = {
      policyEngine,
      loopDetector,
      rateLimiter,
      onToolCallEvent: (event: ToolCallEvent, rule?: import('./types.js').PolicyRule) => {
        // bus.emit triggers the ring buffer subscriber — no direct push needed
        bus.emit('tool:call', event);
        emitAudit(bus, {
          eventType: 'tool:call',
          sessionId: event.sessionId,
          agentId: event.agentId,
          serverId: event.serverId,
          toolName: event.toolName,
          action: 'evaluated',
          policyRule: rule?.name,
        }, config);
      },
      onToolResponseEvent: () => {},
      blockOnCriticalResponseThreats: false,
    };
    app.route('/', mcpGateway(upstreamPool, gatewayInterceptorOpts, PROXY_VERSION));
    logger.info({ servers: Object.keys(config.servers ?? {}) }, 'MCP gateway mounted');
  }

  // ─── LLM API proxy gateway (D-041) ───────────────────────────────────────────
  // Intercepts HTTP calls from Claude Code → Anthropic/OpenAI/Google.
  // Enabled via config.llmProxy.enabled (set from RIND_LLM_PROXY=true in env).
  // Bypass: unset ANTHROPIC_BASE_URL — no code change needed.
  if (config.llmProxy?.enabled) {
    const llmLogPath = config.auditLogPath
      ? config.auditLogPath.replace(/\.jsonl$/, '-llm-events.jsonl')
      : join(RIND_DATA_DIR, 'llm-events.jsonl');
    mkdirSync(dirname(llmLogPath), { recursive: true });

    const llmRingBuffer: IEventStore<LlmCallEvent> = new JsonlEventStore<LlmCallEvent>({
      capacity: config.ringBufferSize ?? 10_000,
      filePath: llmLogPath,
      onError: (err) => logger.error({ err }, 'LLM event log write failed'),
    });

    // llm:request → initial entry (outcome='forwarded', no tokens yet)
    // llm:response → enriched entry with tokens/cost/latency (update in-place)
    // llm:blocked  → terminal entry (no prior request event pushed)
    bus.on('llm:request', (event) => llmRingBuffer.push(event));
    bus.on('llm:response', (event) => {
      llmRingBuffer.update((e) => e.id === event.id, () => event);
    });
    bus.on('llm:blocked', ({ event }) => llmRingBuffer.push(event));

    const llmConfig = { ...defaultLlmProxyConfig(), ...config.llmProxy };
    app.route('/', llmGateway({ config: llmConfig, bus, policyEngine, logger }));
    logger.info({ logLevel: llmConfig.logLevel }, 'LLM API proxy gateway mounted');

    app.get('/logs/llm-calls', (c) => {
      const { provider, model, outcome, agentId, since, until } = c.req.query();
      let events = llmRingBuffer.toArray();

      if (provider) events = events.filter((e) => e.provider === provider);
      if (model) events = events.filter((e) => e.model === model);
      if (outcome) events = events.filter((e) => e.outcome === outcome);
      if (agentId) events = events.filter((e) => e.agentId.includes(agentId));
      if (since) {
        const ts = parseInt(since, 10);
        if (!isNaN(ts)) events = events.filter((e) => e.timestamp >= ts);
      }
      if (until) {
        const ts = parseInt(until, 10);
        if (!isNaN(ts)) events = events.filter((e) => e.timestamp <= ts);
      }

      return c.json(events);
    });

    // Unified timeline: merges tool calls + LLM calls sorted by timestamp.
    // Supports ?agentId=, ?since=, ?until= filters.
    app.get('/logs/timeline', (c) => {
      const { agentId, since, until } = c.req.query();
      const sinceTs = since ? parseInt(since, 10) : NaN;
      const untilTs = until ? parseInt(until, 10) : NaN;

      const toolEvents = ringBuffer.toArray()
        .filter((e) => !agentId || e.agentId.includes(agentId))
        .filter((e) => isNaN(sinceTs) || e.timestamp >= sinceTs)
        .filter((e) => isNaN(untilTs) || e.timestamp <= untilTs)
        .map((e) => ({ kind: 'tool' as const, timestamp: e.timestamp, data: e }));

      const llmEvents = llmRingBuffer.toArray()
        .filter((e) => !agentId || e.agentId.includes(agentId))
        .filter((e) => isNaN(sinceTs) || e.timestamp >= sinceTs)
        .filter((e) => isNaN(untilTs) || e.timestamp <= untilTs)
        .map((e) => ({ kind: 'llm' as const, timestamp: e.timestamp, data: e }));

      const merged = [...toolEvents, ...llmEvents].sort((a, b) => b.timestamp - a.timestamp);
      return c.json(merged);
    });
  }

  // ─── Status summary (D-026) ───────────────────────────────────────────────────
  app.get('/status', (c) => {
    const sessions = listSessions();
    const events = ringBuffer.toArray();
    const schemas = listStoredSchemas();
    // Count critical/high findings across all registered servers as the threat signal
    const threatCount = schemas.reduce(
      (n, s) => n + s.findings.filter((f) => f.severity === 'critical' || f.severity === 'high').length,
      0,
    );
    // Include MCP servers discovered from Claude Code config (not just proxied servers)
    const discoveredServers = discoverMcpServers();
    return c.json({
      status: 'ok',
      sessions: { total: sessions.length, active: sessions.filter((s) => s.active).length },
      toolCalls: { total: events.length },
      threats: { total: threatCount },
      servers: { total: Math.max(schemas.length, discoveredServers.length) },
    });
  });

  // ─── Scan results (for dashboard) ─────────────────────────────────────────────
  // Returns findings from all registered MCP servers — used by the dashboard UI
  // to display the scan findings panel without re-triggering a scan.
  app.get('/scan/results', (c) => {
    // Return all scan results including failed/quarantined servers so the dashboard
    // can show warnings for servers whose scans did not pass.
    return c.json(listAllScanResults());
  });

  // ─── Route modules ────────────────────────────────────────────────────────────
  app.route('/', policyRoutes({ policyEngine, policyStore, bus, logger }));
  app.route('/', sessionRoutes({ bus, config, logger }));
  app.route('/', scanRoutes({ bus, config, logger }));
  app.route('/', logRoutes({ ringBuffer, hookEventBuffer }));
  app.route('/', hookRoutes({ policyEngine, policyStore, approvalQueue, correlator, ringBuffer, hookEventBuffer, bus, config, logger }));
  app.route('/', toolCallRoutes({ policyEngine, policyStore, loopDetector, rateLimiter, approvalQueue, ringBuffer, bus, config, logger }));

  return {
    start: async () => {
      // Reload persisted events into the ring buffer before accepting requests
      const [loaded, hookLoaded] = await Promise.all([
        ringBuffer.load(),
        hookEventBuffer.load(),
      ]);
      if (loaded > 0) {
        logger.info({ events: loaded, file: eventsLogPath }, 'Reloaded persisted tool call events');
      }
      if (hookLoaded > 0) {
        logger.info({ events: hookLoaded, file: hookEventsLogPath }, 'Reloaded persisted hook events');
      }

      // Periodic cleanup of expired correlation entries (every 60s)
      const correlatorCleanup = setInterval(() => correlator.cleanup(), 60_000);

      const server = serve({ fetch: app.fetch, port: config.port });
      // Clean up intervals and queues when server closes to prevent leaks in tests
      server.on('close', () => {
        clearInterval(correlatorCleanup);
        approvalQueue.destroy();
      });
      logger.info(
        { port: config.port, upstreamMcpUrl: config.upstreamMcpUrl },
        'Rind proxy started',
      );
      return server;
    },
    app,
    logger,
    policyStore, // exposed for Phase 2 API mutations
  };
}
