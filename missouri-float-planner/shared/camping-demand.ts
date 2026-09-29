// shared/camping-demand.ts
//
// Camping demand: how booked tracked campsites are on one night,
// as a Quiet → Packed band. Shared so the iOS Today card and any web surface
// compute and word it identically. Design: docs/crowd-signal.md.
//
// ── What this is NOT ───────────────────────────────────────────────────────
// A headcount. Most people on a summer Saturday are day floaters who never
// touch a reservation system. Every surface says "camping" beside the band,
// and the date means that NIGHT, not daytime river traffic.
//
// ── Why Recreation.gov only ────────────────────────────────────────────────
// The federal feed separates Reserved from Closed and walk-up inventory
// (src/lib/camping/recgov.ts). Missouri State Parks' feed is a bare IsFree
// boolean (src/lib/camping/usedirect.ts): a closed or held site is
// indistinguishable from a booked one, which would inflate the percentage.
// State-park rows are ignored until that can be separated. The info tip below
// says so to the user.
//
// ── Coverage, not confidence ───────────────────────────────────────────────
// The gates below say how much of the TRACKED inventory was seen, never how
// representative that is of the river. Missing observations are unknown, not
// open and not booked. Packed requires every eligible campground observed.
//
// Pure TypeScript, relative imports only, so Metro, tsx and Next can all
// consume it.

import { localDate } from './camping-window';

export const CAMPING_DEMAND_INFO =
  'Based on campsites bookable on Recreation.gov (national park and forest campgrounds). Missouri State Park campgrounds aren’t included. Reservable sites only — walk-up sites and day floaters aren’t counted.';

export const CAMPING_DEMAND_SOURCE = 'recreation_gov';

/** Half-open cut-offs on the booked fraction. Quiet < 30% is an owner decision. */
export const BAND_CUTOFFS = { moderate: 0.3, busy: 0.6, crowded: 0.85 } as const;
/** Minimum share of eligible capacity that must be observed. */
export const MIN_COVERAGE = 0.5;
/** Minimum observed reservable sites. */
export const MIN_SITES = 20;
/** A regional sample may tolerate unsized missing campgrounds only when it
 * includes at least five campgrounds and 80% of potentially operating ones.
 * This is a sample-size rule, never a claim about unknown site capacity. */
export const MIN_REGIONAL_CAMPGROUNDS = 5;
export const MIN_REGIONAL_CAMPGROUND_SHARE = 0.8;
/** Freshness allowance for treating tonight's number as final: one nightly
 * sync cycle plus slack. The "today/yesterday" copy is separate and comes from
 * the Chicago calendar date of the reading, never from this allowance. */
export const RECENT_CHECK_MS = 26 * 60 * 60 * 1000;

export type DemandBand = 'quiet' | 'moderate' | 'busy' | 'crowded' | 'packed';
export type DemandWithheld =
  | 'no_tracked_campgrounds'
  | 'seasonal_closure'
  | 'booking_not_open'
  | 'no_reservable_inventory'
  | 'missing_observations'
  | 'unsized_missing'
  | 'small_sample';
/** Calendar day (America/Chicago) of the oldest counted reading. */
export type CheckedDay = 'today' | 'yesterday' | 'earlier';

// Structural inputs: the public CampingOverview satisfies these, and nothing
// here depends on @eddy/types (which shared/ may not import).
export interface DemandObservation {
  date: string;
  sitesOpen: number;
  sitesReservable: number;
  status: 'open' | 'full' | 'closed' | 'not_yet_released';
  checkedAt: string;
}
export interface DemandCampground {
  source: string;
  riverSlugs: string[];
  /** Absent on responses from servers that predate the field. */
  expectedReservable?: number | null;
  nights: DemandObservation[];
}
export interface DemandOverview {
  maxObservationAgeSeconds: number;
  tracked: DemandCampground[];
}

export interface CampingDemand {
  /** Null for the regional reading; otherwise the selected river. */
  riverSlug: string | null;
  date: string;
  /** Null when withheld. */
  band: DemandBand | null;
  withheld: DemandWithheld | null;
  /** Every observed site booked, but some eligible campgrounds were not observed. */
  allObservedBooked: boolean;
  /** 0–1 over observed inventory; null when withheld. */
  booked: number | null;
  bookedSites: number;
  reservableSites: number;
  campgroundsEligible: number;
  campgroundsCounted: number;
  campgroundsFull: number;
  /** Known closed for the night (seasonal). */
  campgroundsClosed: number;
  /** Booking window not yet open for the night. */
  campgroundsNotReleased: number;
  /** Checked, but no reservable inventory (e.g. all walk-up). */
  campgroundsNoInventory: number;
  campgroundsMissing: number;
  /** Missing campgrounds with no capacity baseline to size them. */
  campgroundsMissingUnsized: number;
  /** Observed share of eligible expected capacity; null when it cannot be sized. */
  coverage: number | null;
  completeCoverage: boolean;
  oldestCheckedAt: string | null;
  /** Every counted reading is within RECENT_CHECK_MS. */
  checkedRecently: boolean;
  /** Chicago calendar day of the oldest counted reading; null when none. */
  checkedDay: CheckedDay | null;
  /** 0 = tonight, in America/Chicago. */
  leadDays: number;
  /** Close to the real outcome: tonight or tomorrow, checked today. */
  final: boolean;
}

function bandFor(booked: number): Exclude<DemandBand, 'packed'> {
  if (booked < BAND_CUTOFFS.moderate) return 'quiet';
  if (booked < BAND_CUTOFFS.busy) return 'moderate';
  if (booked < BAND_CUTOFFS.crowded) return 'busy';
  return 'crowded';
}

function daysBetween(from: string, to: string): number {
  return Math.round(
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000,
  );
}

/**
 * Camping demand on one river (or the region when null) for one night.
 *
 * Every eligible campground falls into exactly one bucket:
 * - observed: unexpired `open`/`full` night with reservable inventory → counted
 * - unavailable, accounted for and excluded from inventory (never "full"),
 *   each kept separate because each means something different to a camper:
 *     closed — seasonal closure;
 *     not released — booking has not opened yet;
 *     no inventory — checked, but nothing reservable (e.g. all walk-up)
 * - missing: no unexpired reading for the night → coverage unknown. A missing
 *   campground with no capacity baseline cannot be sized. River ratings are
 *   withheld; the regional pulse may show a sufficiently broad, labeled sample.
 */
export function campingDemand(
  overview: DemandOverview,
  riverSlug: string | null,
  date: string,
  now: number = Date.now(),
): CampingDemand {
  const maxAgeMs = overview.maxObservationAgeSeconds * 1000;
  const eligible = overview.tracked.filter(
    (c) => c.source === CAMPING_DEMAND_SOURCE &&
      (riverSlug === null || c.riverSlugs.includes(riverSlug)),
  );
  let bookedSites = 0,
    reservableSites = 0,
    full = 0,
    closed = 0,
    notReleased = 0,
    noInventory = 0,
    missing = 0,
    missingUnsized = 0,
    observedCapacity = 0,
    missingCapacity = 0,
    oldest: number | null = null,
    recent = true;
  let counted = 0;

  for (const c of eligible) {
    const capacity =
      typeof c.expectedReservable === 'number' && c.expectedReservable > 0
        ? c.expectedReservable
        : null;
    const night = c.nights.find((n) => n.date === date);
    const checked = night ? Date.parse(night.checkedAt) : NaN;
    const age = now - checked;
    // The server already drops expired nights; a cached response may have
    // aged past the limit since, so re-check here.
    if (!night || !Number.isFinite(checked) || age < 0 || age >= maxAgeMs) {
      missing++;
      if (capacity == null) missingUnsized++;
      else missingCapacity += capacity;
      continue;
    }
    if (night.status === 'closed') {
      closed++;
      continue;
    }
    if (night.status === 'not_yet_released') {
      notReleased++;
      continue;
    }
    if (!(night.sitesReservable > 0)) {
      noInventory++;
      continue;
    }
    counted++;
    reservableSites += night.sitesReservable;
    bookedSites += night.sitesReservable - night.sitesOpen;
    if (night.sitesOpen === 0) full++;
    observedCapacity += capacity ?? night.sitesReservable;
    oldest = oldest == null ? checked : Math.min(oldest, checked);
    if (age >= RECENT_CHECK_MS) recent = false;
  }

  const today = localDate(new Date(now));
  const leadDays = daysBetween(today, date);
  const sizedTotal = observedCapacity + missingCapacity;
  const knownCapacityCoverage = sizedTotal > 0 ? observedCapacity / sizedTotal : null;
  // Unsized missing inventory makes the true share unknowable: no coverage.
  const coverage = missingUnsized > 0 ? null : knownCapacityCoverage;
  const completeCoverage = eligible.length > 0 && missing === 0;
  const checkedRecently = counted > 0 && recent;
  const checkedDay: CheckedDay | null =
    oldest == null
      ? null
      : (() => {
          const d = daysBetween(localDate(new Date(oldest)), today);
          return d <= 0 ? 'today' : d === 1 ? 'yesterday' : 'earlier';
        })();
  const base = {
    riverSlug,
    date,
    bookedSites,
    reservableSites,
    campgroundsEligible: eligible.length,
    campgroundsCounted: counted,
    campgroundsFull: full,
    campgroundsClosed: closed,
    campgroundsNotReleased: notReleased,
    campgroundsNoInventory: noInventory,
    campgroundsMissing: missing,
    campgroundsMissingUnsized: missingUnsized,
    coverage,
    completeCoverage,
    oldestCheckedAt: oldest == null ? null : new Date(oldest).toISOString(),
    checkedRecently,
    checkedDay,
    leadDays,
    final: leadDays <= 1 && checkedRecently && checkedDay === 'today',
  };
  const withhold = (reason: DemandWithheld): CampingDemand => ({
    ...base,
    band: null,
    withheld: reason,
    allObservedBooked: false,
    booked: null,
  });

  // Whichever unavailability explains the most campgrounds names the reason.
  // Ties prefer the most conservative wording: closed, then not yet open.
  const unavailableReason = (): DemandWithheld =>
    closed >= notReleased && closed >= noInventory && closed > 0
      ? 'seasonal_closure'
      : notReleased >= noInventory
        ? 'booking_not_open'
        : 'no_reservable_inventory';
  const unavailable = closed + notReleased + noInventory;

  if (eligible.length === 0) return withhold('no_tracked_campgrounds');
  if (counted === 0)
    return withhold(missing === 0 ? unavailableReason() : 'missing_observations');
  // Most tracked campgrounds unavailable for the night: a smaller operating
  // sample than the river normally has, withheld separately from missing data.
  if (unavailable > eligible.length / 2) return withhold(unavailableReason());
  // One unavailable campground must not erase a broad regional sample. Keep
  // its missing count and unknown capacity visible; do not call it zero or
  // claim complete coverage. Smaller river samples retain the strict rule.
  const broadRegionalSample = riverSlug === null &&
    counted >= MIN_REGIONAL_CAMPGROUNDS &&
    counted / (counted + missing) >= MIN_REGIONAL_CAMPGROUND_SHARE;
  if (missingUnsized > 0 && !broadRegionalSample) return withhold('unsized_missing');
  // A large missing campground with a known capacity must still block a
  // misleading sample, even when another missing campground is unsized.
  if (knownCapacityCoverage != null && knownCapacityCoverage < MIN_COVERAGE)
    return withhold('missing_observations');
  if (reservableSites < MIN_SITES) return withhold('small_sample');

  const booked = bookedSites / reservableSites;
  const everyObservedFull = bookedSites === reservableSites;
  return {
    ...base,
    band: everyObservedFull && completeCoverage ? 'packed' : bandFor(booked),
    withheld: null,
    allObservedBooked: everyObservedFull && !completeCoverage,
    booked,
  };
}

/** One regional reading from unique campground inventory, never river totals.
 * The overview already resolves district/loop overlap. facilityId also prevents
 * a repeated campground row or a multi-river association inflating the score.
 * Standalone tracked campgrounds participate even without a linked river. */
export function regionalCampingDemand(
  overview: Omit<DemandOverview, 'tracked'> & {
    tracked: (DemandCampground & { facilityId: string })[];
  },
  date: string,
  now: number = Date.now(),
): CampingDemand {
  const unique = new Map(
    overview.tracked.map((campground) => [campground.facilityId, campground]),
  );
  return campingDemand({ ...overview, tracked: [...unique.values()] }, null, date, now);
}

/** Demand for each river over a run of nights. Never sum these across rivers:
 * a campground serving two rivers is counted in each. */
export function campingDemandByRiver(
  overview: DemandOverview,
  riverSlugs: readonly string[],
  dates: readonly string[],
  now: number = Date.now(),
): Map<string, CampingDemand[]> {
  return new Map(
    riverSlugs.map((slug) => [
      slug,
      dates.map((date) => campingDemand(overview, slug, date, now)),
    ]),
  );
}

/** Rivers with at least one eligible campground, for choosing what to show. */
export function campingDemandRivers(overview: DemandOverview): string[] {
  const rivers = new Set<string>();
  for (const c of overview.tracked)
    if (c.source === CAMPING_DEMAND_SOURCE) for (const s of c.riverSlugs) rivers.add(s);
  return [...rivers].sort();
}

const BAND_LABEL: Record<DemandBand, string> = {
  quiet: 'Quiet',
  moderate: 'Moderate',
  busy: 'Busy',
  crowded: 'Crowded',
  packed: 'Packed',
};

const WITHHELD_LABEL: Record<DemandWithheld, string> = {
  no_tracked_campgrounds: 'No Recreation.gov campgrounds tracked on this river',
  seasonal_closure: 'Most tracked campgrounds are closed this night',
  booking_not_open: 'Booking hasn’t opened yet for most tracked campgrounds',
  no_reservable_inventory: 'Most tracked campgrounds have no reservable sites this night',
  unsized_missing: 'Not enough campground data — some campgrounds couldn’t be checked',
  missing_observations: 'Not enough campground data',
  small_sample: 'Too few reservable sites to rate',
};

/** Short band for a pill, e.g. "Quiet". */
export function demandHeadline(d: CampingDemand): string {
  if (d.band == null) return 'Not enough data';
  if (d.allObservedBooked) return 'All observed sites booked';
  return BAND_LABEL[d.band];
}

/** The line under the headline, e.g. "24% of tracked campsites booked so far". */
export function demandDetail(d: CampingDemand): string {
  if (d.withheld === 'no_tracked_campgrounds' && d.riverSlug === null)
    return 'No Recreation.gov campgrounds tracked in the region';
  if (d.withheld) return WITHHELD_LABEL[d.withheld];
  const pct = Math.round((d.booked ?? 0) * 100);
  const soFar = d.final ? '' : ' so far';
  const coverage =
    !d.completeCoverage && d.coverage != null
      ? ` · ${Math.round(d.coverage * 100)}% of tracked capacity checked`
      : '';
  const sample = d.completeCoverage ? 'tracked' : 'checked';
  const missing = !d.completeCoverage && d.coverage == null
    ? ` · ${d.campgroundsCounted} campgrounds checked · ${d.campgroundsMissing} unavailable`
    : '';
  return `${pct}% of ${sample} campsites booked${soFar}${coverage}${missing}`;
}

/** Basis line, e.g. "3 Recreation.gov campgrounds · Checked today". */
export function demandBasis(d: CampingDemand): string {
  if (d.campgroundsCounted === 0) return 'Recreation.gov campgrounds';
  const n = d.campgroundsCounted;
  const noun = `${n} Recreation.gov campground${n === 1 ? '' : 's'}`;
  const when =
    d.checkedDay === 'today'
      ? 'Checked today'
      : d.checkedDay === 'yesterday'
        ? 'Checked yesterday'
        : 'Checked earlier — may be out of date';
  return `${noun} · ${when}`;
}

/** VoiceOver sentence for one river-night. */
export function demandAccessibilityLabel(d: CampingDemand, riverName: string, nightLabel: string): string {
  if (d.band == null) return `${riverName}, ${nightLabel}: camping demand unavailable. ${demandDetail(d)}.`;
  return `${riverName}, ${nightLabel}: camping demand ${demandHeadline(d)}. ${demandDetail(d)}.`;
}
