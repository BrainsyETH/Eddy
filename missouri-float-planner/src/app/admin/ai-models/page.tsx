'use client';

// src/app/admin/ai-models/page.tsx
// Per-workload Anthropic model selection.
//
// ── Why the confirmation is a panel and not confirm() ──────────────────────
//
// Because a browser can switch confirm() off. Once a page has shown a few
// dialogs the user gets a "prevent this page from creating additional dialogs"
// checkbox, and a suppressed dialog returns immediately — so the handler reads
// "cancelled", returns early, and the Save button becomes a control that
// silently does nothing. scripts/admin/no-blocking-dialogs.test.ts exists
// because exactly that happened to the trust console. Its regex only catches
// `window.confirm(`, but a bare `confirm()` is the same global and the same
// failure, so this page renders the confirmation as state.

import { useCallback, useEffect, useState } from 'react';
import { Bot, AlertTriangle, Check } from 'lucide-react';
import AdminLayout from '@/components/admin/AdminLayout';
import { adminFetch } from '@/hooks/useAdminAuth';

interface ModelOption {
  id: string;
  label: string;
  maxTokens: number;
  thinkingDisabled: boolean;
}

interface WorkloadRow {
  workload: string;
  label: string;
  description: string;
  effectiveModel: string;
  effectiveLabel: string;
  source: 'override' | 'default';
  rejected: { value: string; reason: string } | null;
  stored: string | null;
  defaultModel: string;
  defaultLabel: string;
  options: ModelOption[];
}

/** Sentinel for the "Code default" option — distinct from a model id. */
const USE_DEFAULT = '__default__';

export default function AiModelsPage() {
  const [rows, setRows] = useState<WorkloadRow[]>([]);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const applyPayload = useCallback((payload: { workloads: WorkloadRow[] }) => {
    setRows(payload.workloads);
    setDraft(
      Object.fromEntries(
        payload.workloads.map((row) => [row.workload, row.stored ?? USE_DEFAULT]),
      ),
    );
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminFetch(`/api/admin/ai-models?_t=${Date.now()}`);
      const data = await res.json().catch(() => ({}));
      if (res.ok) applyPayload(data);
      else showToast(data.error || `Could not load models (${res.status})`, 'error');
    } catch {
      showToast('Could not load models', 'error');
    } finally {
      setLoading(false);
    }
  }, [applyPayload]);

  useEffect(() => {
    load();
  }, [load]);

  const dirty = rows.some((row) => (row.stored ?? USE_DEFAULT) !== draft[row.workload]);

  const changeSummary = rows
    .filter((row) => (row.stored ?? USE_DEFAULT) !== draft[row.workload])
    .map((row) => {
      const next = draft[row.workload];
      const nextLabel =
        next === USE_DEFAULT
          ? `Code default (${row.defaultLabel})`
          : row.options.find((o) => o.id === next)?.label ?? next;
      return { workload: row.workload, label: row.label, from: row.effectiveLabel, to: nextLabel };
    });

  const save = async () => {
    setSaving(true);
    try {
      const body = Object.fromEntries(
        Object.entries(draft).map(([workload, value]) => [
          workload,
          value === USE_DEFAULT ? null : value,
        ]),
      );
      const res = await adminFetch(`/api/admin/ai-models?_t=${Date.now()}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        // No `workloads` means the write landed but the server could not re-read
        // it to confirm. Keep what the operator selected rather than adopting a
        // payload that would render every workload as "Code default" — the
        // warning tells them to reload, and that is the honest state.
        if (data.workloads) applyPayload(data);
        setConfirming(false);
        showToast(data.warning || 'Saved. Applies to the next generation.', data.warning ? 'error' : 'success');
      } else {
        showToast(data.error || `Save failed (${res.status})`, 'error');
      }
    } catch {
      showToast('Save failed', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminLayout
      title="AI Models"
      description="Which Claude model writes each kind of generated copy"
    >
      {loading ? (
        <p className="text-neutral-400">Loading…</p>
      ) : (
        <div className="space-y-6">
          <div className="rounded-lg border border-neutral-700 bg-neutral-900/60 p-4 text-sm text-neutral-300">
            <p className="mb-2 flex items-center gap-2 font-medium text-white">
              <Bot className="h-4 w-4" /> What a change does
            </p>
            <ul className="list-disc space-y-1 pl-5">
              <li>Applies to the <strong>next</strong> generation, not to copy already written.</li>
              <li>
                Switching <strong>river and section updates</strong> resets that workload&apos;s
                prompt cache — caches are per-model, so its first run after a switch pays a cache
                write. A one-off cost, not a regression. The other three attach no cache
                breakpoint, so switching them costs nothing.
              </li>
              <li>
                A manual statewide re-run within 12 hours of the last summary is skipped by the
                cron&apos;s own guard, so a statewide switch can look inert until the next daily pass.
              </li>
              <li>
                River, section, statewide and gauge updates record the model on each generated
                row; the gauge one is returned publicly as{' '}
                <code className="text-neutral-400">modelUsed</code> by the gauge-update API.
                Social captions record no model or token usage yet, so a caption switch leaves no
                trace after the fact.
              </li>
              <li>Only models approved for a workload are listed. Widening that list is a code change.</li>
            </ul>
          </div>

          {rows.map((row) => (
            <div key={row.workload} className="rounded-lg border border-neutral-700 bg-neutral-900 p-4">
              <div className="mb-1 flex items-baseline justify-between gap-4">
                <h2 className="font-medium text-white">{row.label}</h2>
                <span className="text-xs text-neutral-400">
                  now: {row.effectiveLabel}{' '}
                  {row.source === 'default' ? '(code default)' : '(override)'}
                </span>
              </div>
              <p className="mb-3 text-sm text-neutral-400">{row.description}</p>

              {row.rejected && (
                <p className="mb-3 flex items-start gap-2 rounded border border-yellow-700/60 bg-yellow-900/20 p-2 text-xs text-yellow-200">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>
                    Stored value <code>{row.rejected.value}</code> was not applied (
                    {row.rejected.reason.replace(/_/g, ' ')}). Running the default until this is
                    changed.
                  </span>
                </p>
              )}

              <select
                value={draft[row.workload] ?? USE_DEFAULT}
                onChange={(e) => setDraft({ ...draft, [row.workload]: e.target.value })}
                className="w-full rounded-lg border border-neutral-600 bg-neutral-900 px-3 py-2 text-white"
              >
                <option value={USE_DEFAULT}>Code default ({row.defaultLabel})</option>
                {row.options.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label} — {option.maxTokens} max tokens
                    {option.thinkingDisabled ? ', thinking off' : ''}
                  </option>
                ))}
              </select>
            </div>
          ))}

          {/* In-page confirmation. Deliberately not confirm() — see the header. */}
          {confirming ? (
            <div className="rounded-lg border border-accent-500/60 bg-neutral-900 p-4">
              <p className="mb-3 font-medium text-white">Apply these changes?</p>
              <ul className="mb-4 space-y-1 text-sm text-neutral-300">
                {changeSummary.map((change) => (
                  <li key={change.workload}>
                    <span className="text-neutral-400">{change.label}:</span> {change.from} →{' '}
                    <strong className="text-white">{change.to}</strong>
                  </li>
                ))}
              </ul>
              <div className="flex gap-2">
                <button
                  onClick={save}
                  disabled={saving}
                  className="rounded-lg bg-accent-500 px-4 py-2 font-medium text-white disabled:opacity-50"
                >
                  {saving ? 'Saving…' : 'Confirm'}
                </button>
                <button
                  onClick={() => setConfirming(false)}
                  disabled={saving}
                  className="rounded-lg border border-neutral-600 px-4 py-2 text-neutral-300 disabled:opacity-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setConfirming(true)}
              disabled={!dirty}
              className="rounded-lg bg-accent-500 px-4 py-2 font-medium text-white disabled:opacity-40"
            >
              {dirty ? 'Review changes' : 'No changes'}
            </button>
          )}
        </div>
      )}

      {toast && (
        <div
          className={`fixed right-4 top-4 z-50 flex items-center gap-2 rounded-lg px-4 py-3 text-white shadow-lg ${
            toast.type === 'success' ? 'bg-green-600' : 'bg-red-600'
          }`}
        >
          {toast.type === 'success' ? <Check className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
          {toast.message}
        </div>
      )}
    </AdminLayout>
  );
}
