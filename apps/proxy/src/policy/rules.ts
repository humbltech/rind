// Policy rule types and matching logic.
// The data model stores agentId on every rule from day 1 — even though
// the v1 UI only exposes tool-name matching, so v2 is not a rewrite.

import type { PolicyRule } from '../types.js';

export function matchesRule(rule: PolicyRule, agentId: string, toolName: string): boolean {
  // Agent matching
  if (rule.agent !== '*' && rule.agent !== agentId) {
    return false;
  }

  const match = rule.match;

  // Tool name exact or pattern matching
  if (match.tool && match.tool.length > 0) {
    const toolMatched = match.tool.some((t) => matchToolPattern(t, toolName));
    if (!toolMatched) return false;
  }

  if (match.toolPattern) {
    if (!matchGlob(match.toolPattern, toolName)) return false;
  }

  // Time window matching
  if (match.timeWindow) {
    const now = new Date();
    const dayOfWeek = now.getUTCDay(); // 0=Sun...6=Sat

    if (match.timeWindow.daysOfWeek) {
      if (!match.timeWindow.daysOfWeek.includes(dayOfWeek)) return false;
    }

    if (match.timeWindow.hours) {
      if (!isWithinHourRange(match.timeWindow.hours, now)) return false;
    }
  }

  return true;
}

function matchToolPattern(pattern: string, toolName: string): boolean {
  // Exact match or keyword-in-name match (e.g. "delete" matches "user.delete")
  return toolName === pattern || toolName.includes(pattern) || toolName.startsWith(pattern);
}

function matchGlob(pattern: string, value: string): boolean {
  // Simple glob: supports "*" wildcard, e.g. "billing.*"
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(`^${escaped}$`).test(value);
}

function isWithinHourRange(range: string, now: Date): boolean {
  // range format: "HH:MM-HH:MM" in UTC
  const [startStr, endStr] = range.split('-');
  if (!startStr || !endStr) return false;

  const [startH = 0, startM = 0] = startStr.split(':').map(Number);
  const [endH = 0, endM = 0] = endStr.split(':').map(Number);

  const currentMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
  const startMinutes = startH * 60 + startM;
  const endMinutes = endH * 60 + endM;

  return currentMinutes >= startMinutes && currentMinutes < endMinutes;
}

export type { PolicyRule };
