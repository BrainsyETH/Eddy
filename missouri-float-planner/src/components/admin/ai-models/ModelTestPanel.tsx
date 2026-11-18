'use client';

// src/components/admin/ai-models/ModelTestPanel.tsx
// Replays a recorded river report on a chosen model and shows the result
// beside a reference. Nothing here saves or publishes: the selection above
// this panel is the only thing that changes what readers get.
//
// ── The reference ──────────────────────────────────────────────────────────
//
// What was published is a weak baseline on its own. The replay sends TODAY's
// instructions, and the published text may have been written under older
// ones, so a difference between the two could be the model or the prompt. The
// first run on a report therefore also re-runs the model the workload uses
// now, and that re-run is the default reference: same prompt, same
// instructions, same moment. The published text stays one click away.
//
// ── One result at a time ───────────────────────────────────────────────────
//
// Reference on one side, the selected run on the other, earlier runs in a
// compact list. Three or four full reports in a grid read as a wall, and the
// comparison that matters is always one candidate against the reference.
//
// ── Export ─────────────────────────────────────────────────────────────────
//
// Runs live in this component and are gone on reload. Approving a model is a
// code change justified by what was read here, so the runs can be saved as a
// file to go with that change.
//
// The dark-looking utility classes are the admin workspace's own vocabulary:
// src/app/admin/admin.css remaps a fixed set of them to its light palette.
// Only classes in that set are used here; one outside it (a different opacity,
// say) keeps its dark value and renders as a grey box with dark text.

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { FlaskConical, AlertTriangle, Check, Download, X } from 'lucide-react';
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

interface SampleInfo {
  id: string;
  createdAt: string;
  outcome: string;
  reason: string | null;
  modelLabel: string | null;
  published: Report | null;
  systemPromptChanged: boolean;
}

interface RunResult {
  /** Client-side key; one model can be run more than once on a report. */
  key: number;
  ranAt: string;
  model: { id: string; label: string; provider: string; approved: boolean; maxTokens: number; reasoningEffort: string | null };
  sample: SampleInfo;
  ok: boolean;
  error?: string;
  verdict?: 'passed' | 'incomplete' | 'replaced' | 'empty';
  reason?: string | null;
  contradictions?: string[];
  incomplete?: 'cut_off' | 'missing_blocks' | null;
  written?: Report | null;
  rawText?: string | null;
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

/** Everything gathered for one recorded report. */
interface ReportRuns {
  info: SampleInfo;
  /** Keep earlier references when the production selection changes mid-session. */
  baselines: Record<string, RunResult>;
  /** Failures belong to the model that was attempted, not the current selection. */
  baselineErrors: Record<string, string>;
  runs: RunResult[];
  selectedKey: number | null;
}

const words = (value: string) => value.replace(/_/g, ' ');

const day = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

const sampleLabel = (sample: TestSample) =>
  `${sample.riverName}${sample.sectionName ? `, ${sample.sectionName}` : ''} · ${sample.conditionLabel} · ${day(sample.createdAt)}`;

/** Stop reasons that mean the output cap was hit before the model finished. */
const CAP_HIT = new Set(['max_tokens', 'max_output_tokens']);

type Tone = 'good' | 'warn' | 'bad';

/** The verdict in words. "Automated checks", because that is all a pass is. */
function verdictOf(run: RunResult): { label: string; tone: Tone } {
  if (!run.ok) return { label: 'Call failed', tone: 'bad' };
  if (run.verdict === 'passed') return { label: 'Automated checks passed', tone: 'good' };
  if (run.verdict === 'incomplete') return { label: 'Incomplete', tone: 'bad' };
  if (run.verdict === 'empty') return { label: 'No text returned', tone: 'bad' };
  return { label: 'Would be replaced', tone: 'warn' };
}

const TONE_CLASS: Record<Tone, string> = {
  good: 'bg-green-900/40 text-green-200',
  warn: 'bg-amber-900/50 text-amber-200',
  bad: 'bg-red-900/40 text-red-200',
};

function VerdictChip({ run }: { run: RunResult }) {
  const { label, tone } = verdictOf(run);
  const Icon = tone === 'good' ? Check : tone === 'warn' ? AlertTriangle : X;
  return (
    <span className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium ${TONE_CLASS[tone]}`}>
      <Icon className="h-3 w-3" aria-hidden /> {label}
    </span>
  );
}

const cost = (run: RunResult) => (run.estimatedCostUsd != null ? `$${run.estimatedCostUsd.toFixed(4)}` : null);
const seconds = (run: RunResult) => `${(run.latencyMs / 1000).toFixed(1)} s`;

/**
 * `partial` marks text from an incomplete run. When it never reached its
 * blocks the parser has nowhere to put it but the last field, and calling
 * that a full report would be the opposite of what it is.
 */
function ReportText({ report, partial = false }: { report: Report; partial?: boolean }) {
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
      {report.quoteText && (
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-neutral-400">
            {partial && !report.summaryText ? 'Text received' : 'Full report'}
          </dt>
          <dd className="mt-0.5 whitespace-pre-line text-neutral-100">{report.quoteText}</dd>
        </div>
      )}
    </dl>
  );
}

/** Why production would not publish this text as written. */
function WhyNot({ run }: { run: RunResult }) {
  if (!run.ok) return <p className="text-sm text-red-200">{run.error}</p>;
  if (run.verdict === 'incomplete') {
    const why =
      run.incomplete === 'missing_blocks'
        ? 'It is missing a report block.'
        : run.stopReason && CAP_HIT.has(run.stopReason)
          ? `It stopped at the ${run.model.maxTokens.toLocaleString()}-token output cap before finishing.`
          : 'The model stopped before finishing.';
    return <p className="mb-3 text-xs text-red-200">Not published as written. {why}</p>;
  }
  if (run.verdict === 'replaced') {
    return (
      <p className="mb-3 text-xs text-amber-200">
        Readers would get the code-written report instead
        {run.reason ? ` (${words(run.reason)})` : ''}
        {run.contradictions?.length ? `: ${run.contradictions.map(words).join(', ')}` : ''}.
      </p>
    );
  }
  return null;
}

function RunDetails({ run }: { run: RunResult }) {
  const usage = run.usage;
  const tokens: string[] = [];
  if (usage) {
    const input = (usage.inputTokens ?? 0) + (usage.cacheReadTokens ?? 0) + (usage.cacheWriteTokens ?? 0);
    tokens.push(
      `${input.toLocaleString()} tokens in${usage.cacheReadTokens ? ` (${usage.cacheReadTokens.toLocaleString()} cached)` : ''}`,
    );
    tokens.push(
      `${(usage.outputTokens ?? 0).toLocaleString()} of ${run.model.maxTokens.toLocaleString()} out` +
        (usage.reasoningTokens ? ` (${usage.reasoningTokens.toLocaleString()} reasoning)` : ''),
    );
  }
  if (run.stopReason) tokens.push(`stopped: ${words(run.stopReason)}`);
  return (
    <details className="mt-2 text-xs text-neutral-400">
      <summary className="cursor-pointer py-2 text-neutral-300">Details</summary>
      <div className="space-y-2">
        {tokens.length > 0 && <p>{tokens.join(' · ')}</p>}
        {run.ok && (
          <p>
            Automated checks compare the condition, the reading and the optimal range with the gauge,
            and require a finished report with all three blocks. They do not check local detail,
            weather, advice or voice.
          </p>
        )}
        {run.rawText && (
          <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded border border-neutral-700 bg-neutral-900 p-2 text-neutral-300">
            {run.rawText}
          </pre>
        )}
      </div>
    </details>
  );
}

/** One run, leading with the report, then verdict, cost and time. */
function RunCard({ run, heading }: { run: RunResult; heading?: string }) {
  const price = cost(run);
  return (
    <>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-medium text-white">
          {heading ?? run.model.label}
          {!heading && !run.model.approved && (
            <span className="ml-2 text-xs font-normal text-neutral-400">test only</span>
          )}
        </h3>
        <VerdictChip run={run} />
      </div>
      <WhyNot run={run} />
      {run.ok && run.written && <ReportText report={run.written} partial={run.verdict === 'incomplete'} />}
      <p className="mt-3 text-xs text-neutral-400">
        {[price, seconds(run)].filter(Boolean).join(' · ')}
      </p>
      <RunDetails run={run} />
    </>
  );
}

const TOGGLE = 'rounded border border-neutral-600 px-2 py-1 text-xs';

export default function ModelTestPanel({ productionModelId }: { productionModelId?: string }) {
  const [models, setModels] = useState<TestModel[]>([]);
  const [loadedBaseline, setLoadedBaseline] = useState<TestModel | null>(null);
  const [samples, setSamples] = useState<TestSample[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [sampleId, setSampleId] = useState('');
  const [modelId, setModelId] = useState('');
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [reports, setReports] = useState<Record<string, ReportRuns>>({});
  const [showPublished, setShowPublished] = useState(false);
  const nextKey = useRef(1);
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
      setLoadedBaseline(data.baseline ?? null);
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
  // The parent updates this only after a confirmed save, never for an unsaved
  // dropdown choice. Do not remount the panel and lose the session's runs.
  const baselineModel = models.find((m) => m.id === productionModelId) ?? loadedBaseline;
  const current = reports[sampleId];
  const baseline = baselineModel ? current?.baselines[baselineModel.id] ?? null : null;
  const baselineError = baselineModel ? current?.baselineErrors[baselineModel.id] : null;
  const selectedRun = current?.runs.find((r) => r.key === current.selectedKey) ?? current?.runs.at(-1) ?? null;
  // Re-run only when it can be: the baseline's provider has a key, and this
  // report has no usable re-run of that model yet.
  const willRunBaseline = Boolean(baselineModel?.configured && !baseline);

  /** One billed call. Resolves to the run, or to the message for a request that failed outright. */
  const call = async (sample: string, model: string): Promise<RunResult | string> => {
    try {
      const res = await adminFetch(`/api/admin/ai-models/test?_t=${Date.now()}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sampleId: sample, model }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return data.error || `Test failed (${res.status})`;
      return { ...data, key: nextKey.current++, ranAt: new Date().toISOString() } as RunResult;
    } catch {
      return 'Test failed. The call may have timed out.';
    }
  };

  const run = async () => {
    if (!sampleId || !modelId) return;
    const sample = sampleId;
    const baselineId = baselineModel?.id;
    setRunning(true);
    setRunError(null);
    try {
      // The candidate and, the first time on this report, the current model
      // beside it. When the candidate IS the current model, its own run is
      // the baseline and no second call is made.
      const separateBaseline = willRunBaseline && baselineId && baselineId !== modelId;
      const [candidate, baseline] = await Promise.all([
        call(sample, modelId),
        separateBaseline ? call(sample, baselineId) : Promise.resolve(null),
      ]);
      if (typeof candidate === 'string') setRunError(candidate);

      setReports((all) => {
        const existing = all[sample];
        const info =
          (typeof candidate !== 'string' && candidate.sample) ||
          (baseline && typeof baseline !== 'string' && baseline.sample) ||
          existing?.info;
        if (!info) return all;

        const next: ReportRuns = existing
          ? { ...existing, info, baselines: { ...existing.baselines }, baselineErrors: { ...existing.baselineErrors } }
          : { info, baselines: {}, baselineErrors: {}, runs: [], selectedKey: null };

        if (typeof candidate !== 'string') {
          next.runs = [...next.runs, candidate];
          next.selectedKey = candidate.key;
          if (baselineId && !next.baselines[baselineId] && candidate.model.id === baselineId && candidate.ok) {
            next.baselines[baselineId] = candidate;
            delete next.baselineErrors[baselineId];
          }
        }
        if (baseline && baselineId) {
          if (typeof baseline === 'string') next.baselineErrors[baselineId] = baseline;
          else if (!baseline.ok) next.baselineErrors[baselineId] = baseline.error ?? 'The call failed.';
          else {
            next.baselines[baselineId] = baseline;
            delete next.baselineErrors[baselineId];
          }
        }
        return { ...all, [sample]: next };
      });
    } finally {
      setRunning(false);
    }
  };

  const hasRuns = Object.values(reports).some((r) => r.runs.length > 0);

  /** Saves every run in this session as one JSON file. */
  const exportRuns = () => {
    // Without the client-side key, and without the per-run copy of the sample
    // that is already recorded once per report below.
    const strip = (result: RunResult) => {
      const copy: Partial<RunResult> = { ...result };
      delete copy.key;
      delete copy.sample;
      return copy;
    };
    const payload = {
      exportedAt: new Date().toISOString(),
      workload: 'river_update',
      note:
        'Replays of recorded river reports from /admin/ai-models. Nothing here was published. ' +
        '"passed" means the automated checks passed (condition, reading, optimal range, completeness); ' +
        'it is not a finding that a report is accurate.',
      reports: Object.entries(reports)
        .filter(([, r]) => r.runs.length > 0)
        .map(([id, r]) => {
          const sample = samples.find((s) => s.id === id);
          return {
            generationId: id,
            river: sample?.riverName ?? null,
            section: sample?.sectionName ?? null,
            condition: sample?.conditionLabel ?? null,
            recordedAt: r.info.createdAt,
            published: {
              outcome: r.info.outcome,
              reason: r.info.reason,
              model: r.info.modelLabel,
              report: r.info.published,
              writtenUnderOlderInstructions: r.info.systemPromptChanged,
            },
            baseline: baselineModel && r.baselines[baselineModel.id] ? strip(r.baselines[baselineModel.id]) : null,
            baselineError: baselineModel ? r.baselineErrors[baselineModel.id] ?? null : null,
            baselines: Object.values(r.baselines).map(strip),
            baselineErrors: r.baselineErrors,
            runs: r.runs.map(strip),
          };
        }),
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `eddy-model-tests-${payload.exportedAt.slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const info = current?.info;
  const referenceIsPublished = showPublished || !baseline;

  return (
    <section
      aria-labelledby="model-test-heading"
      className="rounded-lg border border-neutral-700 bg-neutral-900 p-4"
    >
      <h2 id="model-test-heading" className="flex items-center gap-2 font-medium text-white">
        <FlaskConical className="h-4 w-4" aria-hidden /> Try a model
      </h2>
      <p className="mt-1 text-sm text-neutral-400">
        Replays a recorded river report on another model. Nothing is published, and each run is a
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
                    setShowPublished(false);
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

          {selectedModel && !selectedModel.configured ? (
            <p className="mt-2 text-xs text-neutral-400">
              {selectedModel.label} needs <code>{selectedModel.envVar}</code> set in this environment.
            </p>
          ) : (
            samples.length > 0 &&
            willRunBaseline &&
            baselineModel &&
            baselineModel.id !== modelId && (
              <p className="mt-2 text-xs text-neutral-400">
                This test also re-runs {baselineModel.label}, so both answer the same
                instructions.
              </p>
            )
          )}

          <div aria-live="polite">
            {runError && (
              <p role="alert" className="mt-3 flex items-start gap-2 rounded bg-red-900/20 p-2 text-xs text-red-200">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                <span>{runError}</span>
              </p>
            )}

            {info && (
              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                <article className="rounded-lg border border-neutral-700 bg-neutral-900/50 p-3">
                  {baseline && (
                    <div className="mb-3 flex flex-wrap gap-2" role="group" aria-label="Reference">
                      <button
                        type="button"
                        aria-pressed={!referenceIsPublished}
                        onClick={() => setShowPublished(false)}
                        className={`${TOGGLE} ${referenceIsPublished ? 'text-neutral-300' : 'bg-neutral-900 font-medium text-white'}`}
                      >
                        {baseline.model.label}, re-run now
                      </button>
                      <button
                        type="button"
                        aria-pressed={referenceIsPublished}
                        onClick={() => setShowPublished(true)}
                        className={`${TOGGLE} ${referenceIsPublished ? 'bg-neutral-900 font-medium text-white' : 'text-neutral-300'}`}
                      >
                        Published {day(info.createdAt)}
                      </button>
                    </div>
                  )}

                  {referenceIsPublished || !baseline ? (
                    <>
                      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                        <h3 className="text-sm font-medium text-white">Published {day(info.createdAt)}</h3>
                        <span className="text-xs text-neutral-400">
                          {info.outcome === 'model'
                            ? info.modelLabel ?? 'Model'
                            : info.outcome === 'fallback'
                              ? `Code-written${info.reason ? `: ${words(info.reason)}` : ''}`
                              : 'Nothing published'}
                        </span>
                      </div>
                      {info.published ? (
                        <ReportText report={info.published} />
                      ) : (
                        <p className="text-sm text-neutral-400">This attempt published nothing.</p>
                      )}
                      {info.systemPromptChanged && (
                        <p className="mt-3 text-xs text-amber-200">
                          Written under older instructions than the test uses, so differences may
                          come from the instructions.
                        </p>
                      )}
                      {baselineError && (
                        <p className="mt-3 text-xs text-red-200">
                          {baselineModel?.label ?? 'The current model'} could not be re-run:{' '}
                          {baselineError}
                        </p>
                      )}
                    </>
                  ) : (
                    <RunCard run={baseline} heading={`${baseline.model.label}, re-run now`} />
                  )}
                </article>

                <article className="rounded-lg border border-neutral-700 bg-neutral-900/50 p-3">
                  {selectedRun ? (
                    <RunCard run={selectedRun} />
                  ) : (
                    <p className="text-sm text-neutral-400">No result for this report yet.</p>
                  )}
                </article>
              </div>
            )}

            {current && current.runs.length > 1 && (
              <div className="mt-4">
                <h3 className="text-xs font-medium uppercase tracking-wide text-neutral-400">
                  Runs on this report
                </h3>
                <ul className="mt-2 space-y-1">
                  {current.runs.map((result) => {
                    const selected = result.key === selectedRun?.key;
                    return (
                      <li key={result.key}>
                        <button
                          type="button"
                          aria-pressed={selected}
                          onClick={() =>
                            setReports((all) => ({ ...all, [sampleId]: { ...all[sampleId], selectedKey: result.key } }))
                          }
                          className={`flex w-full flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded border border-neutral-700 px-3 py-2 text-left text-sm hover:bg-neutral-700 ${
                            selected ? 'bg-neutral-700 font-medium text-white' : 'text-neutral-300'
                          }`}
                        >
                          <span>{result.model.label}</span>
                          <span className="text-xs font-normal text-neutral-400">
                            {[verdictOf(result).label, cost(result), seconds(result)].filter(Boolean).join(' · ')}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            {hasRuns && (
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={exportRuns}
                  className="inline-flex items-center gap-2 rounded-lg border border-neutral-600 px-4 py-2 text-sm text-neutral-300"
                >
                  <Download className="h-4 w-4" aria-hidden /> Export results
                </button>
                {current && (
                  <button
                    type="button"
                    onClick={() =>
                      setReports((all) => {
                        const next = { ...all };
                        delete next[sampleId];
                        return next;
                      })
                    }
                    className="rounded-lg border border-neutral-600 px-4 py-2 text-sm text-neutral-300"
                  >
                    Clear this report
                  </button>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </section>
  );
}
