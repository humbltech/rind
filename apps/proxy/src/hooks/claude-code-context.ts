// Claude Code context discovery — reads MCP servers and session metadata
// from Claude Code's local filesystem. Used by the proxy to show registered
// MCP servers and session names on the dashboard without waiting for tool calls.
//
// Data sources (as of Claude Code April 2026):
//   User MCP servers:    ~/.claude/settings.json → mcpServers
//   Plugin MCP servers:  ~/.claude/plugins/cache/*/[version]/.mcp.json
//   Cloud.ai servers:    ~/.claude/mcp-needs-auth-cache.json (Gmail, Drive, Calendar)
//   Plugin enabled:      ~/.claude/settings.json → enabledPlugins
//   Auth status:         ~/.claude/mcp-needs-auth-cache.json
//   Sessions:            ~/.claude/sessions/{PID}.json → { sessionId, name, cwd }

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

// ─── Types ───────────────────────────────────────────────────────────────────

export type McpConnectionStatus =
  | 'connected'       // Seen active tool calls via hooks
  | 'registered'      // In config, no calls seen yet
  | 'needs-auth'      // In mcp-needs-auth-cache.json
  | 'disabled'        // Plugin exists but not in enabledPlugins
  | 'failed';         // We can't determine this from files alone — only from runtime

export interface DiscoveredMcpServer {
  id: string;
  source: 'user-settings' | 'plugin' | 'cloud-ai';
  transport: 'stdio' | 'http';
  command?: string;
  url?: string;
  pluginName?: string;
  enabled: boolean;
  connectionStatus: McpConnectionStatus;
}

export interface ClaudeSession {
  sessionId: string;
  name?: string;
  cwd?: string;
  pid?: number;
  startedAt?: number;
}

export interface ClaudeCodeContext {
  mcpServers: DiscoveredMcpServer[];
  activeSessions: ClaudeSession[];
}

// ─── Settings reader (cached per call) ───────────────────────────────────────

interface ClaudeSettings {
  mcpServers?: Record<string, Record<string, unknown>>;
  enabledPlugins?: Record<string, boolean>;
}

function readSettings(): ClaudeSettings {
  const settingsPath = join(homedir(), '.claude', 'settings.json');
  try {
    return JSON.parse(readFileSync(settingsPath, 'utf-8'));
  } catch {
    return {};
  }
}

function readAuthCache(): Set<string> {
  const cachePath = join(homedir(), '.claude', 'mcp-needs-auth-cache.json');
  try {
    const raw = JSON.parse(readFileSync(cachePath, 'utf-8'));
    // Keys are server names like "claude.ai Google Drive"
    return new Set(Object.keys(raw));
  } catch {
    return new Set();
  }
}

// ─── MCP Server Discovery ────────────────────────────────────────────────────

function discoverMcpServersFromSettings(settings: ClaudeSettings): DiscoveredMcpServer[] {
  const mcpServers = settings.mcpServers;
  if (!mcpServers || typeof mcpServers !== 'object') return [];

  return Object.entries(mcpServers).map(([id, cfg]) => {
    const isHttp = cfg.type === 'http' || typeof cfg.url === 'string';
    return {
      id,
      source: 'user-settings' as const,
      transport: isHttp ? 'http' as const : 'stdio' as const,
      command: typeof cfg.command === 'string' ? cfg.command : undefined,
      url: typeof cfg.url === 'string' ? cfg.url : undefined,
      enabled: true, // User-configured servers are always enabled
      connectionStatus: 'registered' as McpConnectionStatus,
    };
  });
}

function discoverMcpServersFromPlugins(enabledPlugins: Record<string, boolean>): DiscoveredMcpServer[] {
  const pluginsDir = join(homedir(), '.claude', 'plugins', 'cache', 'claude-plugins-official');
  const servers: DiscoveredMcpServer[] = [];

  try {
    const pluginDirs = readdirSync(pluginsDir, { withFileTypes: true })
      .filter((d) => d.isDirectory());

    for (const pluginDir of pluginDirs) {
      const pluginName = pluginDir.name;
      const pluginKey = `${pluginName}@claude-plugins-official`;
      const isEnabled = enabledPlugins[pluginKey] === true;

      try {
        const versionDirs = readdirSync(join(pluginsDir, pluginName), { withFileTypes: true })
          .filter((d) => d.isDirectory());

        for (const versionDir of versionDirs) {
          const mcpPath = join(pluginsDir, pluginName, versionDir.name, '.mcp.json');
          try {
            const raw = JSON.parse(readFileSync(mcpPath, 'utf-8'));
            const entries = extractMcpEntries(raw);

            for (const [id, cfg] of entries) {
              const isHttp = cfg.type === 'http' || typeof cfg.url === 'string';
              servers.push({
                id,
                source: 'plugin',
                transport: isHttp ? 'http' : 'stdio',
                command: typeof cfg.command === 'string' ? cfg.command : undefined,
                url: typeof cfg.url === 'string' ? cfg.url : undefined,
                pluginName,
                enabled: isEnabled,
                connectionStatus: isEnabled ? 'registered' : 'disabled',
              });
            }
          } catch {
            // No .mcp.json in this version — skip
          }
        }
      } catch {
        // Can't read plugin dir — skip
      }
    }
  } catch {
    // Plugins dir doesn't exist — skip
  }

  return servers;
}

// Handle different .mcp.json formats:
//   Format 1: { "serverId": { "command": "...", ... } }          — github, playwright, supabase
//   Format 2: { "mcpServers": { "serverId": { ... } } }         — stripe (wrapped)
function extractMcpEntries(raw: Record<string, unknown>): Array<[string, Record<string, unknown>]> {
  // Check for wrapped format: { "mcpServers": { ... } }
  if ('mcpServers' in raw && typeof raw.mcpServers === 'object' && raw.mcpServers !== null) {
    return Object.entries(raw.mcpServers as Record<string, unknown>)
      .filter(([, v]) => typeof v === 'object' && v !== null)
      .map(([k, v]) => [k, v as Record<string, unknown>]);
  }

  // Direct format: each key is a server ID
  return Object.entries(raw)
    .filter(([, v]) => typeof v === 'object' && v !== null)
    .map(([k, v]) => [k, v as Record<string, unknown>]);
}

// Cloud.ai MCP servers — these are built-in to Claude Code and tracked
// in the auth cache when they need authentication
function discoverCloudAiServers(authCache: Set<string>): DiscoveredMcpServer[] {
  const cloudAiServers: DiscoveredMcpServer[] = [];

  // Known cloud.ai MCP server mappings
  const knownCloudAi: Array<{ cacheKey: string; id: string }> = [
    { cacheKey: 'claude.ai Google Drive', id: 'google-drive' },
    { cacheKey: 'claude.ai Gmail', id: 'gmail' },
    { cacheKey: 'claude.ai Google Calendar', id: 'google-calendar' },
  ];

  for (const { cacheKey, id } of knownCloudAi) {
    if (authCache.has(cacheKey)) {
      cloudAiServers.push({
        id,
        source: 'cloud-ai',
        transport: 'http',
        url: 'claude.ai',
        enabled: true,
        connectionStatus: 'needs-auth',
      });
    }
  }

  return cloudAiServers;
}

export function discoverMcpServers(): DiscoveredMcpServer[] {
  const settings = readSettings();
  const authCache = readAuthCache();
  const enabledPlugins = settings.enabledPlugins ?? {};

  const fromSettings = discoverMcpServersFromSettings(settings);
  const fromPlugins = discoverMcpServersFromPlugins(enabledPlugins);
  const fromCloudAi = discoverCloudAiServers(authCache);

  // Merge — dedupe by id, settings > plugins > cloud-ai
  const seen = new Set<string>();
  const all: DiscoveredMcpServer[] = [];

  for (const server of [...fromSettings, ...fromPlugins, ...fromCloudAi]) {
    if (seen.has(server.id)) continue;
    seen.add(server.id);

    // Apply auth cache status: if server name appears in auth cache, mark needs-auth
    // (overrides 'registered' for plugin servers that need authentication)
    if (authCache.has(server.id) || authCache.has(`claude.ai ${server.id}`)) {
      server.connectionStatus = 'needs-auth';
    }

    all.push(server);
  }

  return all;
}

// ─── Session Discovery ───────────────────────────────────────────────────────

export function discoverActiveSessions(): ClaudeSession[] {
  const sessionsDir = join(homedir(), '.claude', 'sessions');
  const sessions: ClaudeSession[] = [];

  try {
    const files = readdirSync(sessionsDir)
      .filter((f) => f.endsWith('.json'));

    for (const file of files) {
      try {
        const raw = JSON.parse(readFileSync(join(sessionsDir, file), 'utf-8'));
        if (raw.sessionId) {
          sessions.push({
            sessionId: raw.sessionId,
            name: typeof raw.name === 'string' ? raw.name : undefined,
            cwd: typeof raw.cwd === 'string' ? raw.cwd : undefined,
            pid: typeof raw.pid === 'number' ? raw.pid : undefined,
            startedAt: typeof raw.startedAt === 'number' ? raw.startedAt : undefined,
          });
        }
      } catch {
        // Corrupt or locked file — skip
      }
    }
  } catch {
    // Sessions dir doesn't exist — skip
  }

  return sessions;
}

// Look up a session name by session ID from Claude Code's runtime files
export function resolveSessionName(sessionId: string): string | undefined {
  const sessions = discoverActiveSessions();
  return sessions.find((s) => s.sessionId === sessionId)?.name;
}

// ─── Full context snapshot ───────────────────────────────────────────────────

export function discoverClaudeCodeContext(): ClaudeCodeContext {
  return {
    mcpServers: discoverMcpServers(),
    activeSessions: discoverActiveSessions(),
  };
}
