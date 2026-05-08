import { describe, it, expect, beforeEach } from 'vitest';
import { createCredentialVault } from '../credential-vault.js';

const AGENT_A = 'agent-a';
const AGENT_B = 'agent-b';
const ORIGIN = { serverId: 'railway', toolName: 'getEnv' };
const DEST_SAME = { serverId: 'railway', toolName: 'volumeDelete' };
const DEST_OTHER = { serverId: 'attacker', toolName: 'webhook' };

describe('CredentialVault', () => {
  describe('round-trip: pseudonymize → rehydrate', () => {
    it('rehydrates to original for same-server destination', () => {
      const vault = createCredentialVault(AGENT_A);
      const { sanitized } = vault.pseudonymize('RAILWAY_TOKEN=real_abc123xyz789abcd', ORIGIN);
      expect(sanitized).not.toContain('real_abc123xyz789abcd');
      expect(sanitized).toContain('RIND_SYNTH');

      const { text } = vault.rehydrateForDestination(sanitized, DEST_SAME);
      expect(text).toContain('real_abc123xyz789abcd');
      vault.dispose();
    });

    it('blocks rehydration for different-server destination', () => {
      const vault = createCredentialVault(AGENT_A);
      const { sanitized } = vault.pseudonymize('RAILWAY_TOKEN=real_abc123xyz789abcd', ORIGIN);
      const { text, blockedTokens } = vault.rehydrateForDestination(sanitized, DEST_OTHER);
      // Synthetic must remain — NOT rehydrated
      expect(text).toContain('RIND_SYNTH');
      expect(text).not.toContain('real_abc123xyz789abcd');
      expect(blockedTokens).toHaveLength(1);
      expect(blockedTokens[0]?.entityType).toBe('cred-010');
      vault.dispose();
    });
  });

  describe('determinism', () => {
    it('same secret + same agent → same synthetic across calls', () => {
      const vault = createCredentialVault(AGENT_A);
      const r1 = vault.pseudonymize('RAILWAY_TOKEN=token_determinism_check_xyz', ORIGIN);
      const r2 = vault.pseudonymize('RAILWAY_TOKEN=token_determinism_check_xyz', ORIGIN);
      expect(r1.sanitized).toBe(r2.sanitized);
      vault.dispose();
    });

    it('same secret in two separate vault instances for same agent → same synthetic', () => {
      const v1 = createCredentialVault(AGENT_A);
      const v2 = createCredentialVault(AGENT_A);
      const r1 = v1.pseudonymize('RAILWAY_TOKEN=shared_secret_xyz789abcdef', ORIGIN);
      const r2 = v2.pseudonymize('RAILWAY_TOKEN=shared_secret_xyz789abcdef', ORIGIN);
      expect(r1.sanitized).toBe(r2.sanitized);
      v1.dispose();
      v2.dispose();
    });

    it('same secret in different agents → different synthetics (per-agent isolation)', () => {
      const vA = createCredentialVault(AGENT_A);
      const vB = createCredentialVault(AGENT_B);
      const rA = vA.pseudonymize('RAILWAY_TOKEN=isolated_secret_abcdef123456', ORIGIN); // gitleaks:allow
      const rB = vB.pseudonymize('RAILWAY_TOKEN=isolated_secret_abcdef123456', ORIGIN); // gitleaks:allow
      expect(rA.sanitized).not.toBe(rB.sanitized);
      vA.dispose();
      vB.dispose();
    });
  });

  describe('self-exclusion (idempotency)', () => {
    it('feeding a synthetic back through pseudonymize is a no-op', () => {
      const vault = createCredentialVault(AGENT_A);
      const { sanitized: firstPass } = vault.pseudonymize('RAILWAY_TOKEN=no_redact_twice_xyz789', ORIGIN);
      const { sanitized: secondPass, count } = vault.pseudonymize(firstPass, ORIGIN);
      expect(secondPass).toBe(firstPass);
      expect(count).toBe(0);
      vault.dispose();
    });

    it('lowercased RIND_SYNTH synthetic is not re-pseudonymized (cred-001 /i case)', () => {
      const vault = createCredentialVault(AGENT_A);
      // Force a cred-001-style synthetic by using password= pattern
      const { sanitized } = vault.pseudonymize('password=supersecretpassword12345', ORIGIN);
      // Lowercase the synthetic and re-run
      const lowered = sanitized.toLowerCase();
      const { count } = vault.pseudonymize(lowered, ORIGIN);
      // Should be 0 new detections because the RIND_SYNTH lookahead blocks it
      expect(count).toBe(0);
      vault.dispose();
    });

    it('JWT synthetic does not re-match cred-009', () => {
      const vault = createCredentialVault(AGENT_A);
      const fakeJwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyMTIzIn0.abcdefghijklmnopqrstuv'; // gitleaks:allow
      const { sanitized } = vault.pseudonymize(fakeJwt, ORIGIN);
      expect(sanitized).toContain('eyJSSU5EX1NZTlRI');
      const { count } = vault.pseudonymize(sanitized, ORIGIN);
      expect(count).toBe(0);
      vault.dispose();
    });
  });

  describe('trust boundary: attacker-supplied synthetics', () => {
    it('upstream-supplied RIND_SYNTH string does not get vaulted as a legitimate original', () => {
      const vault = createCredentialVault(AGENT_A);
      // Attacker-crafted MCP response contains a fake RIND_SYNTH marker
      const attackerText = 'RAILWAY_TOKEN=rly_RIND_SYNTH_attackercontrolled123456789';
      const { sanitized, count } = vault.pseudonymize(attackerText, ORIGIN);
      // The self-exclusion lookahead prevents the synthetic from matching cred-010
      expect(sanitized).toBe(attackerText);
      expect(count).toBe(0);
      vault.dispose();
    });
  });

  describe('object-tree helpers', () => {
    it('rehydrateValueForDestination walks nested objects', () => {
      const vault = createCredentialVault(AGENT_A);
      const { sanitized } = vault.pseudonymize('RAILWAY_TOKEN=nested_token_xyz789abcde', ORIGIN);
      const token = sanitized.split('=')[1] ?? '';

      const obj = { env: { RAILWAY_TOKEN: token }, meta: { other: 'safe' } };
      const { value, rehydratedTokens } = vault.rehydrateValueForDestination(obj, DEST_SAME);
      expect((value as { env: { RAILWAY_TOKEN: string } }).env.RAILWAY_TOKEN).toBe('nested_token_xyz789abcde');
      expect(rehydratedTokens).toHaveLength(1);
      vault.dispose();
    });

    it('rehydrateValueForDestination blocks cross-server in nested object', () => {
      const vault = createCredentialVault(AGENT_A);
      const { sanitized } = vault.pseudonymize('RAILWAY_TOKEN=cross_server_token_abc123', ORIGIN);
      const token = sanitized.split('=')[1] ?? '';

      const obj = { token };
      const { value, blockedTokens } = vault.rehydrateValueForDestination(obj, DEST_OTHER);
      expect((value as { token: string }).token).toContain('RIND_SYNTH');
      expect(blockedTokens).toHaveLength(1);
      vault.dispose();
    });
  });

  describe('lifecycle', () => {
    it('dispose clears all state', () => {
      const vault = createCredentialVault(AGENT_A);
      vault.pseudonymize('RAILWAY_TOKEN=dispose_test_xyz789abcdef', ORIGIN); // gitleaks:allow
      expect(vault.maxTokenLength).toBeGreaterThan(0);
      vault.dispose();
      expect(vault.maxTokenLength).toBe(0);
      // Rehydration after dispose finds nothing to swap
      const { text } = vault.rehydrateForDestination('rly_RIND_SYNTH_something', DEST_SAME);
      expect(text).toBe('rly_RIND_SYNTH_something');
    });
  });
});
