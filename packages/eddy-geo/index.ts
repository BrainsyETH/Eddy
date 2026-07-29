// packages/eddy-geo/index.ts
// Map geometry both apps need: Web Mercator tile maths for offline packs,
// viewport quantisation for the national gauge layer, and the coordinate →
// navigation-app URL builders.
//
// WHY THIS IS SHARED: the app needs it to tell a user how big a download will be
// before they commit, and the backend may want to expose the same number through
// an API. One implementation, so the estimate a user sees and the estimate we
// plan against can never disagree.
//
// WHY IT MATTERS AT ALL: a river's bounding box is a rectangle, but a river is a
// line. The Current River's bbox spans roughly 1.2° of latitude by 0.9° of
// longitude — mostly land nowhere near the water. Downloading that whole
// rectangle at trail-level zoom is enormous and almost entirely waste. These
// helpers exist to quantify that before we ship a "Download" button that
// silently eats a gigabyte of someone's cellular plan.

/** [minLng, minLat, maxLng, maxLat] — the order /api/rivers/[slug] returns. */
export type Bounds = [number, number, number, number];

const MAX_LAT = 85.0511287798066; // Web Mercator clamp

export function lngToTileX(lng: number, zoom: number): number {
  return Math.floor(((lng + 180) / 360) * Math.pow(2, zoom));
}

export function latToTileY(lat: number, zoom: number): number {
  const clamped = Math.max(-MAX_LAT, Math.min(MAX_LAT, lat));
  const rad = (clamped * Math.PI) / 180;
  return Math.floor(
    ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * Math.pow(2, zoom)
  );
}

/** Tiles covering `bounds` at a single zoom level. */
export function tileCountAtZoom(bounds: Bounds, zoom: number): number {
  const [minLng, minLat, maxLng, maxLat] = bounds;
  const x0 = lngToTileX(minLng, zoom);
  const x1 = lngToTileX(maxLng, zoom);
  // Tile Y is inverted relative to latitude: the north edge gives the smaller Y.
  const y0 = latToTileY(maxLat, zoom);
  const y1 = latToTileY(minLat, zoom);
  return (Math.abs(x1 - x0) + 1) * (Math.abs(y1 - y0) + 1);
}

/** Tiles across an inclusive zoom range — what an offline pack downloads. */
export function tileCountForRange(bounds: Bounds, minZoom: number, maxZoom: number): number {
  let total = 0;
  for (let z = Math.min(minZoom, maxZoom); z <= Math.max(minZoom, maxZoom); z++) {
    total += tileCountAtZoom(bounds, z);
  }
  return total;
}

/**
 * Rough download size. Vector tiles vary hugely with feature density — a tile
 * over farmland is a fraction of one over a town — so this is deliberately a
 * coarse average, useful for "about 40 MB", not for a progress bar.
 */
const AVG_VECTOR_TILE_BYTES = 35 * 1024;

export function estimateBytes(tileCount: number, avgTileBytes = AVG_VECTOR_TILE_BYTES): number {
  return tileCount * avgTileBytes;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  const mb = bytes / (1024 * 1024);
  if (mb < 1024) return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;
  return `${(mb / 1024).toFixed(1)} GB`;
}

/**
 * Expands bounds by a buffer in kilometres.
 *
 * Longitude degrees shrink with latitude, so the lng buffer is divided by
 * cos(lat) — without that, a buffer that looks right in Missouri would be far
 * too narrow further north.
 */
export function bufferBounds(bounds: Bounds, km: number): Bounds {
  const [minLng, minLat, maxLng, maxLat] = bounds;
  const latDelta = km / 111.32;
  const midLat = (minLat + maxLat) / 2;
  const cos = Math.max(0.01, Math.cos((midLat * Math.PI) / 180));
  const lngDelta = km / (111.32 * cos);
  return [
    minLng - lngDelta,
    Math.max(-MAX_LAT, minLat - latDelta),
    maxLng + lngDelta,
    Math.min(MAX_LAT, maxLat + latDelta),
  ];
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

/**
 * Splits a line into per-chunk boxes that follow the river.
 *
 * This is the payload reduction that makes offline viable: several smaller boxes
 * along the corridor cover the water while skipping the empty rectangle corners
 * a single bbox would download. Mapbox can hold multiple regions, so a river
 * becomes a handful of packs rather than one oversized one.
 */
export function corridorBoxes(
  coordinates: Array<[number, number]>,
  chunkSize = 64,
  bufferKm = 2
): Bounds[] {
  if (coordinates.length === 0) return [];
  const boxes: Bounds[] = [];
  for (let i = 0; i < coordinates.length; i += chunkSize) {
    // Overlap by one point so consecutive boxes share an edge and leave no gap
    // mid-river.
    const chunk = coordinates.slice(i, i + chunkSize + 1);
    const box = boundsForLine(chunk);
    if (box) boxes.push(bufferBounds(box, bufferKm));
  }
  return boxes;
}

/** Total tiles for a set of corridor boxes across a zoom range. */
export function tileCountForBoxes(boxes: Bounds[], minZoom: number, maxZoom: number): number {
  return boxes.reduce((sum, box) => sum + tileCountForRange(box, minZoom, maxZoom), 0);
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
