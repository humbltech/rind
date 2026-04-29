// Scenario registry — add new scenarios here to include them in `pnpm sim`

import type { Scenario } from './types.js';
import { replitDbDeletion } from './replit-db-deletion.js';
import { toolPoisoning } from './tool-poisoning.js';
import { sessionKillswitch } from './session-killswitch.js';
import { echoleakExfiltration } from './echoleak-exfiltration.js';
import { costRunawayLoop } from './cost-runaway-loop.js';
import { kiroInfraOutage } from './kiro-infra-outage.js';
import { copilotRce } from './copilot-rce.js';
import { supabaseTicketInjection } from './supabase-ticket-injection.js';
import { whatsappCrossServerShadow } from './whatsapp-cross-server-shadow.js';
import { openclawRugPull } from './openclaw-rug-pull.js';
import { perplexityDriveDeletion } from './perplexity-drive-deletion.js';
import { llmPassthroughAndAudit } from './llm-passthrough-and-audit.js';

export const scenarios: Scenario[] = [
  replitDbDeletion,
  toolPoisoning,
  sessionKillswitch,
  echoleakExfiltration,
  costRunawayLoop,
  kiroInfraOutage,
  copilotRce,
  supabaseTicketInjection,
  whatsappCrossServerShadow,
  openclawRugPull,
  perplexityDriveDeletion,
  // LLM proxy scenarios
  llmPassthroughAndAudit,
];

export const scenariosBySlug = new Map<string, Scenario>(scenarios.map((s) => [s.slug, s]));
