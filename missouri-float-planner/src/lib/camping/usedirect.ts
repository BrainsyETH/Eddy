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
import type {
  CampsiteRecord,
  DailyAggregate,
  FacilityLink,
  FetchResult,
  SiteNight,
} from './types';

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
        /**
         * Preferred over the dictionary key when present, for the reason
         * RawFacility.FacilityId is: this provider has already been caught
         * keying a dictionary by something other than the id it accepts back.
         */
        UnitId?: number;
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

/**
 * In-season camping loops, whole.
 *
 * The records rather than the ids, because a loop's `Name` is the only grouping
 * a state park offers a site list and it exists nowhere else in this API.
 */
export function inSeasonLoops(payload: PlaceResponse): RawFacility[] {
  return campgroundLoops(payload).filter((f) => f.InSeason !== false);
}

/** In-season camping loops, with their global ids. */
export function bookableLoops(payload: PlaceResponse): number[] {
  return inSeasonLoops(payload).map((f) => f.FacilityId!);
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
 * The same grid, per unit instead of per night.
 *
 * `Name` is the whole reason a state park needs no catalog lookup — it is both
 * the site number and its type in one string, `Electric 50 amp #178`. The id is
 * the Units dictionary key, which for this provider IS the unit id.
 *
 * Only two statuses are expressible here: `IsFree` is a boolean, so UseDirect
 * can say open or taken and never "walk-up" or "closed for the season". That
 * asymmetry with the federal feed is real, and the UI must not imply otherwise.
 */
export function foldGridSites(
  payload: GridResponse,
  loop: string | null,
): { sites: CampsiteRecord[]; siteNights: SiteNight[] } {
  const sites: CampsiteRecord[] = [];
  const siteNights: SiteNight[] = [];

  for (const [key, unit] of Object.entries(payload.Facility?.Units ?? {})) {
    const sourceSiteId = String(unit.UnitId ?? key);
    sites.push({
      sourceSiteId,
      name: unit.Name?.trim() || null,
      loop,
      siteType: null,
      maxOccupancy: null,
    });

    for (const [sliceKey, slice] of Object.entries(unit.Slices ?? {})) {
      siteNights.push({
        sourceSiteId,
        date: dateOf(sliceKey),
        status: slice.IsFree ? 'open' : 'reserved',
      });
    }
  }

  return { sites, siteNights };
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
): Promise<FetchResult> {
  const placeId = Number(facility.sourceFacilityId);

  const place = await post<PlaceResponse>(
    'search/place',
    {
      ...COMMON_BODY,
      PlaceId: placeId,
      StartDate: window.startDate,
      // ── ONE, ALWAYS. NOT the window's length ──────────────────────────────
      // This call DISCOVERS loops; the grid below is what reads the calendar,
      // and it takes the full range. Sending the window's length here asks a
      // question about stay availability from an endpoint whose answer is used
      // only for "which loops exist and are in season" — and that answer feeds
      // a branch that reports every night `closed` when it comes back empty.
      //
      // MEASURED, not assumed: Nights of 1, 30 and 90 against Meramec (place
      // 60) and Sam A. Baker (79), in peak season and late October, all return
      // the identical loop list. So this parameter does NOT filter the facility
      // list today and the fourteen-night horizon was not going to break it.
      // Pinned at one anyway, because loop discovery has no business varying
      // with how long somebody wants to stay, and the failure mode if UseDirect
      // ever does start honouring it here is "Closed for the season" printed
      // over a full campground in July.
      Nights: '1',
    },
    limiter,
  );

  const campgrounds = campgroundLoops(place);
  const loops = inSeasonLoops(place);

  // No camping facilities means the park does not camp — Current River SP has
  // a place id and no campground, and a park listing only picnic shelters is
  // the same thing. Camping facilities that are all out of season mean it
  // camps, but not now, which is a different sentence.
  if (campgrounds.length === 0) return { nights: [], sites: [], siteNights: [] };
  if (loops.length === 0) {
    return {
      nights: window.nights.map((date) => ({
        date,
        sitesOpen: 0,
        sitesReservable: 0,
        status: 'closed' as const,
      })),
      sites: [],
      siteNights: [],
    };
  }

  const totals = new Map<string, { open: number; total: number }>();
  const sites: CampsiteRecord[] = [];
  const siteNights: SiteNight[] = [];

  for (const loop of loops) {
    const grid = await post<GridResponse>(
      'search/grid',
      {
        ...COMMON_BODY,
        FacilityId: loop.FacilityId!,
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

    // The loop's own name is the only grouping a state park offers, and it
    // lives on the place response rather than the grid.
    const parsed = foldGridSites(grid, loop.Name?.trim() || null);
    sites.push(...parsed.sites);
    siteNights.push(...parsed.siteNights);
  }

  const wanted = new Set(window.nights);

  return {
    nights: window.nights
      .filter((night) => totals.has(night))
      .map((night) => {
        const { open, total } = totals.get(night)!;
        return {
          date: night,
          sitesOpen: open,
          sitesReservable: total,
          status: (open > 0 ? 'open' : 'full') as DailyAggregate['status'],
        };
      }),
    sites,
    siteNights: siteNights.filter((night) => wanted.has(night.date)),
  };
}
