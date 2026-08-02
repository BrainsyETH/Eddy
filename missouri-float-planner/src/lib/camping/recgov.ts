// src/lib/camping/recgov.ts
// Recreation.gov availability — the federal half.
//
// The documented RIDB API (src/lib/usfs/ridb.ts) has no date dimension at all:
// facilities, campsites, attributes, never a calendar. Availability lives on a
// separate undocumented endpoint that recreation.gov's own booking widget
// calls, keyless, month-locked, and insistent that `start_date` be the first of
// a month:
//
//   GET /api/camps/availability/campground/{facilityId}/month?start_date=...
//
// Pacing is set by the caller and comes from robots.txt — see limiter.ts for
// why that is ten seconds and not the one second the community tools use.

import { fetchJson, HttpError, type Limiter } from './limiter';
import { monthsSpanned, type CampingWindow } from './window';
import type { DailyAggregate, FacilityLink } from './types';

const BASE = 'https://www.recreation.gov/api/camps/availability/campground';

/**
 * Every per-night value the endpoint has been observed to return.
 *
 * `Not Reservable` is a walk-up site — real inventory, but never bookable, so
 * it must not inflate the denominator. `Closed` is seasonal and is the reason
 * this union is not a boolean: Alley Spring reports 2,177 closed cells in
 * September, and rendering those as "fully booked" would send people hunting
 * for a cancellation that cannot exist.
 */
type Cell = 'Available' | 'Reserved' | 'Not Reservable' | 'Closed' | 'NYR';

interface MonthResponse {
  campsites: Record<
    string,
    {
      campsite_id: string;
      availabilities: Record<string, string>;
    }
  >;
}

function monthUrl(facilityId: string, monthStart: string): string {
  const startDate = encodeURIComponent(`${monthStart}T00:00:00.000Z`);
  return `${BASE}/${encodeURIComponent(facilityId)}/month?start_date=${startDate}`;
}

/** Response keys are `2026-08-07T00:00:00Z`; we work in plain dates. */
function dateOf(key: string): string {
  return key.slice(0, 10);
}

/** Fold one night's cells into an aggregate. */
export function foldNight(cells: Cell[]): Omit<DailyAggregate, 'date'> {
  if (cells.length === 0) return { sitesOpen: 0, sitesReservable: 0, status: 'full' };

  let open = 0;
  let reservable = 0;
  let closed = 0;
  let nyr = 0;

  for (const cell of cells) {
    switch (cell) {
      case 'Available':
        open++;
        reservable++;
        break;
      case 'Reserved':
        reservable++;
        break;
      case 'Closed':
        closed++;
        break;
      case 'NYR':
        nyr++;
        break;
      // 'Not Reservable' is walk-up inventory: counted nowhere on purpose.
    }
  }

  // Wholly-closed and wholly-unreleased nights are their own thing. A night
  // that is merely mostly closed still has bookable sites and reports numbers.
  if (closed === cells.length) return { sitesOpen: 0, sitesReservable: 0, status: 'closed' };
  if (nyr === cells.length) return { sitesOpen: 0, sitesReservable: 0, status: 'not_yet_released' };

  return { sitesOpen: open, sitesReservable: reservable, status: open > 0 ? 'open' : 'full' };
}

/** Parse one month payload into per-night aggregates, keyed by date. */
export function parseMonth(payload: MonthResponse): Map<string, Omit<DailyAggregate, 'date'>> {
  const byDate = new Map<string, Cell[]>();

  for (const site of Object.values(payload.campsites ?? {})) {
    for (const [key, value] of Object.entries(site.availabilities ?? {})) {
      const date = dateOf(key);
      const bucket = byDate.get(date);
      if (bucket) bucket.push(value as Cell);
      else byDate.set(date, [value as Cell]);
    }
  }

  const out = new Map<string, Omit<DailyAggregate, 'date'>>();
  for (const [date, cells] of byDate) out.set(date, foldNight(cells));
  return out;
}

/**
 * Availability for one facility across one window.
 *
 * Costs one request per calendar month the window touches — one most weeks,
 * two when a weekend straddles month-end. A 404 means the facility id is not a
 * bookable campground (six of the ids sitting in Eddy's data are exactly that),
 * and is reported as "nothing to say" rather than as an error, so one stale
 * seed row cannot trip the circuit breaker for every facility behind it.
 */
export async function fetchWindow(
  facility: FacilityLink,
  window: CampingWindow,
  limiter: Limiter,
): Promise<DailyAggregate[]> {
  const merged = new Map<string, Omit<DailyAggregate, 'date'>>();

  for (const month of monthsSpanned(window)) {
    // The 404 is swallowed INSIDE the limiter's task, not around it. A missing
    // facility is an answer, not a fault, and letting it surface as a rejection
    // would count against the consecutive-failure budget — three stale seed
    // rows in a row would then trip the breaker and silently drop every
    // facility queued behind them.
    const payload = await limiter.run(async () => {
      try {
        return await fetchJson<MonthResponse>(monthUrl(facility.sourceFacilityId, month));
      } catch (err) {
        if (err instanceof HttpError && err.status === 404) return null;
        throw err;
      }
    });

    if (payload === null) return [];
    for (const [date, agg] of parseMonth(payload)) merged.set(date, agg);
  }

  return window.nights
    .filter((night) => merged.has(night))
    .map((night) => ({ date: night, ...merged.get(night)! }));
}
