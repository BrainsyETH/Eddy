'use client';

import { useState } from 'react';
import type { FloatPlan } from '@/types/api';

/** Explicitly requested, so reading a guide never calculates every route or
 * silently turns an evergreen article into a cached current-water verdict. */
export default function GuideRouteTime({ riverId, startId, endId }: { riverId: string; startId: string; endId: string }) {
  const [busy, setBusy] = useState(false);
  const [text, setText] = useState<string | null>(null);
  async function estimate() {
    setBusy(true);
    try {
      const query = new URLSearchParams({ riverId, startId, endId });
      const response = await fetch(`/api/plan?${query}`, { signal: AbortSignal.timeout(20000) });
      if (!response.ok) throw new Error('Plan unavailable');
      const { plan } = await response.json() as { plan: FloatPlan };
      if (!plan) throw new Error('Missing plan');
      const waterNote = plan.condition.availability?.readingStatus !== 'current' ? ' Current water data is unavailable; this is a planning estimate.' : '';
      setText(plan.floatTime ? `${plan.floatTime.formatted} · ${plan.vessel.name} · ${plan.floatTime.basis === 'moving' ? 'paddling time; add stops' : 'includes typical stops'}.${waterNote} Open this float to check conditions or change your vessel.`
        : plan.floatTimeWithheldReason === 'dangerous' ? 'The planner is withholding a time because of dangerous conditions. Open the river report before planning this float.'
        : plan.floatTimeWithheldReason === 'regulated' ? 'Changing dam releases prevent a single reliable time estimate. Open this float for release information.'
        : 'A time estimate is unavailable. Open this float for the available route information.');
    } catch { setText('Couldn’t load the estimate. Try again or open this float in the planner.'); }
    finally { setBusy(false); }
  }
  return <div className="mt-3 text-sm">
    <button type="button" disabled={busy} onClick={estimate} className="min-h-11 font-semibold text-primary-700 underline underline-offset-4 disabled:opacity-60">{busy ? 'Checking the planner…' : text ? 'Refresh time estimate' : 'Get a float time estimate'}</button>
    <p role="status" className="text-neutral-600">{text}</p>
  </div>;
}
