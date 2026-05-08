// Tool name parsing — single source of truth for mcp__server__tool ↔ (serverId, tool).
//
// Claude Code namespaces MCP tools as `mcp__<server>__<tool>`. The MCP gateway receives
// the raw tool name (`<tool>` only). Both paths must normalize to the same (serverId, tool)
// pair so the merge correlator can join them on a shared key.

export interface NormalizedTool {
	serverId: string;
	tool: string;
}

/**
 * Parse a tool name into (serverId, tool) components.
 *
 * CONTRACT:
 * - Input: toolName (any string), fallbackServerId (optional)
 * - Output: { serverId, tool } — both always non-empty strings
 * - Errors: none — handles all malformed forms gracefully
 * - Side effects: none
 * - Invariants: if toolName starts with 'mcp__', serverId is the segment between
 *   the first and second '__'; tool is everything after
 */
export function normalizeToolName(toolName: string, fallbackServerId?: string): NormalizedTool {
	if (toolName.startsWith('mcp__')) {
		const parts = toolName.split('__');
		const serverId = parts[1] || 'mcp-unknown';
		const tool = parts.slice(2).join('__') || 'unknown';
		return { serverId, tool };
	}
	return { serverId: fallbackServerId ?? 'builtin', tool: toolName };
}

/** Canonical MCP tool name from (serverId, tool) components. */
export function toMcpToolName(serverId: string, tool: string): string {
	return `mcp__${serverId}__${tool}`;
}
