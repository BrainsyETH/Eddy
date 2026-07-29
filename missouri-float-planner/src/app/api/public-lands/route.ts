// src/app/api/public-lands/route.ts
// GET /api/public-lands?bbox=w,s,e,n&zoom=11 — PAD-US boundaries in a viewport.
//
// ── Ownership, not permission ──────────────────────────────────────────────
// Every consumer of this route has to carry the sentence in the 00209 migration
// header: a polygon here says a public agency owns the ground, and says NOTHING
// about whether a paddler may camp on it, portage across it or tie up to it.
// `access` is the agency's own classification — 'RA' (restricted) is extremely
// common on exactly the conservation areas people assume are open, and 296 of
// the parcels loaded say plainly that PAD-US does not know. It is normalised
// (upper-cased, null becomes 'UK') and otherwise untouched; the layer
// descriptions on both clients say what it does not mean, out loud.
//
// ── Why a route and not tiles ──────────────────────────────────────────────
// Same reason /api/gauges/map is a route: the corridor extract is ~1,750
// parcels, the geometry has to be clipped and simplified per viewport anyway,
// and standing up a tile pipeline buys nothing until the offline packs need it.
// The RPC does the clipping (see public_lands_in_bbox); this is a thin wrapper
// around it.
//
// ── Caching ────────────────────────────────────────────────────────────────
// Boundaries change when a federal agency republishes PAD-US, which is roughly
// annually — so this is the most cacheable thing Eddy serves and the headers say
// so. As with /api/gauges/map, the CLIENT quantizes its bbox to a zoom-dependent
// grid before asking; a continuous bbox space has a ~0% CDN hit rate.

import { NextRequest, NextResponse } from 'next/server';
import { cdnCacheHeaders } from '@/lib/api-utils';
import { createAdminClient } from '@/lib/supabase/admin';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { toNum } from '@/lib/utils/num';

export const dynamic = 'force-dynamic';

// ── The response contract, declared here rather than imported ───────────────
// Vercel installs only missouri-float-planner/, so @eddy/types is NOT resolvable
// from this app's tsconfig — the same reason /api/gauges/map declares its own
// MapGaugeLite. The mirror lives in packages/eddy-types/index.ts for the phone.
// Keep them in step by hand; this is a wire format, so a change to either is a
// change to both.

/** PAD-US `Pub_Access`, verbatim. Never collapsed to a boolean — see 00209. */
export type PublicLandAccess = 'OA' | 'RA' | 'XA' | 'UK';

export interface PublicLandProperties {
  id: string;
  /** The agency's unit name: "Mark Twain National Forest", "Current River CA". */
  name: string;
  /** Managing agency, verbatim ('USFS', 'NPS', 'UNK'). */
  manager: string | null;
  managerType: string | null;
  /** 'NF', 'WSR', 'SCA'… what actually tells a reader what they are looking at. */
  designation: string | null;
  /**
   * OA open · RA restricted · XA closed · UK unknown.
   *
   * NORMALISED here and nowhere else: upper-cased, and a null column becomes
   * 'UK'. Both map renderers key a `match` expression off this field, and doing
   * the coalesce/upcase inside those expressions meant writing it twice in two
   * dialects — one of which (Mapbox's native iOS SDK) is the harder to verify.
   * Normalising once, server-side, is the version that cannot drift.
   *
   * Widened to `string` rather than the union above because this is the agency's
   * field and a future PAD-US version may add a code. An unrecognised one is
   * passed through VERBATIM: the clients fall back to the unknown treatment,
   * which is true, where silently rewriting it to 'UK' would destroy the only
   * evidence that a new class exists.
   */
  access: string;
  acres: number | null;
}

export interface PublicLandFeature {
  type: 'Feature';
  properties: PublicLandProperties;
  /** Already clipped to the requested bbox and simplified for the zoom. */
  geometry: unknown;
}

/**
 * A GeoJSON FeatureCollection with two foreign members.
 *
 * Foreign members are legal (RFC 7946 §6.1) and are what let both clients hand
 * this response straight to a map source — MapLibre and Mapbox both ignore what
 * they do not recognise — instead of unwrapping `{ lands, capped, total }` at
 * every call site.
 */
export interface PublicLandsResponse {
  type: 'FeatureCollection';
  features: PublicLandFeature[];
  /** True when the server dropped the smallest parcels to meet the cap. */
  capped: boolean;
  /** How many were in the viewport before the cap. */
  total: number;
}

const DEFAULT_LIMIT = 400;
const MAX_LIMIT = 1000;

/**
 * Below this the layer is not drawn and not asked for.
 *
 * A parcel boundary is a line you read against a river, and at a continental
 * zoom there is no river to read it against — just a wash of fill over four
 * states. Matched by the clients' own floors so a request below it is a bug
 * rather than a normal case.
 */
const MIN_ZOOM = 7;

/** Degrade to an empty viewport at HTTP 200, never an error. */
const EMPTY: PublicLandsResponse = {
  type: 'FeatureCollection',
  features: [],
  capped: false,
  total: 0,
};

/**
 * Simplification tolerance for a zoom, in degrees.
 *
 * One screen pixel at that zoom: 360° of longitude over 256·2^z pixels. Below a
 * pixel the vertices are literally invisible and paying to send them is paying
 * for nothing; above it, a boundary starts to visibly cut corners. Derived
 * server-side from the zoom rather than taken as a parameter, so there is one
 * implementation of this rule instead of one per client — the clients send the
 * zoom they are at, which they cannot get wrong.
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
 * response is CDN-cached for an hour against a quantized bbox.
 */
function toleranceForZoom(zoom: number): number {
  return 360 / (256 * Math.pow(2, zoom));
}

/** Upper-case, and a missing classification is the 'UK' PAD-US already uses. */
function normalizeAccess(raw: string | null): string {
  const trimmed = (raw ?? '').trim().toUpperCase();
  return trimmed || 'UK';
}

interface BboxParse {
  bbox: [number, number, number, number] | null;
  error: string | null;
}

function parseBbox(raw: string | null): BboxParse {
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

interface PublicLandInBboxRow {
  id: string;
  unit_name: string | null;
  manager_name: string | null;
  manager_type: string | null;
  designation: string | null;
  public_access: string | null;
  gis_acres: number | string | null;
  geojson: string | null;
  total: number | string;
}

export async function GET(request: NextRequest) {
  // 60/min. Panning is chattier than a page load, but the client's containment
  // check means a pan inside cached coverage costs no request at all — and
  // boundaries do not move, so a session should make a handful of these total.
  const limited = await rateLimit(`public-lands:${getClientIp(request)}`, 60, 60 * 1000);
  if (limited) return limited;

  const params = request.nextUrl.searchParams;
  const { bbox, error } = parseBbox(params.get('bbox'));
  if (!bbox) {
    return NextResponse.json({ error }, { status: 400 });
  }

  const zoom = Number(params.get('zoom'));
  if (!Number.isFinite(zoom)) {
    return NextResponse.json({ error: 'zoom is required (the client\'s current zoom level)' }, { status: 400 });
  }
  // Not a 400: a client that pans out past the floor should get "nothing here",
  // the same answer it gets over open ocean, rather than an error it has to
  // special-case in its fetch path.
  if (zoom < MIN_ZOOM) {
    return NextResponse.json(EMPTY, { headers: cdnCacheHeaders(3600, 86400) });
  }

  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, parseInt(params.get('limit') ?? '', 10) || DEFAULT_LIMIT),
  );

  try {
    const supabase = createAdminClient();
    const { data, error: rpcError } = await supabase.rpc('public_lands_in_bbox', {
      p_west: bbox[0],
      p_south: bbox[1],
      p_east: bbox[2],
      p_north: bbox[3],
      p_tolerance: toleranceForZoom(zoom),
      p_limit: limit,
    });

    if (rpcError) {
      console.error('[public-lands] public_lands_in_bbox failed:', rpcError.message);
      return NextResponse.json(EMPTY, { status: 200 });
    }

    const rows = (data ?? []) as PublicLandInBboxRow[];

    const features: PublicLandFeature[] = [];
    for (const row of rows) {
      if (!row.geojson) continue;
      let geometry: unknown;
      try {
        geometry = JSON.parse(row.geojson);
      } catch {
        // ST_AsGeoJSON does not emit invalid JSON, so this is unreachable in
        // practice — but a parse throw here would blank the whole layer, and one
        // unparseable parcel must not cost the other 400.
        continue;
      }

      features.push({
        type: 'Feature',
        properties: {
          id: row.id,
          name: row.unit_name ?? 'Public land',
          manager: row.manager_name,
          managerType: row.manager_type,
          designation: row.designation,
          access: normalizeAccess(row.public_access),
          acres: toNum(row.gis_acres),
        },
        geometry,
      });
    }

    // Every row carries the same window count, computed before the RPC's LIMIT.
    const total = rows.length ? Number(rows[0].total) : 0;

    const body: PublicLandsResponse = {
      type: 'FeatureCollection',
      features,
      // Slightly conservative: the RPC also drops parcels whose clip came back
      // empty (a polygon touching only the box edge), so this can read `true`
      // when the cap did not actually bite. Over-disclosing "there is more here,
      // zoom in" is the harmless direction of that error.
      capped: total > features.length,
      total,
    };

    // An hour fresh, a day stale-while-revalidate — an order of magnitude
    // longer than the gauge routes, because this is the one dataset on the map
    // that does not change. PAD-US republishes roughly annually; a re-import is
    // a deploy-time event and an hour of staleness after one costs nothing.
    return NextResponse.json(body, { headers: cdnCacheHeaders(3600, 86400) });
  } catch (err) {
    // The rest of the map must survive this route being down. An empty
    // collection draws nothing extra; an error would blank the layer AND raise
    // a failure for something nobody asked to see.
    console.error('[public-lands] failed:', err);
    return NextResponse.json(EMPTY, { status: 200 });
  }
}
