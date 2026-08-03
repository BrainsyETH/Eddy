// packages/eddy-geo/index.ts
// Map geometry both apps need: viewport quantisation for the national gauge
// layer, and the coordinate → navigation-app URL builders.
//
// WHY THIS IS SHARED: eddy-ios has no test runner of its own, so pure logic that
// only lives there cannot be covered. Anything here is exercised by the web
// suite (src/lib/geo-tiles.test.ts, geo-viewport.test.ts).
//
// IT USED TO HOLD WEB MERCATOR TILE MATHS — tile counts, corridor boxes, a
// download-size estimate — for the offline map download. That feature is gone,
// and so are they: they had exactly one consumer and keeping them would leave a
// tested, documented subsystem that nothing calls, which reads to the next
// person as load-bearing. Git has them if offline downloads ever come back.

/** [minLng, minLat, maxLng, maxLat] — the order /api/rivers/[slug] returns. */
export type Bounds = [number, number, number, number];

/** A point, in the lng/lat pair order the rest of this file uses. */
export interface Coords {
  lat: number;
  lng: number;
}

/**
 * Great-circle distance in miles.
 *
 * STRAIGHT LINE, and every caller must say so. The number that actually decides
 * a trip is drive time, which is a Mapbox Directions call per candidate — far
 * too expensive to run across two dozen rivers to sort a list. "32 miles away"
 * with the caveat beats a spinner, and beats nothing.
 *
 * Lives here rather than in the hook that used to own it because it is pure
 * arithmetic with no relationship to a permission prompt, and because two
 * screens now rank rivers by it — see riverMilesByGauge in eddy-ios. useLocation
 * re-exports it, so existing imports are unaffected.
 */
export function milesBetween(a: Coords, b: Coords): number {
  const EARTH_RADIUS_MILES = 3958.8;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_MILES * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Bytes as a person reads them. Its one caller is the Storage screen, which
 * reports how much room the cached river data takes on the phone.
 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  const mb = bytes / (1024 * 1024);
  if (mb < 1024) return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;
  return `${(mb / 1024).toFixed(1)} GB`;
}

/** Tight bounds around a set of coordinates. */
export function boundsForLine(coordinates: Array<[number, number]>): Bounds | null {
  if (!coordinates.length) return null;
  let minLng = Infinity;
  let minLat = Infinity;
  let maxLng = -Infinity;
  let maxLat = -Infinity;
  for (const [lng, lat] of coordinates) {
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue;
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }
  if (!Number.isFinite(minLng)) return null;
  return [minLng, minLat, maxLng, maxLat];
}

// ── Viewport requests (the national gauge layer) ────────────────────────────
//
// The map asks the server for gauges inside the camera's bounds every time it
// settles. Three problems come with that, and these three helpers are the
// answers:
//
//   1. A continuous bbox space never hits a CDN. Two pans a pixel apart are two
//      distinct URLs, so every request is a cache miss and an origin hit.
//      quantizeBbox snaps to a grid, collapsing a metro area to a handful of
//      URLs that cache properly.
//   2. Snapping alone still refetches whenever a cell boundary is crossed.
//      padBbox asks for more than the screen so small pans stay inside what we
//      already hold.
//   3. bboxContains is what lets the client skip the request entirely.
//
// These live here, not in the app, because eddy-ios has no test runner — pure
// logic that only lives there cannot be covered. See the commit that moved
// reading-unit into shared/ for what that costs when it goes wrong.

/**
 * Grid size in degrees for a zoom level.
 *
 * Coarser when zoomed out, where a cell covers a lot of screen and the payload
 * is capped anyway, and finer when zoomed in, where snapping too coarsely would
 * request most of a state to draw one valley.
 */
export function bboxGridSize(zoom: number): number {
  if (zoom < 8) return 0.5;
  if (zoom < 11) return 0.1;
  return 0.02;
}

/**
 * Snaps bounds outward onto a grid.
 *
 * OUTWARD in both directions — floor the minimums, ceil the maximums — so the
 * snapped box always CONTAINS the real viewport. Rounding to nearest would
 * sometimes return a box smaller than the screen, and the missing strip would
 * show as gauges that appear only after you pan past them.
 */
export function quantizeBbox(bounds: Bounds, zoom: number): Bounds {
  const g = bboxGridSize(zoom);
  const [minLng, minLat, maxLng, maxLat] = bounds;
  // Rounded to kill the floating-point dust that would otherwise make two
  // identical viewports produce two different cache keys.
  const snap = (v: number) => Math.round(v * 1e6) / 1e6;
  return [
    snap(Math.floor(minLng / g) * g),
    snap(Math.max(-90, Math.floor(minLat / g) * g)),
    snap(Math.ceil(maxLng / g) * g),
    snap(Math.min(90, Math.ceil(maxLat / g) * g)),
  ];
}

/**
 * Grows bounds by a fraction of their own size, clamped to the world.
 *
 * Proportional rather than a fixed distance: the point is to buy roughly one
 * screen's worth of slack at any zoom, and a screen is a different number of
 * degrees at z6 than at z14.
 */
export function padBbox(bounds: Bounds, fraction = 0.2): Bounds {
  const [minLng, minLat, maxLng, maxLat] = bounds;
  const lngPad = (maxLng - minLng) * fraction;
  const latPad = (maxLat - minLat) * fraction;
  return [
    Math.max(-180, minLng - lngPad),
    Math.max(-90, minLat - latPad),
    Math.min(180, maxLng + lngPad),
    Math.min(90, maxLat + latPad),
  ];
}

/** True when `inner` lies entirely within `outer` — the "skip the fetch" test. */
export function bboxContains(outer: Bounds, inner: Bounds): boolean {
  return (
    outer[0] <= inner[0] && outer[1] <= inner[1] && outer[2] >= inner[2] && outer[3] >= inner[3]
  );
}

// ── Navigation hand-off (onX, Gaia, Google, Apple) ──────────────────────────
//
// An access point is a place you DRIVE to, and the last mile of that drive is
// frequently an unnamed gravel track. That is the ground onX and Gaia are built
// for and consumer road maps are not, which is why they belong beside the two
// obvious choices rather than as an afterthought.
//
// WHY THE URLS LIVE HERE. The web app has had these since the access-point page
// shipped (src/lib/navigation/deepLinks.ts) and the phone had only Apple Maps.
// Moving the pure half here lets the app share it — and, more to the point, lets
// it be TESTED: eddy-ios has no runner of its own, so logic that lives only
// there cannot be covered. Same argument as the viewport helpers above.
//
// Vercel installs only missouri-float-planner/, so the web app CANNOT import
// this module and deliberately keeps its own copy. The web test suite reaches
// across and asserts the two agree — see navigation-deep-links.test.ts. Change
// a URL template here and you must change it there in the same commit.
//
// COORDINATES, NEVER NAMES. "Akers Ferry" is ambiguous to a geocoder and an
// Ozark access point is frequently not in one at all.

export type NavApp = 'onx' | 'gaia' | 'google' | 'apple';

export interface NavigationCoords {
  lat: number;
  lng: number;
  label?: string;
}

export interface NavLinkSpec {
  app: NavApp;
  label: string;
  subtitle: string;
  /**
   * The app's URL scheme, without the `://`.
   *
   * Present so a native client can ask `canOpenURL` whether the app is even
   * installed before drawing a button for it. The web app derives installedness
   * from a navigation timeout instead and has no use for this field, which is
   * why it is the one key the drift test does not compare.
   */
  scheme: string;
  /** Opens the app directly. */
  deepLink: string;
  /** The same place on the open web, for desktop or a missing app. */
  webFallback: string;
  storeUrl: { ios: string; android: string };
}

/**
 * Navigation links for one coordinate, in the order they should be offered.
 *
 * `directionsOverride` is an admin-entered Google Maps URL for the access points
 * whose real driving approach a coordinate cannot express — it replaces BOTH of
 * Google's URLs and is ignored by the other three, which have no way to consume
 * someone else's route.
 */
export function navLinksFor(
  coords: NavigationCoords,
  directionsOverride?: string | null
): NavLinkSpec[] {
  const { lat, lng, label } = coords;
  const encodedLabel = encodeURIComponent(label || 'Access Point');

  return [
    {
      app: 'onx',
      label: 'Onx',
      subtitle: 'Offroad',
      scheme: 'onxoffroad',
      deepLink: `onxoffroad://map?lat=${lat}&lon=${lng}&zoom=15`,
      webFallback: `https://webmap.onxmaps.com/?lat=${lat}&lon=${lng}&zoom=15`,
      storeUrl: {
        ios: 'https://apps.apple.com/app/onx-offroad/id1326549302',
        android: 'https://play.google.com/store/apps/details?id=com.onxmaps.offroad',
      },
    },
    {
      app: 'gaia',
      label: 'Gaia',
      subtitle: 'GPS',
      scheme: 'gaiagps',
      deepLink: `gaiagps://map?lat=${lat}&lon=${lng}&zoom=15`,
      webFallback: `https://www.gaiagps.com/map/?lat=${lat}&lon=${lng}&zoom=15`,
      storeUrl: {
        ios: 'https://apps.apple.com/app/gaia-gps-offroad-hiking-maps/id329127297',
        android: 'https://play.google.com/store/apps/details?id=com.trailbehind.android.gaiagps.pro',
      },
    },
    {
      app: 'google',
      label: 'Google',
      subtitle: 'Maps',
      scheme: 'comgooglemaps',
      deepLink: directionsOverride || `comgooglemaps://?q=${lat},${lng}&label=${encodedLabel}`,
      webFallback: directionsOverride || `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`,
      storeUrl: {
        ios: 'https://apps.apple.com/app/google-maps/id585027354',
        android: 'https://play.google.com/store/apps/details?id=com.google.android.apps.maps',
      },
    },
    {
      app: 'apple',
      label: 'Apple',
      subtitle: 'Maps',
      scheme: 'maps',
      deepLink: `maps://?q=${encodedLabel}&ll=${lat},${lng}`,
      webFallback: `https://maps.apple.com/?q=${encodedLabel}&ll=${lat},${lng}`,
      storeUrl: {
        ios: 'https://apps.apple.com/app/apple-maps/id915056765',
        android: `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`,
      },
    },
  ];
}

/**
 * Where to actually drive to, given an access point.
 *
 * A gravel bar's coordinate sits on the water; its parking can be a quarter
 * mile up a track. `drivingLat`/`drivingLng` is that parking when an admin has
 * entered it, and it is what navigation must prefer — routing someone to the
 * waterline hands them a destination with no road to it.
 */
export function navCoordinatesFor(accessPoint: {
  drivingLat?: number | null;
  drivingLng?: number | null;
  coordinates: { lat: number; lng: number };
  name: string;
}): NavigationCoords {
  if (accessPoint.drivingLat != null && accessPoint.drivingLng != null) {
    return { lat: accessPoint.drivingLat, lng: accessPoint.drivingLng, label: accessPoint.name };
  }
  return {
    lat: accessPoint.coordinates.lat,
    lng: accessPoint.coordinates.lng,
    label: accessPoint.name,
  };
}
