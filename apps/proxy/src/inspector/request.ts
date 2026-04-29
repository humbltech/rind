// Request inspector: validates outbound tool call inputs before forwarding
// Catches injection attempts embedded in agent-provided arguments

import type { ToolCallEvent } from '../types.js';
import { REQUEST_INJECTION_PATTERNS } from '../rules/index.js';

// Re-export under original name for backwards compatibility (tests and other consumers)
export { REQUEST_INJECTION_PATTERNS as INPUT_INJECTION_PATTERNS } from '../rules/index.js';

export interface RequestInspectionResult {
  allowed: boolean;
  reason?: string;
}

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

  for (const { pattern, label } of REQUEST_INJECTION_PATTERNS) {
    if (pattern.test(combinedInput)) {
      return {
        allowed: false,
        reason: `Blocked: tool call input to "${event.toolName}" contains a ${label}. This is consistent with a prompt injection attack attempting to hijack agent behavior via tool arguments.`,
      };
    }
  }

  return { allowed: true };
}
