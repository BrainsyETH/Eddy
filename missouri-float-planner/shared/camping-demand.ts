// shared/camping-demand.ts
//
// Camping demand: how booked a river's tracked campsites are on one night,
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
/** A reading this recent counts as "checked today" (one nightly sync cycle plus slack). */
export const RECENT_CHECK_MS = 26 * 60 * 60 * 1000;

export type DemandBand = 'quiet' | 'moderate' | 'busy' | 'crowded' | 'packed';
export type DemandWithheld =
  | 'no_tracked_campgrounds'
  | 'seasonal_closure'
  | 'missing_observations'
  | 'small_sample';

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
  riverSlug: string;
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
  campgroundsClosed: number;
  campgroundsMissing: number;
  /** Observed share of eligible expected capacity; null when nothing is sized. */
  coverage: number | null;
  completeCoverage: boolean;
  oldestCheckedAt: string | null;
  /** Every counted reading is from the latest sync cycle. */
  checkedRecently: boolean;
  /** 0 = tonight, in America/Chicago. */
  leadDays: number;
  /** Close to the real outcome: tonight or tomorrow, freshly checked. */
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
 * Camping demand on one river for one night.
 *
 * Every eligible campground falls into exactly one bucket:
 * - observed: unexpired `open`/`full` night with reservable inventory → counted
 * - closed: `closed`, `not_yet_released`, or zero reservable inventory →
 *   accounted for, excluded from inventory (never "full")
 * - missing: no unexpired reading for the night → coverage unknown
 */
export function campingDemand(
  overview: DemandOverview,
  riverSlug: string,
  date: string,
  now: number = Date.now(),
): CampingDemand {
  const maxAgeMs = overview.maxObservationAgeSeconds * 1000;
  const eligible = overview.tracked.filter(
    (c) => c.source === CAMPING_DEMAND_SOURCE && c.riverSlugs.includes(riverSlug),
  );
  let bookedSites = 0,
    reservableSites = 0,
    full = 0,
    closed = 0,
    missing = 0,
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
      missingCapacity += capacity ?? 0;
      continue;
    }
    if (
      night.status === 'closed' ||
      night.status === 'not_yet_released' ||
      !(night.sitesReservable > 0)
    ) {
      closed++;
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
  const coverage = sizedTotal > 0 ? observedCapacity / sizedTotal : null;
  const completeCoverage = eligible.length > 0 && missing === 0;
  const checkedRecently = counted > 0 && recent;
  const base = {
    riverSlug,
    date,
    bookedSites,
    reservableSites,
    campgroundsEligible: eligible.length,
    campgroundsCounted: counted,
    campgroundsFull: full,
    campgroundsClosed: closed,
    campgroundsMissing: missing,
    coverage,
    completeCoverage,
    oldestCheckedAt: oldest == null ? null : new Date(oldest).toISOString(),
    checkedRecently,
    leadDays,
    final: leadDays <= 1 && checkedRecently,
  };
  const withhold = (reason: DemandWithheld): CampingDemand => ({
    ...base,
    band: null,
    withheld: reason,
    allObservedBooked: false,
    booked: null,
  });

  if (eligible.length === 0) return withhold('no_tracked_campgrounds');
  if (counted === 0)
    return withhold(missing === 0 ? 'seasonal_closure' : 'missing_observations');
  // Most tracked campgrounds closed for the night: a smaller operating sample
  // than the river normally has, withheld separately from missing data.
  if (closed > eligible.length / 2) return withhold('seasonal_closure');
  if (coverage != null && coverage < MIN_COVERAGE)
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
  if (d.withheld) return WITHHELD_LABEL[d.withheld];
  const pct = Math.round((d.booked ?? 0) * 100);
  const soFar = d.final ? '' : ' so far';
  const coverage =
    !d.completeCoverage && d.coverage != null
      ? ` · ${Math.round(d.coverage * 100)}% of tracked capacity checked`
      : '';
  return `${pct}% of tracked campsites booked${soFar}${coverage}`;
}

/** Basis line, e.g. "3 Recreation.gov campgrounds · Checked today". */
export function demandBasis(d: CampingDemand): string {
  if (d.campgroundsCounted === 0) return 'Recreation.gov campgrounds';
  const n = d.campgroundsCounted;
  const noun = `${n} Recreation.gov campground${n === 1 ? '' : 's'}`;
  return `${noun} · ${d.checkedRecently ? 'Checked today' : 'Checked earlier — may be out of date'}`;
}

/** VoiceOver sentence for one river-night. */
export function demandAccessibilityLabel(d: CampingDemand, riverName: string, nightLabel: string): string {
  if (d.band == null) return `${riverName}, ${nightLabel}: camping demand unavailable. ${demandDetail(d)}.`;
  return `${riverName}, ${nightLabel}: camping demand ${demandHeadline(d)}. ${demandDetail(d)}.`;
}
