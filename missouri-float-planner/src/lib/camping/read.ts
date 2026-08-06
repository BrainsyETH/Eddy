// src/lib/camping/read.ts
// The read side: Supabase only, never an upstream booking system.
//
// This is the property that bounds Eddy's outbound traffic no matter how
// popular a river page gets — a page render reads cached rows and nothing else.
// If the cache is empty, stale, or the facility is unlinked, the answer is
// `null` and the card renders no availability line at all.

import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveHorizon, resolveWeekend } from './window';
import { summarizeWindow, type AvailabilityStatus, type DailyAggregate } from './types';
import type { CampingSource, FacilityKind } from './types';

/**
 * How old a cached night may be before Eddy stops repeating it.
 *
 * Three nightly runs' worth of slack, widened from two when the stored window
 * went from two nights to fourteen. A fortnight straddles a month boundary on
 * roughly thirteen days in thirty, and on those days the federal source needs
 * two month payloads per facility instead of one — enough to run past a single
 * cron's time budget and leave the tail of the queue for the next slot. Two
 * days of slack would have turned that into a campground going silent.
 */
const MAX_AGE_MS = 72 * 60 * 60 * 1000;

/**
 * How much of the horizon is worth DRAWING as a strip.
 *
 * A campground whose season ends inside the fortnight legitimately has no rows
 * for the tail of it, and a truncated sync legitimately leaves a few nights
 * short. Neither is a reason to say nothing. What IS a reason is a facility
 * with two nights out of fourteen, where a strip would be mostly gaps and the
 * eye would read the gaps as "full".
 *
 * ── This gates the STRIP, not the facility ────────────────────────────────
 *
 * It used to drop the whole row, which was a deploy hazard rather than a
 * safeguard: the table holds two nights per facility until the first horizon
 * sync runs, so shipping this code would have taken every availability line in
 * the app dark until the next 09:00 cron — up to a day of a shipped feature
 * looking broken, for want of data nobody had written yet.
 *
 * The sentence and the strip have different needs and now say so. The sentence
 * needs the weekend it names, whole, and nothing more. The strip needs enough
 * of the fortnight to read as a shape. Below the floor the row still carries
 * its number and simply draws no strip, which is exactly what the app did
 * before any of this existed.
 */
const MIN_STRIP_NIGHTS = 7;

/** One measured night, as the app's strip draws it. */
export interface CampsiteNight {
  date: string;
  sitesOpen: number;
  sitesReservable: number;
  status: AvailabilityStatus;
}

/** What a card needs to render one availability line. */
export interface CampsiteAvailability {
  /** The nights `sitesOpen` describes — a stay, not the horizon. */
  window: { startDate: string; endDate: string; label: string };
  sitesOpen: number;
  sitesReservable: number;
  status: AvailabilityStatus;
  kind: FacilityKind;
  source: CampingSource;
  fetchedAt: string;
  /** The facility, so a client can ask for its individual sites. */
  facilityId: string;
  /**
   * Every measured night of the horizon, ascending. SPARSE BY DESIGN — a
   * missing date means "not measured", which the strip must draw as a gap and
   * never as zero.
   */
  nights: CampsiteNight[];
}

/**
 * Availability keyed by the Eddy row it hangs off.
 *
 * Three maps because Eddy stores the same physical campground in three place
 * tables and a caller only ever holds one of those ids. Meramec is an access
 * point AND a nearby_services row; Alley Spring is an access point AND an
 * nps_campgrounds row. The facility is the one row that knows they are the
 * same place, so it is indexed under every id it names.
 */
export interface AvailabilityIndex {
  /** Preferred where a caller has one: it is the row the map pin came from. */
  byAccessPointId: Map<string, CampsiteAvailability>;
  byNpsCampgroundId: Map<string, CampsiteAvailability>;
  byNearbyServiceId: Map<string, CampsiteAvailability>;
}

export const EMPTY_INDEX: AvailabilityIndex = {
  byAccessPointId: new Map(),
  byNpsCampgroundId: new Map(),
  byNearbyServiceId: new Map(),
};

interface JoinedRow {
  date: string;
  sites_open: number;
  sites_reservable: number;
  status: string;
  fetched_at: string;
  campsite_facilities: {
    id: string;
    source: string;
    kind: string;
    enabled: boolean;
    access_point_id: string | null;
    nps_campground_id: string | null;
    nearby_service_id: string | null;
  } | null;
}

/**
 * Every enabled facility's availability for the coming weekend, indexed both
 * ways so a caller can look up by whichever id it happens to hold.
 *
 * One query for the whole page. The table is a few dozen rows per night, so
 * filtering in memory costs less than a per-facility round trip and keeps this
 * off the critical path of a river page.
 */
export async function loadAvailability(
  supabase: SupabaseClient,
  now = new Date(),
): Promise<AvailabilityIndex> {
  const horizon = resolveHorizon(now);
  // What a SENTENCE describes, which is not what the table holds. See the fold
  // below for why these must never be the same set of nights.
  const window = resolveWeekend(now);

  const { data, error } = await supabase
    .from('campsite_availability')
    .select(
      'date, sites_open, sites_reservable, status, fetched_at, ' +
        'campsite_facilities!inner(id, source, kind, enabled, access_point_id, nps_campground_id, nearby_service_id)',
    )
    .in('date', horizon.nights)
    .eq('campsite_facilities.enabled', true);

  if (error) {
    // Availability is an enhancement. A page that cannot read it should render
    // exactly as it did before this feature existed, not 500.
    console.error('[camping] availability read failed:', error.message);
    return EMPTY_INDEX;
  }

  const nightsByFacility = new Map<
    string,
    { rows: DailyAggregate[]; meta: NonNullable<JoinedRow['campsite_facilities']>; fetchedAt: string }
  >();

  const freshEnough = now.getTime() - MAX_AGE_MS;

  for (const row of (data ?? []) as unknown as JoinedRow[]) {
    const facility = row.campsite_facilities;
    if (!facility) continue;
    if (Date.parse(row.fetched_at) < freshEnough) continue;

    const entry = nightsByFacility.get(facility.id) ?? {
      rows: [],
      meta: facility,
      fetchedAt: row.fetched_at,
    };
    entry.rows.push({
      date: row.date,
      sitesOpen: row.sites_open,
      sitesReservable: row.sites_reservable,
      status: row.status as AvailabilityStatus,
    });
    // Report the oldest night's timestamp: the weakest part of the answer.
    if (row.fetched_at < entry.fetchedAt) entry.fetchedAt = row.fetched_at;
    nightsByFacility.set(facility.id, entry);
  }

  const index: AvailabilityIndex = {
    byAccessPointId: new Map(),
    byNpsCampgroundId: new Map(),
    byNearbyServiceId: new Map(),
  };

  const wantedWeekend = new Set(window.nights);

  for (const { rows, meta, fetchedAt } of nightsByFacility.values()) {
    rows.sort((a, b) => a.date.localeCompare(b.date));

    // ── The sentence describes the WEEKEND, never the fortnight ─────────────
    // summarizeWindow takes the MINIMUM of sitesOpen across the nights it is
    // given, because "8 sites open Fri–Sun" has to mean eight you can book for
    // both nights. Handed fourteen nights that rule is catastrophic rather than
    // conservative: one busy Saturday drags the minimum to zero and the card
    // reads "Fully booked" for a campground with forty sites free on twelve of
    // the fourteen. The horizon feeds the strip; only the weekend is folded.
    const weekend = rows.filter((night) => wantedWeekend.has(night.date));
    if (weekend.length !== window.nights.length) continue;

    const summary = summarizeWindow(weekend);
    if (!summary) continue;

    // Nothing reservable and not closed means the feed had no bookable
    // inventory to report — that is "no answer", not "fully booked".
    if (summary.sitesReservable === 0 && summary.status !== 'closed') continue;

    const availability: CampsiteAvailability = {
      window: { startDate: window.startDate, endDate: window.endDate, label: window.label },
      sitesOpen: summary.sitesOpen,
      sitesReservable: summary.sitesReservable,
      status: summary.status,
      kind: meta.kind as FacilityKind,
      source: meta.source as CampingSource,
      fetchedAt,
      facilityId: meta.id,
      // Empty rather than sparse-to-the-point-of-meaningless: a client draws
      // whatever arrives, and three bars among eleven gaps reads as a
      // campground that is nearly full rather than as one barely measured.
      nights:
        rows.length >= MIN_STRIP_NIGHTS
          ? rows.map((night) => ({
              date: night.date,
              sitesOpen: night.sitesOpen,
              sitesReservable: night.sitesReservable,
              status: night.status,
            }))
          : [],
    };

    // Every id this facility names, so a caller holding any one of them finds
    // the same object. The maps are alternatives, not a precedence order —
    // that lives at the call site, where it can be stated.
    if (meta.access_point_id) index.byAccessPointId.set(meta.access_point_id, availability);
    if (meta.nps_campground_id) index.byNpsCampgroundId.set(meta.nps_campground_id, availability);
    if (meta.nearby_service_id) index.byNearbyServiceId.set(meta.nearby_service_id, availability);
  }

  return index;
}
