// Tool poisoning patterns — detects prompt injection attempts embedded in MCP
// tool descriptions. Attackers embed instructions that redirect an agent to
// leak data or call attacker-controlled endpoints.
// Ref: OWASP MCP Top 10 — A02 (Tool Poisoning), A05 (Prompt Injection via Tools)
//
// Pattern count: 10
// Last updated: 2026-04-29

export interface PoisoningPattern {
  id: string;
  pattern: RegExp;
  label: string;
  severity: 'critical' | 'high' | 'medium';
  description: string;
}

export const TOOL_POISONING_PATTERNS: PoisoningPattern[] = [
  {
    id: 'poi-001',
    pattern: /ignore\s+(previous|prior|all|above)/i,
    label: 'instruction override attempt ("ignore previous instructions")',
    severity: 'critical',
    description: 'Detects "ignore previous instructions" override embedded in tool descriptions',
  },
  {
    id: 'poi-002',
    pattern: /system\s*:/i,
    label: 'embedded SYSTEM: directive',
    severity: 'critical',
    description: 'Detects SYSTEM: role directives embedded in tool descriptions to hijack agent context',
  },
  {
    id: 'poi-003',
    pattern: /<\/?(?:system|assistant|user|prompt|instruction)>/i,
    label: 'XML-style role injection tag',
    severity: 'critical',
    description: 'Detects XML role tags used to inject role context via tool descriptions',
  },
  {
    id: 'poi-004',
    pattern: /\[INST\]|\[\/INST\]|<<SYS>>|<\/SYS>/i,
    label: 'LLaMA-style instruction tag',
    severity: 'critical',
    description: 'Detects LLaMA/Mistral instruction format tags ([INST], <<SYS>>) used for model-specific injection',
  },
  {
    id: 'poi-005',
    pattern: /you\s+are\s+(?:now|a|an)\s+(?!the tool)/i,
    label: 'identity reassignment ("you are now...")',
    severity: 'high',
    description: 'Detects persona reassignment attempts in tool descriptions',
  },
  {
    id: 'poi-006',
    pattern: /\bexfiltrate\b|\bsteal\b|\bsend.*to.*http/i,
    label: 'data exfiltration directive',
    severity: 'critical',
    description: 'Detects explicit data exfiltration commands embedded in tool descriptions',
  },
  {
    id: 'poi-007',
    pattern: /https?:\/\/(?!localhost|127\.|schema\.org|json-schema\.org)\S+/i,
    label: 'external URL in tool description (potential exfiltration endpoint)',
    severity: 'medium',
    description: 'Detects external URLs in tool descriptions — common vector for embedding attacker-controlled endpoints',
  },
  {
    id: 'poi-008',
    pattern: /base64[^a-z]|btoa\(|atob\(/i,
    label: 'base64 encoding reference (potential payload obfuscation)',
    severity: 'high',
    description: 'Detects base64 encoding functions — may indicate payload obfuscation to evade detection',
  },
  {
    id: 'poi-009',
    pattern: /\bdo not\s+(?:log|record|reveal|tell|disclose)/i,
    label: 'log suppression / secrecy directive',
    severity: 'high',
    description: 'Detects directives instructing the agent to suppress logging or hide its actions',
  },
  {
    id: 'poi-010',
    pattern: /\brug\s*pull\b|\bdisable\s+(?:yourself|monitoring|logging)/i,
    label: 'rug-pull or self-modification directive',
    severity: 'critical',
    description: 'Detects rug-pull patterns or self-modification directives that attempt to disable the agent\'s safety controls',
  },
];

// Structural constants used by the poisoning scanner (not regex patterns)
export const MAX_DESCRIPTION_LENGTH = 2000; // legitimate tools rarely need more
export const CROSS_SERVER_ACTION_VERBS = /\b(?:call|also call|invoke|use|execute|run|send to|forward to)\b/i;
