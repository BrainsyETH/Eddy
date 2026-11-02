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
export const FLOAT_PUBLIC_ONLY_LABEL = 'Public access only';
/**
 * The restrictions a search applies, as labels in the Filters order, for a
 * badge or a one-line summary. Unlike floatFilterCount (changes from the
 * defaults, which decides whether Reset means anything), "Public access only"
 * counts here: it is on by default, but it is still a restriction.
 */
export function floatFilterSelections(input: Pick<FloatSearchInput, 'filters' | 'publicOnly'>) {
  return [
    ...(input.publicOnly ? [FLOAT_PUBLIC_ONLY_LABEL] : []),
    ...FLOAT_FILTER_GROUPS.flatMap(group => group.filters).filter(filter => input.filters?.[filter.key] === true).map(filter => filter.label),
  ];
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
  /** Structured cautions for display; `cautions` keeps the full sentences for older clients. */
  cautionItems?: FloatCaution[];
  /** What each end offers. Absent on older payloads. */
  endpointFacts?: { putIn: FloatEndpointFacts; takeOut: FloatEndpointFacts };
  /** Boat-rental and shuttle businesses on this river, most relevant to this float first. */
  outfitters?: FloatOutfitter[];
  /** What lies strictly between the put-in and the take-out, in river order. */
  along?: FloatStop[];
}

export type FloatFacility = 'camping' | 'restrooms' | 'parking';
export interface FloatEndpointFacts {
  facilities: FloatFacility[];
  /** null = not recorded. */
  feeRequired: boolean | null;
}

/**
 * Where a caution applies, so a regional notice never reads as a confirmed
 * problem on the float:
 *   route     recorded on the water between the ends (hazard, portage)
 *   endpoint  at the put-in or take-out (launch below / land above)
 *   area      a park or regional notice not matched to this stretch
 *   check     something Eddy could not verify (alert sources, forecast)
 */
export type FloatCautionScope = 'route' | 'endpoint' | 'area' | 'check';
export interface FloatCaution {
  scope: FloatCautionScope;
  /** A short, complete phrase for one line: "Low dam: portage required". */
  summary: string;
  /** The full sentence, for route details. */
  detail: string;
}
export const FLOAT_CAUTION_LABELS: Record<FloatCautionScope, string> = {
  route: 'On this float',
  endpoint: 'At an end',
  area: 'Area notice',
  check: 'Verify',
};
const CAUTION_ORDER: FloatCautionScope[] = ['route', 'endpoint', 'check', 'area'];
/** Most specific first: something confirmed on the float outranks a park-wide notice. */
export function sortFloatCautions(items: FloatCaution[]) {
  return [...items].sort((a, b) => CAUTION_ORDER.indexOf(a.scope) - CAUTION_ORDER.indexOf(b.scope));
}

/** A floating-relevant offering: a boat rental for some vessel, or a shuttle. */
export type FloatOutfitterOffer = 'shuttle' | 'canoe' | 'kayak' | 'raft' | 'tube';
/**
 * How the business relates to this float:
 *   run      it lists a run from this put-in to this take-out
 *   stretch  it lists a run that starts at or above this put-in and ends at or below this take-out
 *   river    it rents or shuttles on this river; this float is not among its listed runs
 */
export type FloatOutfitterMatch = 'run' | 'stretch' | 'river';
export interface FloatOutfitter {
  id: string;
  name: string;
  offers: FloatOutfitterOffer[];
  website: string | null;
  phone: string | null;
  match: FloatOutfitterMatch;
}
/**
 * The note under an outfitter that says more than being listed does. Every
 * outfitter shown serves the river, so `river` has no note: printing
 * "Serves this river" under each row restated the section heading.
 */
export const FLOAT_OUTFITTER_MATCH_LABELS: Partial<Record<FloatOutfitterMatch, string>> = {
  run: 'Lists this float',
  stretch: 'Lists a run covering this float',
};
export type FloatStopKind = 'access' | 'campground' | 'spring' | 'cave' | 'sight' | 'hazard' | 'portage';
export interface FloatStop {
  kind: FloatStopKind;
  name: string;
  mile: number;
  /** Accesses and campgrounds only. A private stop is never counted as a place to get off. */
  isPublic?: boolean | null;
}

export const FLOAT_FACILITY_LABELS: Record<FloatFacility, string> = {
  camping: 'Camping',
  restrooms: 'Restrooms',
  parking: 'Parking',
};
export const FLOAT_OFFER_LABELS: Record<FloatOutfitterOffer, string> = {
  shuttle: 'Shuttle',
  canoe: 'Canoes',
  kayak: 'Kayaks',
  raft: 'Rafts',
  tube: 'Tubes',
};
/** One business's own services, in two words: "Shuttle · Rentals", "Rentals", "Shuttle". */
export function outfitterServiceLabel(offers: FloatOutfitterOffer[]) {
  return [offers.includes('shuttle') && 'Shuttle', offers.some(offer => offer !== 'shuttle') && 'Rentals'].filter(Boolean).join(' · ');
}

export const FLOAT_STOP_LABELS: Record<FloatStopKind, string> = {
  access: 'Access',
  campground: 'Campground',
  spring: 'Spring',
  cave: 'Cave',
  sight: 'Point of interest',
  hazard: 'Hazard',
  portage: 'Portage',
};

/** Which end has a facility: "at put-in", "at take-out", "at both ends", or null. */
export function facilityWhere(o: Pick<FloatSearchOption, 'endpointFacts'>, facility: FloatFacility) {
  const put = o.endpointFacts?.putIn.facilities.includes(facility) ?? false;
  const take = o.endpointFacts?.takeOut.facilities.includes(facility) ?? false;
  return put && take ? 'at both ends' : put ? 'at put-in' : take ? 'at take-out' : null;
}

export type FloatHighlightKind = 'outfitter' | 'camping' | 'restrooms' | 'spring' | 'sight' | 'access';
export interface FloatHighlight { kind: FloatHighlightKind; label: string }

/**
 * At most two short facts that tell floats apart, each a visible phrase (not
 * an icon to decode). A facility the search filtered for comes first.
 */
export function floatCardHighlights(o: FloatSearchOption, filters?: FloatSearchFilters, limit = 2): FloatHighlight[] {
  const out: FloatHighlight[] = [];
  const listed = o.outfitters?.find(outfitter => outfitter.match !== 'river');
  if (listed) out.push({ kind: 'outfitter', label: `${listed.name}: ${listed.match === 'run' ? 'lists this float' : 'runs cover it'}` });
  const camping = facilityWhere(o, 'camping');
  const restrooms = facilityWhere(o, 'restrooms');
  const facilities: FloatHighlight[] = [];
  if (camping) facilities.push({ kind: 'camping', label: `Camping ${camping}` });
  if (restrooms) facilities.push({ kind: 'restrooms', label: `Restrooms ${restrooms}` });
  // A requested facility leads, ahead of even an outfitter.
  const wanted = facilities.filter(h => (h.kind === 'camping' && filters?.camping) || (h.kind === 'restrooms' && filters?.restrooms));
  out.unshift(...wanted);
  out.push(...facilities.filter(h => !wanted.includes(h)));
  const sight = o.along?.find(stop => stop.kind === 'spring' || stop.kind === 'cave' || stop.kind === 'sight');
  if (sight) out.push({ kind: sight.kind === 'spring' ? 'spring' : 'sight', label: `${sight.name} on the way` });
  const publicStops = o.along?.filter(stop => stop.kind === 'access' && stop.isPublic === true).length ?? 0;
  if (publicStops) out.push({ kind: 'access', label: `${publicStops} public ${publicStops === 1 ? 'access' : 'accesses'} on the way` });
  return out.slice(0, limit);
}

/** Readable access status for the card: never an icon alone. */
export function routeAccessText(o: Pick<FloatSearchOption, 'putIn' | 'takeOut'>) {
  const put = o.putIn.isPublic, take = o.takeOut.isPublic;
  if (put === false && take === false) return { text: 'Private put-in & take-out', private: true };
  if (put === false) return { text: 'Private put-in', private: true };
  if (take === false) return { text: 'Private take-out', private: true };
  if (put === true && take === true) return { text: 'Public access', private: false };
  return { text: 'Access unconfirmed', private: false };
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
