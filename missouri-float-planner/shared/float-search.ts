/** Shared transport and pure ordering rules for Find a Float. All times are
 * trip minutes, including ordinary stops; proximity is geographic miles. */
export type FloatBoat = 'canoe' | 'kayak' | 'raft' | 'tube';
/** Days on the river; `targetHours` is per day. */
export type FloatTripDays = 1 | 2 | 3;
/** Each filter narrows the routes; an omitted or false key never relaxes a safety check. */
export interface FloatSearchFilters {
  restrooms?: boolean;
  camping?: boolean;
  noFees?: boolean;
  smoothRoads?: boolean;
  beginner?: boolean;
  springFed?: boolean;
  noPortages?: boolean;
  goodConditions?: boolean;
  shuttle?: boolean;
}
export type FloatFilterKey = keyof FloatSearchFilters;
export interface FloatSearchInput {
  near?: { lat: number; lng: number };
  river?: string;
  radiusMiles: number;
  targetHours: number;
  vesselType: FloatBoat;
  publicOnly: boolean;
  days?: FloatTripDays;
  filters?: FloatSearchFilters;
}
export const FLOAT_SEARCH_DEFAULT_BOAT: FloatBoat = 'kayak';
export const FLOAT_TRIP_DAYS: FloatTripDays[] = [1, 2, 3];
export const FLOAT_RADIUS_MILES = [25, 50, 100, 150, 200, 300] as const;
export function floatTripLabel(days: FloatTripDays = 1) {
  return days === 1 ? 'Day trip' : `${days} days`;
}
export const FLOAT_FILTER_GROUPS: Array<{ title: string; filters: Array<{ key: FloatFilterKey; label: string }> }> = [
  { title: 'Access', filters: [
    { key: 'restrooms', label: 'Restrooms' },
    { key: 'camping', label: 'Camping' },
    { key: 'noFees', label: 'No fees' },
    { key: 'smoothRoads', label: 'No rough roads' },
  ] },
  { title: 'River', filters: [
    { key: 'beginner', label: 'Beginner friendly' },
    { key: 'springFed', label: 'Spring-fed' },
    { key: 'noPortages', label: 'No portages' },
    { key: 'goodConditions', label: 'Good conditions only' },
  ] },
  { title: 'Services', filters: [{ key: 'shuttle', label: 'Outfitter shuttle' }] },
];
export const FLOAT_FILTER_KEYS = FLOAT_FILTER_GROUPS.flatMap(group => group.filters.map(filter => filter.key));
/** The enabled keys only, so request bodies and search identity ignore `false`. */
export function activeFloatFilters(filters?: FloatSearchFilters): FloatSearchFilters | undefined {
  const on = FLOAT_FILTER_KEYS.filter(key => filters?.[key] === true);
  return on.length ? Object.fromEntries(on.map(key => [key, true])) : undefined;
}
/** Changes from the defaults: each enabled filter, plus including private accesses. */
export function floatFilterCount(input: Pick<FloatSearchInput, 'filters' | 'publicOnly'>) {
  return Object.keys(activeFloatFilters(input.filters) ?? {}).length + (input.publicOnly ? 0 : 1);
}
export function floatTargetMinutes(input: Pick<FloatSearchInput, 'targetHours' | 'days'>) {
  return input.targetHours * (input.days ?? 1) * 60;
}
/** The exact body both apps submit: defaults are explicit and false filters are dropped. */
export function floatSearchRequest(input: FloatSearchInput): FloatSearchInput {
  const filters = activeFloatFilters(input.filters);
  return {
    ...(input.near ? { near: approximateLocation(input.near) } : {}),
    ...(input.river ? { river: input.river } : {}),
    radiusMiles: input.radiusMiles,
    targetHours: input.targetHours,
    vesselType: input.vesselType,
    publicOnly: input.publicOnly,
    ...((input.days ?? 1) > 1 ? { days: input.days } : {}),
    ...(filters ? { filters } : {}),
  };
}
export function floatSearchIdentity(input: FloatSearchInput) {
  return JSON.stringify(floatSearchRequest(input));
}
export interface DurationChoice {
  id: string;
  minutes: number;
  timeRange: { min: number; max: number };
  conditionCode?: string;
  conditional?: boolean;
  nearbyMiles?: number | null;
}
export function durationRelation(
  range: { min: number; max: number },
  targetMinutes: number,
) {
  return targetMinutes < range.min
    ? ('longer' as const)
    : targetMinutes > range.max
      ? ('shorter' as const)
      : ('match' as const);
}
export function compareFloatChoices(
  a: DurationChoice,
  b: DurationChoice,
  target: number,
) {
  const gap = (c: DurationChoice) =>
    Math.max(c.timeRange.min - target, target - c.timeRange.max, 0);
  const caution = (c: DurationChoice) =>
    Number(Boolean(c.conditional || c.conditionCode === 'low'));
  return (
    Number(gap(a) > 0) - Number(gap(b) > 0) ||
    caution(a) - caution(b) ||
    (gap(a) && gap(b) ? gap(a) - gap(b) : 0) ||
    Math.floor(Math.abs(a.minutes - target) / 60) -
      Math.floor(Math.abs(b.minutes - target) / 60) ||
    (a.nearbyMiles ?? Infinity) - (b.nearbyMiles ?? Infinity) ||
    a.timeRange.max - a.timeRange.min - (b.timeRange.max - b.timeRange.min) ||
    a.id.localeCompare(b.id)
  );
}
export function approximateLocation(point: { lat: number; lng: number }) {
  return {
    lat: Math.round(point.lat * 100) / 100,
    lng: Math.round(point.lng * 100) / 100,
  };
}
export function geographicMiles(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
) {
  const r = Math.PI / 180;
  const x =
    Math.sin(((b.lat - a.lat) * r) / 2) ** 2 +
    Math.cos(a.lat * r) *
      Math.cos(b.lat * r) *
      Math.sin(((b.lng - a.lng) * r) / 2) ** 2;
  return 3958.8 * 2 * Math.asin(Math.min(1, Math.sqrt(x)));
}

export interface FloatSearchOption extends DurationChoice {
  riverId: string;
  riverSlug: string;
  riverName: string;
  putIn: { id: string; name: string; isPublic: boolean | null };
  takeOut: { id: string; name: string; isPublic: boolean | null };
  vesselTypeId: string;
  distanceMiles: number;
  formattedTime: string;
  estimateBasis: 'current_conditions' | 'typical';
  observedAt: string | null;
  conditionLabel: string;
  cautions: string[];
  relation: 'match' | 'shorter' | 'longer';
  url: string;
  description: string | null;
  photo?: { url: string; caption: string } | null;
  /** Road minutes from the search origin to the put-in, when routing answered. */
  driveMinutes?: number | null;
  /** Short facts that matched or describe the route, e.g. "Camping". */
  highlights?: string[];
}
export interface FloatSearchResponse {
  matches: FloatSearchOption[];
  alternatives: FloatSearchOption[];
  partial: boolean;
  failed: number;
  evaluated: number;
  estimatedAt: string;
  unavailableReason?: string;
  emptyReason?: FloatSearchEmptyReason;
}

export type FloatSearchEmptyReason = 'too_low' | 'high_water' | 'water_conditions' | 'public_access' | 'access_points' | 'conditions_unavailable' | 'duration_unavailable' | 'closures' | 'hazards' | 'no_nearby_rivers' | 'route_checks' | 'filters';

const EMPTY_REASONS: Record<FloatSearchEmptyReason, string> = {
  too_low: 'Water is currently too low on the routes checked. Try a nearby river or check back when levels rise.',
  high_water: 'High water is keeping the routes checked out of suggestions. Try a nearby river or check back when levels fall.',
  water_conditions: 'Current water conditions rule out the routes checked. Try a nearby river.',
  public_access: 'No downstream route with two confirmed public accesses was found. Include other accesses or try a nearby river.',
  access_points: 'There aren’t enough mapped launch and take-out points for this search. Try a nearby river.',
  conditions_unavailable: 'Current conditions couldn’t be verified for the routes checked. Try a nearby river or check again later.',
  duration_unavailable: 'We couldn’t estimate a float time for the routes checked. Try a nearby river.',
  closures: 'Recorded closures affect the routes checked. Try a nearby river.',
  hazards: 'Recorded hazards keep the routes checked out of suggestions. Try a nearby river.',
  no_nearby_rivers: 'No rivers with eligible launches were found in this area. Try another location or a wider search.',
  route_checks: 'No routes passed the current condition and access checks. Try another river or a wider search.',
  filters: 'No routes match these filters. Clear filters or try a nearby river.',
};

export function floatSearchEmptyReasonMessage(reason: FloatSearchEmptyReason) {
  return EMPTY_REASONS[reason];
}

export const FLOAT_SEARCH_LOADING_TITLE = 'Eddy’s reading the waters';
export const FLOAT_SEARCH_LOADING_DETAIL = 'Finding routes for your day.';

export const REGULATED_DURATION_MESSAGE = 'Duration matching is unavailable on this river because dam releases can change the current mid-float. Check the river page for release information.';
export const FLOAT_SEARCH_MAX_AGE_MS = 30 * 60 * 1000;
export function floatSearchUsedProximity(result: Pick<FloatSearchResponse, 'matches' | 'alternatives'>) {
  return [...result.matches, ...result.alternatives].some((option) => option.nearbyMiles != null);
}
export const FLOAT_SEARCH_EXPIRED_MESSAGE = 'Results expired. Search again for current conditions.';
/** Shown behind an info button on both apps, never as inline subtext. */
export const FLOAT_TIME_INFO = [
  'Eddy uses published trip times when available. Otherwise, estimates use your vessel, route distance, and available river data.',
  'River flow can change your pace. Eddy uses current readings when available; estimates based on typical conditions are labeled.',
  'Trip times allow for typical stops. A time range is a guide, not an arrival time.',
  'Opening a float checks the route again, so its estimate can change.',
];
export const FLOAT_DISTANCE_INFO = [
  'Drive times are road estimates from your starting point to the put-in.',
  'Search radius is a straight line to the put-in, so the drive can be longer.',
  'River miles are the distance you float between the put-in and take-out.',
];
export function floatSearchIsFresh(result: Pick<FloatSearchResponse, 'estimatedAt'>, now = Date.now()) {
  const age = now - Date.parse(result.estimatedAt);
  return Number.isFinite(age) && age >= 0 && age < FLOAT_SEARCH_MAX_AGE_MS;
}
export function floatSearchEmptyMessage(result: FloatSearchResponse) {
  if (result.unavailableReason) return result.unavailableReason;
  if (result.partial && !result.alternatives.length) return 'The search could not finish. Please try again.';
  if (result.emptyReason) return floatSearchEmptyReasonMessage(result.emptyReason);
  if (result.alternatives.length) return 'No exact time match. These shorter or longer routes may work for your day.';
  return 'No routes found with these choices. Try another river or a wider search.';
}

/** Recovery is an explicit new search. Preserve time, vessel and access filters;
 * a selected river supplies a public catalogue location, never device GPS. */
export function floatSearchRecoveryOptions(
  input: FloatSearchInput,
  result: FloatSearchResponse,
  river?: { name: string; floatAccessCoordinates?: Array<{ lat: number; lng: number }> },
) {
  const options: Array<{ label: string; input: FloatSearchInput; location?: string }> = [];
  if (result.matches.length || result.alternatives.length || result.partial) return options;
  if (result.emptyReason === 'filters' && activeFloatFilters(input.filters)) {
    options.push({ label: 'Clear filters', input: { ...input, filters: undefined } });
  }
  if (input.publicOnly && result.emptyReason === 'public_access') {
    options.push({ label: 'Include other accesses', input: { ...input, publicOnly: false } });
  }
  const points = river?.floatAccessCoordinates?.filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lng) && Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180) ?? [];
  if (input.river && points.length) {
    const near = approximateLocation({
      lat: points.reduce((sum, p) => sum + p.lat, 0) / points.length,
      lng: points.reduce((sum, p) => sum + p.lng, 0) / points.length,
    });
    options.push({ label: 'Search nearby rivers', input: { ...input, river: undefined, near }, location: `Near ${river!.name}` });
  } else if (!input.river && input.near && input.radiusMiles < 300) {
    const radiusMiles = Math.min(300, input.radiusMiles * 2);
    options.push({ label: `Search within ${radiusMiles} miles`, input: { ...input, radiusMiles } });
  }
  return options;
}

export interface FloatSearchPlace {
  id: string;
  name: string;
  near: { lat: number; lng: number };
  /** An Eddy access point: searching it selects its river, ordered from this launch. */
  kind?: 'town' | 'access';
  river?: string;
  riverName?: string;
}

export type FloatSort = 'best' | 'drive' | 'shortest' | 'longest';
export const FLOAT_SORTS: Array<{ value: FloatSort; label: string }> = [
  { value: 'best', label: 'Best match' },
  { value: 'drive', label: 'Shortest drive' },
  { value: 'shortest', label: 'Shortest float' },
  { value: 'longest', label: 'Longest float' },
];
export function floatSortsFor(options: Array<Pick<FloatSearchOption, 'driveMinutes'>>) {
  return FLOAT_SORTS.filter(sort => sort.value !== 'drive' || options.some(option => option.driveMinutes != null));
}
/** Reorders a returned section only; it never changes which routes qualified. */
export function sortFloatOptions<T extends Pick<FloatSearchOption, 'minutes' | 'driveMinutes'>>(options: T[], sort: FloatSort): T[] {
  if (sort === 'best') return options;
  const value = (option: T) => sort === 'drive' ? option.driveMinutes ?? Infinity : option.minutes;
  return [...options].sort((a, b) => sort === 'longest' ? value(b) - value(a) : value(a) - value(b));
}
export function driveLabel(minutes: number) {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60), rest = minutes % 60;
  return rest ? `${hours} hr ${rest} min` : `${hours} hr`;
}
export const FLOAT_BOATS: FloatBoat[] = ['canoe', 'kayak', 'raft', 'tube'];
export function floatBoatLabel(boat: FloatBoat) {
  return boat[0].toUpperCase() + boat.slice(1);
}
export const FLOAT_BOAT_STORAGE_KEY = 'eddy.float-search.boat.v1';
export function floatRangeLabel(range: { min: number; max: number }) {
  const hours = (minutes: number) => Math.round((minutes / 60) * 10) / 10;
  return `${hours(range.min)}–${hours(range.max)} hours`;
}
export function publicAccessLabel(value: boolean | null) {
  return value === true
    ? 'Public access'
    : value === false
      ? 'Private access'
      : 'Access status unknown';
}
export function floatPlanPath(
  option: Pick<
    FloatSearchOption,
    'riverSlug' | 'putIn' | 'takeOut' | 'vesselTypeId'
  >,
) {
  return `/plan?${new URLSearchParams({ river: option.riverSlug, putIn: option.putIn.id, takeOut: option.takeOut.id, vessel: option.vesselTypeId })}`;
}
