// Request inspector: validates outbound tool call inputs before forwarding
// Catches injection attempts embedded in agent-provided arguments

import type { ToolCallEvent } from '../types.js';

export interface RequestInspectionResult {
  allowed: boolean;
  reason?: string;
}

// Patterns to detect prompt injection in tool call arguments
const INPUT_INJECTION_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /ignore\s+(previous|prior|all|above)/i, label: 'instruction override in argument' },
  { pattern: /system\s*:/i, label: 'SYSTEM: directive in argument' },
  { pattern: /<\/?(?:system|assistant|user|prompt|instruction)>/i, label: 'role injection tag in argument' },
  { pattern: /\bexfiltrate\b|\bsteal\b/i, label: 'data exfiltration directive in argument' },
];

function extractStrings(value: unknown, depth = 0): string[] {
  if (depth > 5) return []; // avoid deep recursion on attacker-controlled input
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap((v) => extractStrings(v, depth + 1));
  if (value !== null && typeof value === 'object') {
    return Object.values(value as Record<string, unknown>).flatMap((v) =>
      extractStrings(v, depth + 1),
    );
  }
  return [];
}

export function inspectRequest(event: ToolCallEvent): RequestInspectionResult {
  const inputStrings = extractStrings(event.input);
  const combinedInput = inputStrings.join(' ');

  for (const { pattern, label } of INPUT_INJECTION_PATTERNS) {
    if (pattern.test(combinedInput)) {
      return {
        allowed: false,
        reason: `Blocked: tool call input to "${event.toolName}" contains a ${label}. This is consistent with a prompt injection attack attempting to hijack agent behavior via tool arguments.`,
      };
    }
  }

  return { allowed: true };
}
