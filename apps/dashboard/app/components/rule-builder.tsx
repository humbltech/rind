// RuleBuilder — visual form + raw YAML/JSON editor for creating and editing policy rules.
// Left side: form fields for tool matching, parameter matching, subcommand matching.
// Right side: live YAML preview (visual mode) or raw YAML/JSON editor (raw mode).

'use client';

import { useState, useEffect, useMemo } from 'react';
import { X, Code, Eye, Plus, Trash2 } from 'lucide-react';
import type { PolicyRuleRow, ParameterMatcherUI } from './rule-list';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ParamEntry {
  key: string;
  matcherType: 'contains' | 'regex' | 'startsWith' | 'gt' | 'lt' | 'gte' | 'lte' | 'eq';
  value: string; // user-typed — parsed on save
}

interface RuleForm {
  name: string;
  agent: string;
  matchType: 'tool' | 'pattern';
  tools: string;
  toolPattern: string;
  action: PolicyRuleRow['action'];
  rateLimit: { limit: string; window: string };
  subcommands: string;
  parameters: ParamEntry[];
  priority: string;
  loop: { enabled: boolean; type: 'exact' | 'consecutive' | 'subcommand'; threshold: string; window: string };
}

interface RuleBuilderProps {
  initial?: PolicyRuleRow | null;
  onSave: (rule: PolicyRuleRow) => Promise<void>;
  onClose: () => void;
}

type EditorMode = 'visual' | 'raw';

const DEFAULT_FORM: RuleForm = {
  name: '',
  agent: '*',
  matchType: 'tool',
  tools: '',
  toolPattern: '',
  action: 'DENY',
  rateLimit: { limit: '10', window: '1m' },
  subcommands: '',
  parameters: [],
  priority: '50',
  loop: { enabled: false, type: 'exact', threshold: '3', window: '10' },
};

// ─── Component ────────────────────────────────────────────────────────────────

export function RuleBuilder({ initial, onSave, onClose }: RuleBuilderProps) {
  const [form, setForm]       = useState<RuleForm>(() => ruleToForm(initial));
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const [mode, setMode]       = useState<EditorMode>('visual');
  const [rawText, setRawText] = useState('');

  // Sync raw text when switching to raw mode
  useEffect(() => {
    if (mode === 'raw') setRawText(formToYaml(form));
  }, [mode]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  function set<K extends keyof RuleForm>(key: K, value: RuleForm[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    setError(null);
  }

  const yaml = useMemo(() => formToYaml(form), [form]);

  async function handleSave() {
    let rule: PolicyRuleRow | null;

    if (mode === 'raw') {
      try {
        rule = parseRawToRule(rawText);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Invalid YAML/JSON');
        return;
      }
    } else {
      rule = formToRule(form);
    }

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
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className={['w-full max-w-4xl bg-surface border border-border rounded-xl shadow-2xl flex flex-col overflow-hidden', mode === 'raw' ? 'h-[85vh]' : 'max-h-[90vh]'].join(' ')}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border-subtle shrink-0">
          <div>
            <h2 className="text-sm font-semibold text-foreground">
              {initial ? 'Edit rule' : 'New rule'}
            </h2>
            <p className="text-xs text-muted mt-0.5">
              {mode === 'visual' ? 'Fill in the fields — YAML updates live on the right.' : 'Edit raw YAML or paste JSON directly.'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setMode(mode === 'visual' ? 'raw' : 'visual')}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-muted hover:text-foreground border border-border rounded hover:bg-overlay transition-colors"
              title={mode === 'visual' ? 'Switch to raw editor' : 'Switch to visual editor'}
            >
              {mode === 'visual' ? <Code size={12} /> : <Eye size={12} />}
              {mode === 'visual' ? 'Raw editor' : 'Visual editor'}
            </button>
            <button type="button" onClick={onClose} className="p-1.5 text-dim hover:text-foreground hover:bg-overlay rounded transition-colors">
              <X size={15} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex flex-1 overflow-hidden divide-x divide-border-subtle">
          {mode === 'visual' ? (
            <>
              <FormPanel form={form} set={set} />
              <YamlPreview yaml={yaml} />
            </>
          ) : (
            <RawEditor value={rawText} onChange={setRawText} />
          )}
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
              {saving ? 'Saving\u2026' : initial ? 'Save changes' : 'Create rule'}
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
        <Input value={form.name} onChange={(v) => set('name', v)} placeholder="block-sql-deletes" mono />
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
          <Input value={form.tools} onChange={(v) => set('tools', v)} placeholder="Bash, Read, Edit" hint="Comma-separated tool names" mono />
        ) : (
          <Input value={form.toolPattern} onChange={(v) => set('toolPattern', v)} placeholder="sql_*" hint="* matches any characters" mono />
        )}
      </Field>

      {/* Sub-command matching */}
      <Field label="Sub-commands" hint="Bash sub-commands to match, comma-separated (e.g. git push, npm publish)">
        <Input value={form.subcommands} onChange={(v) => set('subcommands', v)} placeholder="git push, git reset" mono />
      </Field>

      {/* Parameter matching */}
      <ParameterSection
        entries={form.parameters}
        onChange={(params) => set('parameters', params)}
      />

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
            <Input value={form.rateLimit.limit} onChange={(v) => set('rateLimit', { ...form.rateLimit, limit: v })} placeholder="10" hint="Max calls" mono />
            <Input value={form.rateLimit.window} onChange={(v) => set('rateLimit', { ...form.rateLimit, window: v })} placeholder="1m" hint="Window (s/m/h/d)" mono />
          </div>
        </Field>
      )}

      <Field label="Priority" hint="Lower number = evaluated first. Default 50, pack rules use 100.">
        <Input value={form.priority} onChange={(v) => set('priority', v)} placeholder="50" mono />
      </Field>

      <Field label="Loop detection" hint="Only trigger this rule when the agent repeats the same call N times in a sliding window.">
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={form.loop.enabled}
            onChange={(e) => set('loop', { ...form.loop, enabled: e.target.checked })}
            className="rounded border-border accent-[var(--rind-accent)]"
          />
          <span className="text-xs text-muted">Enable loop detection</span>
        </label>
        {form.loop.enabled && (
          <div className="mt-2 flex gap-2">
            <div className="flex-1">
              <p className="text-[10px] text-dim mb-1">Type</p>
              <select
                value={form.loop.type}
                onChange={(e) => set('loop', { ...form.loop, type: e.target.value as RuleForm['loop']['type'] })}
                className="w-full px-2 py-1.5 text-xs rounded border border-border bg-canvas text-foreground focus:outline-none focus:ring-1 focus:ring-accent/50"
              >
                <option value="exact">exact — same input</option>
                <option value="consecutive">consecutive — any input</option>
                <option value="subcommand">subcommand — Bash only</option>
              </select>
            </div>
            <div className="w-20">
              <p className="text-[10px] text-dim mb-1">Threshold</p>
              <input
                type="number"
                min="2"
                value={form.loop.threshold}
                onChange={(e) => set('loop', { ...form.loop, threshold: e.target.value })}
                className="w-full px-2 py-1.5 text-xs font-mono rounded border border-border bg-canvas text-foreground focus:outline-none focus:ring-1 focus:ring-accent/50"
              />
            </div>
            <div className="w-20">
              <p className="text-[10px] text-dim mb-1">Window</p>
              <input
                type="number"
                min="2"
                value={form.loop.window}
                onChange={(e) => set('loop', { ...form.loop, window: e.target.value })}
                className="w-full px-2 py-1.5 text-xs font-mono rounded border border-border bg-canvas text-foreground focus:outline-none focus:ring-1 focus:ring-accent/50"
              />
            </div>
          </div>
        )}
      </Field>
    </div>
  );
}

// ─── Parameter matching section ──────────────────────────────────────────────

const MATCHER_TYPES = [
  { value: 'contains', label: 'contains' },
  { value: 'regex', label: 'regex' },
  { value: 'startsWith', label: 'starts with' },
  { value: 'gt', label: '>' },
  { value: 'lt', label: '<' },
  { value: 'gte', label: '>=' },
  { value: 'lte', label: '<=' },
  { value: 'eq', label: '=' },
] as const;

function ParameterSection({ entries, onChange }: { entries: ParamEntry[]; onChange: (entries: ParamEntry[]) => void }) {
  function addEntry() {
    onChange([...entries, { key: '', matcherType: 'contains', value: '' }]);
  }

  function updateEntry(idx: number, patch: Partial<ParamEntry>) {
    const next = entries.map((e, i) => i === idx ? { ...e, ...patch } : e);
    onChange(next);
  }

  function removeEntry(idx: number) {
    onChange(entries.filter((_, i) => i !== idx));
  }

  return (
    <Field label="Parameter matching" hint="Match tool input fields — key is the parameter name, e.g. &quot;command&quot; or &quot;query&quot;">
      <div className="space-y-2">
        {entries.map((entry, idx) => (
          <div key={idx} className="flex gap-2 items-start">
            <input
              type="text"
              value={entry.key}
              onChange={(e) => updateEntry(idx, { key: e.target.value })}
              placeholder="key"
              className="w-24 px-2 py-1.5 text-xs font-mono rounded border border-border bg-canvas text-foreground placeholder:text-dim focus:outline-none focus:ring-1 focus:ring-accent/50"
            />
            <select
              value={entry.matcherType}
              onChange={(e) => updateEntry(idx, { matcherType: e.target.value as ParamEntry['matcherType'] })}
              className="px-2 py-1.5 text-xs rounded border border-border bg-canvas text-foreground focus:outline-none focus:ring-1 focus:ring-accent/50"
            >
              {MATCHER_TYPES.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
            <input
              type="text"
              value={entry.value}
              onChange={(e) => updateEntry(idx, { value: e.target.value })}
              placeholder={entry.matcherType === 'contains' ? 'DROP, TABLE' : 'value'}
              className="flex-1 px-2 py-1.5 text-xs font-mono rounded border border-border bg-canvas text-foreground placeholder:text-dim focus:outline-none focus:ring-1 focus:ring-accent/50"
            />
            <button
              type="button"
              onClick={() => removeEntry(idx)}
              className="p-1.5 text-dim hover:text-critical hover:bg-critical/10 rounded transition-colors"
              title="Remove parameter"
            >
              <Trash2 size={12} />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={addEntry}
          className="flex items-center gap-1 text-xs text-accent hover:text-accent-dim transition-colors"
        >
          <Plus size={12} />
          Add parameter condition
        </button>
      </div>
    </Field>
  );
}

// ─── YAML preview panel ──────────────────────────────────────────────────────

function YamlPreview({ yaml }: { yaml: string }) {
  return (
    <div className="w-80 shrink-0 flex flex-col bg-canvas overflow-hidden">
      <div className="px-4 py-2.5 border-b border-border-subtle">
        <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-dim">YAML preview</span>
      </div>
      <pre className="flex-1 overflow-y-auto px-4 py-4 text-[11px] leading-relaxed font-mono text-muted whitespace-pre-wrap">
        {yaml}
      </pre>
    </div>
  );
}

// ─── Raw editor panel ────────────────────────────────────────────────────────

function RawEditor({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex-1 flex flex-col bg-canvas overflow-hidden">
      <div className="px-4 py-2.5 border-b border-border-subtle flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-dim">YAML / JSON</span>
        <span className="text-[10px] text-dim">Paste a full rule definition below</span>
      </div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        spellCheck={false}
        className="flex-1 w-full px-4 py-4 text-[11px] leading-relaxed font-mono text-foreground bg-canvas resize-none focus:outline-none min-h-[400px]"
        placeholder={RAW_PLACEHOLDER}
      />
    </div>
  );
}

const RAW_PLACEHOLDER = `# YAML format:
name: block-sql-deletes
agent: "*"
match:
  tool:
    - db.execute
  parameters:
    query:
      contains:
        - DROP
        - TABLE
action: DENY
failMode: closed

# Or JSON format:
# {"name": "block-sql-deletes", "match": {"tool": ["db.execute"]}, ...}`;

// ─── Form primitives ────────────────────────────────────────────────────────

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

// ─── Conversion helpers ─────────────────────────────────────────────────────

function ruleToForm(rule: PolicyRuleRow | null | undefined): RuleForm {
  if (!rule) return DEFAULT_FORM;

  const parameters: ParamEntry[] = [];
  if (rule.match.parameters) {
    for (const [key, matcher] of Object.entries(rule.match.parameters)) {
      if (matcher.contains?.length) {
        parameters.push({ key, matcherType: 'contains', value: matcher.contains.join(', ') });
      } else if (matcher.regex) {
        parameters.push({ key, matcherType: 'regex', value: matcher.regex });
      } else if (matcher.startsWith) {
        parameters.push({ key, matcherType: 'startsWith', value: matcher.startsWith });
      } else if (matcher.gt !== undefined) {
        parameters.push({ key, matcherType: 'gt', value: String(matcher.gt) });
      } else if (matcher.lt !== undefined) {
        parameters.push({ key, matcherType: 'lt', value: String(matcher.lt) });
      } else if (matcher.gte !== undefined) {
        parameters.push({ key, matcherType: 'gte', value: String(matcher.gte) });
      } else if (matcher.lte !== undefined) {
        parameters.push({ key, matcherType: 'lte', value: String(matcher.lte) });
      } else if (matcher.eq !== undefined) {
        parameters.push({ key, matcherType: 'eq', value: String(matcher.eq) });
      }
    }
  }

  return {
    name:        rule.name,
    agent:       rule.agent,
    matchType:   rule.match.toolPattern ? 'pattern' : 'tool',
    tools:       rule.match.tool?.join(', ') ?? '',
    toolPattern: rule.match.toolPattern ?? '',
    action:      rule.action,
    rateLimit:   rule.rateLimit
      ? { limit: String(rule.rateLimit.limit), window: rule.rateLimit.window }
      : DEFAULT_FORM.rateLimit,
    subcommands: rule.match.subcommand?.join(', ') ?? '',
    parameters,
    priority: String(rule.priority ?? 50),
    loop: rule.loop
      ? { enabled: true, type: rule.loop.type as RuleForm['loop']['type'], threshold: String(rule.loop.threshold), window: String(rule.loop.window ?? 10) }
      : DEFAULT_FORM.loop,
  };
}

function formToRule(form: RuleForm): PolicyRuleRow | null {
  if (!form.name.trim()) return null;

  const match: PolicyRuleRow['match'] = {};

  // Tool matching
  if (form.matchType === 'tool') {
    const tools = form.tools.split(',').map((t) => t.trim()).filter(Boolean);
    if (tools.length > 0) match.tool = tools;
  } else {
    if (form.toolPattern.trim()) match.toolPattern = form.toolPattern.trim();
  }

  // Sub-command matching
  const subcommands = form.subcommands.split(',').map((s) => s.trim()).filter(Boolean);
  if (subcommands.length > 0) match.subcommand = subcommands;

  // Parameter matching
  const validParams = form.parameters.filter((p) => p.key.trim() && p.value.trim());
  if (validParams.length > 0) {
    match.parameters = {};
    for (const p of validParams) {
      const matcher: ParameterMatcherUI = {};
      if (p.matcherType === 'contains') {
        matcher.contains = p.value.split(',').map((s) => s.trim()).filter(Boolean);
      } else if (p.matcherType === 'regex') {
        matcher.regex = p.value;
      } else if (p.matcherType === 'startsWith') {
        matcher.startsWith = p.value;
      } else if (['gt', 'lt', 'gte', 'lte'].includes(p.matcherType)) {
        const num = Number(p.value);
        if (!Number.isNaN(num)) {
          (matcher as Record<string, number>)[p.matcherType] = num;
        }
      } else if (p.matcherType === 'eq') {
        const num = Number(p.value);
        matcher.eq = Number.isNaN(num) ? p.value : num;
      }
      match.parameters[p.key.trim()] = matcher;
    }
  }

  const priority = Number(form.priority);
  const loop = form.loop.enabled
    ? { type: form.loop.type, threshold: Math.max(2, Number(form.loop.threshold) || 3), window: Math.max(2, Number(form.loop.window) || 10) }
    : undefined;

  return {
    name:   form.name.trim(),
    agent:  form.agent.trim() || '*',
    match,
    action: form.action,
    priority: Number.isNaN(priority) ? 50 : priority,
    ...(loop ? { loop } : {}),
    _meta: { source: 'manual' },
  };
}

function formToYaml(form: RuleForm): string {
  const lines: string[] = [];
  lines.push('name: ' + (form.name || '<name>'));
  lines.push('agent: "' + (form.agent || '*') + '"');
  lines.push('match:');

  if (form.matchType === 'tool') {
    const tools = form.tools.split(',').map((t) => t.trim()).filter(Boolean);
    if (tools.length > 0) {
      lines.push('  tool:');
      for (const t of tools) lines.push(`    - ${t}`);
    }
  } else {
    lines.push('  toolPattern: ' + (form.toolPattern || '<glob>'));
  }

  const subcommands = form.subcommands.split(',').map((s) => s.trim()).filter(Boolean);
  if (subcommands.length > 0) {
    lines.push('  subcommand:');
    for (const s of subcommands) lines.push(`    - "${s}"`);
  }

  const validParams = form.parameters.filter((p) => p.key.trim() && p.value.trim());
  if (validParams.length > 0) {
    lines.push('  parameters:');
    for (const p of validParams) {
      lines.push(`    ${p.key}:`);
      if (p.matcherType === 'contains') {
        lines.push('      contains:');
        for (const v of p.value.split(',').map((s) => s.trim()).filter(Boolean)) {
          lines.push(`        - "${v}"`);
        }
      } else if (p.matcherType === 'regex') {
        lines.push(`      regex: "${p.value}"`);
      } else if (p.matcherType === 'startsWith') {
        lines.push(`      startsWith: "${p.value}"`);
      } else if (['gt', 'lt', 'gte', 'lte'].includes(p.matcherType)) {
        lines.push(`      ${p.matcherType}: ${p.value}`);
      } else if (p.matcherType === 'eq') {
        lines.push(`      eq: ${p.value}`);
      }
    }
  }

  lines.push('action: ' + form.action);
  lines.push('priority: ' + (form.priority || '50'));

  if (form.action === 'RATE_LIMIT') {
    lines.push('rateLimit:');
    lines.push('  limit: ' + (form.rateLimit.limit || '10'));
    lines.push('  window: ' + (form.rateLimit.window || '1m'));
    lines.push('  scope: per_agent');
  }

  if (form.loop.enabled) {
    lines.push('loop:');
    lines.push('  type: ' + form.loop.type);
    lines.push('  threshold: ' + (form.loop.threshold || '3'));
    lines.push('  window: ' + (form.loop.window || '10'));
  }

  lines.push('failMode: closed');
  return lines.join('\n');
}

// ─── Raw editor parsing ─────────────────────────────────────────────────────

function parseRawToRule(text: string): PolicyRuleRow {
  const trimmed = text.trim();
  if (!trimmed) throw new Error('Empty input');

  let parsed: Record<string, unknown>;

  // Try JSON first
  if (trimmed.startsWith('{')) {
    try {
      parsed = JSON.parse(trimmed) as Record<string, unknown>;
    } catch {
      throw new Error('Invalid JSON — check syntax');
    }
  } else {
    // Try YAML — dynamic import not available in client component, so use simple parsing
    // Strip "policies:" wrapper and "- " prefix if present
    let yamlBody = trimmed;
    if (yamlBody.startsWith('policies:')) {
      yamlBody = yamlBody.replace(/^policies:\s*\n\s*-\s*/, '');
    }

    // For raw YAML, we send it to the server to parse
    // For now, attempt JSON-like extraction from YAML-style key: value
    try {
      parsed = simpleYamlParse(yamlBody);
    } catch {
      throw new Error('Could not parse input — use JSON format for complex rules, or switch to visual editor');
    }
  }

  if (!parsed.name || typeof parsed.name !== 'string') throw new Error('Rule must have a "name" field');
  if (!parsed.action || typeof parsed.action !== 'string') throw new Error('Rule must have an "action" field');

  return {
    name: parsed.name as string,
    agent: (parsed.agent as string) ?? '*',
    match: (parsed.match as PolicyRuleRow['match']) ?? {},
    action: parsed.action as PolicyRuleRow['action'],
    priority: typeof parsed.priority === 'number' ? parsed.priority : 50,
    failMode: (parsed.failMode as string) ?? 'closed',
    rateLimit: parsed.rateLimit as PolicyRuleRow['rateLimit'],
    _meta: { source: 'manual' },
  };
}

/** Minimal YAML-like parser for flat/shallow structures. For complex rules, use JSON. */
function simpleYamlParse(text: string): Record<string, unknown> {
  // Best-effort: handle simple key: value lines and nested objects
  // For production, this would use a real YAML library, but we avoid adding deps in the browser
  const result: Record<string, unknown> = {};
  const lines = text.split('\n');
  let currentKey: string | null = null;
  let currentObj: Record<string, unknown> | null = null;
  let currentArray: string[] | null = null;
  let currentArrayKey: string | null = null;

  for (const line of lines) {
    const trimmedLine = line.replace(/#.*$/, '').trimEnd(); // strip comments
    if (!trimmedLine.trim()) continue;

    const indent = line.length - line.trimStart().length;
    const content = trimmedLine.trim();

    // Array item
    if (content.startsWith('- ')) {
      const val = content.slice(2).replace(/^["']|["']$/g, '').trim();
      if (currentArray && currentArrayKey) {
        currentArray.push(val);
      }
      continue;
    }

    // Key: value
    const colonIdx = content.indexOf(':');
    if (colonIdx === -1) continue;

    const key = content.slice(0, colonIdx).trim();
    const val = content.slice(colonIdx + 1).trim();

    // Flush previous array
    if (currentArray && currentArrayKey) {
      if (currentObj) currentObj[currentArrayKey] = currentArray;
      else result[currentArrayKey] = currentArray;
      currentArray = null;
      currentArrayKey = null;
    }

    if (!val) {
      // Could be start of an object or array
      if (indent === 0) {
        currentKey = key;
        currentObj = {};
        result[key] = currentObj;
      } else if (currentObj) {
        // Sub-key with no value — could be array start
        currentArrayKey = key;
        currentArray = [];
      }
      continue;
    }

    // Clean value
    const cleanVal = val.replace(/^["']|["']$/g, '');
    const numVal = Number(cleanVal);

    const finalVal = cleanVal === 'true' ? true
      : cleanVal === 'false' ? false
      : !Number.isNaN(numVal) && cleanVal !== '' ? numVal
      : cleanVal;

    if (indent > 0 && currentObj) {
      currentObj[key] = finalVal;
    } else {
      currentObj = null;
      currentKey = null;
      result[key] = finalVal;
    }
  }

  // Flush final array
  if (currentArray && currentArrayKey) {
    if (currentObj) currentObj[currentArrayKey] = currentArray;
    else result[currentArrayKey] = currentArray;
  }

  return result;
}

// ─── Constants ──────────────────────────────────────────────────────────────

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
