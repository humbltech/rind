// Policies page — Level 1 (pack grid) + Level 2 (visual rule builder) configuration experience.
// Implements D-036: multi-modal policy authoring. Implements D-039: three derived pack states.
//
// Architecture: Client Component that polls the proxy API every 3s.
// Pack state (Disabled / Enabled / Customized) is derived client-side by comparing
// active rules against pack definitions — packs are authoring tools, rules are runtime reality.

'use client';

import { useEffect, useState, useCallback } from 'react';
import { Plus } from 'lucide-react';
import { Sidebar } from '../components/sidebar';
import { PackGrid, type PackSummary } from '../components/pack-grid';
import { PackPreviewSheet } from '../components/pack-preview-sheet';
import { RuleList, type PolicyRuleRow } from '../components/rule-list';
import { RuleBuilder } from '../components/rule-builder';
import { getPacks, getPolicies, enablePack, disablePack, addRule, updateRule, deleteRule, toggleRule, type PackWithState } from '../lib/api.js';

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PoliciesPage() {
  const { packs, rules, isConnected, reload } = usePolicyData();
  const [editingRule, setEditingRule]     = useState<PolicyRuleRow | null | undefined>(undefined);
  // undefined = closed, null = new rule, PolicyRuleRow = edit existing

  const [previewingPackId, setPreviewingPackId] = useState<string | null>(null);

  const packSummaries = derivePacks(packs, rules);

  async function handlePackToggle(packId: string, enable: boolean) {
    if (enable) await enablePack(packId);
    else await disablePack(packId);
    reload();
  }

  async function handleRuleDelete(name: string) {
    await deleteRule(name);
    reload();
  }

  async function handleRuleToggle(name: string) {
    await toggleRule(name);
    reload();
  }

  async function handleRuleSave(rule: PolicyRuleRow) {
    if (editingRule != null) await updateRule(editingRule.name, rule);
    else await addRule(rule);
    reload();
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-auto">
        <div className="max-w-[1400px] mx-auto px-8 py-8 space-y-10">
          <PageTitle connected={isConnected} />
          <PackSection   packs={packSummaries} onToggle={handlePackToggle} onPreview={setPreviewingPackId} />
          <RulesSection  rules={rules} onDelete={handleRuleDelete} onEdit={setEditingRule} onNew={() => setEditingRule(null)} onToggle={handleRuleToggle} />
        </div>
      </main>

      {editingRule !== undefined && (
        <RuleBuilder
          initial={editingRule}
          onSave={handleRuleSave}
          onClose={() => setEditingRule(undefined)}
        />
      )}

      {previewingPackId && (
        <PackPreviewSheet
          packId={previewingPackId}
          onClose={() => setPreviewingPackId(null)}
        />
      )}
    </div>
  );
}

// ─── Page sections ────────────────────────────────────────────────────────────

function PageTitle({ connected }: { connected: boolean }) {
  return (
    <div className="flex items-start justify-between">
      <div>
        <h1 className="text-xl font-semibold text-foreground tracking-tight">Policies</h1>
        <p className="mt-0.5 text-sm text-muted">Enable policy packs or build custom rules</p>
      </div>
      <div className="flex items-center gap-2 mt-1">
        <span className={['w-1.5 h-1.5 rounded-full', connected ? 'bg-accent' : 'bg-critical'].join(' ')} />
        <span className="text-[10px] text-dim">{connected ? 'Proxy connected' : 'Proxy offline'}</span>
      </div>
    </div>
  );
}

function PackSection({ packs, onToggle, onPreview }: {
  packs: PackSummary[];
  onToggle: (id: string, enable: boolean) => Promise<void>;
  onPreview: (id: string) => void;
}) {
  return (
    <section>
      <SectionLabel>Policy packs</SectionLabel>
      <p className="mt-1 mb-4 text-xs text-dim">
        One-click bundles — enable a pack to activate its rules immediately.
      </p>
      <PackGrid packs={packs} onToggle={onToggle} onPreview={onPreview} />
    </section>
  );
}

function RulesSection({
  rules, onDelete, onEdit, onNew, onToggle,
}: {
  rules: PolicyRuleRow[];
  onDelete: (name: string) => Promise<void>;
  onEdit: (rule: PolicyRuleRow) => void;
  onNew: () => void;
  onToggle: (name: string) => Promise<void>;
}) {
  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <SectionLabel>Active rules</SectionLabel>
        <button
          type="button"
          onClick={onNew}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-canvas bg-accent hover:bg-accent-dim rounded transition-colors"
        >
          <Plus size={12} />
          New rule
        </button>
      </div>
      <RuleList rules={rules} onDelete={onDelete} onEdit={onEdit} onToggle={onToggle} />
    </section>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-xs font-semibold uppercase tracking-[0.1em] text-muted">{children}</h2>
  );
}

// ─── Pack state derivation (D-039) ────────────────────────────────────────────
// Three states derived from rules, not stored:
//   Disabled  — no rules with _meta.source === 'pack:id'
//   Enabled   — pack rules present and count matches pack total
//   Customized — pack rules present but count < pack total (some deleted/edited)

function derivePacks(apiPacks: PackWithState[], rules: PolicyRuleRow[]): PackSummary[] {
  return apiPacks.map((pack) => {
    const packRules    = rules.filter((r) => r._meta?.source === `pack:${pack.id}`);
    const activeCount  = packRules.length;
    const totalCount   = pack.rules.length;
    const enabled      = activeCount > 0;
    const customized   = enabled && activeCount < totalCount;

    return {
      id:              pack.id,
      name:            pack.name,
      description:     pack.description,
      category:        pack.category,
      severity:        pack.severity,
      enabled,
      customized,
      activeRuleCount: enabled ? activeCount : undefined,
      totalRuleCount:  enabled ? totalCount  : undefined,
    };
  });
}

// ─── Data polling hook ────────────────────────────────────────────────────────

function usePolicyData() {
  const [packs, setPacks]           = useState<PackWithState[]>([]);
  const [rules, setRules]           = useState<PolicyRuleRow[]>([]);
  const [isConnected, setConnected] = useState(false);
  const [version, setVersion]       = useState(0);

  // Expose a reload trigger for after mutations
  const reload = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    let active = true;

    async function poll() {
      try {
        const [packsData, rulesData] = await Promise.all([
          getPacks(),
          getPolicies(),
        ]);

        if (!active) return;

        setPacks(packsData);
        setRules(rulesData.policies);
        setConnected(true);
      } catch {
        if (active) setConnected(false);
      }
    }

    poll();
    const interval = setInterval(poll, 3000);
    return () => { active = false; clearInterval(interval); };
  }, [version]);

  return { packs, rules, isConnected, reload };
}

