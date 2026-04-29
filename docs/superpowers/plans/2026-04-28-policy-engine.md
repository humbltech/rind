# Policy Engine Extraction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract `apps/proxy/src/policy/` (engine, store, rules, loader, packs) into `packages/policy-engine` (`@rind/policy-engine`), leaving thin barrel re-exports in the proxy so zero internal proxy import paths change.

**Architecture:** Five source files move verbatim with only import paths updated. `PolicyEngine` accepts an optional `ILoopDetector` interface (defined inline in engine.ts) so the concrete `LoopDetector` class stays in the proxy without creating a circular dependency. All five policy types (`PolicyConfig`, `PolicyRule`, `PolicyPack`, etc.) already live in `@rind/core` from Step 1. The proxy's `policy/` folder becomes five thin barrels that re-export everything from `@rind/policy-engine`.

**Tech Stack:** TypeScript 5.4, tsup (ESM + .d.ts), vitest, yaml, zod, pnpm workspaces.

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `packages/policy-engine/tsconfig.json` | TypeScript config (same pattern as sdk-core) |
| Modify | `packages/policy-engine/package.json` | Add `yaml` to dependencies |
| Create | `packages/policy-engine/src/packs.ts` | Pack registry + expandPackRules + recommendPacks |
| Create | `packages/policy-engine/src/rules.ts` | matchesRule, matchesLlmRule (rule matching logic) |
| Create | `packages/policy-engine/src/store.ts` | PolicyStore interface + InMemoryPolicyStore |
| Create | `packages/policy-engine/src/loader.ts` | loadPolicyFile, emptyPolicyConfig (YAML + Zod) |
| Create | `packages/policy-engine/src/engine.ts` | PolicyEngine + ILoopDetector interface |
| Create | `packages/policy-engine/src/index.ts` | Public API barrel |
| Create | `packages/policy-engine/src/__tests__/policy-engine.test.ts` | PolicyEngine tests |
| Create | `packages/policy-engine/src/__tests__/packs.test.ts` | Pack registry + integration tests |
| Create | `packages/policy-engine/src/__tests__/policy-store.test.ts` | InMemoryPolicyStore tests |
| Modify | `apps/proxy/package.json` | Add `@rind/policy-engine: workspace:*` |
| Replace | `apps/proxy/src/policy/engine.ts` | Thin barrel → `@rind/policy-engine` |
| Replace | `apps/proxy/src/policy/store.ts` | Thin barrel → `@rind/policy-engine` |
| Replace | `apps/proxy/src/policy/rules.ts` | Thin barrel → `@rind/policy-engine` |
| Replace | `apps/proxy/src/policy/loader.ts` | Thin barrel → `@rind/policy-engine` |
| Replace | `apps/proxy/src/policy/packs.ts` | Thin barrel → `@rind/policy-engine` |

---

## Task 1: Package setup

**Files:**
- Create: `packages/policy-engine/tsconfig.json`
- Modify: `packages/policy-engine/package.json`

- [ ] **Step 1: Create tsconfig.json**

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "noEmit": false,
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist"]
}
```

File path: `packages/policy-engine/tsconfig.json`

- [ ] **Step 2: Add `yaml` to package.json dependencies**

The current `packages/policy-engine/package.json` has `@rind/core` and `zod` in dependencies. Add `yaml`:

```json
{
  "name": "@rind/policy-engine",
  "version": "0.0.1",
  "type": "module",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "scripts": {
    "build": "tsup src/index.ts --format esm --dts",
    "dev": "tsup src/index.ts --format esm --dts --watch",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@rind/core": "workspace:*",
    "yaml": "^2.6.0",
    "zod": "^3.24.0"
  },
  "devDependencies": {
    "tsup": "^8.0.0",
    "typescript": "^5.4.0",
    "vitest": "^2.0.0"
  }
}
```

- [ ] **Step 3: Install the new dep**

```bash
cd /Users/atinderpalsingh/projects/aegis-bundle/rind && pnpm install
```

Expected: yaml symlinked into `packages/policy-engine/node_modules/yaml`.

- [ ] **Step 4: Commit**

```bash
cd /Users/atinderpalsingh/projects/aegis-bundle/rind
git add packages/policy-engine/tsconfig.json packages/policy-engine/package.json pnpm-lock.yaml
git commit -m "chore: policy-engine tsconfig + yaml dep"
```

---

## Task 2: packs.ts and rules.ts

**Files:**
- Create: `packages/policy-engine/src/packs.ts`
- Create: `packages/policy-engine/src/rules.ts`

Both files are pure logic with no I/O. Their only external dependency is `@rind/core` (for types).

- [ ] **Step 1: Create packs.ts**

Copy `apps/proxy/src/policy/packs.ts` verbatim, then change the one import line:

Old: `import type { PolicyPack, PolicyRule, PolicyRuleWithMeta } from '../types.js';`
New: `import type { PolicyPack, PolicyRule, PolicyRuleWithMeta } from '@rind/core';`

No other changes needed.

- [ ] **Step 2: Verify packs.ts compiles**

```bash
cd /Users/atinderpalsingh/projects/aegis-bundle/rind/packages/policy-engine
npx tsc --noEmit --moduleResolution NodeNext --module NodeNext --strict 2>&1 | head -20 || true
```

Expected: No errors on packs.ts (index.ts is still empty, that's fine).

- [ ] **Step 3: Create rules.ts**

Copy `apps/proxy/src/policy/rules.ts` verbatim, then change the one import line:

Old: `import type { LlmCallEvent, ParameterMatcher, PolicyRule } from '../types.js';`
New: `import type { LlmCallEvent, ParameterMatcher, PolicyRule } from '@rind/core';`

Remove the re-export at the bottom (`export type { PolicyRule };`) — it's unnecessary when the types come from `@rind/core` directly.

No other changes needed.

- [ ] **Step 4: Verify rules.ts compiles**

```bash
cd /Users/atinderpalsingh/projects/aegis-bundle/rind/packages/policy-engine
npx tsc --noEmit --moduleResolution NodeNext --module NodeNext --strict 2>&1 | head -20 || true
```

- [ ] **Step 5: Commit**

```bash
cd /Users/atinderpalsingh/projects/aegis-bundle/rind
git add packages/policy-engine/src/packs.ts packages/policy-engine/src/rules.ts
git commit -m "feat(@rind/policy-engine): add packs.ts and rules.ts"
```

---

## Task 3: store.ts and loader.ts

**Files:**
- Create: `packages/policy-engine/src/store.ts`
- Create: `packages/policy-engine/src/loader.ts`

- [ ] **Step 1: Create store.ts**

Copy `apps/proxy/src/policy/store.ts` verbatim, then change the one import line:

Old: `import type { PolicyConfig, PolicyRule } from '../types.js';`
New: `import type { PolicyConfig, PolicyRule } from '@rind/core';`

Keep `import { writeFileSync, readFileSync, existsSync } from 'node:fs';` as-is.

No other changes needed.

- [ ] **Step 2: Create loader.ts**

Copy `apps/proxy/src/policy/loader.ts` verbatim, then change:

Old: `import type { PolicyConfig } from '../types.js';`
New: `import type { PolicyConfig } from '@rind/core';`

Old: `import { getPack, expandPackRules } from './packs.js';`
New: `import { getPack, expandPackRules } from './packs.js';` ← same, already local

The `yaml` and `zod` imports stay exactly as they are.

- [ ] **Step 3: Verify both files compile**

```bash
cd /Users/atinderpalsingh/projects/aegis-bundle/rind/packages/policy-engine
npx tsc --noEmit --moduleResolution NodeNext --module NodeNext --strict 2>&1 | head -30 || true
```

- [ ] **Step 4: Commit**

```bash
cd /Users/atinderpalsingh/projects/aegis-bundle/rind
git add packages/policy-engine/src/store.ts packages/policy-engine/src/loader.ts
git commit -m "feat(@rind/policy-engine): add store.ts and loader.ts"
```

---

## Task 4: engine.ts with ILoopDetector interface

**Files:**
- Create: `packages/policy-engine/src/engine.ts`

The engine takes an optional `LoopDetector` parameter. Since the concrete `LoopDetector` stays in the proxy, we define a minimal `ILoopDetector` interface in this file (inline — one interface, no need for a separate file).

- [ ] **Step 1: Create engine.ts**

Copy `apps/proxy/src/policy/engine.ts` verbatim, then apply these changes:

**Change 1** — Replace the import of `LoopDetector` type with an inline interface:

Old:
```typescript
import type { LoopDetector } from '../loop-detector.js';
```

New (add before the class definition, after the other imports):
```typescript
/** Minimal interface satisfied by the concrete LoopDetector in the proxy. */
export interface ILoopDetector {
  checkCondition(
    sessionId: string,
    toolName: string,
    input: unknown,
    condition: import('@rind/core').LoopCondition,
  ): { loop: boolean; reason?: string };
}
```

**Change 2** — Replace `../types.js` import:

Old: `import type { LlmCallEvent, PolicyAction, PolicyConfig, PolicyRule, ToolCallEvent } from '../types.js';`
New: `import type { LlmCallEvent, PolicyAction, PolicyConfig, PolicyRule, ToolCallEvent } from '@rind/core';`

**Change 3** — Replace `./store.js` and `./rules.js` imports (they are now local files in this package):

Old: `import type { PolicyStore } from './store.js';` (keep as-is — local)
Old: `import { matchesLlmRule, matchesRule } from './rules.js';` (keep as-is — local)

**Change 4** — Replace the `LoopDetector` type reference in the class:

Old: `private loopDetector?: LoopDetector;`
New: `private loopDetector?: ILoopDetector;`

Old: `constructor(store: PolicyStore, loopDetector?: LoopDetector)`
New: `constructor(store: PolicyStore, loopDetector?: ILoopDetector)`

The full resulting file:

```typescript
// Policy evaluation engine: evaluates tool call events against loaded policy rules.
// Rules are sorted by priority (ascending) — lower priority number = evaluated first.
// Within the same priority, insertion order is preserved. Default action is ALLOW.
//
// The engine reads from a PolicyStore (D-021) and caches the current config.
// When the store is updated (via API in Phase 2), the cache is invalidated
// immediately — the next request uses the new policies without a restart.
//
// Loop detection is policy-driven: rules with a `loop` field only trigger when
// the loop condition is met AND the rule's match criteria apply. The LoopDetector
// is an optional dependency — if not provided, loop conditions are ignored.

import type { LlmCallEvent, PolicyAction, PolicyConfig, PolicyRule, ToolCallEvent } from '@rind/core';
import type { PolicyStore } from './store.js';
import { matchesLlmRule, matchesRule } from './rules.js';

/** Minimal interface satisfied by the concrete LoopDetector in the proxy. */
export interface ILoopDetector {
  checkCondition(
    sessionId: string,
    toolName: string,
    input: unknown,
    condition: import('@rind/core').LoopCondition,
  ): { loop: boolean; reason?: string };
}

// Stable sort: lower priority number = evaluated first. Rules without priority default to 50.
function sortByPriority(rules: PolicyConfig['policies']): PolicyConfig['policies'] {
  return [...rules].sort((a, b) => (a.priority ?? 50) - (b.priority ?? 50));
}

export interface PolicyEvalResult {
  action: PolicyAction;
  matchedRule?: PolicyRule; // the rule that triggered the action (undefined = default allow)
  reason?: string; // human-readable reason (for loop detection, includes threshold info)
}

export class PolicyEngine {
  private rules: PolicyConfig['policies'];
  // Pre-compiled regexes keyed by pattern string — compiled once at load/reload time
  private compiledRegexes = new Map<string, RegExp>();
  private loopDetector?: ILoopDetector;

  constructor(store: PolicyStore, loopDetector?: ILoopDetector) {
    this.rules = sortByPriority(store.get().policies);
    this.loopDetector = loopDetector;
    this.compileRegexes();

    // Subscribe to store updates — swap cache + recompile + re-sort immediately
    store.subscribe(() => {
      this.rules = sortByPriority(store.get().policies);
      this.compileRegexes();
    });
  }

  evaluate(event: ToolCallEvent): PolicyEvalResult {
    for (const rule of this.rules) {
      // Skip disabled rules (enabled defaults to true when not set)
      if (rule.enabled === false) continue;

      if (!matchesRule(rule, event.agentId, event.toolName, event.input, this.compiledRegexes)) {
        continue;
      }

      // If the rule has a loop condition, only trigger when the condition is met
      if (rule.loop) {
        if (!this.loopDetector) continue; // no detector → skip loop rules
        const loopResult = this.loopDetector.checkCondition(
          event.sessionId, event.toolName, event.input, rule.loop,
        );
        if (!loopResult.loop) continue; // condition not met → skip this rule
        return {
          action: rule.action,
          matchedRule: rule,
          reason: loopResult.reason,
        };
      }

      return { action: rule.action, matchedRule: rule };
    }
    return { action: 'ALLOW' };
  }

  /**
   * Evaluate an LLM call event against the loaded policy rules.
   * Only rules with llmModel or llmProvider criteria (or agent-only rules) are considered.
   * Loop detection does not apply to LLM calls. Default action is ALLOW.
   */
  evaluateLlm(event: LlmCallEvent): PolicyEvalResult {
    for (const rule of this.rules) {
      if (rule.enabled === false) continue;
      if (!matchesLlmRule(rule, event)) continue;
      return { action: rule.action, matchedRule: rule };
    }
    return { action: 'ALLOW' };
  }

  getRules(): PolicyConfig['policies'] {
    return this.rules;
  }

  /**
   * Return rules that have content-based match criteria.
   * Used by evaluateLlmContent() in the content policy pipeline.
   */
  getContentRules(): PolicyConfig['policies'] {
    return this.rules.filter((r) => r.enabled !== false && r.match.content != null);
  }

  private compileRegexes(): void {
    this.compiledRegexes.clear();
    for (const rule of this.rules) {
      if (!rule.match.parameters) continue;
      for (const matcher of Object.values(rule.match.parameters)) {
        if (matcher.regex && !this.compiledRegexes.has(matcher.regex)) {
          try {
            this.compiledRegexes.set(matcher.regex, new RegExp(matcher.regex, 'i'));
          } catch {
            // Invalid regex in policy — skip (loader Zod validation should have caught it)
          }
        }
      }
    }
  }
}
```

- [ ] **Step 2: Verify engine.ts compiles**

```bash
cd /Users/atinderpalsingh/projects/aegis-bundle/rind/packages/policy-engine
npx tsc --noEmit --moduleResolution NodeNext --module NodeNext --strict 2>&1 | head -30 || true
```

- [ ] **Step 3: Commit**

```bash
cd /Users/atinderpalsingh/projects/aegis-bundle/rind
git add packages/policy-engine/src/engine.ts
git commit -m "feat(@rind/policy-engine): add engine.ts with ILoopDetector interface"
```

---

## Task 5: index.ts barrel + tests

**Files:**
- Create: `packages/policy-engine/src/index.ts`
- Create: `packages/policy-engine/src/__tests__/policy-engine.test.ts`
- Create: `packages/policy-engine/src/__tests__/packs.test.ts`
- Create: `packages/policy-engine/src/__tests__/policy-store.test.ts`
- Modify: `packages/policy-engine/src/index.ts` (replace the empty stub)

- [ ] **Step 1: Create index.ts**

Replace the empty stub at `packages/policy-engine/src/index.ts` with:

```typescript
// @rind/policy-engine — public API
export type { PolicyStore } from './store.js';
export { InMemoryPolicyStore } from './store.js';
export { loadPolicyFile, emptyPolicyConfig } from './loader.js';
export type { PolicyEvalResult, ILoopDetector } from './engine.js';
export { PolicyEngine } from './engine.js';
export { listPacks, getPack, expandPackRules, rulesFromPack, recommendPacks } from './packs.js';
export { matchesRule, matchesLlmRule } from './rules.js';
```

- [ ] **Step 2: Build the package**

```bash
cd /Users/atinderpalsingh/projects/aegis-bundle/rind/packages/policy-engine
pnpm build
```

Expected: `dist/index.js` and `dist/index.d.ts` created. No errors.

- [ ] **Step 3: Write policy-engine.test.ts**

Create `packages/policy-engine/src/__tests__/policy-engine.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { PolicyEngine } from '../engine.js';
import { InMemoryPolicyStore } from '../store.js';
import type { PolicyConfig, ToolCallEvent } from '@rind/core';

function makeEvent(toolName: string, agentId = 'agent-1', input: unknown = {}): ToolCallEvent {
  return {
    sessionId: 'session-1',
    agentId,
    serverId: 'server-1',
    toolName,
    input,
    timestamp: Date.now(),
  };
}

const config: PolicyConfig = {
  policies: [
    {
      name: 'block-destructive',
      agent: '*',
      match: { tool: ['delete', 'drop', 'truncate'] },
      action: 'DENY',
      failMode: 'closed',
    },
    {
      name: 'public-agent-restrictions',
      agent: 'agent-public',
      match: { toolPattern: 'billing.*' },
      action: 'DENY',
      failMode: 'closed',
    },
    {
      name: 'require-approval-export',
      agent: '*',
      match: { tool: ['export'] },
      action: 'REQUIRE_APPROVAL',
      failMode: 'closed',
    },
  ],
};

function makeEngine(cfg: PolicyConfig = config): PolicyEngine {
  return new PolicyEngine(new InMemoryPolicyStore(cfg));
}

describe('PolicyEngine — basic evaluation', () => {
  const engine = makeEngine();

  it('allows unmatched tool calls', () => {
    expect(engine.evaluate(makeEvent('get_user')).action).toBe('ALLOW');
  });

  it('returns no matchedRule on allow', () => {
    expect(engine.evaluate(makeEvent('get_user')).matchedRule).toBeUndefined();
  });

  it('denies tool names matching keyword list', () => {
    expect(engine.evaluate(makeEvent('user.delete')).action).toBe('DENY');
    expect(engine.evaluate(makeEvent('drop_table')).action).toBe('DENY');
  });

  it('denies billing tools for public agent', () => {
    expect(engine.evaluate(makeEvent('billing.charge', 'agent-public')).action).toBe('DENY');
  });

  it('allows billing tools for internal agent', () => {
    expect(engine.evaluate(makeEvent('billing.charge', 'agent-internal')).action).toBe('ALLOW');
  });

  it('first matching rule wins', () => {
    const result = engine.evaluate(makeEvent('export'));
    expect(result.action).toBe('REQUIRE_APPROVAL');
    expect(result.matchedRule?.name).toBe('require-approval-export');
  });
});

describe('PolicyEngine — store invalidation (D-021)', () => {
  it('picks up policy changes immediately after store update', () => {
    const store = new InMemoryPolicyStore({ policies: [] });
    const engine = new PolicyEngine(store);

    expect(engine.evaluate(makeEvent('db.execute')).action).toBe('ALLOW');

    store.update({
      policies: [
        {
          name: 'block-all-db',
          agent: '*',
          match: { tool: ['db.execute'] },
          action: 'DENY',
          failMode: 'closed',
        },
      ],
    });

    expect(engine.evaluate(makeEvent('db.execute')).action).toBe('DENY');
  });
});

describe('PolicyEngine — parameter matching (D-016)', () => {
  const paramCfg: PolicyConfig = {
    policies: [
      {
        name: 'block-drop-sql',
        agent: '*',
        match: {
          tool: ['db.execute'],
          parameters: { query: { contains: ['DROP', 'TABLE'] } },
        },
        action: 'DENY',
        failMode: 'closed',
      },
      {
        name: 'block-large-amounts',
        agent: '*',
        match: {
          tool: ['payment.charge'],
          parameters: { amount: { gt: 10000 } },
        },
        action: 'REQUIRE_APPROVAL',
        failMode: 'closed',
      },
    ],
  };
  const engine = makeEngine(paramCfg);

  it('blocks SQL containing DROP TABLE', () => {
    expect(engine.evaluate(makeEvent('db.execute', 'agent-1', { query: 'DROP TABLE users' })).action).toBe('DENY');
  });

  it('allows SQL that does not contain the pattern', () => {
    expect(engine.evaluate(makeEvent('db.execute', 'agent-1', { query: 'SELECT * FROM users' })).action).toBe('ALLOW');
  });

  it('requires approval for large amounts', () => {
    expect(engine.evaluate(makeEvent('payment.charge', 'agent-1', { amount: 50000 })).action).toBe('REQUIRE_APPROVAL');
  });

  it('allows small amounts', () => {
    expect(engine.evaluate(makeEvent('payment.charge', 'agent-1', { amount: 100 })).action).toBe('ALLOW');
  });
});

describe('PolicyEngine — subcommand matching', () => {
  const subConfig: PolicyConfig = {
    policies: [
      {
        name: 'block-git-push',
        agent: '*',
        match: {
          tool: ['Bash'],
          subcommand: ['git push', 'git reset'],
        },
        action: 'DENY',
        failMode: 'closed',
      },
    ],
  };
  const engine = makeEngine(subConfig);

  it('blocks git push', () => {
    expect(engine.evaluate(makeEvent('Bash', 'agent-1', { command: 'git push origin main' })).action).toBe('DENY');
  });

  it('blocks git push in compound command', () => {
    expect(engine.evaluate(makeEvent('Bash', 'agent-1', { command: 'git add . && git push' })).action).toBe('DENY');
  });

  it('allows git status', () => {
    expect(engine.evaluate(makeEvent('Bash', 'agent-1', { command: 'git status' })).action).toBe('ALLOW');
  });
});

describe('PolicyEngine — priority ordering', () => {
  it('evaluates lower priority numbers first', () => {
    const cfg: PolicyConfig = {
      policies: [
        { name: 'high-priority', agent: '*', match: { tool: ['action'] }, action: 'DENY', failMode: 'closed', priority: 10 },
        { name: 'low-priority', agent: '*', match: { tool: ['action'] }, action: 'ALLOW', failMode: 'closed', priority: 90 },
      ],
    };
    const result = makeEngine(cfg).evaluate(makeEvent('action'));
    expect(result.action).toBe('DENY');
    expect(result.matchedRule?.name).toBe('high-priority');
  });
});

describe('PolicyEngine — disabled rules', () => {
  it('skips disabled rules', () => {
    const cfg: PolicyConfig = {
      policies: [
        { name: 'disabled', agent: '*', match: { tool: ['action'] }, action: 'DENY', failMode: 'closed', enabled: false },
      ],
    };
    expect(makeEngine(cfg).evaluate(makeEvent('action')).action).toBe('ALLOW');
  });
});
```

- [ ] **Step 4: Write packs.test.ts**

Create `packages/policy-engine/src/__tests__/packs.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { listPacks, getPack, expandPackRules, rulesFromPack, recommendPacks } from '../packs.js';
import { InMemoryPolicyStore } from '../store.js';
import { PolicyEngine } from '../engine.js';
import type { ToolCallEvent } from '@rind/core';

function makeEvent(toolName: string, input: unknown = {}): ToolCallEvent {
  return { sessionId: 'sess-1', agentId: 'agent-1', serverId: 'srv-1', toolName, input, timestamp: Date.now() };
}

describe('listPacks', () => {
  it('returns at least the four Phase 1A packs', () => {
    const ids = listPacks().map((p) => p.id);
    expect(ids).toContain('sql-protection');
    expect(ids).toContain('shell-protection');
    expect(ids).toContain('filesystem-protection');
    expect(ids).toContain('exfil-protection');
  });
});

describe('getPack', () => {
  it('returns pack by id', () => {
    const pack = getPack('sql-protection');
    expect(pack).toBeDefined();
    expect(pack?.name).toBe('SQL Protection');
  });

  it('returns undefined for unknown pack', () => {
    expect(getPack('unknown-pack')).toBeUndefined();
  });
});

describe('expandPackRules', () => {
  it('stamps each rule with source metadata', () => {
    const pack = getPack('sql-protection')!;
    for (const rule of expandPackRules(pack)) {
      expect(rule._meta?.source).toBe('pack:sql-protection');
    }
  });

  it('sets priority to 100 (pack default)', () => {
    const pack = getPack('sql-protection')!;
    for (const rule of expandPackRules(pack)) {
      expect(rule.priority).toBe(100);
    }
  });
});

describe('rulesFromPack', () => {
  it('identifies rules from a given pack', () => {
    const pack = getPack('sql-protection')!;
    const expanded = expandPackRules(pack);
    const store = new InMemoryPolicyStore({ policies: expanded });
    const found = rulesFromPack(store.get().policies, 'sql-protection');
    expect(found.length).toBe(expanded.length);
  });

  it('returns empty when pack not enabled', () => {
    const store = new InMemoryPolicyStore({ policies: [] });
    expect(rulesFromPack(store.get().policies, 'sql-protection')).toHaveLength(0);
  });
});

describe('recommendPacks', () => {
  it('recommends sql-protection for sql_ tools', () => {
    const packs = recommendPacks(['sql_query', 'sql_execute']);
    expect(packs.map((p) => p.id)).toContain('sql-protection');
  });

  it('returns empty for unrelated tools', () => {
    expect(recommendPacks(['get_weather', 'read_file'])).toHaveLength(0);
  });
});

describe('cli-protection pack integration', () => {
  it('blocks rm -rf via engine', () => {
    const pack = getPack('cli-protection')!;
    const store = new InMemoryPolicyStore({ policies: expandPackRules(pack) });
    const engine = new PolicyEngine(store);
    const result = engine.evaluate(makeEvent('Bash', { command: 'rm -rf /' }));
    expect(result.action).toBe('DENY');
  });

  it('allows safe commands', () => {
    const pack = getPack('cli-protection')!;
    const store = new InMemoryPolicyStore({ policies: expandPackRules(pack) });
    const engine = new PolicyEngine(store);
    const result = engine.evaluate(makeEvent('Bash', { command: 'ls -la' }));
    expect(result.action).toBe('ALLOW');
  });
});
```

- [ ] **Step 5: Write policy-store.test.ts**

Create `packages/policy-engine/src/__tests__/policy-store.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { InMemoryPolicyStore } from '../store.js';
import type { PolicyRule } from '@rind/core';

function makeRule(name: string): PolicyRule {
  return { name, agent: '*', match: { tool: [name] }, action: 'DENY', failMode: 'closed' };
}

describe('InMemoryPolicyStore', () => {
  it('get() returns the initial config', () => {
    const store = new InMemoryPolicyStore({ policies: [makeRule('r1')] });
    expect(store.get().policies).toHaveLength(1);
  });

  it('update() replaces config atomically', () => {
    const store = new InMemoryPolicyStore({ policies: [] });
    store.update({ policies: [makeRule('r1'), makeRule('r2')] });
    expect(store.get().policies).toHaveLength(2);
  });

  it('subscribe() fires callback on update', () => {
    const store = new InMemoryPolicyStore({ policies: [] });
    let fired = 0;
    store.subscribe(() => fired++);
    store.update({ policies: [makeRule('r1')] });
    expect(fired).toBe(1);
  });

  it('subscribe() returns unsubscribe function', () => {
    const store = new InMemoryPolicyStore({ policies: [] });
    let fired = 0;
    const unsub = store.subscribe(() => fired++);
    unsub();
    store.update({ policies: [makeRule('r1')] });
    expect(fired).toBe(0);
  });

  it('addRule() appends a rule', () => {
    const store = new InMemoryPolicyStore({ policies: [] });
    store.addRule(makeRule('r1'));
    expect(store.get().policies).toHaveLength(1);
  });

  it('addRule() throws if name already exists', () => {
    const store = new InMemoryPolicyStore({ policies: [makeRule('r1')] });
    expect(() => store.addRule(makeRule('r1'))).toThrow('already exists');
  });

  it('updateRule() replaces by name', () => {
    const store = new InMemoryPolicyStore({ policies: [makeRule('r1')] });
    store.updateRule('r1', { ...makeRule('r1'), action: 'ALLOW' });
    expect(store.get().policies[0]?.action).toBe('ALLOW');
  });

  it('updateRule() throws if name not found', () => {
    const store = new InMemoryPolicyStore({ policies: [] });
    expect(() => store.updateRule('missing', makeRule('missing'))).toThrow('not found');
  });

  it('removeRule() removes by name and returns true', () => {
    const store = new InMemoryPolicyStore({ policies: [makeRule('r1')] });
    expect(store.removeRule('r1')).toBe(true);
    expect(store.get().policies).toHaveLength(0);
  });

  it('removeRule() returns false if name not found', () => {
    const store = new InMemoryPolicyStore({ policies: [] });
    expect(store.removeRule('missing')).toBe(false);
  });

  it('update() deduplicates rules by name (last wins)', () => {
    const store = new InMemoryPolicyStore({ policies: [] });
    store.update({
      policies: [makeRule('dup'), { ...makeRule('dup'), action: 'ALLOW' }],
    });
    expect(store.get().policies).toHaveLength(1);
    expect(store.get().policies[0]?.action).toBe('ALLOW');
  });
});
```

- [ ] **Step 6: Run tests**

```bash
cd /Users/atinderpalsingh/projects/aegis-bundle/rind/packages/policy-engine
pnpm test
```

Expected: All tests pass (3 test files, ~30 tests total).

- [ ] **Step 7: Commit**

```bash
cd /Users/atinderpalsingh/projects/aegis-bundle/rind
git add packages/policy-engine/src/index.ts packages/policy-engine/src/__tests__/
git commit -m "feat(@rind/policy-engine): index barrel + tests (30 tests passing)"
```

---

## Task 6: Proxy thin barrels + proxy package.json

**Files:**
- Modify: `apps/proxy/package.json`
- Replace: `apps/proxy/src/policy/engine.ts`
- Replace: `apps/proxy/src/policy/store.ts`
- Replace: `apps/proxy/src/policy/rules.ts`
- Replace: `apps/proxy/src/policy/loader.ts`
- Replace: `apps/proxy/src/policy/packs.ts`

- [ ] **Step 1: Add @rind/policy-engine to proxy's package.json**

In `apps/proxy/package.json`, add to `dependencies`:
```json
"@rind/policy-engine": "workspace:*"
```

- [ ] **Step 2: Install**

```bash
cd /Users/atinderpalsingh/projects/aegis-bundle/rind && pnpm install
```

- [ ] **Step 3: Convert policy/engine.ts to thin barrel**

Replace entire contents of `apps/proxy/src/policy/engine.ts` with:

```typescript
export { PolicyEngine, type ILoopDetector, type PolicyEvalResult } from '@rind/policy-engine';
```

- [ ] **Step 4: Convert policy/store.ts to thin barrel**

Replace entire contents of `apps/proxy/src/policy/store.ts` with:

```typescript
export { InMemoryPolicyStore, type PolicyStore } from '@rind/policy-engine';
```

- [ ] **Step 5: Convert policy/rules.ts to thin barrel**

Replace entire contents of `apps/proxy/src/policy/rules.ts` with:

```typescript
export { matchesRule, matchesLlmRule } from '@rind/policy-engine';
```

- [ ] **Step 6: Convert policy/loader.ts to thin barrel**

Replace entire contents of `apps/proxy/src/policy/loader.ts` with:

```typescript
export { loadPolicyFile, emptyPolicyConfig } from '@rind/policy-engine';
```

- [ ] **Step 7: Convert policy/packs.ts to thin barrel**

Replace entire contents of `apps/proxy/src/policy/packs.ts` with:

```typescript
export { listPacks, getPack, expandPackRules, rulesFromPack, recommendPacks } from '@rind/policy-engine';
```

- [ ] **Step 8: Check proxy typecheck**

```bash
cd /Users/atinderpalsingh/projects/aegis-bundle/rind/apps/proxy
npx tsc --noEmit 2>&1 | grep -v "pack-grid" | head -30 || true
```

Expected: No errors from policy files. (The existing pack-grid.tsx error in the dashboard is pre-existing and unrelated — ignore it.)

- [ ] **Step 9: Run proxy tests**

```bash
cd /Users/atinderpalsingh/projects/aegis-bundle/rind/apps/proxy
pnpm test 2>&1 | tail -20
```

Expected: All previously passing tests continue to pass.

- [ ] **Step 10: Commit**

```bash
cd /Users/atinderpalsingh/projects/aegis-bundle/rind
git add apps/proxy/package.json apps/proxy/src/policy/ pnpm-lock.yaml
git commit -m "refactor: wire proxy policy/ to @rind/policy-engine barrels"
```
