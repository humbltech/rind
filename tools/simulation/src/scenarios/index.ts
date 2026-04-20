// Scenario registry — add new scenarios here to include them in `pnpm sim`

import type { Scenario } from './types.js';
import { replitDbDeletion } from './replit-db-deletion.js';
import { toolPoisoning } from './tool-poisoning.js';
import { sessionKillswitch } from './session-killswitch.js';

export const scenarios: Scenario[] = [replitDbDeletion, toolPoisoning, sessionKillswitch];

export const scenariosBySlug = new Map<string, Scenario>(scenarios.map((s) => [s.slug, s]));
