import {
  regionalCampingDemand,
  campingDemand,
  demandHeadline,
  demandDetail,
  type CampingDemand,
} from '@eddy/conditions/camping-demand';
import { localDate } from '@eddy/conditions/camping-window';
import type { CampingOverview } from '@eddy/types';
import { campingRiverOptions } from './campingHeatmap';

// Curated popular Ozarks destinations, not a live traffic ranking. Only rivers
// with a usable reading for tonight can take a slot; other covered rivers follow.
const POPULAR_CAMPING_RIVERS: readonly string[] = [
  'current', 'jacks-fork', 'buffalo', 'meramec', 'niangua',
  'eleven-point', 'huzzah', 'big-piney', 'courtois', 'st-francis', 'black',
];

/** Today always means tonight in the Ozarks, including Chicago midnight and
 * DST. Never fall back to an upcoming weekend or the cached horizon's start. */
export function todayCampingDemand(
  overview: CampingOverview,
  now: number,
): CampingDemand {
  return regionalCampingDemand(overview, localDate(new Date(now)), now);
}

/** Popular rivers with usable tonight data. Filter before limiting so an
 * uncovered river never displaces one we can actually show. */
export function todayPopularCamping(
  overview: CampingOverview,
  now: number,
) {
  const date = localDate(new Date(now));
  const rank = (slug: string) => {
    const index = POPULAR_CAMPING_RIVERS.indexOf(slug);
    return index < 0 ? POPULAR_CAMPING_RIVERS.length : index;
  };
  return campingRiverOptions(overview.tracked, overview.untracked)
    .map(({ slug, label }) => ({
      slug, name: label, demand: campingDemand(overview, slug, date, now),
    }))
    .filter((row) => row.demand.band !== null)
    .sort((a, b) => rank(a.slug) - rank(b.slug) || a.name.localeCompare(b.name) || a.slug.localeCompare(b.slug))
    .slice(0, 5);
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
