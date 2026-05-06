// Request-side injection patterns — prompt injection attempts embedded in tool
// call arguments before they are forwarded to an upstream MCP server.
// Ref: OWASP MCP Top 10 — A01 (Prompt Injection via Tool Arguments)
//
// Pattern count: 10
// Last updated: 2026-04-29

export interface RequestInjectionPattern {
  id: string;
  pattern: RegExp;
  label: string;
  description: string;
}

export const REQUEST_INJECTION_PATTERNS: RequestInjectionPattern[] = [
  {
    id: 'req-inj-001',
    pattern: /ignore\s+(previous|prior|all|above)/i,
    label: 'instruction override in argument',
    description: 'Detects "ignore previous/prior/all instructions" override attempts in tool arguments',
  },
  {
    id: 'req-inj-002',
    pattern: /system\s*:/i,
    label: 'SYSTEM: directive in argument',
    description: 'Detects embedded SYSTEM: prompt directives injected into tool arguments',
  },
  {
    id: 'req-inj-003',
    // Context-escape to privileged role: a closing role tag followed by an opening PRIVILEGED
    // role tag (`system`, `prompt`, `instruction`). This is the specific injection mechanism —
    // an attacker escapes the current conversational role and injects instructions as if they
    // came from a privileged system context.
    //
    // NOT matched: normal conversation turn transitions (`</user><assistant>`,
    // `</assistant><user>`) which appear in serialised conversation history. Those are
    // conversational role transitions, not privilege escalation attempts.
    //
    // The original standalone-tag pattern `<\/?(?:system|assistant|user|prompt|instruction)>`
    // matched any lone role tag — causing false positives on LLM API bodies where Claude Code
    // serialises prior turns using the same XML markers. The broader context-escape variant
    // `</roleA><roleB>` (any role → any role) also false-positived on turn alternation.
    // Only destination-is-privileged (`</anything><system|prompt|instruction>`) is specific
    // enough to avoid both false-positive classes.
    pattern: /<\/(?:system|assistant|user|prompt|instruction)>\s*<(?:system|prompt|instruction)>/i,
    label: 'role context escape to privileged role in argument',
    description: 'Detects XML role context-escape to a privileged role (</roleA><system|prompt|instruction>) in tool arguments — attacker escaping conversational context to inject privileged instructions',
  },
  {
    id: 'req-inj-004',
    pattern: /\bexfiltrate\b|\bsteal\b/i,
    label: 'data exfiltration directive in argument',
    description: 'Detects explicit exfiltration or theft directives in tool arguments',
  },
  {
    id: 'req-inj-005',
    pattern: /\bcurl\s+(?:-[a-zA-Z\s]*)?https?:\/\//i,
    label: 'shell command (curl) injection in argument',
    description: 'Detects curl HTTP commands injected into tool arguments — RCE vector (ref: CVE-2025-53773)',
  },
  {
    id: 'req-inj-006',
    pattern: /\bwget\s+https?:\/\//i,
    label: 'shell command (wget) injection in argument',
    description: 'Detects wget download commands injected into tool arguments',
  },
  {
    id: 'req-inj-007',
    pattern: /\|\s*(?:sh|bash|zsh|ash)\b/i,
    label: 'shell pipe execution injection in argument',
    description: 'Detects pipe-to-shell patterns (| sh, | bash) that execute arbitrary commands',
  },
  {
    id: 'req-inj-008',
    pattern: /;\s*(?:sh|bash|rm|curl|wget|python|node)\s/i,
    label: 'shell command chaining injection in argument',
    description: 'Detects semicolon command chaining that appends malicious commands after legitimate ones',
  },
  {
    id: 'req-inj-009',
    pattern: /\$\(.*\)/i,
    label: 'shell command substitution injection in argument',
    description: 'Detects $() command substitution used to embed shell execution in strings',
  },
  {
    id: 'req-inj-010',
    pattern: /`[^`]{3,}`/i,
    label: 'shell backtick execution injection in argument',
    description: 'Detects backtick command execution embedded in tool argument strings',
  },
];
