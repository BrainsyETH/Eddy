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
import type {
  CampsiteRecord,
  DailyAggregate,
  FacilityLink,
  FetchResult,
  SiteNight,
  UnitStatus,
} from './types';

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

/**
 * The same five values, as one site's own state.
 *
 * A total function over `Cell`, so a value the feed starts emitting tomorrow
 * fails the type check here rather than silently landing in the database as
 * something the CHECK constraint rejects at 4am. Anything genuinely unknown is
 * dropped by `unitCells`, matching foldNight's habit of counting it nowhere.
 */
const UNIT_STATUS: Record<Cell, UnitStatus> = {
  Available: 'open',
  Reserved: 'reserved',
  'Not Reservable': 'walk_up',
  Closed: 'closed',
  NYR: 'not_yet_released',
};

/**
 * What one site carries, which is a great deal more than the calendar.
 *
 * Every field below was verified against a live Red Bluff (232391) payload.
 * The endpoint was integrated for its calendar alone, so for a while this
 * interface declared three of these and the rest were parsed by nobody — which
 * is why Eddy needed no second API to list individual sites, and why it spent
 * that time counting picnic shelters as campsites. See CAMPING_USE.
 */
export interface MonthResponse {
  campsites: Record<
    string,
    {
      campsite_id: string;
      /** What the booking page prints — `RTL3`, `012`. Not the id. */
      site?: string;
      /** The campground this site belongs to, when the payload covers several. */
      loop?: string;
      /** `STANDARD ELECTRIC`, `TENT ONLY`, `GROUP SHELTER ELECTRIC`, … */
      campsite_type?: string;
      /** `Overnight` or `Day` — see CAMPING_USE. */
      type_of_use?: string;
      max_num_people?: number;
      availabilities: Record<string, string>;
    }
  >;
}

/**
 * The only kind of site a person can sleep in.
 *
 * A campground's payload mixes overnight sites with day-use inventory that is
 * bookable on the same calendar, so counting everything overstates it: Red
 * Bluff returns two group picnic shelters among its 62 entries and therefore
 * reported "36 of 54 sites open" where the truthful answer is 35 of 52. Two of
 * those "sites" are pavilions with a roof and no ground to pitch on.
 *
 * The state-park adapter already excludes exactly this (usedirect.ts's
 * CAMPGROUND_CATEGORY, and the commit that stopped counting picnic shelters);
 * the federal side could not, because `type_of_use` was never parsed. Absent
 * counts as overnight — the field is reliably present, and dropping a real
 * campsite is worse than keeping a shelter.
 */
const CAMPING_USE = 'Day';

/**
 * Month payloads already fetched during one sync run.
 *
 * Three Ozark district ids cover eighteen campgrounds between them, so without
 * this the loop rows would re-request the same payload up to eight times —
 * eight times the load, for identical bytes. Keyed by facility and month, and
 * a null value memoizes a 404 so a dead id is asked about once.
 */
export type MonthCache = Map<string, MonthResponse | null>;

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

/** Trailing whitespace is real in this feed: `Ridge Top Loop ` and `Ridge Top Loop`. */
function cleanLoop(loop: string | undefined): string | null {
  const trimmed = loop?.trim();
  return trimmed ? trimmed : null;
}

/**
 * Every overnight site in one payload, with its calendar.
 *
 * THE SINGLE TRAVERSAL. Every projection below reads this and nothing else, so
 * the number a card prints and the list a person scrolls cannot disagree about
 * which sites were counted — the failure mode being "8 open" above a list of
 * six, which reads as a bug in the app rather than in a feed.
 *
 * `loop` narrows a shared district payload to one campground. Filtering here
 * rather than at the fetch keeps the request count at one per district no
 * matter how many of its campgrounds Eddy lists. It is compared trimmed, since
 * the same loop arrives spelled both ways within one response.
 */
function overnightSites(
  payload: MonthResponse,
  loop?: string | null,
): { record: CampsiteRecord; cells: { date: string; cell: Cell }[] }[] {
  const wanted = cleanLoop(loop ?? undefined);
  const out: { record: CampsiteRecord; cells: { date: string; cell: Cell }[] }[] = [];

  for (const site of Object.values(payload.campsites ?? {})) {
    const siteLoop = cleanLoop(site.loop);
    if (wanted && siteLoop !== wanted) continue;
    if (site.type_of_use === CAMPING_USE) continue;

    const cells: { date: string; cell: Cell }[] = [];
    for (const [key, value] of Object.entries(site.availabilities ?? {})) {
      // A value outside the union is dropped rather than guessed at. foldNight
      // already counts an unrecognised cell nowhere; this keeps the site list
      // agreeing with it instead of inventing a sixth state.
      if (!(value in UNIT_STATUS)) continue;
      cells.push({ date: dateOf(key), cell: value as Cell });
    }

    out.push({
      record: {
        sourceSiteId: site.campsite_id,
        name: site.site?.trim() || null,
        loop: siteLoop,
        siteType: site.campsite_type?.trim() || null,
        maxOccupancy: typeof site.max_num_people === 'number' ? site.max_num_people : null,
      },
      cells,
    });
  }

  return out;
}

/** Parse one month payload into per-night aggregates, keyed by date. */
export function parseMonth(
  payload: MonthResponse,
  loop?: string | null,
): Map<string, Omit<DailyAggregate, 'date'>> {
  const byDate = new Map<string, Cell[]>();

  for (const { cells } of overnightSites(payload, loop)) {
    for (const { date, cell } of cells) {
      const bucket = byDate.get(date);
      if (bucket) bucket.push(cell);
      else byDate.set(date, [cell]);
    }
  }

  const out = new Map<string, Omit<DailyAggregate, 'date'>>();
  for (const [date, cells] of byDate) out.set(date, foldNight(cells));
  return out;
}

/** The same payload, per site instead of per night. */
export function parseMonthSites(
  payload: MonthResponse,
  loop?: string | null,
): { sites: CampsiteRecord[]; siteNights: SiteNight[] } {
  const sites: CampsiteRecord[] = [];
  const siteNights: SiteNight[] = [];

  for (const { record, cells } of overnightSites(payload, loop)) {
    sites.push(record);
    for (const { date, cell } of cells) {
      siteNights.push({ sourceSiteId: record.sourceSiteId, date, status: UNIT_STATUS[cell] });
    }
  }

  return { sites, siteNights };
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
  cache?: MonthCache,
): Promise<FetchResult> {
  const merged = new Map<string, Omit<DailyAggregate, 'date'>>();
  // Keyed so a site appearing in both months of a straddling window is one
  // record, not two competing ones.
  const sites = new Map<string, CampsiteRecord>();
  const siteNights: SiteNight[] = [];

  for (const month of monthsSpanned(window)) {
    const key = `${facility.sourceFacilityId}:${month}`;
    let payload: MonthResponse | null;

    if (cache?.has(key)) {
      payload = cache.get(key)!;
    } else {
      // The 404 is swallowed INSIDE the limiter's task, not around it. A
      // missing facility is an answer, not a fault, and letting it surface as
      // a rejection would count against the consecutive-failure budget —
      // three stale seed rows in a row would then trip the breaker and
      // silently drop every facility queued behind them.
      payload = await limiter.run(async () => {
        try {
          return await fetchJson<MonthResponse>(monthUrl(facility.sourceFacilityId, month));
        } catch (err) {
          if (err instanceof HttpError && err.status === 404) return null;
          throw err;
        }
      });
      cache?.set(key, payload);
    }

    if (payload === null) return { nights: [], sites: [], siteNights: [] };

    for (const [date, agg] of parseMonth(payload, facility.sourceLoop)) merged.set(date, agg);

    const parsed = parseMonthSites(payload, facility.sourceLoop);
    for (const site of parsed.sites) sites.set(site.sourceSiteId, site);
    siteNights.push(...parsed.siteNights);
  }

  const wanted = new Set(window.nights);

  return {
    nights: window.nights
      .filter((night) => merged.has(night))
      .map((night) => ({ date: night, ...merged.get(night)! })),
    sites: [...sites.values()],
    // A month payload covers the whole month; only the horizon is stored.
    siteNights: siteNights.filter((night) => wanted.has(night.date)),
  };
}
