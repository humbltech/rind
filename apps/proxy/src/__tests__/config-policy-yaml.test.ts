// Tests for config/policy-yaml.ts — generateStarterPolicyYaml().

import { describe, it, expect } from 'vitest';
import { generateStarterPolicyYaml } from '../config/policy-yaml.js';

describe('generateStarterPolicyYaml', () => {
  it('returns a non-empty string', () => {
    const yaml = generateStarterPolicyYaml();
    expect(typeof yaml).toBe('string');
    expect(yaml.length).toBeGreaterThan(0);
  });

  it('includes cli-protection as an enabled pack', () => {
    const yaml = generateStarterPolicyYaml();
    // Must be uncommented (no leading #) so it actually loads
    expect(yaml).toMatch(/^\s*-\s+cli-protection/m);
  });

  it('includes a packs section', () => {
    expect(generateStarterPolicyYaml()).toContain('packs:');
  });

  it('includes a policies section', () => {
    expect(generateStarterPolicyYaml()).toContain('policies:');
  });

  it('includes a link to docs', () => {
    expect(generateStarterPolicyYaml()).toContain('rind.sh/docs');
  });

  it('contains commented-out example rules', () => {
    const yaml = generateStarterPolicyYaml();
    // Comments before example rules
    expect(yaml).toContain('#');
    // At least one commented example block
    expect(yaml).toMatch(/#\s*-\s+name:/m);
  });

  it('is valid YAML structure (no tab characters — YAML forbids tabs for indentation)', () => {
    // YAML uses spaces not tabs
    const lines = generateStarterPolicyYaml().split('\n');
    for (const line of lines) {
      expect(line).not.toMatch(/^\t/);
    }
  });

  it('is deterministic — same output on every call', () => {
    expect(generateStarterPolicyYaml()).toBe(generateStarterPolicyYaml());
  });
});
