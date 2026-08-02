// src/lib/camping/read.ts
// The read side: Supabase only, never an upstream booking system.
//
// This is the property that bounds Eddy's outbound traffic no matter how
// popular a river page gets — a page render reads cached rows and nothing else.
// If the cache is empty, stale, or the facility is unlinked, the answer is
// `null` and the card renders no availability line at all.

import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveWeekend } from './window';
import { summarizeWindow, type AvailabilityStatus, type DailyAggregate } from './types';
import type { CampingSource, FacilityKind } from './types';

/**
 * How old a cached night may be before Eddy stops repeating it.
 *
 * Two nightly runs' worth of slack. One missed cron is invisible; a source
 * that has been failing for two days goes quiet rather than confidently
 * reporting last week's vacancies.
 */
const MAX_AGE_MS = 48 * 60 * 60 * 1000;

/** What a card needs to render one availability line. */
export interface CampsiteAvailability {
  window: { startDate: string; endDate: string; label: string };
  sitesOpen: number;
  sitesReservable: number;
  status: AvailabilityStatus;
  kind: FacilityKind;
  source: CampingSource;
  fetchedAt: string;
}

/** Availability keyed by the Eddy row it hangs off. */
export interface AvailabilityIndex {
  byNpsCampgroundId: Map<string, CampsiteAvailability>;
  byNearbyServiceId: Map<string, CampsiteAvailability>;
}

export const EMPTY_INDEX: AvailabilityIndex = {
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
  const window = resolveWeekend(now);

  const { data, error } = await supabase
    .from('campsite_availability')
    .select(
      'date, sites_open, sites_reservable, status, fetched_at, ' +
        'campsite_facilities!inner(id, source, kind, enabled, nps_campground_id, nearby_service_id)',
    )
    .in('date', window.nights)
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
    byNpsCampgroundId: new Map(),
    byNearbyServiceId: new Map(),
  };

  for (const { rows, meta, fetchedAt } of nightsByFacility.values()) {
    // A partial window would describe a different stay than its own label.
    if (rows.length !== window.nights.length) continue;

    const summary = summarizeWindow(rows);
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
    };

    if (meta.nps_campground_id) index.byNpsCampgroundId.set(meta.nps_campground_id, availability);
    if (meta.nearby_service_id) index.byNearbyServiceId.set(meta.nearby_service_id, availability);
  }

  return index;
}
