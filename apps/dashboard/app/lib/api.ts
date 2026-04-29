// Typed API client for the Rind proxy server.
// All fetch('/api/proxy/*') calls go through here — one place for endpoint URLs and response types.

import type { ToolCallEvent, LlmCallEvent, ScanFinding, ScanResult, Session, PolicyRule, PolicyPack, PolicyRuleWithMeta } from '@rind/core';

// ─── Re-export shared types ───────────────────────────────────────────────────
// Components import from here rather than declaring duplicate interfaces.

export type { ToolCallEvent, LlmCallEvent, ScanFinding, PolicyRule, PolicyRuleWithMeta, PolicyPack };
export type { Session };

// ─── API-specific response types ─────────────────────────────────────────────
// These are shapes returned by the proxy API that don't have a @rind/core equivalent.

/** /status response */
export interface ProxyStatus {
  status: string;
  sessions: { total: number; active: number };
  toolCalls: { total: number };
  threats: { total: number };
  servers: { total: number };
}

/** Scan result enriched with the tools array (ScanResult + tools from /scan/results) */
export interface ServerScanResult extends ScanResult {
  tools: Array<{ name: string; description: string }>;
}

/** MCP server info from /hook/context */
export type McpConnectionStatus = 'connected' | 'registered' | 'needs-auth' | 'disabled' | 'failed';
export type McpProtectionState = 'proxied' | 'observed' | 'registered';

export interface McpServerInfo {
  id: string;
  name: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  connectionStatus: McpConnectionStatus;
  protectionState?: McpProtectionState;
  transport?: string;
}

export interface ClaudeSession {
  sessionId: string;
  name?: string;
  cwd?: string;
  pid?: number;
  startedAt?: number;
}

export interface HookContext {
  mcpServers: McpServerInfo[];
  activeSessions: ClaudeSession[];
}

/** Pending approval item from /approvals */
export interface PendingApproval {
  id: string;
  sessionId: string;
  agentId: string;
  toolName: string;
  toolLabel?: string;
  input: unknown;
  reason: string;
  ruleName?: string;
  createdAt: number;
  timeoutMs: number;
  onTimeout: 'DENY' | 'ALLOW';
}

/** Pack with runtime enabled state */
export type PackWithState = PolicyPack & { enabled: boolean };

/** Timeline event from /logs/timeline */
export type TimelineEvent =
  | { kind: 'tool'; timestamp: number; data: ToolCallEvent }
  | { kind: 'llm'; timestamp: number; data: LlmCallEvent };

// ─── API client functions ─────────────────────────────────────────────────────

const BASE = '/api/proxy';

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`GET ${path} failed: ${res.status}`);
  return res.json() as Promise<T>;
}

async function post<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`POST ${path} failed: ${res.status}`);
  return res.json() as Promise<T>;
}

async function put<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`PUT ${path} failed: ${res.status}`);
  return res.json() as Promise<T>;
}

async function patch<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'PATCH',
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`PATCH ${path} failed: ${res.status}`);
  return res.json() as Promise<T>;
}

async function del<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`DELETE ${path} failed: ${res.status}`);
  return res.json() as Promise<T>;
}

// ─── Status ───────────────────────────────────────────────────────────────────
export const getStatus = () => get<ProxyStatus>('/status');

// ─── Tool call logs ───────────────────────────────────────────────────────────
export const getToolCalls = (params?: { agentId?: string; toolName?: string; since?: number; until?: number }) => {
  const q = new URLSearchParams();
  if (params?.agentId) q.set('agentId', params.agentId);
  if (params?.toolName) q.set('toolName', params.toolName);
  if (params?.since) q.set('since', String(params.since));
  if (params?.until) q.set('until', String(params.until));
  const qs = q.toString();
  return get<ToolCallEvent[]>(`/logs/tool-calls${qs ? `?${qs}` : ''}`);
};

// ─── LLM call logs ────────────────────────────────────────────────────────────
export const getLlmCalls = (params?: { provider?: string; model?: string; outcome?: string; agentId?: string; since?: number; until?: number }) => {
  const q = new URLSearchParams();
  if (params?.provider) q.set('provider', params.provider);
  if (params?.model) q.set('model', params.model);
  if (params?.outcome) q.set('outcome', params.outcome);
  if (params?.agentId) q.set('agentId', params.agentId);
  if (params?.since) q.set('since', String(params.since));
  if (params?.until) q.set('until', String(params.until));
  const qs = q.toString();
  return get<LlmCallEvent[]>(`/logs/llm-calls${qs ? `?${qs}` : ''}`);
};

// ─── Timeline ─────────────────────────────────────────────────────────────────
export const getTimeline = (params?: { agentId?: string; since?: number; until?: number }) => {
  const q = new URLSearchParams();
  if (params?.agentId) q.set('agentId', params.agentId);
  if (params?.since) q.set('since', String(params.since));
  if (params?.until) q.set('until', String(params.until));
  const qs = q.toString();
  return get<TimelineEvent[]>(`/logs/timeline${qs ? `?${qs}` : ''}`);
};

// ─── Hook events ──────────────────────────────────────────────────────────────
export const getHookEvents = (params?: { session_id?: string; event_type?: string; agent_id?: string }) => {
  const q = new URLSearchParams();
  if (params?.session_id) q.set('session_id', params.session_id);
  if (params?.event_type) q.set('event_type', params.event_type);
  if (params?.agent_id) q.set('agent_id', params.agent_id);
  const qs = q.toString();
  return get<unknown[]>(`/logs/hook-events${qs ? `?${qs}` : ''}`);
};

// ─── Scan results ─────────────────────────────────────────────────────────────
export const getScanResults = () => get<ServerScanResult[]>('/scan/results');

// ─── Hook context ─────────────────────────────────────────────────────────────
export const getHookContext = () => get<HookContext>('/hook/context');

// ─── Sessions ────────────────────────────────────────────────────────────────
export const getSessions = () => get<Session[]>('/sessions');

// ─── Policies ────────────────────────────────────────────────────────────────
export const getPolicies = () => get<{ policies: PolicyRule[] }>('/policies');
export const addRule = (rule: PolicyRule) => post<{ added: boolean; rule: PolicyRule }>('/policies/rules', rule);
export const updateRule = (name: string, rule: PolicyRule) => put<{ updated: boolean; rule: PolicyRule }>(`/policies/rules/${encodeURIComponent(name)}`, rule);
export const toggleRule = (name: string) => patch<{ toggled: boolean; name: string; enabled: boolean }>(`/policies/rules/${encodeURIComponent(name)}/toggle`);
export const deleteRule = (name: string) => del<{ removed: boolean; name: string }>(`/policies/rules/${encodeURIComponent(name)}`);
export const replacePolicies = (policies: PolicyRule[]) => put<{ replaced: boolean; ruleCount: number }>('/policies', { policies });

// ─── Packs ───────────────────────────────────────────────────────────────────
export const getPacks = () => get<PackWithState[]>('/packs');
export const getPack = (packId: string) => get<PackWithState>(`/packs/${packId}`);
export const enablePack = (packId: string) => post<{ enabled: boolean; packId: string; ruleCount: number }>(`/packs/${packId}/enable`);
export const disablePack = (packId: string) => del<{ disabled: boolean; packId: string }>(`/packs/${packId}`);

// ─── Approvals ───────────────────────────────────────────────────────────────
export const getApprovals = () => get<PendingApproval[]>('/approvals');
export const approveAction = (id: string) => post<{ approved: boolean; id: string }>(`/approvals/${id}/approve`);
export const denyAction = (id: string) => post<{ denied: boolean; id: string }>(`/approvals/${id}/deny`);
