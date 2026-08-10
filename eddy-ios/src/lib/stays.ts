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
 * How far out to look, in miles. This is a RADIUS; the box is twice it.
 *
 * ── THIS HAS BEEN 5, THEN 10, AND IS 5 AGAIN ─────────────────────────────
 *
 * The argument for 10 is on the record and is not wrong: Ozark float country is
 * rural, five miles around most put-ins on the Current or the Jacks Fork
 * encloses national forest and gravel road, and an empty map reads as a broken
 * button rather than as a true answer about an empty patch of ground. Ten
 * reached the towns where the cabins actually are — Eminence, Salem,
 * Steelville.
 *
 * It is 5 again by explicit instruction: a ~10-mile-across map, said in the copy
 * as "About 10 miles across". The trade being accepted is the one above — a
 * tighter box around a rural put-in will sometimes open on nothing.
 *
 * If that shows up in use, this constant is the whole fix. `staySearchAreaLabel`
 * derives its number from it, so the copy cannot be left behind saying the old
 * size.
 */
export const STAY_SEARCH_RADIUS_MILES = 5;

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

/**
 * The size of the search area, said as the map reads rather than as the maths.
 *
 * DERIVED, not written. The number is `2 × radius` because the box is centred
 * on the place, so the copy cannot drift from the geometry when the radius moves
 * — which it has, twice.
 *
 * "Across" is the NORTH-SOUTH span, and it is the honest one to quote: longitude
 * degrees are narrower than latitude degrees at 37°N, so `boundingBox` widens the
 * east-west side by 1/cos(lat) and the box is about 12.6 miles wide for every 10
 * it is tall. Quoting the smaller dimension under-promises; quoting the larger
 * would over-promise, and quoting both would be a geometry lesson on a link row.
 */
export function staySearchAreaLabel(radiusMiles: number = STAY_SEARCH_RADIUS_MILES): string {
  return `About ${radiusMiles * 2} miles across`;
}

/**
 * Airbnb's Rausch, on the outbound glyph and NOWHERE ELSE.
 *
 * ── Why the glyph and not the label ──────────────────────────────────────
 * Contrast decides it. `#FF5A5F` measures 3.05:1 on the light card (`#FFFFFF`),
 * which clears WCAG's 3:1 floor for a non-text graphical object and misses the
 * 4.5:1 floor for text. So the glyph can wear the real brand colour and the
 * label cannot. Darkening it enough to pass as text was the alternative and it
 * buys nothing — a darkened Rausch is not Rausch, so it would be neither
 * accessible-by-right nor recognisable.
 *
 * ── Why so little of it ──────────────────────────────────────────────────
 * Airbnb's trademark guidance
 * (https://www.airbnb.com/help/article/3233) is about not implying a
 * relationship that does not exist. Eddy has no partnership with Airbnb; this is
 * a link. A tinted glyph says "this leaves for Airbnb"; a filled coral button or
 * a logo would say something Eddy is not entitled to say. The label stays
 * `colors.text` and there is no mark.
 *
 * ── Why it is not in palette.ts ──────────────────────────────────────────
 * The palette is Eddy's, and every value in it is a ROLE that resolves through
 * the brand scales. This is a third party's constant that happens to be painted
 * on one glyph. Putting it in the palette would make it look like a colour the
 * app owns and could reuse, which is the opposite of the point.
 *
 * One hex for both schemes: on the dark card it measures about 4.9:1, so the
 * scheme-aware pair the light mode would need is unnecessary once the label is
 * out of scope.
 */
export const AIRBNB_LINK_COLOR = '#FF5A5F';
