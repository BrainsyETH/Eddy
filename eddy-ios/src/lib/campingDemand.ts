import {
  regionalCampingDemand,
  campingDemand,
  demandDetail,
  demandBasis,
  BAND_CUTOFFS,
  type CampingDemand,
  type DemandWithheld,
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

/** Capacity describes the observed reservable inventory, explained in the legend.
 * Null when the reading is withheld: the card then shows campingPulseWithheldNote. */
export function campingPulseHeadline(demand: CampingDemand): string | null {
  const reading = campingPulseReading(demand);
  return reading ? `At ${reading.label} capacity${demand.riverSlug === null ? ' across the Ozarks' : ''}` : null;
}

/** Why tonight has no reading, as one plain sentence. A withheld reading is an
 * ordinary state (off-season, a provider gap), so the card says what happened
 * instead of leading with a failure headline above rivers that do have data. */
export function campingPulseWithheldNote(demand: CampingDemand): string | null {
  if (demand.band !== null || demand.withheld === null) return null;
  // River rows are filtered to usable readings; keep the shared wording for any other caller.
  if (demand.riverSlug !== null) return `${demandDetail(demand)}.`;
  return regionalWithheldNote(demand, demand.withheld);
}

function regionalWithheldNote(demand: CampingDemand, reason: DemandWithheld): string {
  switch (reason) {
    case 'missing_observations':
    case 'unsized_missing': {
      const { campgroundsMissing: missing, campgroundsEligible: eligible } = demand;
      return missing > 0 && missing < eligible
        ? `No Ozarks-wide reading tonight. ${missing} of ${eligible} campgrounds couldn’t be checked.`
        : 'No Ozarks-wide reading tonight. Campgrounds couldn’t be checked.';
    }
    case 'seasonal_closure': return 'Most tracked campgrounds are closed tonight.';
    case 'booking_not_open': return 'Booking hasn’t opened yet for most tracked campgrounds.';
    case 'no_reservable_inventory': return 'Most tracked campgrounds have no reservable sites tonight.';
    case 'small_sample': return 'Too few reservable sites to rate tonight.';
    case 'no_tracked_campgrounds': return 'No Recreation.gov campgrounds are tracked yet.';
  }
}

/** Reservations do not account for first-come, first-served inventory. */
export function campingPulseFcfsNote(demand: CampingDemand): string | null {
  if (demand.band === null) return null;
  if (demand.riverSlug === null) return 'FCFS may be available.';
  return demand.booked === 1 ? 'FCFS sites may be available' : null;
}

/** Age the oldest counted observation, not the phone's last successful refresh. */
export function campingPulseUpdated(demand: CampingDemand, now: number): string | null {
  if (demand.band === null || !demand.oldestCheckedAt) return null;
  const checkedAt = Date.parse(demand.oldestCheckedAt);
  if (!Number.isFinite(checkedAt) || !Number.isFinite(now)) return null;
  const hours = Math.floor(Math.max(0, now - checkedAt) / 3_600_000);
  if (hours === 0) return 'Updated less than 1 hour ago';
  return `Updated ${hours} hour${hours === 1 ? '' : 's'} ago`;
}

/** Use the actual percent for bar width; rounding must not imply empty/full. */
export function campingPulseReading(demand: CampingDemand): { percent: number; label: string } | null {
  if (demand.band === null || demand.booked === null) return null;
  const percent = demand.booked * 100;
  const rounded = Math.round(percent);
  const label = percent > 0 && rounded === 0 ? '<1%'
    : percent < 100 && rounded === 100 ? '>99%'
      : `${rounded}%`;
  return { percent, label };
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
    'Tonight’s bookings across tracked Ozarks Recreation.gov campsites.',
    'Longer bars mean more campsites booked. Ticks mark band changes.',
    [
      `Quiet: under ${moderate}% · green`,
      `Moderate: ${moderate}–under ${busy}% · yellow`,
      `Busy: ${busy}–under ${crowded}% · orange`,
      `Crowded: ${crowded}%+ · red`,
      'Packed: 100%, with full coverage',
    ].join('\n'),
    'Excludes state parks, walk-up sites and day floaters.',
    sample,
  ].filter(Boolean).join('\n\n');
}

/** Keep the measured sample explicit when some tracked inventory is missing. */
export function campingPulseDetail(demand: CampingDemand): string {
  const reading = campingPulseReading(demand);
  if (reading === null) return demandDetail(demand);
  const sample = demand.completeCoverage ? 'tracked' : 'checked';
  return `${reading.label} of ${sample} campsites booked`;
}

/** Describe the actual sample without inventing capacity for missing data. */
export function campingPulseCoverage(demand: CampingDemand): string | null {
  if (demand.band === null || demand.completeCoverage) return null;
  const n = demand.campgroundsCounted;
  return `Based on ${n} campground${n === 1 ? '' : 's'} · ${demand.campgroundsMissing} unavailable`;
}

/** Speak the same result as the card, including sample scope and reading age. */
export function campingPulseAccessibilityLabel(demand: CampingDemand, scope: string, now: number): string {
  const withheld = campingPulseWithheldNote(demand);
  if (withheld) return `${scope} camping tonight. ${withheld}`;
  return [
    `${scope} camping tonight`,
    campingPulseHeadline(demand),
    campingPulseDetail(demand),
    demandBasis(demand).split(' · ')[0],
    campingPulseCoverage(demand),
    campingPulseFcfsNote(demand) ? 'First-come, first-served sites may be available' : null,
    campingPulseUpdated(demand, now),
  ].filter(Boolean).join('. ');
}
