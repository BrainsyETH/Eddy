import type { FloatPlan, SavePlanRequest } from '@/types/api';
import { appDestination } from './app-destination';

/** Same endpoint snapshot contract as Share; saving happens only after a tap. */
export function planAppSaveRequest(plan: FloatPlan): SavePlanRequest {
  return {
    riverId: plan.river.id, startId: plan.putIn.id, endId: plan.takeOut.id, vesselTypeId: plan.vessel.id,
    snapshot: {
      distanceMiles: plan.distance.miles,
      estimatedFloatMinutes: plan.floatTime?.minutes ?? null,
      floatTimeRange: plan.floatTime?.timeRange ?? null,
      driveBackMinutes: plan.driveBack?.minutes ?? null,
      conditionCode: plan.condition?.code ?? null,
      gaugeHeightFt: plan.condition?.gaugeHeightFt ?? null,
      dischargeCfs: plan.condition?.dischargeCfs ?? null,
      gaugeName: plan.condition?.gaugeName ?? null,
    },
  };
}

export async function savePlanForApp(plan: FloatPlan, signal: AbortSignal): Promise<string> {
  const response = await fetch('/api/plan/save', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(planAppSaveRequest(plan)), signal,
  });
  if (!response.ok) throw new Error('Could not save plan');
  const data = await response.json();
  const destination = appDestination({ plan: data?.shortCode });
  if (!destination) throw new Error('Missing plan link');
  return destination.id;
}
