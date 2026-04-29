// Shared detector result type — returned by all detector implementations.

import type { DetectorMatchAudit } from '@rind/core';

export interface DetectorRunResult {
  triggered: boolean;
  stage: 'regex' | 'ml_ner' | 'llm_judge';
  maxConfidence: number;
  matches: DetectorMatchAudit[];
}
