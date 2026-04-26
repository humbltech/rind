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
import type { ProxyConfig, ToolCallEvent, AuditEntry, PolicyRule } from './types.js';
import { runFullScan, listStoredSchemas } from './scanner/index.js';
import { intercept } from './interceptor.js';
import { PolicyEngine } from './policy/engine.js';
import { InMemoryPolicyStore } from './policy/store.js';
import { loadPolicyFile, emptyPolicyConfig } from './policy/loader.js';
import { createSession, getSession, killSession, listSessions } from './session.js';
import { RindEventBus } from './event-bus.js';
import { RingBuffer } from './ring-buffer.js';
import { PersistentRingBuffer } from './persistent-ring-buffer.js';
import { AuditWriter } from './audit-writer.js';
import { LoopDetector } from './loop-detector.js';
import { RateLimiter } from './rate-limiter.js';
import { listPacks, getPack, expandPackRules, rulesFromPack, recommendPacks } from './policy/packs.js';
import { HookRequestSchema, HookEventSchema, evaluateHook, processHookEvent, deriveToolLabel } from './hooks/claude-code.js';
import type { ProcessedHookEvent, HookEvalOptions, HookEvalResult } from './hooks/claude-code.js';
import { CorrelationTracker } from './hooks/correlator.js';
import { ApprovalQueue } from './approval-queue.js';
import { discoverClaudeCodeContext, discoverMcpServers, resolveSessionName } from './hooks/claude-code-context.js';
import { UpstreamPool } from './transport/pool.js';
import { createUpstreamClient } from './transport/upstream/factory.js';
import { mcpGateway } from './transport/gateway.js';
import { z } from 'zod';

// ─── Inline validation schemas ────────────────────────────────────────────────
// All HTTP request bodies are validated with Zod before use — never rely on
// TypeScript generics alone (they are compile-time only, not runtime validation).

const PolicyRuleSchema: z.ZodType<PolicyRule> = z.object({
  name: z.string(),
  agent: z.string().default('*'),
  enabled: z.boolean().default(true),
  match: z.object({
    tool: z.array(z.string()).optional(),
    toolPattern: z.string().optional(),
    timeWindow: z
      .object({
        daysOfWeek: z.array(z.number().int().min(0).max(6)).optional(),
        hours: z.string().regex(/^\d{2}:\d{2}-\d{2}:\d{2}$/).optional(),
      })
      .optional(),
    parameters: z.record(z.object({
      contains: z.array(z.string()).optional(),
      regex: z.string().optional(),
      startsWith: z.string().optional(),
      gt: z.number().optional(),
      lt: z.number().optional(),
      gte: z.number().optional(),
      lte: z.number().optional(),
      eq: z.unknown().optional(),
      in: z.array(z.unknown()).optional(),
    })).optional(),
    subcommand: z.array(z.string()).optional(),
  }),
  action: z.enum(['ALLOW', 'DENY', 'REQUIRE_APPROVAL', 'RATE_LIMIT']),
  approval: z.object({ timeout: z.string().optional(), onTimeout: z.enum(['DENY', 'ALLOW']).optional() }).optional(),
  costEstimate: z.number().nonnegative().optional(),
  limits: z.object({
    maxCallsPerSession: z.number().int().positive().optional(),
    maxCallsPerHour: z.number().int().positive().optional(),
    maxCostPerSession: z.number().nonnegative().optional(),
    maxCostPerHour: z.number().nonnegative().optional(),
  }).optional(),
  rateLimit: z.object({
    limit: z.number().int().positive(),
    window: z.string().regex(/^\d+(s|m|h|d)$/),
    scope: z.enum(['per_agent', 'per_tool', 'global']),
  }).optional(),
  failMode: z.enum(['closed', 'open']).default('closed'),
  priority: z.number().int().min(0).default(50),
  loop: z.object({
    type: z.enum(['exact', 'consecutive', 'subcommand']),
    threshold: z.number().int().min(2),
    window: z.number().int().min(2).default(30),
  }).optional(),
}) as z.ZodType<PolicyRule>;

const PolicyConfigSchema = z.object({
  policies: z.array(PolicyRuleSchema),
});

const ScanBodySchema = z.object({
  serverId: z.string().min(1),
  tools: z.array(z.unknown()),
});

const CreateSessionBodySchema = z.object({
  agentId: z.string().optional(),
});

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
  const policyStore = new InMemoryPolicyStore(policyConfig, policyPersistPath);
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
  const ringBuffer = new PersistentRingBuffer<ToolCallEvent>({
    capacity: config.ringBufferSize ?? 10_000,
    filePath: eventsLogPath,
    onError: (err) => logger.error({ err }, 'Event log write failed'),
  });
  // Hook events buffer — stores PostToolUse, SubagentStart/Stop for observability
  const hookEventBuffer = new PersistentRingBuffer<ProcessedHookEvent>({
    capacity: config.ringBufferSize ?? 10_000,
    filePath: hookEventsLogPath,
    onError: (err) => logger.error({ err }, 'Hook event log write failed'),
  });

  const auditWriter = new AuditWriter(auditLogPath, (err) => {
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
  if (Object.keys(config.servers ?? {}).length > 0) {
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
    const schemas = listStoredSchemas();
    return c.json(schemas);
  });

  // ─── Policy management (D-021 + D-036) ───────────────────────────────────────

  // List active rules
  app.get('/policies', (c) => c.json({ policies: policyEngine.getRules() }));

  // Add a single rule
  app.post('/policies/rules', async (c) => {
    const body = await c.req.json<unknown>();
    const parsed = PolicyRuleSchema.safeParse(body);
    if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
    try {
      policyStore.addRule(parsed.data);
      emitPolicyAudit(bus, 'rule-added', parsed.data.name);
      return c.json({ added: true, rule: parsed.data }, 201);
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : 'Unknown error' }, 409);
    }
  });

  // Replace a rule by name
  app.put('/policies/rules/:name', async (c) => {
    const { name } = c.req.param();
    const body = await c.req.json<unknown>();
    const parsed = PolicyRuleSchema.safeParse(body);
    if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
    try {
      policyStore.updateRule(name, parsed.data);
      emitPolicyAudit(bus, 'rule-updated', name);
      return c.json({ updated: true, rule: parsed.data });
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : 'Unknown error' }, 404);
    }
  });

  // Toggle a rule's enabled state
  app.patch('/policies/rules/:name/toggle', async (c) => {
    const { name } = c.req.param();
    const rules = policyStore.get().policies;
    const rule = rules.find((r) => r.name === name);
    if (!rule) return c.json({ error: `Rule "${name}" not found` }, 404);
    const updated = { ...rule, enabled: rule.enabled === false ? true : false };
    policyStore.updateRule(name, updated);
    emitPolicyAudit(bus, `rule-${updated.enabled ? 'enabled' : 'disabled'}`, name);
    return c.json({ toggled: true, name, enabled: updated.enabled });
  });

  // Delete a rule by name
  app.delete('/policies/rules/:name', (c) => {
    const { name } = c.req.param();
    const removed = policyStore.removeRule(name);
    if (!removed) return c.json({ error: `Rule "${name}" not found` }, 404);
    emitPolicyAudit(bus, 'rule-removed', name);
    return c.json({ removed: true, name });
  });

  // Replace entire config (for YAML upload or GitOps)
  app.put('/policies', async (c) => {
    const body = await c.req.json<unknown>();
    const parsed = PolicyConfigSchema.safeParse(body);
    if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
    policyStore.update(parsed.data);
    emitPolicyAudit(bus, 'config-replaced', '*');
    return c.json({ replaced: true, ruleCount: parsed.data.policies.length });
  });

  // Dry-run validation (no write)
  app.post('/policies/validate', async (c) => {
    const body = await c.req.json<unknown>();
    const parsed = PolicyConfigSchema.safeParse(body);
    if (!parsed.success) return c.json({ valid: false, error: parsed.error.flatten() }, 400);
    return c.json({ valid: true, ruleCount: parsed.data.policies.length });
  });

  // ─── Policy packs (D-036) ─────────────────────────────────────────────────────

  // List all available packs (with enabled state)
  app.get('/packs', (c) => {
    const activePolicies = policyStore.get().policies;
    const packs = listPacks().map((pack) => {
      const enabledRules = rulesFromPack(activePolicies, pack.id);
      return { ...pack, enabled: enabledRules.length > 0 };
    });
    return c.json(packs);
  });

  // Get a single pack
  app.get('/packs/:packId', (c) => {
    const { packId } = c.req.param();
    const pack = getPack(packId);
    if (!pack) return c.json({ error: `Pack "${packId}" not found` }, 404);
    const activePolicies = policyStore.get().policies;
    return c.json({ ...pack, enabled: rulesFromPack(activePolicies, pack.id).length > 0 });
  });

  // Enable a pack — expands its rules into the active config
  app.post('/packs/:packId/enable', (c) => {
    const { packId } = c.req.param();
    const pack = getPack(packId);
    if (!pack) return c.json({ error: `Pack "${packId}" not found` }, 404);

    const current = policyStore.get();
    const alreadyEnabled = rulesFromPack(current.policies, packId);
    if (alreadyEnabled.length > 0) return c.json({ error: `Pack "${packId}" is already enabled` }, 409);

    const newRules = expandPackRules(pack);
    policyStore.update({ policies: [...current.policies, ...newRules] });
    emitPolicyAudit(bus, 'pack-enabled', packId);
    logger.info({ packId, ruleCount: newRules.length }, 'Policy pack enabled');
    return c.json({ enabled: true, packId, ruleCount: newRules.length }, 201);
  });

  // Disable a pack — removes all its rules from the active config
  app.delete('/packs/:packId', (c) => {
    const { packId } = c.req.param();
    const pack = getPack(packId);
    if (!pack) return c.json({ error: `Pack "${packId}" not found` }, 404);

    const current = policyStore.get();
    const prefix = `pack:${packId}`;
    const next = current.policies.filter(
      (r) => !('_meta' in r && (r as { _meta?: { source?: string } })._meta?.source === prefix),
    );
    if (next.length === current.policies.length) {
      return c.json({ error: `Pack "${packId}" is not enabled` }, 404);
    }
    policyStore.update({ policies: next });
    emitPolicyAudit(bus, 'pack-disabled', packId);
    logger.info({ packId }, 'Policy pack disabled');
    return c.json({ disabled: true, packId });
  });

  // Recommendations: packs relevant to discovered tools
  app.get('/suggestions', (c) => {
    const schemas = listStoredSchemas();
    const toolNames = schemas.flatMap((s) => s.tools.map((t) => t.name));
    const recommendations = recommendPacks(toolNames);
    const activePolicies = policyStore.get().policies;
    return c.json(
      recommendations.map((pack) => ({
        ...pack,
        enabled: rulesFromPack(activePolicies, pack.id).length > 0,
      })),
    );
  });

  // ─── Claude Code PreToolUse hook endpoint (D-040) ────────────────────────────
  // Claude Code fires this before every tool call — built-in (Bash, Write, Edit, …)
  // and MCP tools. The hook blocks execution if Rind returns { continue: false }.
  // This endpoint runs the interceptor in evaluate-only mode (steps 1-5, no forward).
  app.post('/hook/evaluate', async (c) => {
    let raw: unknown;
    try {
      raw = await c.req.json();
    } catch {
      // Malformed JSON from Claude Code's hook runner — deny to fail closed.
      return c.json({ continue: false, stopReason: 'Rind: hook payload is not valid JSON' }, 400);
    }
    const parsed = HookRequestSchema.safeParse(raw);
    if (!parsed.success) {
      return c.json({ continue: false, stopReason: `Rind: invalid hook payload — ${parsed.error.message}` }, 400);
    }

    // Auto-register session on first hook call from a session ID
    const sid = parsed.data.session_id;
    const agentId = parsed.data.agent_id ?? `hook:${sid}`;
    if (!getSession(sid)) {
      createSession(agentId, sid);
    }

    // Hook evaluate is advisory — don't pass loop detector or rate limiter.
    // These are enforcement mechanisms for the MCP proxy path where Rind controls
    // the forward. In hook mode, Claude Code executes the tool — if Rind incorrectly
    // blocks, it breaks the user's workflow. Policy rules still apply (they're explicit
    // user intent); loop/rate detection is Rind's own safety net for proxy-mode only.
    const hookEvalOpts: HookEvalOptions = { sendGuidance: config.hookSendGuidance ?? true };
    let matchedRuleName: string | undefined;
    const evalResult: HookEvalResult = await evaluateHook(parsed.data, {
      policyEngine,
      onToolCallEvent: (event, rule) => {
        matchedRuleName = rule?.name;
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
      onToolResponseEvent: () => {
        // Hook is evaluate-only — no upstream response to emit
      },
      blockOnCriticalResponseThreats: false,
    }, hookEvalOpts);

    const toolLabel = deriveToolLabel(parsed.data.tool_name, parsed.data.tool_input);

    // ── REQUIRE_APPROVAL: hold the HTTP response until human decides ────────
    if (evalResult.interceptorAction === 'REQUIRE_APPROVAL') {
      // Parse timeout from the matched policy rule's approval config
      const matchedRule = policyStore.get().policies.find((r) => r.name === matchedRuleName);
      const timeoutMs = parseApprovalTimeout(matchedRule?.approval?.timeout) ?? 120_000;
      const onTimeout = matchedRule?.approval?.onTimeout ?? 'DENY';

      const { approval, wait } = approvalQueue.enqueue({
        sessionId: sid,
        agentId,
        toolName: parsed.data.tool_name,
        toolLabel,
        input: parsed.data.tool_input,
        reason: `Tool call "${parsed.data.tool_name}" requires human approval.`,
        ruleName: matchedRuleName,
        timeoutMs,
        onTimeout,
      });

      logger.info(
        { approvalId: approval.id, toolName: parsed.data.tool_name, timeoutMs },
        'Approval requested — holding hook response',
      );

      // Store event as pending while we wait
      const correlationId = correlator.recordPreToolUse(sid, parsed.data.tool_name, parsed.data.tool_input);
      const sessionName = resolveSessionName(sid);
      const enrichedEvent: ToolCallEvent = {
        sessionId: sid,
        sessionName,
        agentId,
        serverId: parsed.data.tool_name.startsWith('mcp__') ? parsed.data.tool_name.split('__')[1] || 'mcp-unknown' : 'builtin',
        toolName: parsed.data.tool_name,
        toolLabel,
        input: parsed.data.tool_input,
        timestamp: Date.now(),
        outcome: 'require-approval',
        reason: `Pending approval (${approval.id})`,
        matchedRule: matchedRuleName,
        source: (parsed.data.tool_name.startsWith('mcp__') ? 'mcp' : 'builtin') as 'builtin' | 'mcp',
        cwd: parsed.data.cwd,
        correlationId,
      };
      ringBuffer.push(enrichedEvent);

      // Block here until approved, denied, or timed out
      const result = await wait;

      // Update the event in the ring buffer with the final decision
      const finalOutcome = result.decision === 'approve' ? 'allowed' : 'blocked';
      ringBuffer.update(
        (e) => e.correlationId === correlationId,
        (e) => ({
          ...e,
          outcome: finalOutcome as 'allowed' | 'blocked',
          reason: result.decision === 'approve'
            ? `Approved by ${result.decidedBy ?? 'dashboard'}`
            : result.decision === 'timeout'
              ? `Approval timed out (${onTimeout})`
              : `Denied by ${result.decidedBy ?? 'dashboard'}`,
        }),
      );

      logger.info(
        { approvalId: approval.id, decision: result.decision, toolName: parsed.data.tool_name },
        'Approval resolved',
      );

      // Translate decision to hook response
      const shouldAllow = result.decision === 'approve'
        || (result.decision === 'timeout' && onTimeout === 'ALLOW');

      if (shouldAllow) {
        return c.json({
          hookSpecificOutput: {
            hookEventName: 'PreToolUse',
            permissionDecision: 'allow',
            additionalContext: `Approved by ${result.decidedBy ?? 'dashboard'}.`,
          },
        });
      }

      const denyReason = result.decision === 'timeout'
        ? `Approval timed out after ${Math.round(timeoutMs / 1000)}s — action denied.`
        : `Action denied by ${result.decidedBy ?? 'dashboard'}.`;
      return c.json({
        continue: false,
        stopReason: denyReason,
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'deny',
          permissionDecisionReason: denyReason,
        },
      });
    }

    // ── Normal allow/deny flow ────────────────────────────────────────────────
    const hookResponse = evalResult.response;
    const isDenied = 'continue' in hookResponse;
    const decision = isDenied ? 'deny' : 'allow';
    const correlationId = correlator.recordPreToolUse(sid, parsed.data.tool_name, parsed.data.tool_input);
    const sessionName = resolveSessionName(sid);
    const enrichedEvent: ToolCallEvent = {
      sessionId: sid,
      sessionName,
      agentId,
      serverId: parsed.data.tool_name.startsWith('mcp__') ? parsed.data.tool_name.split('__')[1] || 'mcp-unknown' : 'builtin',
      toolName: parsed.data.tool_name,
      toolLabel,
      input: parsed.data.tool_input,
      timestamp: Date.now(),
      outcome: (isDenied ? 'blocked' : 'allowed') as 'allowed' | 'blocked',
      reason: isDenied ? (hookResponse as { stopReason: string }).stopReason : undefined,
      matchedRule: matchedRuleName,
      source: (parsed.data.tool_name.startsWith('mcp__') ? 'mcp' : 'builtin') as 'builtin' | 'mcp',
      cwd: parsed.data.cwd,
      correlationId,
    };
    ringBuffer.push(enrichedEvent);

    logger.info(
      { toolName: parsed.data.tool_name, decision },
      'Hook evaluation complete',
    );

    return c.json(hookResponse);
  });

  // ─── Hook event ingestion (Phase 1: PostToolUse, SubagentStart/Stop) ────────
  // Non-blocking observability endpoint. Accepts any hook event, stores it,
  // returns 200 immediately. No policy decision — purely for audit/display.
  app.post('/hook/event', async (c) => {
    let raw: unknown;
    try {
      raw = await c.req.json();
    } catch {
      return c.json({ error: 'Invalid JSON' }, 400);
    }
    const parsed = HookEventSchema.safeParse(raw);
    if (!parsed.success) {
      return c.json({ error: `Invalid hook event: ${parsed.error.message}` }, 400);
    }

    const event = processHookEvent(parsed.data);

    // Match PostToolUse to its PreToolUse via correlation tracker and enrich the
    // original ToolCallEvent in the ring buffer with response data (server-side join).
    if (event.eventType === 'PostToolUse' && parsed.data.tool_name) {
      const correlationId = correlator.matchPostToolUse(
        parsed.data.session_id,
        parsed.data.tool_name,
        parsed.data.tool_input,
      );
      event.correlationId = correlationId;

      // Enrich the matching PreToolUse event in the ring buffer
      if (correlationId) {
        ringBuffer.update(
          (e) => e.correlationId === correlationId,
          (e) => ({
            ...e,
            response: {
              outputPreview: event.outputPreview,
              outputTruncated: event.outputTruncated,
              outputSizeBytes: event.outputSizeBytes,
              outputHash: event.outputHash,
              threats: event.threats,
              timestamp: event.timestamp,
            },
          }),
        );
      }
    }

    hookEventBuffer.push(event);

    // Auto-register session
    const sid = parsed.data.session_id;
    const agentId = parsed.data.agent_id ?? `hook:${sid}`;
    if (!getSession(sid)) {
      createSession(agentId, sid);
    }

    logger.info(
      { eventType: event.eventType, agentId: event.agentId, toolName: event.toolName },
      'Hook event received',
    );

    return c.json({ ok: true });
  });

  // Hook events query endpoint — dashboard reads subagent lifecycle + tool responses
  app.get('/logs/hook-events', (c) => {
    const { session_id, event_type, agent_id } = c.req.query();
    let events = hookEventBuffer.toArray();

    if (session_id) events = events.filter((e) => e.sessionId === session_id);
    if (event_type) events = events.filter((e) => e.eventType === event_type);
    if (agent_id) events = events.filter((e) => e.agentId === agent_id);

    return c.json(events);
  });

  // ─── Approval management (D-013) ──────────────────────────────────────────
  // Dashboard polls this to show pending approvals and resolve them.

  app.get('/approvals', (c) => {
    return c.json(approvalQueue.list());
  });

  app.post('/approvals/:id/approve', (c) => {
    const { id } = c.req.param();
    const found = approvalQueue.approve(id, 'dashboard');
    if (!found) return c.json({ error: `Approval "${id}" not found or already resolved` }, 404);
    logger.info({ approvalId: id }, 'Approval granted via dashboard');
    return c.json({ approved: true, id });
  });

  app.post('/approvals/:id/deny', (c) => {
    const { id } = c.req.param();
    const found = approvalQueue.deny(id, 'dashboard');
    if (!found) return c.json({ error: `Approval "${id}" not found or already resolved` }, 404);
    logger.info({ approvalId: id }, 'Approval denied via dashboard');
    return c.json({ denied: true, id });
  });

  // ─── Claude Code context discovery ──────────────────────────────────────────
  // Returns MCP servers registered in Claude Code and active session metadata.
  // Dashboard polls this to show server protection states and session names.
  app.get('/hook/context', (c) => {
    const context = discoverClaudeCodeContext();

    // Enrich with protection state: which MCP servers are also going through the proxy?
    const proxiedServerIds = new Set(Object.keys(config.servers ?? {}));
    // Which MCP servers have been seen via hooks (mcp__server__tool pattern)?
    const observedServerIds = new Set<string>();
    for (const event of ringBuffer.toArray()) {
      if (event.source === 'mcp' && event.serverId !== 'builtin') {
        observedServerIds.add(event.serverId);
      }
    }

    const enrichedServers = context.mcpServers.map((server) => {
      // Protection state: proxied > observed > registered
      const protectionState = proxiedServerIds.has(server.id)
        ? 'proxied' as const
        : observedServerIds.has(server.id)
          ? 'observed' as const
          : 'registered' as const;

      // Connection status upgrade: if we've seen tool calls, it's connected
      const connectionStatus = observedServerIds.has(server.id)
        ? 'connected' as const
        : server.connectionStatus;

      return { ...server, protectionState, connectionStatus };
    });

    return c.json({
      mcpServers: enrichedServers,
      activeSessions: context.activeSessions,
    });
  });

  // Session name lookup — returns the human-readable name for a session ID
  app.get('/hook/session-name/:sessionId', (c) => {
    const name = resolveSessionName(c.req.param('sessionId'));
    return c.json({ name: name ?? null });
  });

  // ─── Session management ────────────────────────────────────────────────────────
  app.post('/sessions', async (c) => {
    const parsed = CreateSessionBodySchema.safeParse(await c.req.json());
    if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
    const session = createSession(parsed.data.agentId ?? config.agentId);
    logger.info({ sessionId: session.sessionId, agentId: session.agentId }, 'Session created');
    bus.emit('session:created', session);
    emitAudit(bus, {
      eventType: 'session:created',
      sessionId: session.sessionId,
      agentId: session.agentId,
      serverId: '',
      action: 'ALLOW',
    }, config);
    return c.json(session, 201);
  });

  app.get('/sessions', (c) => c.json(listSessions()));

  app.delete('/sessions/:sessionId', (c) => {
    const { sessionId } = c.req.param();
    const sessions = listSessions();
    const session = sessions.find((s) => s.sessionId === sessionId);
    const killed = killSession(sessionId);
    if (!killed) return c.json({ error: 'Session not found' }, 404);
    logger.warn({ sessionId }, 'Session killed via kill-switch');
    bus.emit('session:killed', { sessionId, agentId: session?.agentId ?? 'unknown' });
    emitAudit(bus, {
      eventType: 'session:killed',
      sessionId,
      agentId: session?.agentId ?? 'unknown',
      serverId: '',
      action: 'ALLOW',
    }, config);
    return c.json({ killed: true, sessionId });
  });

  // ─── Scan-on-connect ──────────────────────────────────────────────────────────
  app.post('/scan', async (c) => {
    const parsed = ScanBodySchema.safeParse(await c.req.json());
    if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
    const { serverId, tools } = parsed.data;
    logger.info({ serverId }, 'Scan-on-connect triggered');

    const result = runFullScan(serverId, tools as Parameters<typeof runFullScan>[1]);

    const level = result.passed ? 'info' : 'warn';
    logger[level](
      { serverId, findingCount: result.findings.length, passed: result.passed },
      'Scan complete',
    );

    bus.emit('scan:complete', result);
    emitAudit(bus, {
      eventType: 'scan:complete',
      sessionId: '',
      agentId: '',
      serverId,
      action: result.passed ? 'ALLOW' : 'DENY',
    }, config);

    return c.json(result);
  });

  // ─── Continuous re-scan (D-030) ───────────────────────────────────────────────
  // Trigger a re-scan of an already-registered server — detects schema mutations
  // mid-session (rug pull detection). Schema drift logic is in runFullScan():
  // if serverId is already in the schema store, it compares against the baseline.
  app.post('/scan/refresh', async (c) => {
    const parsed = ScanBodySchema.safeParse(await c.req.json());
    if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
    const { serverId, tools } = parsed.data;
    logger.info({ serverId }, 'Re-scan triggered (rug pull detection)');

    const result = runFullScan(serverId, tools as Parameters<typeof runFullScan>[1]);

    const level = result.passed ? 'info' : 'warn';
    logger[level](
      { serverId, findingCount: result.findings.length, passed: result.passed },
      'Re-scan complete',
    );

    bus.emit('scan:complete', result);
    emitAudit(bus, {
      eventType: 'scan:complete',
      sessionId: '',
      agentId: '',
      serverId,
      action: result.passed ? 'ALLOW' : 'DENY',
    }, config);

    return c.json(result);
  });

  // ─── Tool call proxy ──────────────────────────────────────────────────────────
  app.post('/proxy/tool-call', async (c) => {
    const body = await c.req.json<Omit<ToolCallEvent, 'timestamp'> & { sessionId?: string }>();

    const callId = randomUUID();
    const event: ToolCallEvent = {
      sessionId: body.sessionId ?? randomUUID(),
      agentId: body.agentId ?? config.agentId,
      serverId: body.serverId,
      toolName: body.toolName,
      input: body.input,
      timestamp: Date.now(),
      correlationId: callId,
    };

    // D-022: upstream timeout support
    const timeoutMs = config.upstreamTimeoutMs ?? 30_000;

    // Use injected forwardFn if provided (simulation/test), otherwise fetch upstream
    const forwardFn = config.forwardFn
      ? async (e: typeof event) => config.forwardFn!(e.toolName, e.input)
      : async (e: typeof event) => {
          const start = Date.now();
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), timeoutMs);
          try {
            const response = await fetch(`${config.upstreamMcpUrl}/tool-call`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ toolName: e.toolName, input: e.input }),
              signal: controller.signal,
            });
            const upstreamOutput = (await response.json()) as unknown;
            return { output: upstreamOutput, durationMs: Date.now() - start };
          } finally {
            clearTimeout(timeout);
          }
        };

    const callStart = Date.now();
    let interceptResult: Awaited<ReturnType<typeof intercept>>;
    try {
      interceptResult = await intercept(event, forwardFn, {
        policyEngine,
        loopDetector,
        rateLimiter,
        onToolCallEvent: (e, matchedRule) => {
          bus.emit('tool:call', e);
          logger.info(
            { sessionId: e.sessionId, agentId: e.agentId, toolName: e.toolName },
            'Tool call',
          );
          emitAudit(bus, {
            eventType: 'tool:call',
            sessionId: e.sessionId,
            agentId: e.agentId,
            serverId: e.serverId,
            action: 'ALLOW',
            toolName: e.toolName,
            policyRule: matchedRule?.name,
            input: e.input,
          }, config);
        },
        onToolResponseEvent: (e) => {
          bus.emit('tool:response', e);
          ringBuffer.update(
            (entry) => entry.correlationId === callId,
            (entry) => ({ ...entry, source: entry.source ?? ('mcp' as const) }),
          );
          if (e.threats.length > 0) {
            bus.emit('tool:threat', e);
            logger.warn(
              { sessionId: e.sessionId, toolName: e.toolName, threatCount: e.threats.length },
              'Response threats detected',
            );
            emitAudit(bus, {
              eventType: 'tool:threat',
              sessionId: e.sessionId,
              agentId: e.agentId,
              serverId: e.serverId,
              action: 'ALLOW',
              toolName: e.toolName,
              threats: e.threats,
              ...(config.auditIncludeOutput ? { output: e.output } : {}),
            }, config);
          } else {
            logger.debug(
              { sessionId: e.sessionId, toolName: e.toolName, durationMs: e.durationMs },
              'Tool response clean',
            );
          }
        },
        blockOnCriticalResponseThreats: true,
      });
    } catch (err) {
      // Upstream unreachable or timed out (D-022)
      const isTimeout = err instanceof Error && err.name === 'AbortError';
      const errorKind = isTimeout ? 'upstream-timeout' as const : 'upstream-unreachable' as const;
      const outcome = isTimeout ? 'upstream-timeout' as const : 'upstream-error' as const;
      const durationMs = Date.now() - callStart;

      bus.emit('tool:error', {
        sessionId: event.sessionId,
        agentId: event.agentId,
        serverId: event.serverId,
        toolName: event.toolName,
        errorKind,
        durationMs,
      });

      ringBuffer.update(
        (e) => e.correlationId === callId,
        (e) => ({ ...e, outcome, source: 'proxy' as const }),
      );

      logger.error({ err, toolName: event.toolName, durationMs }, isTimeout ? 'Upstream timeout' : 'Upstream error');
      return c.json(
        {
          content: [{ type: 'text', text: isTimeout
            ? `MCP server timed out: ${event.toolName}`
            : `MCP server unavailable: ${event.toolName}` }],
          isError: true,
        },
        200,
      );
    }

    const { output, interceptorResult } = interceptResult;
    const blocked = interceptorResult.action !== 'ALLOW' && interceptorResult.action !== 'RATE_LIMIT';

    if (blocked || interceptorResult.action === 'RATE_LIMIT') {
      logger.warn(
        { action: interceptorResult.action, reason: interceptorResult.reason, toolName: event.toolName },
        'Tool call blocked',
      );
      bus.emit('tool:blocked', {
        event,
        action: interceptorResult.action,
        reason: interceptorResult.reason,
      });
      // Enrich the event already in the ring buffer with block details.
      // The raw event was pushed by the onToolCallEvent callback before policy evaluation;
      // now we backfill outcome/rule/reason so the dashboard shows the block.
      const updated = ringBuffer.update(
        (e) => e.correlationId === callId,
        (e) => ({
          ...e,
          outcome: 'blocked' as const,
          matchedRule: interceptorResult.matchedRule,
          reason: interceptorResult.reason,
          source: 'mcp' as const,
        }),
      );
      logger.debug({ updated, bufferLen: ringBuffer.length }, 'Ring buffer enrichment for blocked call');
      emitAudit(bus, {
        eventType: 'tool:blocked',
        sessionId: event.sessionId,
        agentId: event.agentId,
        serverId: event.serverId,
        action: interceptorResult.action,
        toolName: event.toolName,
        reason: interceptorResult.reason,
        input: event.input,
      }, config);

      const responseBody: Record<string, unknown> = {
        blocked: true,
        action: interceptorResult.action,
        reason: interceptorResult.reason,
        outcome: 'blocked',
        rule: interceptorResult.matchedRule,
      };
      // D-013: enriched REQUIRE_APPROVAL response
      if (interceptorResult.approvalRequired) {
        responseBody['approvalRequired'] = true;
        responseBody['callbackUrl'] = null;
        responseBody['inputSummary'] = interceptorResult.inputSummary;
      }
      // D-017: rate limit metadata
      if (interceptorResult.rateLimitResetMs !== undefined) {
        responseBody['rateLimitResetMs'] = interceptorResult.rateLimitResetMs;
        responseBody['rateLimitRemaining'] = interceptorResult.rateLimitRemaining;
      }
      // D-014: cost limit metadata
      if (interceptorResult.limitType) {
        responseBody['limitType'] = interceptorResult.limitType;
      }

      return c.json(responseBody, 403);
    }

    // Enrich the ring buffer event with allowed outcome so dashboard shows status
    ringBuffer.update(
      (e) => e.correlationId === callId,
      (e) => ({ ...e, outcome: 'allowed' as const, source: 'mcp' as const }),
    );

    return c.json({ blocked: false, output, outcome: 'allowed' });
  });

  // ─── Log access ───────────────────────────────────────────────────────────────
  app.get('/logs/tool-calls', (c) => {
    const { agentId, toolName, since, until } = c.req.query();
    let events = ringBuffer.toArray();

    if (agentId) events = events.filter((e) => e.agentId === agentId);
    if (toolName) events = events.filter((e) => e.toolName === toolName);
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

// ─── Audit helpers ────────────────────────────────────────────────────────────

function emitAudit(
  bus: RindEventBus,
  fields: Omit<AuditEntry, 'timestamp'>,
  config: ProxyConfig,
): void {
  bus.emit('audit', {
    timestamp: new Date().toISOString(),
    ...fields,
  } as AuditEntry);
}

/** Parse a human-readable duration string (e.g. "30s", "2m", "5m") into milliseconds. */
function parseApprovalTimeout(timeout?: string): number | undefined {
  if (!timeout) return undefined;
  const m = timeout.match(/^(\d+)(s|m|h)$/);
  if (!m) return undefined;
  const val = parseInt(m[1]!, 10);
  switch (m[2]) {
    case 's': return val * 1000;
    case 'm': return val * 60_000;
    case 'h': return val * 3_600_000;
    default: return undefined;
  }
}

// Records every policy mutation in the audit trail with its own distinct eventType.
function emitPolicyAudit(
  bus: RindEventBus,
  operation: 'rule-added' | 'rule-updated' | 'rule-removed' | 'rule-enabled' | 'rule-disabled' | 'config-replaced' | 'pack-enabled' | 'pack-disabled',
  target: string,
): void {
  bus.emit('audit', {
    timestamp: new Date().toISOString(),
    eventType: 'policy:mutation',
    sessionId: '',
    agentId: 'rind:policy-api',
    serverId: '',
    action: 'ALLOW',
    reason: `policy:${operation}:${target}`,
  } as AuditEntry);
}
