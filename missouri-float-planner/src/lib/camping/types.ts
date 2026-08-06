// src/lib/camping/types.ts
// The shape both availability providers collapse into.
//
// Recreation.gov and UseDirect disagree about almost everything — one is
// month-locked and status-per-night, the other takes a date range and reports a
// boolean per unit; one names a `Closed` season, the other just drops the loop
// out of season. Everything downstream of the adapters (cache rows, API
// response, chip copy) speaks only the vocabulary below, so adding a third
// provider later means writing one `fetchWindow` and nothing else.

/** Which system a facility is booked through. */
export type CampingSource = 'recreation_gov' | 'mo_state_parks';

/**
 * What a card can say about a night or a window.
 *
 * `not_yet_released` is unreachable for the next-weekend window — that is never
 * more than nine days out and both booking windows are far wider
 * (Recreation.gov ~6 months, Missouri 270 days). It stays in the union because
 * the federal feed really does emit `NYR` and silently folding that into
 * `full` would be a lie if the window ever widens.
 */
export type AvailabilityStatus = 'open' | 'full' | 'closed' | 'not_yet_released';

/** A campground proper, or a district-wide backcountry permit. */
export type FacilityKind = 'campground' | 'backcountry_district';

/** One night at one facility, already folded across every site. */
export interface DailyAggregate {
  /** ISO date, `YYYY-MM-DD`, in the facility's own local day. */
  date: string;
  /** Sites bookable and free. */
  sitesOpen: number;
  /**
   * Sites bookable at all — the honest denominator.
   *
   * Excludes walk-up and seasonally-closed inventory. Red Bluff lists 62 sites
   * but 8 are first-come every single day; counting those would render "52 of
   * 62 open" for a campground where only 54 can ever be reserved.
   */
  sitesReservable: number;
  status: AvailabilityStatus;
}

/**
 * What one individual site is doing on one night.
 *
 * Deliberately NOT `AvailabilityStatus`. That union describes a whole
 * facility, where "full" is a statement about every site at once; a single site
 * is never "full", it is taken. The distinction that matters most here is
 * `walk_up`: Red Bluff's eight first-come sites are real inventory a person can
 * sleep in, and they must be listable — but counting them would make the
 * denominator lie, which is why foldNight excludes them. Storing the status
 * rather than a boolean is what lets both be true at once.
 */
export type UnitStatus = 'open' | 'reserved' | 'walk_up' | 'closed' | 'not_yet_released';

/**
 * One individual site, as its booking system describes it.
 *
 * Both providers volunteer all of this in the SAME response as the
 * availability — recreation.gov's month payload carries `site`, `loop`,
 * `campsite_type` and `max_num_people` alongside the calendar, and UseDirect's
 * grid carries `Units[].Name`. Neither needs a second API, a key, or a catalog
 * join. (The documented RIDB API would add ADA flags and coordinates and
 * nothing else this feature uses; see lib/usfs/ridb.ts, still uncalled.)
 */
export interface CampsiteRecord {
  /** The provider's own id, unique within its facility. */
  sourceSiteId: string;
  /** What the booking page PRINTS — `RTL3`, `012`, `Electric 50 amp #178`. */
  name: string | null;
  /** Trimmed: recreation.gov ships both `Ridge Top Loop` and `Ridge Top Loop `. */
  loop: string | null;
  /** `STANDARD ELECTRIC`, `TENT ONLY`, … — the provider's vocabulary, verbatim. */
  siteType: string | null;
  maxOccupancy: number | null;
}

/** One night at one site, before anything is folded. */
export interface SiteNight {
  sourceSiteId: string;
  date: string;
  status: UnitStatus;
}

/**
 * What an adapter answers with.
 *
 * All three come from ONE parse of ONE payload and must stay that way:
 * `nights` is `siteNights` folded, and computing them independently is how a
 * card ends up saying "8 open" above a list of six. See recgov.parseMonth.
 */
export interface FetchResult {
  nights: DailyAggregate[];
  sites: CampsiteRecord[];
  siteNights: SiteNight[];
}

/** A row of the curated link table, as the adapters need it. */
export interface FacilityLink {
  id: string;
  source: CampingSource;
  /**
   * Whatever identifier its own source needs, and only its own source.
   *
   * Federal: a RIDB facility id, one campground. UseDirect: a PlaceId, one
   * park — its bookable loops are discovered per sync rather than stored, so a
   * park that renumbers its loops needs no migration.
   */
  sourceFacilityId: string;
  /**
   * One loop inside a shared payload, or null for a whole facility.
   *
   * Ozark backcountry permits put up to eight separately named campgrounds
   * behind a single recreation.gov id, tagging each campsite with the
   * campground it belongs to. Set this and the adapter reports that loop's own
   * inventory instead of the district's — which is the difference between
   * "5 of 8 sites open" at Powder Mill and a district-wide 52 that describes
   * gravel bars twenty river miles away.
   */
  sourceLoop: string | null;
  displayName: string;
  kind: FacilityKind;
}

/** What a window's worth of nights collapses to for display. */
export interface WindowSummary {
  sitesOpen: number;
  sitesReservable: number;
  status: AvailabilityStatus;
}

/**
 * Fold the nights of a window into the single number a card shows.
 *
 * A site only counts as open if it is open for the whole stay, so the window
 * takes the MINIMUM across its nights rather than an average — "8 sites open
 * Fri–Sun" has to mean eight sites you can actually book for both nights.
 *
 * Status precedence matters and is not obvious. A window where every night is
 * closed is `closed`; a window with any bookable inventory at all is `open` or
 * `full` on the numbers. The mixed case — Pulltite is open Friday and Saturday
 * then closes 49 of 56 sites on Sunday — resolves to the numbers, because a
 * user who can still book two of the three nights is not looking at a closed
 * campground.
 */
export function summarizeWindow(nights: DailyAggregate[]): WindowSummary | null {
  if (nights.length === 0) return null;

  if (nights.every((n) => n.status === 'closed')) {
    return { sitesOpen: 0, sitesReservable: 0, status: 'closed' };
  }
  if (nights.every((n) => n.status === 'not_yet_released')) {
    return { sitesOpen: 0, sitesReservable: 0, status: 'not_yet_released' };
  }

  // Nights that are closed or unreleased carry no inventory and would drag the
  // minimum to zero, turning "closed Sunday" into "fully booked all weekend".
  const bookable = nights.filter(
    (n) => n.status !== 'closed' && n.status !== 'not_yet_released',
  );
  if (bookable.length === 0) return { sitesOpen: 0, sitesReservable: 0, status: 'full' };

  const sitesOpen = Math.min(...bookable.map((n) => n.sitesOpen));
  const sitesReservable = Math.max(...bookable.map((n) => n.sitesReservable));

  return { sitesOpen, sitesReservable, status: sitesOpen > 0 ? 'open' : 'full' };
}
