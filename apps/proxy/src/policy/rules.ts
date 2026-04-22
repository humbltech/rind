// Policy rule matching logic.
// The data model stores agentId on every rule from day 1 — even though
// the v1 UI only exposes tool-name matching, so v2 is not a rewrite.
//
// D-016: input parameter matching — recursive key lookup with depth limit 5,
//        supporting contains / regex / startsWith / numeric / in comparators.

import type { ParameterMatcher, PolicyRule } from '../types.js';

export function matchesRule(
  rule: PolicyRule,
  agentId: string,
  toolName: string,
  input: unknown,
  compiledRegexes: Map<string, RegExp>,
): boolean {
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

  // Input parameter matching (D-016)
  if (match.parameters && Object.keys(match.parameters).length > 0) {
    if (!matchesParameters(match.parameters, input, compiledRegexes)) return false;
  }

  // Sub-command matching (Bash only)
  if (match.subcommand && match.subcommand.length > 0) {
    if (!matchesSubcommand(match.subcommand, input)) return false;
  }

  return true;
}

// ─── Parameter matching ───────────────────────────────────────────────────────

/**
 * Check all parameter matchers against the tool input.
 * Each key in `matchers` is looked up recursively in the input object (depth ≤ 5).
 * All conditions must match (AND semantics).
 */
function matchesParameters(
  matchers: Record<string, ParameterMatcher>,
  input: unknown,
  compiledRegexes: Map<string, RegExp>,
): boolean {
  for (const [key, matcher] of Object.entries(matchers)) {
    const value = findValue(key, input, 0);
    if (value === undefined) return false; // key not found — rule doesn't match
    if (!matchesValue(value, matcher, compiledRegexes)) return false;
  }
  return true;
}

/** Recursively find the first value under the given key name (depth limit 5). */
function findValue(key: string, obj: unknown, depth: number): unknown {
  if (depth > 5 || obj === null || typeof obj !== 'object') return undefined;
  const record = obj as Record<string, unknown>;
  if (Object.prototype.hasOwnProperty.call(record, key)) return record[key];
  for (const v of Object.values(record)) {
    const found = findValue(key, v, depth + 1);
    if (found !== undefined) return found;
  }
  return undefined;
}

/** Apply a ParameterMatcher to a found value. All conditions are ANDed. */
function matchesValue(
  value: unknown,
  matcher: ParameterMatcher,
  compiledRegexes: Map<string, RegExp>,
): boolean {
  // contains: string must contain ALL listed substrings (case-insensitive)
  if (matcher.contains !== undefined) {
    if (typeof value !== 'string') return false;
    const lower = value.toLowerCase();
    for (const sub of matcher.contains) {
      if (!lower.includes(sub.toLowerCase())) return false;
    }
  }

  // regex: full-string match (pre-compiled at policy load time)
  if (matcher.regex !== undefined) {
    if (typeof value !== 'string') return false;
    const re = compiledRegexes.get(matcher.regex) ?? new RegExp(matcher.regex, 'i');
    if (!re.test(value)) return false;
  }

  // startsWith
  if (matcher.startsWith !== undefined) {
    if (typeof value !== 'string') return false;
    if (!value.startsWith(matcher.startsWith)) return false;
  }

  // numeric comparators
  if (matcher.gt !== undefined && (typeof value !== 'number' || value <= matcher.gt)) return false;
  if (matcher.lt !== undefined && (typeof value !== 'number' || value >= matcher.lt)) return false;
  if (matcher.gte !== undefined && (typeof value !== 'number' || value < matcher.gte)) return false;
  if (matcher.lte !== undefined && (typeof value !== 'number' || value > matcher.lte)) return false;

  // strict equality
  if (matcher.eq !== undefined && value !== matcher.eq) return false;

  // membership
  if (matcher.in !== undefined && !matcher.in.includes(value)) return false;

  return true;
}

// ─── Sub-command matching ─────────────────────────────────────────────────────

/**
 * Extract sub-commands from Bash input and check if any match the pattern list.
 * "git status && npm publish" with patterns ['npm publish'] → true.
 * Matching is case-insensitive.
 */
function matchesSubcommand(patterns: string[], input: unknown): boolean {
  const inp = input as Record<string, unknown> | null | undefined;
  if (!inp || typeof inp !== 'object') return false;
  const cmd = typeof inp.command === 'string' ? inp.command.trim() : '';
  if (!cmd) return false;

  // Extract sub-commands: split on compound operators, then summarize each
  const parts = cmd.split(/\s*(?:&&|\|\||[;|])\s*/);
  const subs: string[] = [];
  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    subs.push(summarizeBashCommand(trimmed));
    // Also keep the full trimmed command for exact content matching
    subs.push(trimmed.toLowerCase());
  }

  const lowerPatterns = patterns.map((p) => p.toLowerCase());

  // Match if ANY sub-command matches ANY pattern (supports exact, prefix, and glob)
  for (const sub of subs) {
    const lower = sub.toLowerCase();
    for (const pattern of lowerPatterns) {
      // Glob pattern (contains *): "*git*status*" matches "git status"
      if (pattern.includes('*')) {
        if (matchGlob(pattern, lower)) return true;
        continue;
      }
      // Exact match on summarized sub-command: "git push" matches "git push"
      if (lower === pattern) return true;
      // Or the full command starts with the pattern: "git push origin main" matches "git push"
      if (lower.startsWith(pattern + ' ') || lower.startsWith(pattern)) return true;
    }
  }
  return false;
}

/** Summarize a Bash command to binary + sub-command: "git -C /repo push" → "git push" */
function summarizeBashCommand(cmd: string): string {
  const tokens = cmd.split(/\s+/);
  if (tokens.length === 0) return cmd;
  const binary = tokens[0]!;

  if (['git', 'npm', 'npx', 'pnpm', 'docker'].includes(binary)) {
    const sub = findBashSubCommand(tokens, 1);
    return sub ? `${binary} ${sub}` : binary;
  }
  return binary;
}

function findBashSubCommand(tokens: string[], from: number): string | undefined {
  let i = from;
  while (i < tokens.length) {
    const t = tokens[i]!;
    if (t.startsWith('--')) { i++; continue; }
    if (t.startsWith('-') && t.length <= 3) { i += 2; continue; }
    if (t.startsWith('/') || t.startsWith('"') || t.startsWith("'")) { i++; continue; }
    return t;
  }
  return undefined;
}

// ─── Tool name matching ───────────────────────────────────────────────────────

function matchToolPattern(pattern: string, toolName: string): boolean {
  // Exact match or keyword-in-name match (e.g. "delete" matches "user.delete")
  return toolName === pattern || toolName.includes(pattern) || toolName.startsWith(pattern);
}

function matchGlob(pattern: string, value: string): boolean {
  // Simple glob: supports "*" wildcard, e.g. "billing.*"
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(`^${escaped}$`).test(value);
}

// ─── Time window matching ─────────────────────────────────────────────────────

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
