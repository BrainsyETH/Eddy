'use client';

import { useState, type ReactNode } from 'react';
import { AlertTriangle, Loader2, RefreshCw, Timer } from 'lucide-react';
import type { FloatPlan } from '@/types/api';

type Estimate =
  | { kind: 'time'; time: string; vessel: string; basis: string; stale: boolean }
  | { kind: 'note'; text: string };

/** Explicitly requested, so reading a guide never calculates every route or
 * silently turns an evergreen article into a cached current-water verdict.
 * `children` render first in the action row (the card's planner button). */
export default function GuideRouteTime({ riverId, startId, endId, children }: { riverId: string; startId: string; endId: string; children?: ReactNode }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Estimate | null>(null);
  async function estimate() {
    setBusy(true);
    try {
      const query = new URLSearchParams({ riverId, startId, endId });
      const response = await fetch(`/api/plan?${query}`, { signal: AbortSignal.timeout(20000) });
      if (!response.ok) throw new Error('Plan unavailable');
      const { plan } = await response.json() as { plan: FloatPlan };
      if (!plan) throw new Error('Missing plan');
      setResult(plan.floatTime ? {
        kind: 'time',
        time: plan.floatTime.formatted,
        vessel: plan.vessel.name,
        basis: plan.floatTime.basis === 'moving' ? 'Paddling time; add stops' : 'Includes typical stops',
        stale: plan.condition.availability?.readingStatus !== 'current',
      } : {
        kind: 'note',
        text: plan.floatTimeWithheldReason === 'dangerous' ? 'The planner is withholding a time because of dangerous conditions. Open the river report before planning this float.'
          : plan.floatTimeWithheldReason === 'regulated' ? 'Changing dam releases prevent a single reliable time estimate. Open this float for release information.'
          : 'A time estimate is unavailable. Open this float for the available route information.',
      });
    } catch { setResult({ kind: 'note', text: 'Couldn’t load the estimate. Try again or open this float in the planner.' }); }
    finally { setBusy(false); }
  }
  const Icon = busy ? Loader2 : result ? RefreshCw : Timer;
  return <div className="mt-4">
    <div className="flex flex-wrap items-center gap-2.5">
      {children}
      <button type="button" disabled={busy} onClick={estimate} className="guide-action guide-action--time">
        <Icon size={16} strokeWidth={2.5} aria-hidden="true" className={busy ? 'guide-spin' : undefined} />
        {busy ? 'Checking the river…' : result ? 'Check again' : 'Today’s float time'}
      </button>
    </div>
    <div role="status">
      {result?.kind === 'time' && <div className="guide-estimate">
        <div className="mb-1 text-[10px] font-bold uppercase tracking-[.12em] text-primary-700">Float time at today’s flow</div>
        <div className="font-display text-xl font-semibold leading-tight text-neutral-900">{result.time}</div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <span className="guide-estimate-chip">{result.vessel}</span>
          <span className="guide-estimate-chip">{result.basis}</span>
        </div>
        {result.stale && <p className="m-0 mt-2 text-xs text-neutral-600">Current water data is unavailable; this is a planning estimate.</p>}
      </div>}
      {result?.kind === 'note' && <div className="guide-estimate flex gap-2 text-sm text-neutral-700" data-tone="warn">
        <AlertTriangle size={16} aria-hidden="true" className="mt-0.5 shrink-0 text-accent-700" />
        <p className="m-0">{result.text}</p>
      </div>}
    </div>
  </div>;
}
