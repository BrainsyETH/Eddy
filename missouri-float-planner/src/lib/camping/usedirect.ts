// src/lib/camping/usedirect.ts
// Missouri State Parks availability — the other half of the map.
//
// Recreation.gov is federal only, which leaves out Meramec, Echo Bluff, Bennett
// Spring, Montauk, Sam A. Baker and Onondaga: state parks, and some of the most
// heavily used camping in Ozarks float country. Those book through icampmo.com,
// which is UseDirect. The reservation page publishes its own API base in
// plain JavaScript:
//
//   var SearchUrl = 'https://msprdr.usedirect.com/MSPRDR/rdr/';
//
// Two calls per park: `search/place` lists the bookable loops, `search/grid`
// returns per-unit, per-night freedom for one loop. Unlike Recreation.gov the
// grid accepts an arbitrary date range, so a Fri–Sun window is one request per
// loop regardless of whether it crosses month-end.
//
// UseDirect serves no robots.txt (404) and states no policy, so the pacing the
// caller passes is simply courtesy: measured latency is ~400ms and nine parks
// at 1.5s spacing produced zero errors.

import { fetchJson, type Limiter } from './limiter';
import type { CampingWindow } from './window';
import type { DailyAggregate, FacilityLink } from './types';

const BASE = 'https://msprdr.usedirect.com/MSPRDR/rdr';

/** Shared body fields both endpoints demand, none of which we vary. */
const COMMON_BODY = {
  IsADA: false,
  MinVehicleLength: 0,
  UnitCategoryId: 0,
  UnitTypesGroupIds: [] as number[],
  SleepingUnitId: 0,
  WebOnly: true,
  InSeasonOnly: true,
  RestrictADA: false,
} as const;

interface PlaceResponse {
  SelectedPlace?: {
    Name?: string;
    Facilities?: Record<string, RawFacility>;
  };
}

/**
 * The only facility category that holds campsites.
 *
 * Parks mix camping with day-use inventory in the same place response, and
 * both are bookable, so counting everything overstates the campground. Meramec
 * returns three picnic shelters (`day use`) and three group-tenting pitches
 * (`Group Camping`) alongside its 197 campsites — reporting 203 sites, all six
 * extras of which are the wrong kind of thing, and the three free shelters
 * inflating the open count too. Group camping is excluded for the same reason
 * a group site is priced separately: it is not what "8 sites open" means to
 * somebody looking for a place to pitch a tent.
 */
const CAMPGROUND_CATEGORY = 'Campgrounds';

interface RawFacility {
  /**
   * The real, global id — and the single sharpest edge in this integration.
   *
   * The Facilities dictionary is keyed by a PLACE-LOCAL index for some parks
   * (Sam A. Baker's loops are keyed 1..6) while `search/grid` only accepts the
   * global id carried here (820). Passing the key instead answers
   * "Invalid FacilityId specified" with an HTTP 200 and an empty Units map, so
   * the park silently reports zero sites rather than failing. Roughly half the
   * Missouri parks are affected.
   */
  FacilityId?: number;
  Name?: string;
  InSeason?: boolean;
  /** `Campgrounds`, `day use`, `Group Camping`, … — see CAMPGROUND_CATEGORY. */
  Category?: string;
}

interface GridResponse {
  Facility?: {
    Units?: Record<
      string,
      {
        Name?: string;
        Slices?: Record<string, { IsFree?: boolean }>;
      }
    >;
  };
}

async function post<T>(path: string, body: unknown, limiter: Limiter): Promise<T> {
  return limiter.run(() =>
    fetchJson<T>(`${BASE}/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );
}

/** Slice keys are `2026-08-07T00:00:00` — local, unzoned, already a date. */
function dateOf(key: string): string {
  return key.slice(0, 10);
}

/**
 * Camping loops, in season or not.
 *
 * Separate from `bookableLoops` so the caller can tell "this park has no
 * campground" from "this park's campground is shut" — a day-use-only place
 * must report nothing, while a closed campground must report closed.
 */
export function campgroundLoops(payload: PlaceResponse): RawFacility[] {
  return Object.values(payload.SelectedPlace?.Facilities ?? {}).filter(
    (f) => f.Category === CAMPGROUND_CATEGORY && typeof f.FacilityId === 'number',
  );
}

/** In-season camping loops, with their global ids. */
export function bookableLoops(payload: PlaceResponse): number[] {
  return campgroundLoops(payload)
    .filter((f) => f.InSeason !== false)
    .map((f) => f.FacilityId!);
}

/**
 * Count free and total units per night from one loop's grid.
 *
 * A unit is a site; a slice is one night of that site. There is no per-night
 * status vocabulary here — only `IsFree` — so a night's total is simply how
 * many units reported at all, which is why out-of-season loops have to be
 * filtered upstream rather than detected here.
 */
export function foldGrid(payload: GridResponse): Map<string, { open: number; total: number }> {
  const byDate = new Map<string, { open: number; total: number }>();

  for (const unit of Object.values(payload.Facility?.Units ?? {})) {
    for (const [key, slice] of Object.entries(unit.Slices ?? {})) {
      const date = dateOf(key);
      const bucket = byDate.get(date) ?? { open: 0, total: 0 };
      bucket.total++;
      if (slice.IsFree) bucket.open++;
      byDate.set(date, bucket);
    }
  }

  return byDate;
}

/**
 * Availability for one state park across one window.
 *
 * Costs one `search/place` plus one `search/grid` per in-season loop — nine
 * parks came to 42 requests when measured. A park with loops but none in season
 * reports every night `closed`, which is the honest answer for a campground
 * shut for the winter and matches what the federal adapter emits for the same
 * situation.
 */
export async function fetchWindow(
  facility: FacilityLink,
  window: CampingWindow,
  limiter: Limiter,
): Promise<DailyAggregate[]> {
  const placeId = Number(facility.sourceFacilityId);

  const place = await post<PlaceResponse>(
    'search/place',
    {
      ...COMMON_BODY,
      PlaceId: placeId,
      StartDate: window.startDate,
      Nights: String(window.nights.length),
    },
    limiter,
  );

  const campgrounds = campgroundLoops(place);
  const loops = bookableLoops(place);

  // No camping facilities means the park does not camp — Current River SP has
  // a place id and no campground, and a park listing only picnic shelters is
  // the same thing. Camping facilities that are all out of season mean it
  // camps, but not now, which is a different sentence.
  if (campgrounds.length === 0) return [];
  if (loops.length === 0) {
    return window.nights.map((date) => ({
      date,
      sitesOpen: 0,
      sitesReservable: 0,
      status: 'closed' as const,
    }));
  }

  const totals = new Map<string, { open: number; total: number }>();

  for (const loopId of loops) {
    const grid = await post<GridResponse>(
      'search/grid',
      {
        ...COMMON_BODY,
        FacilityId: loopId,
        StartDate: window.startDate,
        EndDate: window.endDate,
        UnitSort: 'orderby',
      },
      limiter,
    );

    for (const [date, counts] of foldGrid(grid)) {
      const bucket = totals.get(date) ?? { open: 0, total: 0 };
      bucket.open += counts.open;
      bucket.total += counts.total;
      totals.set(date, bucket);
    }
  }

  return window.nights
    .filter((night) => totals.has(night))
    .map((night) => {
      const { open, total } = totals.get(night)!;
      return {
        date: night,
        sitesOpen: open,
        sitesReservable: total,
        status: (open > 0 ? 'open' : 'full') as DailyAggregate['status'],
      };
    });
}
