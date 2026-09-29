import {
  regionalCampingDemand,
  campingDemand,
  demandHeadline,
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

/** Saved order, rivers only, no unrelated fallback rows or extra API calls. */
export function todayFavoriteCamping(
  overview: CampingOverview,
  favorites: readonly { kind: string; slug: string; name: string }[],
  now: number,
) {
  const date = localDate(new Date(now));
  const seen = new Set<string>();
  return favorites.filter((favorite) => {
    if (favorite.kind !== 'river' || !favorite.slug || seen.has(favorite.slug)) return false;
    seen.add(favorite.slug);
    return true;
  }).slice(0, 5).map(({ slug, name }) => ({
    slug, name, demand: campingDemand(overview, slug, date, now),
  }));
}

/** The short reading shown beside a river and above the regional bar. */
export function campingPulseSummary(demand: CampingDemand): string {
  const headline = demandHeadline(demand);
  if (demand.band === null || demand.allObservedBooked) return headline;
  return `${headline} · ${Math.round((demand.booked ?? 0) * 100)}% booked`;
}

/** Keep the measured sample explicit when some tracked inventory is missing. */
export function campingPulseDetail(demand: CampingDemand): string {
  if (demand.band === null) return demandDetail(demand);
  const percent = Math.round((demand.booked ?? 0) * 100);
  const sample = demand.completeCoverage ? 'tracked' : 'checked';
  return `${percent}% of ${sample} campsites booked tonight`;
}

/** Describe the actual sample without inventing capacity for missing data. */
export function campingPulseCoverage(demand: CampingDemand): string | null {
  if (demand.band === null || demand.completeCoverage) return null;
  const n = demand.campgroundsCounted;
  return `Based on ${n} campground${n === 1 ? '' : 's'} · ${demand.campgroundsMissing} unavailable`;
}
