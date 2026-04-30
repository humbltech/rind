// RuleBuilder — visual form + raw YAML/JSON editor for creating and editing policy rules.
//
// Rule types:
//   tool-call    — match on tool name / pattern / parameters / subcommand / loop
//   llm-gateway  — match on LLM model name or provider
//   llm-content  — detect PII / secrets / injection / DLP in LLM request or response body
//
// Right panel has two tabs: YAML preview and Help reference.

'use client';

import { useState, useEffect, useMemo } from 'react';
import { X, Code, Eye, Plus, Trash2, HelpCircle, FileCode } from 'lucide-react';
import type { PolicyRuleRow, ParameterMatcherUI } from './rule-list';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ParamEntry {
  key: string;
  matcherType: 'contains' | 'regex' | 'startsWith' | 'gt' | 'lt' | 'gte' | 'lte' | 'eq';
  value: string;
}

interface DlpPatternEntry {
  regex: string;
  label: string;
}

interface RuleForm {
  ruleType: 'tool-call' | 'llm-gateway' | 'llm-content';
  name: string;
  agent: string;
  // Tool-call fields
  matchType: 'tool' | 'pattern';
  tools: string;
  toolPattern: string;
  subcommands: string;
  parameters: ParamEntry[];
  loop: { enabled: boolean; type: 'exact' | 'consecutive' | 'subcommand'; threshold: string; window: string };
  // LLM gateway fields
  llmModels: string;
  llmProviders: string[];
  // LLM content fields
  contentScope: 'request' | 'response' | 'both';
  contentTargets: string[];
  detectors: string[];
  piiEntities: string[];
  piiLocale: string;
  secretPatterns: string[];
  dlpPatterns: DlpPatternEntry[];
  // Action config
  action: PolicyRuleRow['action'];
  redactReplacement: string;
  rateLimit: { limit: string; window: string };
  priority: string;
}

interface RuleBuilderProps {
  initial?: PolicyRuleRow | null;
  onSave: (rule: PolicyRuleRow) => Promise<void>;
  onClose: () => void;
}

type EditorMode = 'visual' | 'raw';
type RightTab  = 'yaml' | 'help';

const DEFAULT_FORM: RuleForm = {
  ruleType:          'tool-call',
  name:              '',
  agent:             '*',
  matchType:         'tool',
  tools:             '',
  toolPattern:       '',
  subcommands:       '',
  parameters:        [],
  loop:              { enabled: false, type: 'exact', threshold: '3', window: '10' },
  llmModels:         '',
  llmProviders:      [],
  contentScope:      'both',
  contentTargets:    [],
  detectors:         [],
  piiEntities:       [],
  piiLocale:         'en-CA',
  secretPatterns:    [],
  dlpPatterns:       [],
  action:            'DENY',
  redactReplacement: '[REDACTED]',
  rateLimit:         { limit: '10', window: '1m' },
  priority:          '50',
};

// ─── Component ────────────────────────────────────────────────────────────────

export function RuleBuilder({ initial, onSave, onClose }: RuleBuilderProps) {
  const [form, setForm]           = useState<RuleForm>(() => ruleToForm(initial));
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [mode, setMode]           = useState<EditorMode>('visual');
  const [rightTab, setRightTab]   = useState<RightTab>('yaml');
  const [rawText, setRawText]     = useState('');

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

  function setRuleType(ruleType: RuleForm['ruleType']) {
    setForm((f) => {
      const validActions = ACTIONS_FOR_TYPE[ruleType];
      const action = validActions.includes(f.action) ? f.action : validActions[0]!;
      return { ...f, ruleType, action };
    });
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
            <h2 className="text-sm font-semibold text-foreground">{initial ? 'Edit rule' : 'New rule'}</h2>
            <p className="text-xs text-muted mt-0.5">
              {mode === 'visual' ? 'Fill in the fields — YAML updates live on the right.' : 'Edit raw YAML or paste JSON directly.'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setMode(mode === 'visual' ? 'raw' : 'visual')}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-muted hover:text-foreground border border-border rounded hover:bg-overlay transition-colors"
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
              <FormPanel form={form} set={set} setRuleType={setRuleType} />
              <RightPanel tab={rightTab} onTab={setRightTab} yaml={yaml} ruleType={form.ruleType} action={form.action} />
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
            <button type="button" onClick={onClose} className="px-3 py-1.5 text-sm text-muted hover:text-foreground hover:bg-overlay rounded transition-colors">Cancel</button>
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

function FormPanel({
  form,
  set,
  setRuleType,
}: {
  form: RuleForm;
  set: <K extends keyof RuleForm>(k: K, v: RuleForm[K]) => void;
  setRuleType: (t: RuleForm['ruleType']) => void;
}) {
  const actions = ACTIONS_FOR_TYPE[form.ruleType];
  const showActionConfig = form.ruleType === 'llm-content' && (form.action === 'REDACT' || form.action === 'PSEUDONYMIZE');

  return (
    <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
      {/* Rule type selector */}
      <Field label="Rule type">
        <div className="flex gap-2">
          {RULE_TYPES.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              onClick={() => setRuleType(value)}
              className={[
                'flex-1 py-1.5 text-xs rounded border transition-colors',
                form.ruleType === value
                  ? 'bg-accent/10 border-accent/40 text-accent font-medium'
                  : 'border-border text-muted hover:border-border-subtle hover:text-foreground',
              ].join(' ')}
            >
              {label}
            </button>
          ))}
        </div>
      </Field>

      <Field label="Rule name" hint="Unique identifier — no spaces">
        <Input value={form.name} onChange={(v) => set('name', v)} placeholder="block-sql-deletes" mono />
      </Field>

      <Field label="Agent" hint="* = all agents, or enter a specific agent ID">
        <Input value={form.agent} onChange={(v) => set('agent', v)} placeholder="*" mono />
      </Field>

      {form.ruleType === 'tool-call'   && <ToolCallFields   form={form} set={set} />}
      {form.ruleType === 'llm-gateway' && <LlmGatewayFields form={form} set={set} />}
      {form.ruleType === 'llm-content' && <LlmContentFields form={form} set={set} />}

      {/* Action grid — filtered by rule type */}
      <Field label="Action">
        <div className="grid grid-cols-2 gap-2">
          {actions.map((a) => (
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
              <span className="font-medium">{a.replaceAll('_', ' ')}</span>
              <span className="block mt-0.5 text-[10px] opacity-70">{ACTION_HINTS[a]}</span>
            </button>
          ))}
        </div>
      </Field>

      {/* Action-specific config */}
      {showActionConfig && (
        <ActionConfigFields form={form} set={set} />
      )}

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
    </div>
  );
}

// ─── Action-specific config ───────────────────────────────────────────────────

function ActionConfigFields({ form, set }: { form: RuleForm; set: <K extends keyof RuleForm>(k: K, v: RuleForm[K]) => void }) {
  if (form.action === 'REDACT') {
    return (
      <Field
        label="Replacement text"
        hint='Text that replaces each matched value. Use [REDACTED], ***, or a custom string.'
      >
        <Input
          value={form.redactReplacement}
          onChange={(v) => set('redactReplacement', v)}
          placeholder="[REDACTED]"
          mono
        />
      </Field>
    );
  }

  if (form.action === 'PSEUDONYMIZE') {
    return (
      <div className="rounded border border-border bg-overlay/40 px-3 py-2.5 space-y-1">
        <p className="text-[10px] font-medium text-foreground">Token format</p>
        <p className="text-[10px] text-dim leading-relaxed">
          Each detected value is replaced with a unique token: <code className="font-mono text-accent">{'<EMAIL_1>'}</code>, <code className="font-mono text-accent">{'<PHONE_2>'}</code>, etc.
          The original values are held in a per-request vault and restored in the LLM response before it reaches the agent.
          Tokens are scoped to the request — they are never persisted.
        </p>
      </div>
    );
  }

  return null;
}

// ─── Tool call match fields ───────────────────────────────────────────────────

function ToolCallFields({ form, set }: { form: RuleForm; set: <K extends keyof RuleForm>(k: K, v: RuleForm[K]) => void }) {
  return (
    <>
      <Field label="Match tools by">
        <div className="flex gap-2 mb-2">
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

      <Field label="Sub-commands" hint="Bash sub-commands to match, comma-separated (e.g. git push, npm publish)">
        <Input value={form.subcommands} onChange={(v) => set('subcommands', v)} placeholder="git push, git reset" mono />
      </Field>

      <ParameterSection entries={form.parameters} onChange={(params) => set('parameters', params)} />

      <Field label="Loop detection" hint="Only trigger when the agent repeats the same call N times in a sliding window.">
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
              <input type="number" min="2" value={form.loop.threshold}
                onChange={(e) => set('loop', { ...form.loop, threshold: e.target.value })}
                className="w-full px-2 py-1.5 text-xs font-mono rounded border border-border bg-canvas text-foreground focus:outline-none focus:ring-1 focus:ring-accent/50"
              />
            </div>
            <div className="w-20">
              <p className="text-[10px] text-dim mb-1">Window</p>
              <input type="number" min="2" value={form.loop.window}
                onChange={(e) => set('loop', { ...form.loop, window: e.target.value })}
                className="w-full px-2 py-1.5 text-xs font-mono rounded border border-border bg-canvas text-foreground focus:outline-none focus:ring-1 focus:ring-accent/50"
              />
            </div>
          </div>
        )}
      </Field>
    </>
  );
}

// ─── LLM gateway match fields ─────────────────────────────────────────────────

function LlmGatewayFields({ form, set }: { form: RuleForm; set: <K extends keyof RuleForm>(k: K, v: RuleForm[K]) => void }) {
  return (
    <>
      <Field label="Model patterns" hint="Comma-separated glob patterns — e.g. claude-sonnet-*, gpt-4o">
        <Input value={form.llmModels} onChange={(v) => set('llmModels', v)} placeholder="claude-sonnet-*, gpt-4o" mono />
      </Field>
      <Field label="Providers" hint="Leave empty to match all providers">
        <ChipSelector options={LLM_PROVIDER_OPTIONS} selected={form.llmProviders} onChange={(v) => set('llmProviders', v)} />
      </Field>
    </>
  );
}

// ─── LLM content match fields ─────────────────────────────────────────────────

function LlmContentFields({ form, set }: { form: RuleForm; set: <K extends keyof RuleForm>(k: K, v: RuleForm[K]) => void }) {
  const hasPii     = form.detectors.includes('pii');
  const hasSecrets = form.detectors.includes('secrets');
  const hasDlp     = form.detectors.includes('dlp');

  return (
    <>
      <Field label="Scope">
        <div className="flex gap-2">
          {(['request', 'response', 'both'] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => set('contentScope', s)}
              className={[
                'flex-1 py-1.5 text-xs rounded border transition-colors capitalize',
                form.contentScope === s
                  ? 'bg-accent/10 border-accent/40 text-accent font-medium'
                  : 'border-border text-muted hover:border-border-subtle hover:text-foreground',
              ].join(' ')}
            >
              {s}
            </button>
          ))}
        </div>
      </Field>

      <Field label="Targets" hint="Which message roles to scan. Leave empty to scan all.">
        <ChipSelector options={CONTENT_TARGET_OPTIONS} selected={form.contentTargets} onChange={(v) => set('contentTargets', v)} />
      </Field>

      <Field label="Detectors">
        <ChipSelector options={DETECTOR_OPTIONS} selected={form.detectors} onChange={(v) => set('detectors', v)} />
      </Field>

      {hasPii && (
        <>
          <Field label="PII entities" hint="Leave empty to detect all supported types.">
            <ChipSelector options={PII_ENTITY_OPTIONS} selected={form.piiEntities} onChange={(v) => set('piiEntities', v)} />
          </Field>
          <Field label="Locale" hint="Locale for locale-specific patterns (SIN = Canada, SSN = US)">
            <Input value={form.piiLocale} onChange={(v) => set('piiLocale', v)} placeholder="en-CA" mono />
          </Field>
        </>
      )}

      {hasSecrets && (
        <Field label="Secret patterns" hint="Leave empty to use all built-in patterns.">
          <ChipSelector options={SECRET_PATTERN_OPTIONS} selected={form.secretPatterns} onChange={(v) => set('secretPatterns', v)} />
        </Field>
      )}

      {hasDlp && (
        <DlpPatternEditor
          patterns={form.dlpPatterns}
          onChange={(v) => set('dlpPatterns', v)}
        />
      )}
    </>
  );
}

// ─── DLP pattern editor ───────────────────────────────────────────────────────

function DlpPatternEditor({ patterns, onChange }: { patterns: DlpPatternEntry[]; onChange: (v: DlpPatternEntry[]) => void }) {
  function add() {
    onChange([...patterns, { regex: '', label: '' }]);
  }
  function update(idx: number, patch: Partial<DlpPatternEntry>) {
    onChange(patterns.map((p, i) => i === idx ? { ...p, ...patch } : p));
  }
  function remove(idx: number) {
    onChange(patterns.filter((_, i) => i !== idx));
  }

  return (
    <Field
      label="Custom patterns"
      hint="Each pattern is a regex. Label is used as the token prefix for PSEUDONYMIZE (e.g. EMP_ID → <EMP_ID_1>) or appears in audit logs for REDACT."
    >
      <div className="space-y-2">
        {patterns.map((p, idx) => (
          <div key={idx} className="flex gap-2 items-start">
            <div className="flex-1">
              <input
                type="text"
                value={p.regex}
                onChange={(e) => update(idx, { regex: e.target.value })}
                placeholder="EMP-\d{6}"
                className="w-full px-2 py-1.5 text-xs font-mono rounded border border-border bg-canvas text-foreground placeholder:text-dim focus:outline-none focus:ring-1 focus:ring-accent/50"
              />
            </div>
            <div className="w-28">
              <input
                type="text"
                value={p.label}
                onChange={(e) => update(idx, { label: e.target.value })}
                placeholder="employee-id"
                className="w-full px-2 py-1.5 text-xs font-mono rounded border border-border bg-canvas text-foreground placeholder:text-dim focus:outline-none focus:ring-1 focus:ring-accent/50"
              />
            </div>
            <button
              type="button"
              onClick={() => remove(idx)}
              className="p-1.5 text-dim hover:text-critical hover:bg-critical/10 rounded transition-colors"
              title="Remove pattern"
            >
              <Trash2 size={12} />
            </button>
          </div>
        ))}
        {patterns.length === 0 && (
          <p className="text-[10px] text-dim">No custom patterns yet. Add one below.</p>
        )}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={add}
            className="flex items-center gap-1 text-xs text-accent hover:text-accent-dim transition-colors"
          >
            <Plus size={12} />
            Add pattern
          </button>
          <span className="text-[10px] text-dim">regex · label</span>
        </div>
      </div>
    </Field>
  );
}

// ─── Chip selector ────────────────────────────────────────────────────────────

function ChipSelector({
  options,
  selected,
  onChange,
}: {
  options: readonly { value: string; label: string }[];
  selected: string[];
  onChange: (v: string[]) => void;
}) {
  function toggle(value: string) {
    onChange(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value]);
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map(({ value, label }) => (
        <button
          key={value}
          type="button"
          onClick={() => toggle(value)}
          className={[
            'px-2 py-1 text-[10px] rounded border transition-colors',
            selected.includes(value)
              ? 'bg-accent/10 border-accent/40 text-accent font-medium'
              : 'border-border text-dim hover:border-border-subtle hover:text-muted',
          ].join(' ')}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

// ─── Parameter matching section ───────────────────────────────────────────────

const MATCHER_TYPES = [
  { value: 'contains',   label: 'contains' },
  { value: 'regex',      label: 'regex' },
  { value: 'startsWith', label: 'starts with' },
  { value: 'gt',         label: '>' },
  { value: 'lt',         label: '<' },
  { value: 'gte',        label: '>=' },
  { value: 'lte',        label: '<=' },
  { value: 'eq',         label: '=' },
] as const;

function ParameterSection({ entries, onChange }: { entries: ParamEntry[]; onChange: (entries: ParamEntry[]) => void }) {
  function addEntry() { onChange([...entries, { key: '', matcherType: 'contains', value: '' }]); }
  function updateEntry(idx: number, patch: Partial<ParamEntry>) {
    onChange(entries.map((e, i) => i === idx ? { ...e, ...patch } : e));
  }
  function removeEntry(idx: number) { onChange(entries.filter((_, i) => i !== idx)); }

  return (
    <Field label="Parameter matching" hint='Match tool input fields — key is the parameter name, e.g. "command" or "query"'>
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
              {MATCHER_TYPES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
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
        <button type="button" onClick={addEntry} className="flex items-center gap-1 text-xs text-accent hover:text-accent-dim transition-colors">
          <Plus size={12} />
          Add parameter condition
        </button>
      </div>
    </Field>
  );
}

// ─── Right panel (tabbed: YAML preview / Help) ────────────────────────────────

function RightPanel({
  tab, onTab, yaml, ruleType, action,
}: {
  tab: RightTab;
  onTab: (t: RightTab) => void;
  yaml: string;
  ruleType: RuleForm['ruleType'];
  action: RuleForm['action'];
}) {
  return (
    <div className="w-80 shrink-0 flex flex-col bg-canvas overflow-hidden">
      {/* Tab bar */}
      <div className="flex border-b border-border-subtle shrink-0">
        <button
          type="button"
          onClick={() => onTab('yaml')}
          className={[
            'flex items-center gap-1.5 px-3 py-2.5 text-[10px] font-semibold uppercase tracking-[0.08em] border-b-2 transition-colors',
            tab === 'yaml'
              ? 'border-accent text-accent'
              : 'border-transparent text-dim hover:text-muted',
          ].join(' ')}
        >
          <FileCode size={10} />
          YAML
        </button>
        <button
          type="button"
          onClick={() => onTab('help')}
          className={[
            'flex items-center gap-1.5 px-3 py-2.5 text-[10px] font-semibold uppercase tracking-[0.08em] border-b-2 transition-colors',
            tab === 'help'
              ? 'border-accent text-accent'
              : 'border-transparent text-dim hover:text-muted',
          ].join(' ')}
        >
          <HelpCircle size={10} />
          Help
        </button>
      </div>

      {tab === 'yaml' ? (
        <pre className="flex-1 overflow-y-auto px-4 py-4 text-[11px] leading-relaxed font-mono text-muted whitespace-pre-wrap">
          {yaml}
        </pre>
      ) : (
        <HelpPanel ruleType={ruleType} action={action} />
      )}
    </div>
  );
}

// ─── Help panel ───────────────────────────────────────────────────────────────

function HelpPanel({ ruleType, action }: { ruleType: RuleForm['ruleType']; action: RuleForm['action'] }) {
  const content = HELP_CONTENT[ruleType];
  const example = (action === 'PSEUDONYMIZE' || action === 'REDACT')
    ? (HELP_EXAMPLES_BY_ACTION[action] ?? content.example)
    : content.example;

  return (
    <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 text-[11px]">
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-dim mb-1">{content.title}</p>
        <p className="text-muted leading-relaxed">{content.description}</p>
      </div>

      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-dim mb-2">Example YAML</p>
        <pre className="text-[10px] font-mono text-muted bg-overlay/50 border border-border rounded px-3 py-3 whitespace-pre overflow-x-auto leading-relaxed">
          {example}
        </pre>
      </div>

      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-dim mb-2">Fields</p>
        <div className="space-y-2">
          {content.fields.map((f) => (
            <div key={f.name}>
              <span className="font-mono text-accent">{f.name}</span>
              {f.type && <span className="text-dim ml-1">({f.type})</span>}
              <p className="text-dim mt-0.5 leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Raw editor panel ─────────────────────────────────────────────────────────

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

function Input({ value, onChange, placeholder, hint, mono }: {
  value: string; onChange: (v: string) => void; placeholder?: string; hint?: string; mono?: boolean;
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

  const hasLlmContent = !!rule.match.content;
  const hasLlmGateway = !!(rule.match.llmModel?.length || rule.match.llmProvider?.length);
  const ruleType: RuleForm['ruleType'] = hasLlmContent ? 'llm-content'
    : hasLlmGateway ? 'llm-gateway'
    : 'tool-call';

  const parameters: ParamEntry[] = [];
  if (rule.match.parameters) {
    for (const [key, matcher] of Object.entries(rule.match.parameters)) {
      if (matcher.contains?.length)       parameters.push({ key, matcherType: 'contains',   value: matcher.contains.join(', ') });
      else if (matcher.regex)             parameters.push({ key, matcherType: 'regex',       value: matcher.regex });
      else if (matcher.startsWith)        parameters.push({ key, matcherType: 'startsWith',  value: matcher.startsWith });
      else if (matcher.gt !== undefined)  parameters.push({ key, matcherType: 'gt',          value: String(matcher.gt) });
      else if (matcher.lt !== undefined)  parameters.push({ key, matcherType: 'lt',          value: String(matcher.lt) });
      else if (matcher.gte !== undefined) parameters.push({ key, matcherType: 'gte',         value: String(matcher.gte) });
      else if (matcher.lte !== undefined) parameters.push({ key, matcherType: 'lte',         value: String(matcher.lte) });
      else if (matcher.eq !== undefined)  parameters.push({ key, matcherType: 'eq',          value: String(matcher.eq) });
    }
  }

  return {
    ruleType,
    name:              rule.name,
    agent:             rule.agent,
    matchType:         rule.match.toolPattern ? 'pattern' : 'tool',
    tools:             rule.match.tool?.join(', ') ?? '',
    toolPattern:       rule.match.toolPattern ?? '',
    subcommands:       rule.match.subcommand?.join(', ') ?? '',
    parameters,
    loop:              rule.loop
      ? { enabled: true, type: rule.loop.type as RuleForm['loop']['type'], threshold: String(rule.loop.threshold), window: String(rule.loop.window ?? 10) }
      : DEFAULT_FORM.loop,
    llmModels:         rule.match.llmModel?.join(', ') ?? '',
    llmProviders:      rule.match.llmProvider ?? [],
    contentScope:      rule.match.content?.scope ?? 'both',
    contentTargets:    rule.match.content?.targets ?? [],
    detectors:         rule.match.content?.detectors ?? [],
    piiEntities:       rule.pii?.entities ?? [],
    piiLocale:         rule.pii?.locale ?? 'en-CA',
    secretPatterns:    rule.secrets?.patterns ?? [],
    dlpPatterns:       rule.dlp?.patterns ?? [],
    action:            rule.action,
    redactReplacement: rule.redact?.replacement ?? '[REDACTED]',
    rateLimit:         rule.rateLimit
      ? { limit: String(rule.rateLimit.limit), window: rule.rateLimit.window }
      : DEFAULT_FORM.rateLimit,
    priority:          String(rule.priority ?? 50),
  };
}

function formToRule(form: RuleForm): PolicyRuleRow | null {
  if (!form.name.trim()) return null;

  const match: PolicyRuleRow['match'] = {};
  const priority = Number(form.priority);
  const basePriority = Number.isNaN(priority) ? 50 : priority;

  // ── Tool call ──────────────────────────────────────────────────────────────
  if (form.ruleType === 'tool-call') {
    if (form.matchType === 'tool') {
      const tools = form.tools.split(',').map((t) => t.trim()).filter(Boolean);
      if (tools.length > 0) match.tool = tools;
    } else {
      if (form.toolPattern.trim()) match.toolPattern = form.toolPattern.trim();
    }
    const subcommands = form.subcommands.split(',').map((s) => s.trim()).filter(Boolean);
    if (subcommands.length > 0) match.subcommand = subcommands;

    const validParams = form.parameters.filter((p) => p.key.trim() && p.value.trim());
    if (validParams.length > 0) {
      match.parameters = {};
      for (const p of validParams) {
        const matcher: ParameterMatcherUI = {};
        if (p.matcherType === 'contains')                  matcher.contains   = p.value.split(',').map((s) => s.trim()).filter(Boolean);
        else if (p.matcherType === 'regex')                matcher.regex      = p.value;
        else if (p.matcherType === 'startsWith')           matcher.startsWith = p.value;
        else if (['gt','lt','gte','lte'].includes(p.matcherType)) {
          const num = Number(p.value);
          if (!Number.isNaN(num)) (matcher as Record<string, number>)[p.matcherType] = num;
        } else if (p.matcherType === 'eq') {
          const num = Number(p.value);
          matcher.eq = Number.isNaN(num) ? p.value : num;
        }
        match.parameters[p.key.trim()] = matcher;
      }
    }

    const loop = form.loop.enabled
      ? { type: form.loop.type, threshold: Math.max(2, Number(form.loop.threshold) || 3), window: Math.max(2, Number(form.loop.window) || 10) }
      : undefined;

    return {
      name: form.name.trim(), agent: form.agent.trim() || '*', match, action: form.action, priority: basePriority,
      ...(loop ? { loop } : {}),
      ...(form.action === 'RATE_LIMIT' ? { rateLimit: { limit: Number(form.rateLimit.limit) || 10, window: form.rateLimit.window || '1m', scope: 'per_tool' as const } } : {}),
      _meta: { source: 'manual' },
    };
  }

  // ── LLM gateway ────────────────────────────────────────────────────────────
  if (form.ruleType === 'llm-gateway') {
    const models = form.llmModels.split(',').map((m) => m.trim()).filter(Boolean);
    if (models.length > 0) match.llmModel = models;
    if (form.llmProviders.length > 0) match.llmProvider = form.llmProviders;
    if (!match.llmModel && !match.llmProvider) return null;

    return {
      name: form.name.trim(), agent: form.agent.trim() || '*', match, action: form.action, priority: basePriority,
      ...(form.action === 'RATE_LIMIT' ? { rateLimit: { limit: Number(form.rateLimit.limit) || 10, window: form.rateLimit.window || '1m', scope: 'per_agent' as const } } : {}),
      _meta: { source: 'manual' },
    };
  }

  // ── LLM content ────────────────────────────────────────────────────────────
  if (form.detectors.length === 0) return null;

  match.content = {
    scope:     form.contentScope,
    detectors: form.detectors,
    ...(form.contentTargets.length > 0 ? { targets: form.contentTargets } : {}),
  };

  const rule: PolicyRuleRow = { name: form.name.trim(), agent: form.agent.trim() || '*', match, action: form.action, priority: basePriority, _meta: { source: 'manual' } };

  if (form.detectors.includes('pii') && form.piiEntities.length > 0)
    rule.pii = { entities: form.piiEntities, ...(form.piiLocale ? { locale: form.piiLocale } : {}) };
  if (form.detectors.includes('secrets') && form.secretPatterns.length > 0)
    rule.secrets = { patterns: form.secretPatterns };
  if (form.detectors.includes('injection'))
    rule.injection = {};
  if (form.detectors.includes('dlp') && form.dlpPatterns.filter((p) => p.regex && p.label).length > 0)
    rule.dlp = { patterns: form.dlpPatterns.filter((p) => p.regex.trim() && p.label.trim()) };

  if (form.action === 'REDACT')
    rule.redact = { replacement: form.redactReplacement || '[REDACTED]' };
  if (form.action === 'RATE_LIMIT')
    rule.rateLimit = { limit: Number(form.rateLimit.limit) || 10, window: form.rateLimit.window || '1m', scope: 'per_agent' };

  return rule;
}

function formToYaml(form: RuleForm): string {
  const L: string[] = [];
  L.push('name: ' + (form.name || '<name>'));
  L.push('agent: "' + (form.agent || '*') + '"');
  L.push('match:');

  if (form.ruleType === 'tool-call') {
    if (form.matchType === 'tool') {
      const tools = form.tools.split(',').map((t) => t.trim()).filter(Boolean);
      if (tools.length > 0) { L.push('  tool:'); for (const t of tools) L.push(`    - ${t}`); }
    } else {
      L.push('  toolPattern: ' + (form.toolPattern || '<glob>'));
    }
    const sub = form.subcommands.split(',').map((s) => s.trim()).filter(Boolean);
    if (sub.length > 0) { L.push('  subcommand:'); for (const s of sub) L.push(`    - "${s}"`); }
    const params = form.parameters.filter((p) => p.key.trim() && p.value.trim());
    if (params.length > 0) {
      L.push('  parameters:');
      for (const p of params) {
        L.push(`    ${p.key}:`);
        if      (p.matcherType === 'contains')              { L.push('      contains:'); for (const v of p.value.split(',').map((s) => s.trim()).filter(Boolean)) L.push(`        - "${v}"`); }
        else if (p.matcherType === 'regex')                 L.push(`      regex: "${p.value}"`);
        else if (p.matcherType === 'startsWith')            L.push(`      startsWith: "${p.value}"`);
        else if (['gt','lt','gte','lte'].includes(p.matcherType)) L.push(`      ${p.matcherType}: ${p.value}`);
        else if (p.matcherType === 'eq')                    L.push(`      eq: ${p.value}`);
      }
    }

  } else if (form.ruleType === 'llm-gateway') {
    const models = form.llmModels.split(',').map((m) => m.trim()).filter(Boolean);
    if (models.length > 0) { L.push('  llmModel:'); for (const m of models) L.push(`    - ${m}`); }
    if (form.llmProviders.length > 0) { L.push('  llmProvider:'); for (const p of form.llmProviders) L.push(`    - ${p}`); }

  } else {
    // llm-content
    if (form.detectors.length > 0) {
      L.push('  content:');
      L.push(`    scope: ${form.contentScope}`);
      if (form.contentTargets.length > 0) { L.push('    targets:'); for (const t of form.contentTargets) L.push(`      - ${t}`); }
      L.push('    detectors:');
      for (const d of form.detectors) L.push(`      - ${d}`);
    }
  }

  L.push('action: ' + form.action);
  L.push('priority: ' + (form.priority || '50'));

  if (form.action === 'RATE_LIMIT') {
    L.push('rateLimit:');
    L.push('  limit: ' + (form.rateLimit.limit || '10'));
    L.push('  window: ' + (form.rateLimit.window || '1m'));
    L.push('  scope: per_agent');
  }

  if (form.ruleType === 'llm-content') {
    if (form.detectors.includes('pii') && form.piiEntities.length > 0) {
      L.push('pii:');
      L.push('  entities:');
      for (const e of form.piiEntities) L.push(`    - ${e}`);
      if (form.piiLocale) L.push(`  locale: ${form.piiLocale}`);
    }
    if (form.detectors.includes('secrets') && form.secretPatterns.length > 0) {
      L.push('secrets:');
      L.push('  patterns:');
      for (const p of form.secretPatterns) L.push(`    - ${p}`);
    }
    if (form.detectors.includes('injection')) L.push('injection: {}');
    const validDlp = form.dlpPatterns.filter((p) => p.regex.trim() && p.label.trim());
    if (form.detectors.includes('dlp') && validDlp.length > 0) {
      L.push('dlp:');
      L.push('  patterns:');
      for (const p of validDlp) {
        L.push(`    - regex: "${p.regex}"`);
        L.push(`      label: ${p.label}`);
      }
    }
    if (form.action === 'REDACT') {
      L.push('redact:');
      L.push(`  replacement: "${form.redactReplacement || '[REDACTED]'}"`);
    }
  }

  if (form.ruleType === 'tool-call' && form.loop.enabled) {
    L.push('loop:');
    L.push('  type: ' + form.loop.type);
    L.push('  threshold: ' + (form.loop.threshold || '3'));
    L.push('  window: ' + (form.loop.window || '10'));
  }

  L.push('failMode: closed');
  return L.join('\n');
}

// ─── Raw editor parsing ───────────────────────────────────────────────────────

function parseRawToRule(text: string): PolicyRuleRow {
  const trimmed = text.trim();
  if (!trimmed) throw new Error('Empty input');
  let parsed: Record<string, unknown>;
  if (trimmed.startsWith('{')) {
    try { parsed = JSON.parse(trimmed) as Record<string, unknown>; }
    catch { throw new Error('Invalid JSON — check syntax'); }
  } else {
    let yamlBody = trimmed;
    if (yamlBody.startsWith('policies:')) yamlBody = yamlBody.replace(/^policies:\s*\n\s*-\s*/, '');
    try { parsed = simpleYamlParse(yamlBody); }
    catch { throw new Error('Could not parse input — use JSON format for complex rules, or switch to visual editor'); }
  }
  if (!parsed.name || typeof parsed.name !== 'string') throw new Error('Rule must have a "name" field');
  if (!parsed.action || typeof parsed.action !== 'string') throw new Error('Rule must have an "action" field');
  return {
    name: parsed.name as string,
    agent: (parsed.agent as string) ?? '*',
    match: (parsed.match as PolicyRuleRow['match']) ?? {},
    action: parsed.action as PolicyRuleRow['action'],
    priority: typeof parsed.priority === 'number' ? parsed.priority : 50,
    failMode: (parsed.failMode as 'closed' | 'open') ?? 'closed',
    rateLimit: parsed.rateLimit as PolicyRuleRow['rateLimit'],
    ...(parsed.pii       ? { pii:       parsed.pii       as PolicyRuleRow['pii'] }       : {}),
    ...(parsed.secrets   ? { secrets:   parsed.secrets   as PolicyRuleRow['secrets'] }   : {}),
    ...(parsed.dlp       ? { dlp:       parsed.dlp       as PolicyRuleRow['dlp'] }       : {}),
    ...(parsed.injection ? { injection: parsed.injection as PolicyRuleRow['injection'] } : {}),
    ...(parsed.redact    ? { redact:    parsed.redact    as PolicyRuleRow['redact'] }    : {}),
    _meta: { source: 'manual' },
  };
}

function simpleYamlParse(text: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const lines = text.split('\n');
  let currentObj: Record<string, unknown> | null = null;
  let currentArray: string[] | null = null;
  let currentArrayKey: string | null = null;

  for (const line of lines) {
    const trimmedLine = line.replace(/#.*$/, '').trimEnd();
    if (!trimmedLine.trim()) continue;
    const indent = line.length - line.trimStart().length;
    const content = trimmedLine.trim();

    if (content.startsWith('- ')) {
      const val = content.slice(2).replace(/^["']|["']$/g, '').trim();
      if (currentArray && currentArrayKey) currentArray.push(val);
      continue;
    }

    const colonIdx = content.indexOf(':');
    if (colonIdx === -1) continue;
    const key = content.slice(0, colonIdx).trim();
    const val = content.slice(colonIdx + 1).trim();

    if (currentArray && currentArrayKey) {
      if (currentObj) currentObj[currentArrayKey] = currentArray;
      else result[currentArrayKey] = currentArray;
      currentArray = null; currentArrayKey = null;
    }

    if (!val) {
      if (indent === 0) { currentObj = {}; result[key] = currentObj; }
      else if (currentObj) { currentArrayKey = key; currentArray = []; }
      continue;
    }

    const cleanVal = val.replace(/^["']|["']$/g, '');
    const numVal = Number(cleanVal);
    const finalVal = cleanVal === 'true' ? true : cleanVal === 'false' ? false
      : !Number.isNaN(numVal) && cleanVal !== '' ? numVal : cleanVal;

    if (indent > 0 && currentObj) currentObj[key] = finalVal;
    else { currentObj = null; result[key] = finalVal; }
  }

  if (currentArray && currentArrayKey) {
    if (currentObj) currentObj[currentArrayKey] = currentArray;
    else result[currentArrayKey] = currentArray;
  }
  return result;
}

// ─── Help content ─────────────────────────────────────────────────────────────

const HELP_CONTENT: Record<RuleForm['ruleType'], {
  title: string;
  description: string;
  example: string;
  fields: { name: string; type?: string; desc: string }[];
}> = {
  'tool-call': {
    title: 'Tool Call Rule',
    description: 'Matches MCP tool calls from the agent. Evaluated before the call is forwarded to the upstream server.',
    example: `{
  "name": "block-git-push",
  "agent": "*",
  "match": {
    "tool": ["Bash"],
    "subcommand": ["git push", "git reset"],
    "parameters": {
      "command": { "contains": ["rm -rf", "--force"] },
      "count": { "gt": 100 }
    }
  },
  "action": "DENY",
  "priority": 10,
  "loop": { "type": "exact", "threshold": 3, "window": 10 },
  "failMode": "closed"
}`,
    fields: [
      { name: 'match.tool',        type: 'string[]',  desc: 'Tool names to match (e.g. Bash, Read, Edit). Omit to match all tools.' },
      { name: 'match.toolPattern', type: 'string',    desc: 'Glob pattern for tool names (e.g. sql_*). Use instead of tool.' },
      { name: 'match.subcommand',  type: 'string[]',  desc: 'Bash sub-commands to match after splitting on &&, ||, ;, |.' },
      { name: 'match.parameters',  type: 'object',    desc: 'Match tool input fields. Each key maps to a matcher: contains, regex, startsWith, gt, lt, gte, lte, eq.' },
      { name: 'action',            type: 'enum',      desc: 'DENY | ALLOW | REQUIRE_APPROVAL | RATE_LIMIT' },
      { name: 'loop',              type: 'object',    desc: 'Trigger only when the same call repeats. type: exact | consecutive | subcommand. threshold: min repeat count. window: sliding window in seconds.' },
      { name: 'rateLimit',         type: 'object',    desc: 'limit: max calls. window: e.g. 1m, 1h. scope: per_agent | per_tool | global.' },
      { name: 'priority',          type: 'number',    desc: 'Evaluation order. Lower = evaluated first. Default 50.' },
      { name: 'failMode',          type: 'enum',      desc: 'closed = fail safe (deny on error). open = fail permissive.' },
    ],
  },
  'llm-gateway': {
    title: 'LLM Gateway Rule',
    description: 'Matches outbound LLM API calls by model name or provider. Evaluated before the request is forwarded to Anthropic/OpenAI/Google.',
    example: `name: deny-gpt4-production
agent: "*"
match:
  llmModel:
    - gpt-4o
    - gpt-4-turbo
  llmProvider:
    - openai
action: DENY
priority: 20
failMode: closed

---

name: rate-limit-claude-opus
agent: "*"
match:
  llmModel:
    - claude-opus-*
action: RATE_LIMIT
rateLimit:
  limit: 5
  window: 1h
  scope: per_agent
priority: 30`,
    fields: [
      { name: 'match.llmModel',    type: 'string[]',  desc: 'Model name glob patterns (e.g. claude-sonnet-*, gpt-4o). At least one of llmModel or llmProvider is required.' },
      { name: 'match.llmProvider', type: 'string[]',  desc: 'Provider names: anthropic | openai | google. Omit to match all providers.' },
      { name: 'action',            type: 'enum',      desc: 'DENY | ALLOW | REQUIRE_APPROVAL | RATE_LIMIT' },
      { name: 'rateLimit',         type: 'object',    desc: 'Required when action is RATE_LIMIT. limit: max calls, window: e.g. 1m/1h/1d, scope: per_agent | global.' },
      { name: 'priority',          type: 'number',    desc: 'Evaluation order. Lower = evaluated first. Default 50.' },
    ],
  },
  'llm-content': {
    title: 'LLM Content Rule',
    description: 'Scans the text content of LLM messages for PII, secrets, injection attacks, or custom patterns. Applied to request bodies sent to the model and/or responses received from it.',
    example: `name: pseudonymize-pii-requests
agent: "*"
match:
  content:
    scope: request
    targets:
      - user
      - system
    detectors:
      - pii
      - secrets
pii:
  entities:
    - EMAIL
    - PHONE
    - SIN
    - CREDIT_CARD
  locale: en-CA
secrets:
  patterns:
    - openai_key
    - anthropic_key
    - aws_access_key
action: PSEUDONYMIZE
priority: 25
failMode: closed`,
    fields: [
      { name: 'match.content.scope',     type: 'enum',     desc: 'request | response | both — which direction to scan.' },
      { name: 'match.content.targets',   type: 'string[]', desc: 'Message roles to scan: system | user | assistant. Omit to scan all roles.' },
      { name: 'match.content.detectors', type: 'string[]', desc: 'Active detectors: pii | secrets | injection | dlp. At least one required.' },
      { name: 'pii.entities',            type: 'string[]', desc: 'Entity types: EMAIL, PHONE, SIN, SSN, CREDIT_CARD, IBAN, IP_ADDRESS, PASSPORT, PERSON_NAME, ADDRESS, DATE_OF_BIRTH, HEALTH_CARD. Omit for all.' },
      { name: 'pii.locale',              type: 'string',   desc: 'Locale for locale-specific patterns. en-CA enables SIN detection; en-US enables SSN.' },
      { name: 'secrets.patterns',        type: 'string[]', desc: 'Secret types: openai_key, anthropic_key, aws_access_key, github_token, stripe_key, jwt, private_key, bearer_token, generic_api_key.' },
      { name: 'dlp.patterns',            type: 'object[]', desc: 'Custom regex patterns. Each entry: { regex: "EMP-\\d{6}", label: "employee-id" }. Label used as token prefix for PSEUDONYMIZE.' },
      { name: 'redact.replacement',      type: 'string',   desc: 'Replacement text for REDACT action. Default: [REDACTED].' },
      { name: 'action',                  type: 'enum',     desc: 'DENY | ALLOW | REQUIRE_APPROVAL | RATE_LIMIT | REDACT | PSEUDONYMIZE' },
    ],
  },
};

const HELP_EXAMPLES_BY_ACTION: Partial<Record<PolicyRuleRow['action'], string>> = {
  REDACT: `name: redact-secrets-and-custom
agent: "*"
match:
  content:
    scope: request
    detectors:
      - secrets
      - dlp
secrets:
  patterns:
    - openai_key
    - aws_access_key
dlp:
  patterns:
    - regex: "EMP-\\d{6}"
      label: employee-id
    - regex: "PROJ-[A-Z]{2}\\d{4}"
      label: project-code
redact:
  replacement: "***"
action: REDACT
priority: 20
failMode: closed`,

  PSEUDONYMIZE: `name: pseudonymize-pii-outbound
agent: "*"
match:
  content:
    scope: request
    detectors:
      - pii
      - dlp
pii:
  entities:
    - EMAIL
    - PHONE
    - SIN
  locale: en-CA
dlp:
  patterns:
    - regex: "EMP-\\d{6}"
      label: employee-id
# Tokens: <EMAIL_1>, <PHONE_2>, <SIN_3>, <EMPLOYEE_ID_4>
# Originals are restored in the LLM response automatically.
action: PSEUDONYMIZE
priority: 25
failMode: closed`,
};

// ─── Constants ────────────────────────────────────────────────────────────────

const RULE_TYPES = [
  { value: 'tool-call'   as const, label: 'Tool Call' },
  { value: 'llm-gateway' as const, label: 'LLM Gateway' },
  { value: 'llm-content' as const, label: 'LLM Content' },
];

const ACTIONS_FOR_TYPE: Record<RuleForm['ruleType'], PolicyRuleRow['action'][]> = {
  'tool-call':   ['DENY', 'ALLOW', 'REQUIRE_APPROVAL', 'RATE_LIMIT'],
  'llm-gateway': ['DENY', 'ALLOW', 'REQUIRE_APPROVAL', 'RATE_LIMIT'],
  'llm-content': ['DENY', 'ALLOW', 'REQUIRE_APPROVAL', 'RATE_LIMIT', 'REDACT', 'PSEUDONYMIZE'],
};

const LLM_PROVIDER_OPTIONS = [
  { value: 'anthropic', label: 'Anthropic' },
  { value: 'openai',    label: 'OpenAI' },
  { value: 'google',    label: 'Google' },
] as const;

const CONTENT_TARGET_OPTIONS = [
  { value: 'system',    label: 'System' },
  { value: 'user',      label: 'User' },
  { value: 'assistant', label: 'Assistant' },
] as const;

const DETECTOR_OPTIONS = [
  { value: 'pii',       label: 'PII' },
  { value: 'secrets',   label: 'Secrets' },
  { value: 'injection', label: 'Injection' },
  { value: 'dlp',       label: 'DLP / Custom' },
] as const;

const PII_ENTITY_OPTIONS = [
  { value: 'EMAIL',         label: 'Email' },
  { value: 'PHONE',         label: 'Phone' },
  { value: 'SIN',           label: 'SIN' },
  { value: 'SSN',           label: 'SSN' },
  { value: 'CREDIT_CARD',   label: 'Credit Card' },
  { value: 'IBAN',          label: 'IBAN' },
  { value: 'IP_ADDRESS',    label: 'IP Address' },
  { value: 'PASSPORT',      label: 'Passport' },
  { value: 'PERSON_NAME',   label: 'Person Name' },
  { value: 'ADDRESS',       label: 'Address' },
  { value: 'DATE_OF_BIRTH', label: 'Date of Birth' },
  { value: 'HEALTH_CARD',   label: 'Health Card' },
] as const;

const SECRET_PATTERN_OPTIONS = [
  { value: 'openai_key',      label: 'OpenAI key' },
  { value: 'anthropic_key',   label: 'Anthropic key' },
  { value: 'aws_access_key',  label: 'AWS access key' },
  { value: 'github_token',    label: 'GitHub token' },
  { value: 'stripe_key',      label: 'Stripe key' },
  { value: 'jwt',             label: 'JWT' },
  { value: 'private_key',     label: 'Private key' },
  { value: 'bearer_token',    label: 'Bearer token' },
  { value: 'generic_api_key', label: 'Generic API key' },
] as const;

const ACTION_ACTIVE: Record<PolicyRuleRow['action'], string> = {
  DENY:             'bg-critical/10 border-critical/40 text-critical',
  ALLOW:            'bg-accent/10 border-accent/40 text-accent',
  REQUIRE_APPROVAL: 'bg-warning/10 border-warning/40 text-warning',
  RATE_LIMIT:       'bg-overlay border-border text-foreground',
  REDACT:           'bg-overlay border-border text-foreground',
  PSEUDONYMIZE:     'bg-overlay border-border text-foreground',
};

const ACTION_HINTS: Record<PolicyRuleRow['action'], string> = {
  DENY:             'Block immediately',
  ALLOW:            'Always permit',
  REQUIRE_APPROVAL: 'Pause for review',
  RATE_LIMIT:       'Cap call frequency',
  REDACT:           'Replace with static text',
  PSEUDONYMIZE:     'Replace with tokens, restore in response',
};
