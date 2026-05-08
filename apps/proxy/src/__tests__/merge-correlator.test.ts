import { describe, it, expect, beforeEach } from 'vitest';
import { MergeCorrelator } from '../merge-correlator.js';

function makeCorrelator(nowMs = 0) {
  let currentTime = nowMs;
  const now = () => currentTime;
  const correlator = new MergeCorrelator(now);
  const tick = (ms: number) => { currentTime += ms; };
  return { correlator, tick };
}

const INPUT = { deploymentId: 'dep_abc123', tail: 50 };

describe('MergeCorrelator', () => {
  describe('recordHook + tryMatchProxy', () => {
    it('returns the entry after recording', () => {
      const { correlator } = makeCorrelator();
      correlator.recordHook('railway', 'deployment-logs', INPUT, 'corr-1');
      const entry = correlator.tryMatchProxy('railway', 'deployment-logs', INPUT);
      expect(entry?.correlationId).toBe('corr-1');
    });

    it('returns undefined for an unknown key', () => {
      const { correlator } = makeCorrelator();
      correlator.recordHook('railway', 'deployment-logs', INPUT, 'corr-1');
      expect(correlator.tryMatchProxy('railway', 'different-tool', INPUT)).toBeUndefined();
      expect(correlator.tryMatchProxy('other-server', 'deployment-logs', INPUT)).toBeUndefined();
      expect(correlator.tryMatchProxy('railway', 'deployment-logs', { other: true })).toBeUndefined();
    });

    it('returns undefined after TTL expiry', () => {
      const { correlator, tick } = makeCorrelator();
      correlator.recordHook('railway', 'deployment-logs', INPUT, 'corr-1');
      tick(5001);
      expect(correlator.tryMatchProxy('railway', 'deployment-logs', INPUT)).toBeUndefined();
    });

    it('returns undefined for consumed entries', () => {
      const { correlator } = makeCorrelator();
      correlator.recordHook('railway', 'deployment-logs', INPUT, 'corr-1');
      correlator.claim('corr-1', 'proxy');
      expect(correlator.tryMatchProxy('railway', 'deployment-logs', INPUT)).toBeUndefined();
    });

    it('handles null and undefined input consistently', () => {
      const { correlator } = makeCorrelator();
      correlator.recordHook('builtin', 'Bash', null, 'corr-null');
      expect(correlator.tryMatchProxy('builtin', 'Bash', null)?.correlationId).toBe('corr-null');
      expect(correlator.tryMatchProxy('builtin', 'Bash', undefined)?.correlationId).toBe('corr-null');
    });
  });

  describe('FIFO for concurrent identical calls', () => {
    it('matches in insertion order', () => {
      const { correlator } = makeCorrelator();
      correlator.recordHook('railway', 'deployment-logs', INPUT, 'corr-1');
      correlator.recordHook('railway', 'deployment-logs', INPUT, 'corr-2');

      const first = correlator.tryMatchProxy('railway', 'deployment-logs', INPUT);
      expect(first?.correlationId).toBe('corr-1');
      correlator.claim('corr-1', 'proxy');

      const second = correlator.tryMatchProxy('railway', 'deployment-logs', INPUT);
      expect(second?.correlationId).toBe('corr-2');
    });
  });

  describe('claim', () => {
    it('returns true for first claimant', () => {
      const { correlator } = makeCorrelator();
      correlator.recordHook('railway', 'deployment-logs', INPUT, 'corr-1');
      expect(correlator.claim('corr-1', 'proxy')).toBe(true);
    });

    it('returns false for second claimant', () => {
      const { correlator } = makeCorrelator();
      correlator.recordHook('railway', 'deployment-logs', INPUT, 'corr-1');
      correlator.claim('corr-1', 'proxy');
      expect(correlator.claim('corr-1', 'post-tool-use')).toBe(false);
    });

    it('returns false for unknown correlationId', () => {
      const { correlator } = makeCorrelator();
      expect(correlator.claim('not-registered', 'proxy')).toBe(false);
    });
  });

  describe('wasConsumedByProxy', () => {
    it('returns false when no entry registered', () => {
      const { correlator } = makeCorrelator();
      expect(correlator.wasConsumedByProxy('unknown')).toBe(false);
    });

    it('returns false when registered but not claimed', () => {
      const { correlator } = makeCorrelator();
      correlator.recordHook('railway', 'deployment-logs', INPUT, 'corr-1');
      expect(correlator.wasConsumedByProxy('corr-1')).toBe(false);
    });

    it('returns false when claimed by post-tool-use', () => {
      const { correlator } = makeCorrelator();
      correlator.recordHook('railway', 'deployment-logs', INPUT, 'corr-1');
      correlator.claim('corr-1', 'post-tool-use');
      expect(correlator.wasConsumedByProxy('corr-1')).toBe(false);
    });

    it('returns true when claimed by proxy', () => {
      const { correlator } = makeCorrelator();
      correlator.recordHook('railway', 'deployment-logs', INPUT, 'corr-1');
      correlator.claim('corr-1', 'proxy');
      expect(correlator.wasConsumedByProxy('corr-1')).toBe(true);
    });
  });

  describe('cleanup', () => {
    it('evicts expired entries from both indexes', () => {
      const { correlator, tick } = makeCorrelator();
      correlator.recordHook('railway', 'deployment-logs', INPUT, 'corr-1');
      tick(5001);
      correlator.cleanup();

      expect(correlator.tryMatchProxy('railway', 'deployment-logs', INPUT)).toBeUndefined();
      // claim on an evicted entry also returns false
      expect(correlator.claim('corr-1', 'proxy')).toBe(false);
    });

    it('retains live entries after cleanup', () => {
      const { correlator, tick } = makeCorrelator();
      correlator.recordHook('railway', 'deployment-logs', INPUT, 'corr-old');
      tick(5001);
      correlator.recordHook('railway', 'deployment-logs', INPUT, 'corr-new');
      correlator.cleanup();

      const entry = correlator.tryMatchProxy('railway', 'deployment-logs', INPUT);
      expect(entry?.correlationId).toBe('corr-new');
    });
  });
});
