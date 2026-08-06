// eddy-ios/src/lib/stays.ts
// Somewhere to sleep that is not a campsite.
//
// ── A link, and deliberately never a count ────────────────────────────────
//
// Airbnb has no public listings API — the one it had was retired — so Eddy
// cannot say "12 stays within 10 miles" and must not imply it. What it can do
// is hand somebody a map of the right patch of ground, which is the whole of
// what this file builds.
//
// That limit sits well with the rest of the app rather than against it: the
// availability line renders nothing rather than "unknown" for exactly the same
// reason. A button that says "Search Airbnb nearby" promises a search. A badge
// reading "12 nearby" would promise a number Eddy has not got.
//
// ── Where it earns its place ──────────────────────────────────────────────
//
// Most usefully on a campground that is FULL. "Fully booked · Fri–Sun" is the
// end of the conversation today; a cabin fifteen minutes away is the obvious
// next question, and the app knew the coordinates the whole time.
//
// Pure, and free of `@/` imports, so the web suite can run it — the Expo app
// has no runner of its own.

/**
 * How far out to look, in miles.
 *
 * NOT the five miles this started as. Ozark float country is rural: five miles
 * around most put-ins on the Current or the Jacks Fork encloses national forest
 * and gravel road, and the honest result is an empty map — which reads as a
 * broken button rather than as a true answer about a genuinely empty patch of
 * ground. Ten reaches the towns where the cabins actually are (Eminence,
 * Salem, Steelville) while still meaning "near here" to somebody who has just
 * been told the campground is full.
 *
 * One constant, changed in one place, if that judgement turns out wrong.
 */
export const STAY_SEARCH_RADIUS_MILES = 10;

/** Mean degrees of latitude per mile. Good to a fraction of a percent anywhere. */
const MILES_PER_DEGREE_LAT = 69.05;

export interface LatLng {
  lat: number;
  lng: number;
}

/**
 * A bounding box `radius` miles around a point.
 *
 * Longitude degrees narrow toward the poles, so the east-west span is divided
 * by cos(latitude) — without it the box is a third too narrow at Missouri's
 * latitude and the search quietly misses the towns either side.
 */
export function boundingBox(
  at: LatLng,
  radiusMiles: number = STAY_SEARCH_RADIUS_MILES,
): { neLat: number; neLng: number; swLat: number; swLng: number } {
  const dLat = radiusMiles / MILES_PER_DEGREE_LAT;
  // Guarded against a cos that reaches zero at the pole. Eddy's rivers are all
  // near 37°N, so this only ever matters to a test.
  const cos = Math.max(0.01, Math.cos((at.lat * Math.PI) / 180));
  const dLng = radiusMiles / (MILES_PER_DEGREE_LAT * cos);

  return {
    neLat: at.lat + dLat,
    neLng: at.lng + dLng,
    swLat: at.lat - dLat,
    swLng: at.lng - dLng,
  };
}

/** Six decimals is about a tenth of a metre — far past what a map search needs. */
function coord(value: number): string {
  return value.toFixed(6);
}

/**
 * Airbnb's map search, centred on a patch of river.
 *
 * `search_by_map=true` is what makes Airbnb honour the box rather than
 * geocoding a place name and drifting to the nearest town centre.
 *
 * Returns null for a place with no geocode. Some directory rows have none, and
 * a button that opens a search of the whole world is worse than no button.
 */
export function airbnbSearchUrl(
  at: LatLng | null | undefined,
  radiusMiles: number = STAY_SEARCH_RADIUS_MILES,
): string | null {
  if (!at || !Number.isFinite(at.lat) || !Number.isFinite(at.lng)) return null;
  if (at.lat === 0 && at.lng === 0) return null;

  const box = boundingBox(at, radiusMiles);
  const params = new URLSearchParams({
    refinement_paths: '/homes',
    search_by_map: 'true',
    ne_lat: coord(box.neLat),
    ne_lng: coord(box.neLng),
    sw_lat: coord(box.swLat),
    sw_lng: coord(box.swLng),
  });

  return `https://www.airbnb.com/s/homes?${params.toString()}`;
}

/**
 * What the row says.
 *
 * Names the destination, because it leaves for Safari and lands on somebody
 * else's brand. A vague "Stays nearby" that opens Airbnb is the kind of small
 * dishonesty that costs trust the first time it surprises anyone.
 */
export const STAY_SEARCH_LABEL = 'Search Airbnb nearby';

/** The radius, said the way the row says it. */
export function stayRadiusLabel(radiusMiles: number = STAY_SEARCH_RADIUS_MILES): string {
  return `Within about ${radiusMiles} miles`;
}
