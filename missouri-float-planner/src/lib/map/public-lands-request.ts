// src/lib/map/public-lands-request.ts
// Parsing and arithmetic for /api/public-lands, pulled out so it can be tested.
//
// The route itself is a rate limit, an RPC call and a row-to-feature loop; none
// of that is worth a test. What IS worth one is everything here, because THREE
// of these functions shipped wrong and not one was visible from the code:
//
//   * `zoom` missing entirely read as zoom 0 — see parseZoom.
//   * `capped` was computed against the returned row count — see wasCapped.
//   * `limit=-5` clamped to 1 rather than the default — see parseLimit.
//
// The first two were found by curling the deployed route, which is the only
// place they were observable; the third was found by the test written for the
// first two. They share a shape, and it is the shape worth remembering: every
// one answered a malformed request with a plausible-looking SUCCESS. An empty
// FeatureCollection at HTTP 200, a "zoom in for more" on a complete viewport, a
// map with one national forest on it. None would ever have produced a stack
// trace, a 500 or a log line, and no amount of reading the route would have
// shown them — `Number(null) === 0` and `parseInt('-5') || d` are both perfectly
// ordinary-looking JavaScript that mean something other than they appear to.

import { parseRowLimit } from '@/lib/api-utils';

/** Below this the layer is not drawn and not asked for. Matched by both clients. */
export const MIN_ZOOM = 7;

export const DEFAULT_LIMIT = 400;
export const MAX_LIMIT = 1000;

/**
 * Simplification tolerance for a zoom, in degrees.
 *
 * One screen pixel at that zoom: 360° of longitude over 256·2^z pixels. Below a
 * pixel the vertices are literally invisible and paying to send them is paying
 * for nothing; above it, a boundary starts to visibly cut corners. Derived
 * server-side rather than taken as a parameter, so there is one implementation
 * of this rule instead of one per client — the clients send the zoom they are
 * at, which they cannot get wrong.
 *
 * The RPC clamps into [0.00005, 0.05] regardless, so a nonsense zoom cannot ask
 * for a full-precision statewide query.
 *
 * ── Measured, so nobody re-derives it ─────────────────────────────────────
 * Against the 1,753 parcels in production, 2026-07-29:
 *
 *   z14, eight miles of the Current   5 parcels     3.7 kB
 *   z11, one river reach             73 parcels      34 kB
 *   z7, the whole Ozarks            398 of 1,031    337 kB
 *
 * The statewide figure is the worst case and it is NOT fixable by lowering the
 * cap: at limit 150 it is still 301 kB, because the bytes live in a handful of
 * enormous multipolygons (Mark Twain National Forest is 1.5M acres of
 * non-contiguous ground) rather than in the count. Coarsening the tolerance
 * fourfold only reaches 280 kB — ST_SimplifyPreserveTopology cannot drop a ring,
 * only its vertices — while visibly cutting corners. So the floor is real, and
 * the answers to it are the ones already in place: MIN_ZOOM stops it happening
 * at continental scale, the layer is off by default on both clients, and the
 * response is CDN-cached against a quantized bbox.
 */
export function toleranceForZoom(zoom: number): number {
  return 360 / (256 * Math.pow(2, zoom));
}

/** Upper-case, and a missing classification is the 'UK' PAD-US already uses. */
export function normalizeAccess(raw: string | null | undefined): string {
  const trimmed = (raw ?? '').trim().toUpperCase();
  return trimmed || 'UK';
}

export interface BboxParse {
  bbox: [number, number, number, number] | null;
  error: string | null;
}

export function parseBbox(raw: string | null): BboxParse {
  if (!raw) return { bbox: null, error: 'bbox is required (west,south,east,north)' };
  const parts = raw.split(',').map((p) => Number(p.trim()));
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) {
    return { bbox: null, error: 'bbox must be four numbers: west,south,east,north' };
  }
  const [west, south, east, north] = parts;
  if (south > north) return { bbox: null, error: 'bbox south must be <= north' };
  if (south < -90 || north > 90) return { bbox: null, error: 'bbox latitudes must be within -90..90' };
  if (west < -180 || east > 180) return { bbox: null, error: 'bbox longitudes must be within -180..180' };
  if (west > east) {
    return { bbox: null, error: 'bbox crossing the antimeridian must be split into two requests' };
  }
  return { bbox: [west, south, east, north], error: null };
}

export interface ZoomParse {
  zoom: number | null;
  error: string | null;
}

/**
 * The client's current zoom, or an error.
 *
 * ── The bug this exists to have fixed ──────────────────────────────────────
 * This was `Number(params.get('zoom'))` guarded by `Number.isFinite`, and the
 * guard could not fire for the one case it was written for. `searchParams.get`
 * returns **null** for an absent parameter and `Number(null)` is **0** — a
 * perfectly finite number — so omitting `zoom` entirely did not 400. It became
 * zoom 0, fell under MIN_ZOOM, and returned an empty FeatureCollection at HTTP
 * 200: a caller that forgot the parameter got "there is no public land here",
 * which is a total failure wearing the costume of a successful no-op.
 *
 * Verified against the deployed route before this fix:
 *   /api/public-lands?bbox=-91.5,37.0,-91.2,37.2          -> 200, zero features
 *   /api/public-lands?bbox=-91.5,37.0,-91.2,37.2&zoom=11  -> 200, 73 features
 *
 * So absence is now checked BEFORE the numeric conversion, and the empty string
 * (`?zoom=`) is treated as absence too, which is the same mistake with a
 * different spelling and which `Number('')` also turns into 0.
 */
export function parseZoom(raw: string | null): ZoomParse {
  if (raw === null || raw.trim() === '') {
    return { zoom: null, error: "zoom is required (the client's current zoom level)" };
  }
  const zoom = Number(raw);
  if (!Number.isFinite(zoom)) {
    return { zoom: null, error: 'zoom must be a number' };
  }
  return { zoom, error: null };
}

/**
 * The row cap for this route, clamped.
 *
 * A thin wrapper over the shared parseRowLimit rather than its own arithmetic:
 * the expression it replaced (`Math.max(1, parseInt(raw) || DEFAULT)`) clamped a
 * negative limit to 1 instead of falling back, and it was copied here from
 * /api/gauges/map. Fixing it in one place is what stops the next route to page
 * inheriting it a third time. This exists only to bind the two constants.
 */
export function parseLimit(raw: string | null): number {
  return parseRowLimit(raw, DEFAULT_LIMIT, MAX_LIMIT);
}

/**
 * Did the row cap actually drop anything?
 *
 * ── The bug this exists to have fixed ──────────────────────────────────────
 * This compared `total` against the number of features RETURNED, which is not
 * the same question. The RPC also drops any parcel whose clip to the viewport
 * came back empty — a polygon touching only the box edge — so a viewport with
 * 74 matches, 400 of room and one edge-toucher returned 73 features and said
 * `capped: true`. Observed on the deployed route at exactly those numbers.
 *
 * That is not a harmless over-disclosure. `capped` is what a client uses to say
 * "showing 400 of 1,031 — zoom in", and firing it on a viewport that is showing
 * everything there is teaches people to distrust the one message that means
 * something.
 *
 * `total > limit` is the literal question — the cap bit iff there was more than
 * the cap allowed — and it cannot be confused by the empty-clip filter.
 */
export function wasCapped(total: number, limit: number): boolean {
  return total > limit;
}
