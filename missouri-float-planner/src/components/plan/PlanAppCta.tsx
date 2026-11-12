'use client';

import { useEffect, useRef, useState } from 'react';
import type { FloatPlan } from '@/types/api';
import { savePlanForApp } from '@/lib/plan-app-handoff';
import { trackEvent } from '@/lib/analytics';
import AppCta from '../AppCta';
import Button from '../ui/Button';
import { useAppDevice } from '../useAppDevice';
import { useAppPromotionView } from '../useAppPromotionView';

export default function PlanAppCta({ plan }: { plan: FloatPlan }) {
  // Remount on a route/vessel change. A late save can never offer the previous route.
  return <PlanInvitation key={`${plan.river.id}:${plan.putIn.id}:${plan.takeOut.id}:${plan.vessel.id}`} plan={plan} />;
}

function PlanInvitation({ plan }: { plan: FloatPlan }) {
  const device = useAppDevice();
  const [code, setCode] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'saving' | 'error'>('idle');
  const pending = useRef<AbortController | null>(null);
  const ref = useAppPromotionView<HTMLElement>('planner_result', `${plan.putIn.id}:${plan.takeOut.id}:${plan.vessel.id}`, device !== 'android');
  useEffect(() => () => pending.current?.abort(), []);
  if (device === 'android') return null;
  if (code) return <AppCta destination={{ kind: 'plan', id: code }} title="Your float is ready in Eddy" label="planner_handoff" />;
  async function prepare() {
    if (pending.current) return;
    const controller = new AbortController();
    pending.current = controller;
    setStatus('saving');
    const timeout = setTimeout(() => {
      controller.abort();
      pending.current = null;
      setStatus('error');
    }, 15000);
    trackEvent('app_plan_prepare', { label: 'planner_result', page_path: window.location.pathname });
    try {
      const shortCode = await savePlanForApp(plan, controller.signal);
      if (!controller.signal.aborted) { setCode(shortCode); setStatus('idle'); }
    } catch {
      if (!controller.signal.aborted) setStatus('error');
    } finally {
      clearTimeout(timeout);
      if (pending.current === controller) pending.current = null;
    }
  }
  return <aside ref={ref} className="app-cta card-panel" data-app-cta="planner_result" aria-label="Take this float into Eddy">
    <div>
      <p className="mb-2 text-sm text-neutral-600">Your route, ready to follow on your iPhone.</p>
      <Button variant="outline" className="min-h-11 w-full" disabled={status === 'saving'} onClick={prepare}>
        {status === 'saving' ? 'Preparing your plan…' : 'Follow this float in River Mode'}
      </Button>
      {status === 'error' && <p role="alert" className="mt-2 text-sm text-neutral-700">Couldn’t save the app link. Your route is still here. Try again.</p>}
      <span role="status" className="sr-only">{status === 'saving' ? 'Saving your route for Eddy' : ''}</span>
    </div>
  </aside>;
}
