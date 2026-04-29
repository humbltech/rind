import { describe, it, expect, beforeEach } from 'vitest';
import { createPIIVault } from '../pii-vault.js';
import type { PIIVault } from '../pii-vault.js';

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
    expect(sanitized).toContain('<EMAIL_1>');
    expect(sanitized).not.toContain('john@acme.com');

    const rehydrated = vault.rehydrate(sanitized);
    expect(rehydrated).toBe('Contact john@acme.com for details.');
  });

  it('assigns incrementing counters per entity type', () => {
    const { sanitized } = vault.pseudonymize(
      'Email a@x.com and b@x.com please.',
      { entities: ['EMAIL'] },
    );
    expect(sanitized).toContain('<EMAIL_1>');
    expect(sanitized).toContain('<EMAIL_2>');
  });

  it('deduplicates — same value gets same token', () => {
    const { sanitized } = vault.pseudonymize(
      'From: a@x.com. To: a@x.com.',
      { entities: ['EMAIL'] },
    );
    // Both occurrences replaced with the same token
    expect(sanitized).toBe('From: <EMAIL_1>. To: <EMAIL_1>.');
    expect(vault.size).toBe(1);
  });

  it('handles multiple entity types independently', () => {
    const { sanitized } = vault.pseudonymize(
      'Call 416-555-1234 or email bob@example.com.',
      { entities: ['PHONE', 'EMAIL'] },
    );
    expect(sanitized).toContain('<PHONE_1>');
    expect(sanitized).toContain('<EMAIL_1>');
    expect(sanitized).not.toContain('416-555-1234');
    expect(sanitized).not.toContain('bob@example.com');
  });

  it('rehydrate is a no-op when no tokens are present', () => {
    vault.pseudonymize('no pii here', { entities: ['EMAIL'] });
    expect(vault.rehydrate('plain text response')).toBe('plain text response');
  });

  it('rehydrate leaves unknown tokens unchanged', () => {
    vault.pseudonymize('test@example.com', { entities: ['EMAIL'] });
    expect(vault.rehydrate('prefix <EMAIL_999> suffix')).toBe('prefix <EMAIL_999> suffix');
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
    vault.pseudonymize('user@example.com', { entities: ['EMAIL'] });
    expect(vault.size).toBe(1);
    vault.dispose();
    expect(vault.size).toBe(0);
    // After dispose, rehydrate has no mapping
    expect(vault.rehydrate('<EMAIL_1>')).toBe('<EMAIL_1>');
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

  it('applyTokens replaces original values with tokens — safe in production', () => {
    vault.pseudonymize('Contact bob@example.com for info.', { entities: ['EMAIL'] });
    // applyTokens goes original→token (forward direction)
    const applied = vault.applyTokens('Please reach bob@example.com or bob@example.com again.');
    expect(applied).toBe('Please reach <EMAIL_1> or <EMAIL_1> again.');
    // Does not throw in production
    const originalEnv = process.env['NODE_ENV'];
    process.env['NODE_ENV'] = 'production';
    try {
      expect(() => vault.applyTokens('bob@example.com')).not.toThrow();
    } finally {
      process.env['NODE_ENV'] = originalEnv;
    }
    vault.dispose();
  });

  it('applyTokens is a no-op before pseudonymize is called', () => {
    expect(vault.applyTokens('bob@example.com')).toBe('bob@example.com');
  });

  it('applyTokens returns identity after dispose', () => {
    vault.pseudonymize('bob@example.com', { entities: ['EMAIL'] });
    vault.dispose();
    expect(vault.applyTokens('bob@example.com')).toBe('bob@example.com');
  });

  it('accumulates entries across multiple pseudonymize calls', () => {
    vault.pseudonymize('first@x.com', { entities: ['EMAIL'] });
    vault.pseudonymize('second@x.com', { entities: ['EMAIL'] });
    expect(vault.size).toBe(2);
    // Counters continue incrementing across calls
    const applied = vault.applyTokens('second@x.com and first@x.com');
    expect(applied).toBe('<EMAIL_2> and <EMAIL_1>');
    vault.dispose();
  });
});
