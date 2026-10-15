import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveHorizon, PLANNING_NIGHTS } from './window';
import { loadFacilitySitesForWindow } from './sites';
import { searchCampingStay } from './stay';
import { stayNights, type CampingStay } from '../../../shared/camping-stay';

export function validPlanningStay(stay: CampingStay, now: Date): boolean {
  const nights = stayNights(stay);
  const horizon = resolveHorizon(now, PLANNING_NIGHTS).nights;
  return (
    nights.length > 0 &&
    nights[0] >= horizon[0] &&
    nights[nights.length - 1] <= horizon[horizon.length - 1]
  );
}
/** Cached observations only; this never calls a booking provider. */
export async function loadCampingStay(
  db: SupabaseClient,
  facilityId: string,
  arrival: string,
  departure: string,
  now = new Date(),
) {
  const stay = { arrival, departure };
  if (!validPlanningStay(stay, now))
    throw new Error('Stay must be within the next 90 nights');
  const nights = stayNights(stay);
  const snapshot = await loadFacilitySitesForWindow(
    db,
    facilityId,
    {
      startDate: arrival,
      endDate: departure,
      label: `${arrival} – ${departure}`,
      nights,
    },
    now,
  );
  return snapshot ? searchCampingStay(snapshot, arrival, departure, now) : null;
}
