/** Shared transport and pure ordering rules for Find a Float. All times are
 * trip minutes, including ordinary stops; proximity is geographic miles. */
export type FloatBoat = 'canoe' | 'kayak' | 'raft' | 'tube';
export interface FloatSearchInput {
  near?: { lat: number; lng: number };
  river?: string;
  radiusMiles: number;
  targetHours: number;
  vesselType: FloatBoat;
  publicOnly: boolean;
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
}
export interface FloatSearchResponse {
  matches: FloatSearchOption[];
  alternatives: FloatSearchOption[];
  partial: boolean;
  failed: number;
  evaluated: number;
  estimatedAt: string;
  unavailableReason?: string;
}

export const REGULATED_DURATION_MESSAGE = 'Duration matching is unavailable on this river because dam releases can change the current mid-float. Check the river page for release information.';
export const FLOAT_SEARCH_MAX_AGE_MS = 30 * 60 * 1000;
/** Proximity orders similar fits only; it is straight-line, so never shown as a distance. */
export const FLOAT_SEARCH_PROXIMITY_NOTE = 'Among similar fits, put-ins closer to your starting point are listed first. Plan a float to see the drive.';
export function floatSearchUsedProximity(result: Pick<FloatSearchResponse, 'matches' | 'alternatives'>) {
  return [...result.matches, ...result.alternatives].some((option) => option.nearbyMiles != null);
}
export const FLOAT_SEARCH_EXPIRED_MESSAGE = 'These results have expired. Your choices are saved; search again for current conditions.';
export function floatSearchIsFresh(result: Pick<FloatSearchResponse, 'estimatedAt'>, now = Date.now()) {
  const age = now - Date.parse(result.estimatedAt);
  return Number.isFinite(age) && age >= 0 && age < FLOAT_SEARCH_MAX_AGE_MS;
}
export function floatSearchEmptyMessage(result: FloatSearchResponse) {
  if (result.unavailableReason) return result.unavailableReason;
  if (result.partial && result.evaluated === 0) return 'The search could not finish. Please try again.';
  return 'No duration matches found in this search. Try another river, boat, or time, or widen your nearby search.';
}

export interface FloatSearchPlace {
  id: string;
  name: string;
  near: { lat: number; lng: number };
}
export const FLOAT_BOATS: FloatBoat[] = ['canoe', 'kayak', 'raft', 'tube'];
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
