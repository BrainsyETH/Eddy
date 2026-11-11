import type {
  CampingStayResult,
  CampsiteStay,
} from '../../../shared/camping-stay';
import { stayNights } from '../../../shared/camping-stay';
import { campingStayState, currentPolicyStay } from '../../../shared/camping-policy';
import type { TrackedCampground } from './overview-types';
import { MAX_AGE_MS } from './freshness';
import { resolveHorizon, resolveWeekend } from './window';

export const WEB_STAY_CAP = 14;
export const WEB_FILTERS = ['Tent', 'RV', 'Electric'] as const;
export type WebSiteFilter = (typeof WEB_FILTERS)[number];
export type SiteFlags = Record<WebSiteFilter, boolean | null>;
export type StayVerdict = CampsiteStay['state'] | 'closed' | 'not_yet_released';
export interface StayBucket {
  flags: SiteFlags;
  state: StayVerdict;
  complete: boolean;
  count: number;
  policy?: {
    checkedAt: string;
    reviewBy: string;
    observed: { state: StayVerdict; complete: boolean };
    unobserved: { state: StayVerdict; complete: boolean };
  };
}
export interface FacilityStaySummary {
  facilityId: string;
  fetchedAt: string | null;
  catalogSites: number;
  buckets: StayBucket[];
}
export interface RegionalStay {
  arrival: string;
  departure: string;
  generatedAt: string;
  facilities: FacilityStaySummary[];
  filters: WebSiteFilter[];
}

/** Only explicit provider terms establish a flag; STANDARD does not prove RV suitability. */
export function siteFlags(
  site: { siteType: string | null; name: string | null },
  source: string,
): SiteFlags {
  const kind = (
    site.siteType ??
    (source === 'mo_state_parks' ? site.name?.split(/[#\d]/)[0] : '') ??
    ''
  )
    .trim()
    .toUpperCase();
  const nonElectric = /NONELECTRIC|\bBASIC\b/.test(kind);
  const electric = nonElectric
    ? false
    : /\bELECTRIC\b/.test(kind)
      ? true
      : null;
  return {
    Tent: /\bTENT\b/.test(kind)
      ? true
      : /\bRV\b|CABIN|YURT/.test(kind)
        ? false
        : null,
    RV: /\bRV\b/.test(kind)
      ? true
      : /TENT ONLY|WALK|CABIN|YURT|PLATFORM TENT/.test(kind)
        ? false
        : null,
    Electric: electric,
  };
}
function verdict(entry: CampsiteStay): { state: StayVerdict; complete: boolean } {
  return {
    state: entry.nights.every(n => n.state === 'closed') ? 'closed'
      : entry.nights.every(n => n.state === 'not_yet_released') ? 'not_yet_released' : entry.state,
    complete: entry.nights.every(n => n.state !== 'unknown'),
  };
}
export function compactStay(
  stay: CampingStayResult,
  source: string,
): FacilityStaySummary {
  const grouped = new Map<string, StayBucket>();
  for (const entry of stay.sites) {
    const policy = entry.site.policy;
    const observedNights = entry.nights.map(n => ({ ...n, state: n.observedState ?? n.state }));
    const bucket: StayBucket = {
      flags: siteFlags(entry.site, source),
      ...verdict(entry),
      count: 1,
      ...(policy ? { policy: {
        checkedAt: policy.checkedAt, reviewBy: policy.reviewBy,
        observed: verdict({ ...entry, nights: observedNights, state: campingStayState(observedNights) }),
        unobserved: verdict(currentPolicyStay(entry, false, Date.parse(policy.checkedAt))),
      } } : {}),
    };
    const key = JSON.stringify([bucket.flags, bucket.state, bucket.complete, bucket.policy]);
    const previous = grouped.get(key);
    if (previous) previous.count++;
    else grouped.set(key, bucket);
  }
  return {
    facilityId: stay.facilityId,
    fetchedAt: stay.fetchedAt,
    catalogSites: stay.sites.length,
    buckets: [...grouped.values()],
  };
}
export function shippingFilters(
  facilities: FacilityStaySummary[],
): WebSiteFilter[] {
  const total = facilities.reduce((sum, f) => sum + f.catalogSites, 0);
  return WEB_FILTERS.filter(
    (filter) =>
      total > 0 &&
      facilities.reduce(
        (sum, f) =>
          sum +
          f.buckets.reduce(
            (n, b) => n + (b.flags[filter] === null ? 0 : b.count),
            0,
          ),
        0,
      ) /
        total >=
        0.95,
  );
}
export interface StayAnswer {
  state:
    | 'available'
    | 'first_come'
    | 'unknown'
    | 'closed'
    | 'not_yet_released'
    | 'unavailable'
    | 'no_match';
  count: number;
  partial: boolean;
}
/** Filters are OR, matching the existing campsite chips. Unknown types cannot prove a zero. */
export function filteredStay(
  facilities: FacilityStaySummary[],
  filters: WebSiteFilter[],
  now = Date.now(),
): StayAnswer {
  let open = 0,
    walk = 0,
    possible = 0,
    matched = 0,
    closed = 0,
    unreleased = 0,
    total = 0;
  let incomplete = facilities.length === 0;
  for (const facility of facilities) {
    const age = facility.fetchedAt ? now - Date.parse(facility.fetchedAt) : NaN;
    const fresh = Number.isFinite(age) && age >= 0 && age < MAX_AGE_MS;
    if (!facility.catalogSites) {
      incomplete = true;
      continue;
    }
    for (const stored of facility.buckets) {
      const policy = stored.policy;
      const policyCurrent = policy && Date.parse(policy.checkedAt) <= now && now < Date.parse(policy.reviewBy);
      if (!fresh && !policyCurrent) {
        incomplete = true;
        continue;
      }
      const bucket = { ...stored, ...(!fresh ? policy!.unobserved : policy && !policyCurrent ? policy.observed : {}) };
      total += bucket.count;
      const match =
        !filters.length || filters.some((f) => bucket.flags[f] === true);
      const uncertainType =
        !match && filters.some((f) => bucket.flags[f] === null);
      const viable = ['available', 'first_come', 'unknown'].includes(
        bucket.state,
      );
      if (uncertainType && viable) possible += bucket.count;
      if (!match) continue;
      matched += bucket.count;
      if (!bucket.complete) incomplete = true;
      if (bucket.state === 'available') open += bucket.count;
      if (bucket.state === 'first_come') walk += bucket.count;
      if (bucket.state === 'unknown') possible += bucket.count;
      if (bucket.state === 'closed') closed += bucket.count;
      if (bucket.state === 'not_yet_released') unreleased += bucket.count;
    }
  }
  const partial = incomplete || possible > 0;
  return {
    state: open
      ? 'available'
      : walk
        ? 'first_come'
        : partial || !total
          ? 'unknown'
          : !matched
            ? 'no_match'
            : closed === matched
              ? 'closed'
              : unreleased === matched
                ? 'not_yet_released'
                : 'unavailable',
    count: open || walk,
    partial,
  };
}
export function stayLabel(answer: StayAnswer): string {
  switch (answer.state) {
    case 'available':
      return `${answer.partial ? 'At least ' : ''}${answer.count} ${answer.count === 1 ? 'site' : 'sites'} for your whole stay`;
    case 'first_come':
      return 'First come · No reservations';
    case 'unknown':
      return 'Availability unknown';
    case 'closed':
      return 'Closed for these dates';
    case 'not_yet_released':
      return 'Dates not released';
    case 'no_match':
      return 'No matching sites';
    case 'unavailable':
      return 'No sites for the whole stay';
  }
}
/** Existing place identity, never provider ID: district permits cover separate campgrounds. */
export function campgroundKey(camp: TrackedCampground): string {
  return camp.place
    ? `${camp.place.type}:${camp.place.id}`
    : `facility:${camp.facilityId}`;
}
export function groupCampgrounds(camps: TrackedCampground[]) {
  const groups = new Map<string, TrackedCampground[]>();
  for (const camp of camps) {
    const key = campgroundKey(camp);
    groups.set(key, [...(groups.get(key) ?? []), camp]);
  }
  return [...groups].map(([key, facilities]) => ({
    key,
    camp: facilities[0],
    facilities,
  }));
}
export function parseWebStay(
  params: URLSearchParams,
  horizon: { startDate: string; endDateExclusive: string },
) {
  if (
    [...params.keys()].some((key) => !['arrival', 'departure'].includes(key)) ||
    params.getAll('arrival').length !== 1 ||
    params.getAll('departure').length !== 1
  )
    return null;
  const arrival = params.get('arrival')!,
    departure = params.get('departure')!;
  const nights = stayNights({ arrival, departure });
  return nights.length &&
    nights.length <= WEB_STAY_CAP &&
    arrival >= horizon.startDate &&
    departure <= horizon.endDateExclusive
    ? { arrival, departure, nights }
    : null;
}
/** The web tab's date controls follow Central midnight, including resumed tabs. */
export function webPlanningWindow(clock: number) {
  const horizon = resolveHorizon(new Date(clock), 90);
  const weekend = resolveWeekend(new Date(clock));
  return { horizon: { ...horizon, endDateExclusive: horizon.endDate }, weekend };
}
