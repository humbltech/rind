// Demo server launcher — starts both sim servers concurrently.
//
// Usage:
//   pnpm demo-serve             # starts threat-sim (8080) + victim-service (8081)
//
// Both servers run until the process is terminated (Ctrl-C).

import { startThreatSim } from './threat-sim.js';
import { startVictimService } from './victim-service.js';

process.stdout.write('\nRind demo servers starting...\n\n');

startThreatSim(8080);
startVictimService(8081);

process.stdout.write('\nPress Ctrl-C to stop.\n');
