// eddy-ios/src/lib/directions.ts
// Turning a float plan into the two or three drives it actually takes.
//
// A float has more driving in it than paddling for most people: get to the
// put-in, leave a car at the take-out, and run the shuttle between them. The
// website answers that with Google Maps links; on a phone the answer has to be
// a handoff to whatever the phone already trusts for navigation.
//
// ── Apple Maps, not Google ──────────────────────────────────────────────────
// Apple Maps is guaranteed present on every iPhone, so a link into it can never
// fail. Offering Google as well would mean shipping LSApplicationQueriesSchemes
// and a canOpenURL probe just to decide whether to draw a second button — and a
// button that sometimes bounces to a web page is worse than one that always
// opens an app. The https form is used rather than the maps:// scheme because
// it degrades to a real page if this ever runs anywhere but iOS.
//
// Coordinates rather than names, always. "Akers Ferry" is ambiguous to a
// geocoder and an Ozark access point is frequently not in one at all; the
// latitude and longitude we hold are the only unambiguous thing about it.

/** Where a drive starts or ends. Anything with a coordinate will do. */
export interface DrivePoint {
  name: string;
  coordinates: { lng: number; lat: number };
}

function coord(point: DrivePoint): string {
  return `${point.coordinates.lat},${point.coordinates.lng}`;
}

/** Directions from wherever the phone is now to a single point. */
export function driveToUrl(point: DrivePoint): string {
  return `https://maps.apple.com/?daddr=${encodeURIComponent(coord(point))}&dirflg=d`;
}

/**
 * Directions between two of the plan's own points — the shuttle.
 *
 * Take-out → put-in is the direction the shuttle drives (you leave a car at the
 * bottom and drive back up to the water), and it is the same direction the plan's
 * own `driveBack` estimate is measured in, so the two agree.
 */
export function driveBetweenUrl(from: DrivePoint, to: DrivePoint): string {
  return `https://maps.apple.com/?saddr=${encodeURIComponent(coord(from))}&daddr=${encodeURIComponent(coord(to))}&dirflg=d`;
}

/**
 * The USGS page for a gauge, when we know its site number.
 *
 * The monitoring-location path is USGS's current canonical URL; the older
 * `?site_no=` query form redirects to it. Returns null rather than a guessed URL
 * when the plan came back without a site id — a dead link on a safety-adjacent
 * number is worse than no link.
 */
export function usgsGaugeUrl(siteId: string | null | undefined): string | null {
  if (!siteId) return null;
  return `https://waterdata.usgs.gov/monitoring-location/${encodeURIComponent(siteId)}/`;
}
