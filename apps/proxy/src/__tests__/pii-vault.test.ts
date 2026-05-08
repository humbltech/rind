import { describe, it, expect, beforeEach } from 'vitest';
import { createPIIVault } from '../pii-vault.js';
import type { PIIVault } from '../pii-vault.js';

const ORIGIN = { serverId: 'server-a', toolName: 'test-tool' };
const OTHER_SERVER = { serverId: 'server-b', toolName: 'other-tool' };

describe('PIIVault', () => {
  let vault: PIIVault;

  beforeEach(() => {
    vault = createPIIVault('agent-test-123');
  });

  it('pseudonymizes an email and rehydrates it', () => {
    const { sanitized } = vault.pseudonymize(
      'Contact john@acme.com for details.',
      ORIGIN,
      { entities: ['EMAIL'] },
    );
    expect(sanitized).not.toContain('john@acme.com');
    expect(sanitized).toContain('@example.com');

    const rehydrated = vault.rehydrate(sanitized);
    expect(rehydrated).toBe('Contact john@acme.com for details.');
  });

  it('assigns distinct synthetics for distinct values', () => {
    const { sanitized } = vault.pseudonymize(
      'Email a@x.com and b@x.com please.',
      ORIGIN,
      { entities: ['EMAIL'] },
    );
    expect(sanitized).not.toContain('a@x.com');
    expect(sanitized).not.toContain('b@x.com');
    expect(vault.size).toBe(2);
    expect(vault.rehydrate(sanitized)).toBe('Email a@x.com and b@x.com please.');
  });

  it('deduplicates — same value gets same synthetic', () => {
    const { sanitized } = vault.pseudonymize(
      'From: a@x.com. To: a@x.com.',
      ORIGIN,
      { entities: ['EMAIL'] },
    );
    expect(vault.size).toBe(1);
    expect(sanitized).not.toContain('a@x.com');
    // Both occurrences should be the same synthetic
    const synthMatch = sanitized.match(/synth\+[A-Za-z0-9_-]+@example\.com/);
    expect(synthMatch).not.toBeNull();
    const synth = synthMatch![0]!;
    expect(sanitized).toBe(`From: ${synth}. To: ${synth}.`);
  });

  it('handles multiple entity types independently', () => {
    const { sanitized } = vault.pseudonymize(
      'Call 416-555-1234 or email bob@acme.com.',
      ORIGIN,
      { entities: ['PHONE', 'EMAIL'] },
    );
    expect(sanitized).not.toContain('416-555-1234');
    expect(sanitized).not.toContain('bob@acme.com');
    expect(vault.size).toBe(2);
    expect(vault.rehydrate(sanitized)).toBe('Call 416-555-1234 or email bob@acme.com.');
  });

  it('rehydrate is a no-op when no tokens are present', () => {
    vault.pseudonymize('no pii here', ORIGIN, { entities: ['EMAIL'] });
    expect(vault.rehydrate('plain text response')).toBe('plain text response');
  });

  it('rehydrate leaves unknown strings unchanged', () => {
    vault.pseudonymize('test@acme.com', ORIGIN, { entities: ['EMAIL'] });
    expect(vault.rehydrate('prefix totally-unknown-value suffix')).toBe(
      'prefix totally-unknown-value suffix',
    );
  });

  it('returns stats with correct entity type breakdown', () => {
    const { stats } = vault.pseudonymize(
      'a@x.com, b@x.com, 416-555-0000',
      ORIGIN,
      { entities: ['EMAIL', 'PHONE'] },
    );
    expect(stats.tokenCount).toBe(3);
    expect(stats.entityTypeBreakdown['EMAIL']).toBe(2);
    expect(stats.entityTypeBreakdown['PHONE']).toBe(1);
    expect(stats.rehydrated).toBe(false);
  });

  it('returns salted hashes in stats (Tier 2)', () => {
    const { stats } = vault.pseudonymize('test@x.com', ORIGIN, { entities: ['EMAIL'] });
    expect(stats.valueHashes).toBeDefined();
    expect(stats.valueHashes![0]!.entityType).toBe('EMAIL');
    expect(stats.valueHashes![0]!.hash).toHaveLength(64); // sha256 hex
    expect(stats.valueHashes![0]!.occurrences).toBe(1);
    expect(stats.valueHashes![0]!.hash).not.toBe('test@x.com');
  });

  it('dispose clears vault state', () => {
    const { sanitized } = vault.pseudonymize('user@acme.com', ORIGIN, { entities: ['EMAIL'] });
    expect(vault.size).toBe(1);
    vault.dispose();
    expect(vault.size).toBe(0);
    // After dispose, any string passes through unchanged
    expect(vault.rehydrate(sanitized)).toBe(sanitized);
  });

  it('clean text produces empty stats', () => {
    const { sanitized, entityCount, stats } = vault.pseudonymize(
      'No sensitive data here.',
      ORIGIN,
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
    vault.pseudonymize('Contact bob@acme.com for info.', ORIGIN, { entities: ['EMAIL'] });
    const synth = vault.getSyntheticsForEntity('EMAIL')[0]!;
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
    vault.pseudonymize('bob@acme.com', ORIGIN, { entities: ['EMAIL'] });
    vault.dispose();
    expect(vault.applyTokens('bob@acme.com')).toBe('bob@acme.com');
  });

  it('accumulates entries across multiple pseudonymize calls', () => {
    vault.pseudonymize('first@x.com', ORIGIN, { entities: ['EMAIL'] });
    vault.pseudonymize('second@x.com', ORIGIN, { entities: ['EMAIL'] });
    expect(vault.size).toBe(2);
    const applied = vault.applyTokens('second@x.com and first@x.com');
    expect(applied).not.toContain('second@x.com');
    expect(applied).not.toContain('first@x.com');
    expect(applied).toContain('@example.com');
  });

  it('maxTokenLength reflects the longest synthetic in the vault', () => {
    expect(vault.maxTokenLength).toBe(0);
    vault.pseudonymize('user@acme.com', ORIGIN, { entities: ['EMAIL'] });
    const synth = vault.getSyntheticsForEntity('EMAIL')[0]!;
    expect(vault.maxTokenLength).toBe(synth.length);
  });

  // ─── HMAC determinism tests ─────────────────────────────────────────────────

  it('same value + same agentId → same synthetic across calls (HMAC determinism)', () => {
    const v1 = createPIIVault('agent-xyz');
    const v2 = createPIIVault('agent-xyz');
    const { sanitized: s1 } = v1.pseudonymize('alice@corp.com', ORIGIN, { entities: ['EMAIL'] });
    const { sanitized: s2 } = v2.pseudonymize('alice@corp.com', ORIGIN, { entities: ['EMAIL'] });
    expect(s1).toBe(s2);
    expect(s1).not.toContain('alice@corp.com');
    v1.dispose();
    v2.dispose();
  });

  it('same vault: re-pseudonymizing same text is idempotent (synthetic not re-detected)', () => {
    const { sanitized } = vault.pseudonymize('alice@corp.com', ORIGIN, { entities: ['EMAIL'] });
    // Running pseudonymize on the already-sanitized output should be a no-op
    const { sanitized: double } = vault.pseudonymize(sanitized, ORIGIN, { entities: ['EMAIL'] });
    expect(double).toBe(sanitized);
    expect(vault.size).toBe(1); // no new entry added
  });

  it('different agentIds produce different synthetics for the same value', () => {
    const va = createPIIVault('agent-a-unique');
    const vb = createPIIVault('agent-b-unique');
    const { sanitized: sa } = va.pseudonymize('alice@corp.com', ORIGIN, { entities: ['EMAIL'] });
    const { sanitized: sb } = vb.pseudonymize('alice@corp.com', ORIGIN, { entities: ['EMAIL'] });
    expect(sa).not.toBe(sb);
    va.dispose();
    vb.dispose();
  });

  // ─── Destination scoping tests ───────────────────────────────────────────────

  it('rehydrates on same server (allowedDestinations match)', () => {
    vault.pseudonymize('alice@corp.com', ORIGIN, { entities: ['EMAIL'] });
    const synth = vault.getSyntheticsForEntity('EMAIL')[0]!;
    const { text, rehydratedTokens, blockedTokens } = vault.rehydrateForDestination(
      `email: ${synth}`,
      ORIGIN, // same serverId
    );
    expect(text).toBe('email: alice@corp.com');
    expect(rehydratedTokens).toHaveLength(1);
    expect(blockedTokens).toHaveLength(0);
  });

  it('blocks rehydration on a different server', () => {
    vault.pseudonymize('alice@corp.com', ORIGIN, { entities: ['EMAIL'] });
    const synth = vault.getSyntheticsForEntity('EMAIL')[0]!;
    const { text, rehydratedTokens, blockedTokens } = vault.rehydrateForDestination(
      `email: ${synth}`,
      OTHER_SERVER, // different serverId
    );
    expect(text).toBe(`email: ${synth}`); // synthetic NOT replaced
    expect(rehydratedTokens).toHaveLength(0);
    expect(blockedTokens).toHaveLength(1);
  });

  it('rehydrateValueForDestination walks deep object trees', () => {
    vault.pseudonymize('alice@corp.com', ORIGIN, { entities: ['EMAIL'] });
    const synth = vault.getSyntheticsForEntity('EMAIL')[0]!;
    const input = { user: { email: synth }, list: [synth] };
    const { value } = vault.rehydrateValueForDestination(input, ORIGIN);
    expect(value).toEqual({ user: { email: 'alice@corp.com' }, list: ['alice@corp.com'] });
  });

  it('widens allowedDestinations when same value re-encountered from a second server', () => {
    vault.pseudonymize('alice@corp.com', ORIGIN, { entities: ['EMAIL'] });
    // Same value encountered from OTHER_SERVER — widens destinations
    vault.pseudonymize('alice@corp.com', OTHER_SERVER, { entities: ['EMAIL'] });
    expect(vault.size).toBe(1); // still one entry, no duplicate
    const synth = vault.getSyntheticsForEntity('EMAIL')[0]!;
    // Now rehydrates on both servers
    const { text: t1 } = vault.rehydrateForDestination(`${synth}`, ORIGIN);
    const { text: t2 } = vault.rehydrateForDestination(`${synth}`, OTHER_SERVER);
    expect(t1).toBe('alice@corp.com');
    expect(t2).toBe('alice@corp.com');
  });

  // ─── Entity-type shape tests ─────────────────────────────────────────────────

  it('email synthetic is in RFC 2606 reserved range', () => {
    const { sanitized } = vault.pseudonymize('user@company.com', ORIGIN, { entities: ['EMAIL'] });
    expect(sanitized).toMatch(/synth\+[A-Za-z0-9_-]+@example\.com/);
  });

  it('phone synthetic is in NANP 555-010-XXXX reserved range', () => {
    const { sanitized } = vault.pseudonymize('416-555-1234', ORIGIN, { entities: ['PHONE'] });
    expect(sanitized).toMatch(/555[-.]010[-.]?\d{4}/);
  });

  it('SSN synthetic is in 000-00-XXXX reserved range', () => {
    const { sanitized } = vault.pseudonymize('123-45-6789', ORIGIN, { entities: ['SSN'] });
    expect(sanitized).toMatch(/000-00-\d{4}/);
  });

  it('IP synthetic is in RFC 5737 TEST-NET-1 range', () => {
    const { sanitized } = vault.pseudonymize('8.8.8.8', ORIGIN, { entities: ['IP_ADDRESS'] });
    expect(sanitized).toMatch(/192\.0\.2\.\d+/);
  });

  it('IBAN synthetic uses XX invalid-country prefix', () => {
    const { sanitized } = vault.pseudonymize('GB29NWBK60161331926819', ORIGIN, { entities: ['IBAN'] });
    expect(sanitized).toMatch(/^XX00/);
    expect(sanitized).not.toContain('GB29NWBK60161331926819');
    expect(vault.rehydrate(sanitized)).toBe('GB29NWBK60161331926819');
  });

  it('pseudonymize with no config scans all Phase 1 entities', () => {
    const text = 'SSN: 123-45-6789 and email user@corp.com';
    const { sanitized } = vault.pseudonymize(text, ORIGIN);
    expect(sanitized).not.toContain('user@corp.com');
    expect(sanitized).not.toContain('123-45-6789');
  });
});
