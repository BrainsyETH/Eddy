'use client';

// src/components/admin/ai-models/ModelTestPanel.tsx
// Replays a recorded river report on a chosen model and shows the result
// beside what was published. Nothing here saves or publishes: the selection
// above this panel is the only thing that changes what readers get.
//
// Runs accumulate per report, so two or three models can be read side by side
// on the same water. Switching reports keeps each report's runs.
//
// The dark-looking utility classes are the admin workspace's own vocabulary:
// src/app/admin/admin.css remaps a fixed set of them to its light palette.
// Only classes in that set are used here; one outside it (a different opacity,
// say) keeps its dark value and renders as a grey box with dark text.

import { useCallback, useEffect, useId, useState } from 'react';
import { FlaskConical, AlertTriangle, Check, X } from 'lucide-react';
import { adminFetch } from '@/hooks/useAdminAuth';

interface TestModel {
  id: string;
  label: string;
  provider: string;
  approved: boolean;
  configured: boolean;
  envVar: string;
}

interface TestSample {
  id: string;
  createdAt: string;
  riverSlug: string;
  sectionSlug: string | null;
  riverName: string;
  sectionName: string | null;
  conditionCode: string;
  conditionLabel: string;
  outcome: string;
  modelUsed: string | null;
}

interface Report {
  summaryText: string | null;
  eddyRead: string | null;
  quoteText: string;
}

interface RunResult {
  /** Client-side key; one model can be run more than once on a report. */
  key: number;
  model: { id: string; label: string; provider: string; approved: boolean; maxTokens: number; reasoningEffort: string | null };
  sample: {
    id: string;
    createdAt: string;
    outcome: string;
    reason: string | null;
    modelLabel: string | null;
    published: Report | null;
    systemPromptChanged: boolean;
  };
  ok: boolean;
  error?: string;
  verdict?: 'passed' | 'replaced' | 'empty';
  reason?: string | null;
  contradictions?: string[];
  written?: Report | null;
  stopReason?: string | null;
  latencyMs: number;
  usage?: {
    inputTokens: number | null;
    outputTokens: number | null;
    cacheReadTokens: number | null;
    cacheWriteTokens: number | null;
    reasoningTokens: number | null;
  };
  estimatedCostUsd?: number | null;
}

const words = (value: string) => value.replace(/_/g, ' ');

const day = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

const sampleLabel = (sample: TestSample) =>
  `${sample.riverName}${sample.sectionName ? `, ${sample.sectionName}` : ''} · ${sample.conditionLabel} · ${day(sample.createdAt)}`;

/** Stop reasons that mean the output cap was hit before the model finished. */
const CUT_OFF = new Set(['max_tokens', 'max_output_tokens']);

function ReportText({ report }: { report: Report }) {
  return (
    <dl className="space-y-3 text-sm">
      {report.summaryText && (
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-neutral-400">Summary</dt>
          <dd className="mt-0.5 text-neutral-100">{report.summaryText}</dd>
        </div>
      )}
      {report.eddyRead && (
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-neutral-400">Eddy Read</dt>
          <dd className="mt-0.5 text-neutral-100">{report.eddyRead}</dd>
        </div>
      )}
      <div>
        <dt className="text-xs font-medium uppercase tracking-wide text-neutral-400">Full report</dt>
        <dd className="mt-0.5 whitespace-pre-line text-neutral-100">{report.quoteText}</dd>
      </div>
    </dl>
  );
}

function Verdict({ run }: { run: RunResult }) {
  if (!run.ok) {
    return (
      <span className="inline-flex items-center gap-1 rounded bg-red-900/40 px-2 py-0.5 text-xs font-medium text-red-200">
        <X className="h-3 w-3" aria-hidden /> Call failed
      </span>
    );
  }
  if (run.verdict === 'passed') {
    return (
      <span className="inline-flex items-center gap-1 rounded bg-green-900/40 px-2 py-0.5 text-xs font-medium text-green-200">
        <Check className="h-3 w-3" aria-hidden /> Passes checks
      </span>
    );
  }
  if (run.verdict === 'empty') {
    return (
      <span className="inline-flex items-center gap-1 rounded bg-red-900/40 px-2 py-0.5 text-xs font-medium text-red-200">
        <X className="h-3 w-3" aria-hidden /> No text returned
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded bg-amber-900/50 px-2 py-0.5 text-xs font-medium text-amber-200">
      <AlertTriangle className="h-3 w-3" aria-hidden /> Would be replaced
    </span>
  );
}

function RunMeta({ run }: { run: RunResult }) {
  const parts: string[] = [];
  const usage = run.usage;
  if (usage) {
    const cached = (usage.cacheReadTokens ?? 0) + (usage.cacheWriteTokens ?? 0);
    const input = (usage.inputTokens ?? 0) + cached;
    parts.push(`${input.toLocaleString()} in${usage.cacheReadTokens ? ` (${usage.cacheReadTokens.toLocaleString()} cached)` : ''}`);
    parts.push(
      `${(usage.outputTokens ?? 0).toLocaleString()} of ${run.model.maxTokens.toLocaleString()} out` +
        (usage.reasoningTokens ? ` (${usage.reasoningTokens.toLocaleString()} reasoning)` : ''),
    );
  }
  if (run.estimatedCostUsd != null) parts.push(`$${run.estimatedCostUsd.toFixed(4)}`);
  parts.push(`${(run.latencyMs / 1000).toFixed(1)} s`);
  return <p className="mt-3 text-xs text-neutral-400">{parts.join(' · ')}</p>;
}

export default function ModelTestPanel() {
  const [models, setModels] = useState<TestModel[]>([]);
  const [samples, setSamples] = useState<TestSample[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [sampleId, setSampleId] = useState('');
  const [modelId, setModelId] = useState('');
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [runs, setRuns] = useState<Record<string, RunResult[]>>({});
  const sampleFieldId = useId();
  const modelFieldId = useId();

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await adminFetch(`/api/admin/ai-models/test?_t=${Date.now()}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setLoadError(data.error || `Could not load the test panel (${res.status})`);
        return;
      }
      const nextModels: TestModel[] = data.models ?? [];
      const nextSamples: TestSample[] = data.samples ?? [];
      setModels(nextModels);
      setSamples(nextSamples);
      setLoadError(data.samplesError ?? null);
      setSampleId((current) => current || nextSamples[0]?.id || '');
      // Default to the first model that is not yet approved and can run: the
      // ones worth testing are the ones nobody has read.
      setModelId(
        (current) =>
          current ||
          nextModels.find((m) => !m.approved && m.configured)?.id ||
          nextModels.find((m) => m.configured)?.id ||
          nextModels[0]?.id ||
          '',
      );
    } catch {
      setLoadError('Could not load the test panel');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const selectedModel = models.find((m) => m.id === modelId);
  const sampleRuns = runs[sampleId] ?? [];
  const reference = sampleRuns[0]?.sample;

  const run = async () => {
    if (!sampleId || !modelId) return;
    setRunning(true);
    setRunError(null);
    try {
      const res = await adminFetch(`/api/admin/ai-models/test?_t=${Date.now()}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sampleId, model: modelId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setRunError(data.error || `Test failed (${res.status})`);
        return;
      }
      setRuns((current) => ({
        ...current,
        [sampleId]: [...(current[sampleId] ?? []), { ...data, key: Date.now() }],
      }));
    } catch {
      setRunError('Test failed. The call may have timed out.');
    } finally {
      setRunning(false);
    }
  };

  return (
    <section
      aria-labelledby="model-test-heading"
      className="rounded-lg border border-neutral-700 bg-neutral-900 p-4"
    >
      <h2 id="model-test-heading" className="flex items-center gap-2 font-medium text-white">
        <FlaskConical className="h-4 w-4" aria-hidden /> Try a model
      </h2>
      <p className="mt-1 text-sm text-neutral-400">
        Replays a recorded river report on another model. Nothing is published, and each run is one
        billed call.
      </p>

      {loading ? (
        <p className="mt-4 text-sm text-neutral-400">Loading…</p>
      ) : (
        <>
          {loadError && (
            <p role="alert" className="mt-4 flex items-start gap-2 rounded bg-amber-900/50 p-2 text-xs text-amber-200">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              <span>{loadError}</span>
            </p>
          )}

          {samples.length === 0 ? (
            !loadError && (
              <p className="mt-4 text-sm text-neutral-400">
                No recorded river reports yet. They appear after the next river update runs.
              </p>
            )
          ) : (
            <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1.4fr)_auto] sm:items-end">
              <div>
                <label htmlFor={sampleFieldId} className="block text-sm text-neutral-300">
                  Report
                </label>
                <select
                  id={sampleFieldId}
                  value={sampleId}
                  onChange={(e) => {
                    setSampleId(e.target.value);
                    setRunError(null);
                  }}
                  className="mt-1 min-h-11 w-full rounded-lg border border-neutral-600 bg-neutral-900 px-3 py-2 text-white"
                >
                  {samples.map((sample) => (
                    <option key={sample.id} value={sample.id}>
                      {sampleLabel(sample)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor={modelFieldId} className="block text-sm text-neutral-300">
                  Model
                </label>
                <select
                  id={modelFieldId}
                  value={modelId}
                  onChange={(e) => {
                    setModelId(e.target.value);
                    setRunError(null);
                  }}
                  className="mt-1 min-h-11 w-full rounded-lg border border-neutral-600 bg-neutral-900 px-3 py-2 text-white"
                >
                  {models.map((model) => (
                    <option key={model.id} value={model.id} disabled={!model.configured}>
                      {model.label}
                      {model.approved ? '' : ' (test only)'}
                      {model.configured ? '' : `, no ${model.provider} key`}
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="button"
                onClick={run}
                disabled={running || !sampleId || !selectedModel?.configured}
                className="rounded-lg bg-accent-500 px-4 py-2 font-medium text-white disabled:opacity-40"
              >
                {running ? 'Running…' : 'Run test'}
              </button>
            </div>
          )}

          {selectedModel && !selectedModel.configured && (
            <p className="mt-2 text-xs text-neutral-400">
              {selectedModel.label} needs <code>{selectedModel.envVar}</code> set in this environment.
            </p>
          )}

          <div aria-live="polite">
            {runError && (
              <p role="alert" className="mt-3 flex items-start gap-2 rounded bg-red-900/20 p-2 text-xs text-red-200">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                <span>{runError}</span>
              </p>
            )}

            {reference && (
              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                <article className="rounded-lg border border-neutral-700 bg-neutral-900/50 p-3">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-sm font-medium text-white">
                      Published {day(reference.createdAt)}
                    </h3>
                    <span className="text-xs text-neutral-400">
                      {reference.outcome === 'model'
                        ? reference.modelLabel ?? 'Model'
                        : reference.outcome === 'fallback'
                          ? `Code-written${reference.reason ? `: ${words(reference.reason)}` : ''}`
                          : 'Nothing published'}
                    </span>
                  </div>
                  {reference.published ? (
                    <ReportText report={reference.published} />
                  ) : (
                    <p className="text-sm text-neutral-400">This attempt published nothing.</p>
                  )}
                  {reference.systemPromptChanged && (
                    <p className="mt-3 text-xs text-amber-200">
                      Eddy&apos;s instructions have changed since this was written, so the test runs
                      under newer ones.
                    </p>
                  )}
                </article>

                {sampleRuns.map((result) => (
                  <article key={result.key} className="rounded-lg border border-neutral-700 bg-neutral-900/50 p-3">
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                      <h3 className="text-sm font-medium text-white">
                        {result.model.label}
                        {!result.model.approved && (
                          <span className="ml-2 text-xs font-normal text-neutral-400">test only</span>
                        )}
                      </h3>
                      <Verdict run={result} />
                    </div>

                    {!result.ok && <p className="text-sm text-red-200">{result.error}</p>}

                    {result.ok && result.verdict === 'replaced' && (
                      <p className="mb-3 text-xs text-amber-200">
                        Readers would get the code-written report instead
                        {result.reason ? ` (${words(result.reason)})` : ''}
                        {result.contradictions?.length ? `: ${result.contradictions.map(words).join(', ')}` : ''}.
                      </p>
                    )}

                    {result.ok && result.stopReason && CUT_OFF.has(result.stopReason) && (
                      <p className="mb-3 text-xs text-amber-200">
                        Stopped at the {result.model.maxTokens.toLocaleString()}-token output cap before
                        finishing.
                      </p>
                    )}

                    {result.ok && result.written && <ReportText report={result.written} />}
                    <RunMeta run={result} />
                  </article>
                ))}
              </div>
            )}

            {sampleRuns.length > 0 && (
              <button
                type="button"
                onClick={() => setRuns((current) => ({ ...current, [sampleId]: [] }))}
                className="mt-3 rounded-lg border border-neutral-600 px-4 py-2 text-sm text-neutral-300"
              >
                Clear results
              </button>
            )}
          </div>
        </>
      )}
    </section>
  );
}
