// DLP detector — runs user-defined data loss prevention patterns.

import type { DlpDetectorConfig } from '@rind/core';
import type { DetectorRunResult } from './types.js';

const SEVERITY_CONFIDENCE: Record<string, number> = {
  critical: 0.95,
  high: 0.85,
  medium: 0.75,
};

export function runDLPDetector(
  text: string,
  config: DlpDetectorConfig,
): DetectorRunResult {
  const matches: DetectorRunResult['matches'] = [];

  // DLP patterns are user-defined and validated by Zod at startup. A new RegExp
  // is compiled per call rather than cached because DLP configs can change between
  // requests (hot-reload). For high-pattern-count configs this is acceptable given
  // the low frequency of DLP rule changes vs. the complexity of a pattern cache.
  for (const { name, regex, severity } of config.patterns) {
    try {
      if (new RegExp(regex).test(text)) {
        matches.push({
          label: name,
          type: name,
          confidence: SEVERITY_CONFIDENCE[severity] ?? 0.75,
          stage: 'regex',
        });
      }
    } catch {
      // Invalid regex — skip silently (Zod validation catches this at startup)
    }
  }

  return {
    triggered: matches.length > 0,
    stage: 'regex',
    maxConfidence: matches.length > 0 ? Math.max(...matches.map((m) => m.confidence)) : 0,
    matches,
  };
}
