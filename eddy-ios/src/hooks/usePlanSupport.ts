import { useEffect, useState } from 'react';
import type { FloatPlan } from '@eddy/types';
import { fetchAccessPointDetail, fetchRiverServices } from '@/api/client';
import { milesBetween } from '@/hooks/useLocation';
import { emptyPlanSupport, loadPlanSupport, type PlanSupportData } from '@/lib/loadPlanSupport';

export interface PlanSupportState {
  data: PlanSupportData;
  loading: boolean;
}

/** Shared by the endpoint camping panels and nearby services; no duplicate reads. */
export function usePlanSupport(plan: FloatPlan | null): PlanSupportState {
  const key = plan ? `${plan.river.slug}:${plan.putIn.id}:${plan.putIn.slug ?? ''}:${plan.takeOut.id}:${plan.takeOut.slug ?? ''}` : '';
  const [held, setHeld] = useState<{ key: string; state: PlanSupportState } | null>(null);
  useEffect(() => {
    if (!plan) return;
    const controller = new AbortController();
    void loadPlanSupport(plan, {
      // Only the core facts are needed here, never nearby float estimates.
      fetchDetail: (river, access, signal) => fetchAccessPointDetail(river, access, signal, false),
      fetchServices: fetchRiverServices,
      distance: milesBetween,
      signal: controller.signal,
    }).then((data) => {
      if (!controller.signal.aborted) setHeld({ key, state: { data, loading: false } });
    });
    return () => controller.abort();
    // Endpoint identity owns these facts; a refreshed gauge doesn't change it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return held?.key === key ? held.state : { data: emptyPlanSupport(), loading: !!plan };
}
