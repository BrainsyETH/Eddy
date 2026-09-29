import {
  regionalCampingDemand,
  campingDemand,
  demandHeadline,
  demandDetail,
  demandBasis,
  BAND_CUTOFFS,
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

/** Separate labels for the status and number. Unknown never becomes 0%. */
export function campingPulsePills(demand: CampingDemand): { status: string; percent: string | null } {
  return {
    status: demandHeadline(demand),
    percent: demand.band === null || demand.booked === null
      ? null
      : `${Math.round(demand.booked * 100)}%`,
  };
}

/** A short, tap-to-open legend. Bounds come from the actual scorer. */
export function campingPulseInfo(demand: CampingDemand | null): string {
  const moderate = BAND_CUTOFFS.moderate * 100;
  const busy = BAND_CUTOFFS.busy * 100;
  const crowded = BAND_CUTOFFS.crowded * 100;
  const sample = demand && demand.campgroundsCounted > 0
    ? `${demandBasis(demand)}${demand.campgroundsMissing ? ` · ${demand.campgroundsMissing} unavailable` : ''}`
    : null;
  return [
    'Percent of checked Recreation.gov campsites booked tonight.',
    [
      `Quiet: under ${moderate}%`,
      `Moderate: ${moderate}–under ${busy}%`,
      `Busy: ${busy}–under ${crowded}%`,
      `Crowded: ${crowded}%+`,
      'Packed: 100%, with full coverage',
    ].join('\n'),
    'Excludes state parks, walk-up sites and day floaters.',
    sample,
  ].filter(Boolean).join('\n\n');
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
