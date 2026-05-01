import { describe, it, expect, beforeEach } from 'vitest';
import { createPIIVault } from '../pii-vault.js';
import type { PIIVault } from '../pii-vault.js';
import { generateSyntheticValue } from '../synthetic-generators.js';

describe('PIIVault', () => {
  let vault: PIIVault;

  beforeEach(() => {
    vault = createPIIVault('req-test-123');
  });

  it('pseudonymizes an email and rehydrates it', () => {
    const { sanitized } = vault.pseudonymize(
      'Contact john@acme.com for details.',
      { entities: ['EMAIL'] },
    );
    expect(sanitized).not.toContain('john@acme.com');
    // Synthetic is an RFC 2606 reserved address
    expect(sanitized).toContain('@example.com');

    const rehydrated = vault.rehydrate(sanitized);
    expect(rehydrated).toBe('Contact john@acme.com for details.');
  });

  it('assigns distinct synthetics for distinct values', () => {
    const { sanitized } = vault.pseudonymize(
      'Email a@x.com and b@x.com please.',
      { entities: ['EMAIL'] },
    );
    expect(sanitized).not.toContain('a@x.com');
    expect(sanitized).not.toContain('b@x.com');
    // Two distinct values → two vault entries
    expect(vault.size).toBe(2);
    // Both are fully rehydratable
    expect(vault.rehydrate(sanitized)).toBe('Email a@x.com and b@x.com please.');
  });

  it('deduplicates — same value gets same synthetic', () => {
    const { sanitized } = vault.pseudonymize(
      'From: a@x.com. To: a@x.com.',
      { entities: ['EMAIL'] },
    );
    // Only one vault entry — not two
    expect(vault.size).toBe(1);
    expect(sanitized).not.toContain('a@x.com');
    // Both occurrences replaced by the identical synthetic
    const synth = generateSyntheticValue('EMAIL', 'a@x.com', 0);
    expect(sanitized).toBe(`From: ${synth}. To: ${synth}.`);
  });

  it('handles multiple entity types independently', () => {
    const { sanitized } = vault.pseudonymize(
      'Call 416-555-1234 or email bob@acme.com.',
      { entities: ['PHONE', 'EMAIL'] },
    );
    expect(sanitized).not.toContain('416-555-1234');
    expect(sanitized).not.toContain('bob@acme.com');
    expect(vault.size).toBe(2);
    expect(vault.rehydrate(sanitized)).toBe('Call 416-555-1234 or email bob@acme.com.');
  });

  it('rehydrate is a no-op when no tokens are present', () => {
    vault.pseudonymize('no pii here', { entities: ['EMAIL'] });
    expect(vault.rehydrate('plain text response')).toBe('plain text response');
  });

  it('rehydrate leaves unknown strings unchanged', () => {
    vault.pseudonymize('test@acme.com', { entities: ['EMAIL'] });
    expect(vault.rehydrate('prefix totally-unknown-value suffix')).toBe(
      'prefix totally-unknown-value suffix',
    );
  });

  it('returns stats with correct entity type breakdown', () => {
    const { stats } = vault.pseudonymize(
      'a@x.com, b@x.com, 416-555-0000',
      { entities: ['EMAIL', 'PHONE'] },
    );
    expect(stats.tokenCount).toBe(3);
    expect(stats.entityTypeBreakdown['EMAIL']).toBe(2);
    expect(stats.entityTypeBreakdown['PHONE']).toBe(1);
    expect(stats.rehydrated).toBe(false);
  });

  it('returns salted hashes in stats (Tier 2)', () => {
    const { stats } = vault.pseudonymize('test@x.com', { entities: ['EMAIL'] });
    expect(stats.valueHashes).toBeDefined();
    expect(stats.valueHashes![0]!.entityType).toBe('EMAIL');
    expect(stats.valueHashes![0]!.hash).toHaveLength(64); // sha256 hex
    expect(stats.valueHashes![0]!.occurrences).toBe(1);
    // Hash must not equal the original value
    expect(stats.valueHashes![0]!.hash).not.toBe('test@x.com');
  });

  it('dispose clears vault state', () => {
    vault.pseudonymize('user@acme.com', { entities: ['EMAIL'] });
    expect(vault.size).toBe(1);
    vault.dispose();
    expect(vault.size).toBe(0);
    // After dispose, any string passes through unchanged
    const synth = generateSyntheticValue('EMAIL', 'user@acme.com', 0);
    expect(vault.rehydrate(synth)).toBe(synth);
  });

  it('clean text produces empty stats', () => {
    const { sanitized, entityCount, stats } = vault.pseudonymize(
      'No sensitive data here.',
      { entities: ['EMAIL', 'PHONE'] },
    );
    expect(sanitized).toBe('No sensitive data here.');
    expect(entityCount).toBe(0);
    expect(stats.tokenCount).toBe(0);
  });

  it('getDebugEntries throws in production', () => {
    const originalEnv = process.env['NODE_ENV'];
    process.env['NODE_ENV'] = 'production';
    try {
      expect(() => vault.getDebugEntries()).toThrow('not available in production');
    } finally {
      process.env['NODE_ENV'] = originalEnv;
    }
  });

  it('applyTokens replaces original values with synthetics — safe in production', () => {
    vault.pseudonymize('Contact bob@acme.com for info.', { entities: ['EMAIL'] });
    const synth = generateSyntheticValue('EMAIL', 'bob@acme.com', 0);
    // applyTokens goes original→synthetic (forward direction)
    const applied = vault.applyTokens('Please reach bob@acme.com or bob@acme.com again.');
    expect(applied).toBe(`Please reach ${synth} or ${synth} again.`);
    // Does not throw in production
    const originalEnv = process.env['NODE_ENV'];
    process.env['NODE_ENV'] = 'production';
    try {
      expect(() => vault.applyTokens('bob@acme.com')).not.toThrow();
    } finally {
      process.env['NODE_ENV'] = originalEnv;
    }
    vault.dispose();
  });

  it('applyTokens is a no-op before pseudonymize is called', () => {
    expect(vault.applyTokens('bob@acme.com')).toBe('bob@acme.com');
  });

  it('applyTokens returns identity after dispose', () => {
    vault.pseudonymize('bob@acme.com', { entities: ['EMAIL'] });
    vault.dispose();
    expect(vault.applyTokens('bob@acme.com')).toBe('bob@acme.com');
  });

  it('accumulates entries across multiple pseudonymize calls', () => {
    vault.pseudonymize('first@x.com', { entities: ['EMAIL'] });
    vault.pseudonymize('second@x.com', { entities: ['EMAIL'] });
    expect(vault.size).toBe(2);
    // Counters continue incrementing: first@x.com → index 0, second@x.com → index 1
    const synth0 = generateSyntheticValue('EMAIL', 'first@x.com', 0);
    const synth1 = generateSyntheticValue('EMAIL', 'second@x.com', 1);
    const applied = vault.applyTokens('second@x.com and first@x.com');
    expect(applied).toBe(`${synth1} and ${synth0}`);
    vault.dispose();
  });

  it('maxTokenLength reflects the longest synthetic in the vault', () => {
    expect(vault.maxTokenLength).toBe(0);
    vault.pseudonymize('user@acme.com', { entities: ['EMAIL'] });
    const synth = generateSyntheticValue('EMAIL', 'user@acme.com', 0);
    expect(vault.maxTokenLength).toBe(synth.length);
  });
});
