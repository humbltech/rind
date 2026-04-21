// RuleBuilder — Level 2 visual form for creating and editing policy rules.
// Renders as a modal overlay with a form on the left and live YAML preview on the right.
// The YAML preview updates in real time as the user fills in fields, teaching the DSL.

'use client';

import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import type { PolicyRuleRow } from './rule-list';

// ─── Types ────────────────────────────────────────────────────────────────────

interface RuleForm {
  name: string;
  agent: string;
  matchType: 'tool' | 'pattern';
  tools: string;       // comma-separated tool names
  toolPattern: string;
  action: PolicyRuleRow['action'];
  rateLimit: { limit: string; window: string };
}

interface RuleBuilderProps {
  initial?: PolicyRuleRow | null;
  onSave: (rule: PolicyRuleRow) => Promise<void>;
  onClose: () => void;
}

const DEFAULT_FORM: RuleForm = {
  name: '',
  agent: '*',
  matchType: 'tool',
  tools: '',
  toolPattern: '',
  action: 'DENY',
  rateLimit: { limit: '10', window: '1m' },
};

// ─── Component ────────────────────────────────────────────────────────────────

export function RuleBuilder({ initial, onSave, onClose }: RuleBuilderProps) {
  const [form, setForm]     = useState<RuleForm>(() => ruleToForm(initial));
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState<string | null>(null);

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  function set<K extends keyof RuleForm>(key: K, value: RuleForm[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    setError(null);
  }

  const yaml = formToYaml(form);

  async function handleSave() {
    const rule = formToRule(form);
    if (!rule) { setError('Name and at least one match field are required.'); return; }
    setSaving(true);
    setError(null);
    try {
      await onSave(rule);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    // Backdrop
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-3xl bg-surface border border-border rounded-xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border-subtle shrink-0">
          <div>
            <h2 className="text-sm font-semibold text-foreground">
              {initial ? 'Edit rule' : 'New rule'}
            </h2>
            <p className="text-xs text-muted mt-0.5">
              Fill in the fields — YAML updates live on the right.
            </p>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 text-dim hover:text-foreground hover:bg-overlay rounded transition-colors">
            <X size={15} />
          </button>
        </div>

        {/* Body: form + preview */}
        <div className="flex flex-1 overflow-hidden divide-x divide-border-subtle">
          <FormPanel form={form} set={set} />
          <YamlPreview yaml={yaml} />
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-border-subtle shrink-0">
          {error
            ? <p className="text-xs text-critical">{error}</p>
            : <p className="text-xs text-dim">Priority defaults to 50 — lower numbers are evaluated first.</p>
          }
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="px-3 py-1.5 text-sm text-muted hover:text-foreground hover:bg-overlay rounded transition-colors">
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-1.5 text-sm font-medium text-canvas bg-accent hover:bg-accent-dim rounded transition-colors disabled:opacity-50"
            >
              {saving ? 'Saving…' : initial ? 'Save changes' : 'Create rule'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Form panel ───────────────────────────────────────────────────────────────

function FormPanel({ form, set }: { form: RuleForm; set: <K extends keyof RuleForm>(k: K, v: RuleForm[K]) => void }) {
  return (
    <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
      <Field label="Rule name" hint="Unique identifier — no spaces">
        <Input
          value={form.name}
          onChange={(v) => set('name', v)}
          placeholder="block-sql-deletes"
          mono
        />
      </Field>

      <Field label="Agent" hint="* = all agents, or enter a specific agent ID">
        <Input value={form.agent} onChange={(v) => set('agent', v)} placeholder="*" mono />
      </Field>

      <Field label="Match tools by">
        <div className="flex gap-2">
          {(['tool', 'pattern'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => set('matchType', t)}
              className={[
                'flex-1 py-1.5 text-xs rounded border transition-colors',
                form.matchType === t
                  ? 'bg-accent/10 border-accent/40 text-accent font-medium'
                  : 'border-border text-muted hover:border-border-subtle hover:text-foreground',
              ].join(' ')}
            >
              {t === 'tool' ? 'Tool names' : 'Glob pattern'}
            </button>
          ))}
        </div>
        {form.matchType === 'tool' ? (
          <Input
            value={form.tools}
            onChange={(v) => set('tools', v)}
            placeholder="sql_execute, db_query"
            hint="Comma-separated tool names"
            mono
          />
        ) : (
          <Input
            value={form.toolPattern}
            onChange={(v) => set('toolPattern', v)}
            placeholder="sql_*"
            hint="* matches any characters, e.g. sql_*"
            mono
          />
        )}
      </Field>

      <Field label="Action">
        <div className="grid grid-cols-2 gap-2">
          {(['DENY', 'ALLOW', 'REQUIRE_APPROVAL', 'RATE_LIMIT'] as const).map((a) => (
            <button
              key={a}
              type="button"
              onClick={() => set('action', a)}
              className={[
                'py-2 px-3 text-xs rounded border transition-colors text-left',
                form.action === a
                  ? ACTION_ACTIVE[a]
                  : 'border-border text-muted hover:border-border-subtle hover:text-foreground',
              ].join(' ')}
            >
              <span className="font-medium">{a.replace('_', ' ')}</span>
              <span className="block mt-0.5 text-[10px] opacity-70">{ACTION_HINTS[a]}</span>
            </button>
          ))}
        </div>
      </Field>

      {form.action === 'RATE_LIMIT' && (
        <Field label="Rate limit">
          <div className="flex gap-2">
            <Input
              value={form.rateLimit.limit}
              onChange={(v) => set('rateLimit', { ...form.rateLimit, limit: v })}
              placeholder="10"
              hint="Max calls"
              mono
            />
            <Input
              value={form.rateLimit.window}
              onChange={(v) => set('rateLimit', { ...form.rateLimit, window: v })}
              placeholder="1m"
              hint="Window (s/m/h/d)"
              mono
            />
          </div>
        </Field>
      )}
    </div>
  );
}

// ─── YAML preview panel ───────────────────────────────────────────────────────

function YamlPreview({ yaml }: { yaml: string }) {
  return (
    <div className="w-72 shrink-0 flex flex-col bg-canvas overflow-hidden">
      <div className="px-4 py-2.5 border-b border-border-subtle">
        <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-dim">YAML preview</span>
      </div>
      <pre className="flex-1 overflow-y-auto px-4 py-4 text-[11px] leading-relaxed font-mono text-muted whitespace-pre-wrap">
        {yaml}
      </pre>
    </div>
  );
}

// ─── Form primitives ──────────────────────────────────────────────────────────

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-medium text-foreground">{label}</label>
      {children}
      {hint && <p className="text-[10px] text-dim">{hint}</p>}
    </div>
  );
}

function Input({
  value, onChange, placeholder, hint, mono,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  hint?: string;
  mono?: boolean;
}) {
  return (
    <div className="space-y-1">
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={[
          'w-full px-3 py-2 text-xs rounded border border-border bg-canvas text-foreground placeholder:text-dim',
          'focus:outline-none focus:ring-1 focus:ring-accent/50 focus:border-accent/50 transition-colors',
          mono ? 'font-mono' : '',
        ].join(' ')}
      />
      {hint && <p className="text-[10px] text-dim">{hint}</p>}
    </div>
  );
}

// ─── Conversion helpers ───────────────────────────────────────────────────────

function ruleToForm(rule: PolicyRuleRow | null | undefined): RuleForm {
  if (!rule) return DEFAULT_FORM;
  return {
    name:        rule.name,
    agent:       rule.agent,
    matchType:   rule.match.toolPattern ? 'pattern' : 'tool',
    tools:       rule.match.tool?.join(', ') ?? '',
    toolPattern: rule.match.toolPattern ?? '',
    action:      rule.action,
    rateLimit:   DEFAULT_FORM.rateLimit,
  };
}

function formToRule(form: RuleForm): PolicyRuleRow | null {
  if (!form.name.trim()) return null;

  const match: PolicyRuleRow['match'] = {};
  if (form.matchType === 'tool') {
    const tools = form.tools.split(',').map((t) => t.trim()).filter(Boolean);
    if (tools.length > 0) match.tool = tools;
  } else {
    if (form.toolPattern.trim()) match.toolPattern = form.toolPattern.trim();
  }

  return {
    name:   form.name.trim(),
    agent:  form.agent.trim() || '*',
    match,
    action: form.action,
    priority: 50,
    _meta: { source: 'manual' },
  };
}

function formToYaml(form: RuleForm): string {
  const lines: string[] = ['policies:'];
  lines.push('  - name: ' + (form.name || '<name>'));
  lines.push('    agent: ' + (form.agent || '*'));
  lines.push('    match:');

  if (form.matchType === 'tool') {
    const tools = form.tools.split(',').map((t) => t.trim()).filter(Boolean);
    if (tools.length > 0) {
      lines.push('      tool:');
      for (const t of tools) lines.push(`        - ${t}`);
    } else {
      lines.push('      tool: []');
    }
  } else {
    lines.push('      toolPattern: ' + (form.toolPattern || '<glob>'));
  }

  lines.push('    action: ' + form.action);

  if (form.action === 'RATE_LIMIT') {
    lines.push('    rateLimit:');
    lines.push('      limit: ' + (form.rateLimit.limit || '10'));
    lines.push('      window: ' + (form.rateLimit.window || '1m'));
    lines.push("      scope: per_agent");
  }

  lines.push('    failMode: closed');
  return lines.join('\n');
}

// ─── Constants ────────────────────────────────────────────────────────────────

const ACTION_ACTIVE: Record<PolicyRuleRow['action'], string> = {
  DENY:             'bg-critical/10 border-critical/40 text-critical',
  ALLOW:            'bg-accent/10 border-accent/40 text-accent',
  REQUIRE_APPROVAL: 'bg-warning/10 border-warning/40 text-warning',
  RATE_LIMIT:       'bg-overlay border-border text-foreground',
};

const ACTION_HINTS: Record<PolicyRuleRow['action'], string> = {
  DENY:             'Block immediately',
  ALLOW:            'Always permit',
  REQUIRE_APPROVAL: 'Pause for review',
  RATE_LIMIT:       'Cap call frequency',
};
