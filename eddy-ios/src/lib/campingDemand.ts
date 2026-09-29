import {
  regionalCampingDemand,
  demandDetail,
  type CampingDemand,
} from '@eddy/conditions/camping-demand';
import { localDate } from '@eddy/conditions/camping-window';
import type { CampingOverview } from '@eddy/types';

/** Today always means tonight in the Ozarks, including Chicago midnight and
 * DST. Never fall back to an upcoming weekend or the cached horizon's start. */
export function todayCampingDemand(
  overview: CampingOverview,
  now: number,
): CampingDemand {
  return regionalCampingDemand(overview, localDate(new Date(now)), now);
}

/** Keep the measured sample explicit when some tracked inventory is missing. */
export function campingPulseDetail(demand: CampingDemand): string {
  if (demand.band === null) return demandDetail(demand);
  const percent = Math.round((demand.booked ?? 0) * 100);
  const sample = demand.completeCoverage ? 'tracked' : 'checked';
  return `${percent}% of ${sample} campsites booked tonight`;
}
