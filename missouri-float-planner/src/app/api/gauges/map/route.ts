// src/app/api/gauges/map/route.ts
// GET /api/gauges/map?bbox=w,s,e,n — gauges inside a viewport.
//
// The national "All Gauges" tier for the map. A SEPARATE route from
// /api/gauges rather than a query parameter on it, deliberately: a route whose
// response BODY SHAPE changes with a query parameter is how a shipped iOS
// build breaks against a newer server. /api/gauges keeps returning the same
// ~46 curated gauges in the same fat shape it always has, for the six web
// consumers and every build already in the App Store.
//
// ── The cap, and saying so ──────────────────────────────────────────────────
// Results are ordered curated-first, then by discharge, and capped. So when
// the cap bites it drops the smallest creeks and NEVER a gauge Eddy has rated.
// `total` comes back alongside, so the client can say "300 of 1,240 here —
// zoom in" instead of quietly showing a third of the map. Same disclosure
// MO_SITES_CAP makes in mo-sites.ts, same reason.
//
// ── Caching ────────────────────────────────────────────────────────────────
// A continuous bbox space has a ~0% CDN hit rate, so the CLIENT quantizes its
// bbox to a zoom-dependent grid before asking (see quantizeBbox in @eddy/geo).
// That collapses a metro area to a handful of URLs, which these headers then
// cache properly. The server does not re-quantize: it would have to guess the
// client's zoom, and a server-side snap that disagrees with the client's would
// produce gaps at the seams.

import { NextRequest, NextResponse } from 'next/server';
import { cdnCacheHeaders, parseRowLimit } from '@/lib/api-utils';
import { createAdminClient } from '@/lib/supabase/admin';
import { classifyQualifiers } from '@/lib/usgs/gauges';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { withX402Route } from '@/lib/x402-config';
import { toNum } from '@/lib/utils/num';

export const dynamic = 'force-dynamic';

// ── The response contract, declared here rather than imported ───────────────
// Vercel installs only missouri-float-planner/, so @eddy/types is NOT
// resolvable from this app's tsconfig — that is why /api/gauges declares its
// own GaugeStation rather than importing MapGauge. The mirror of these two
// interfaces lives in packages/eddy-types/index.ts for the phone. Keep them in
// step by hand; they are a wire format, so a change to either is a change to
// both regardless of how the types are shared.

export interface MapGaugeLite {
  /** gauge_stations.id — the key stars are stored under. */
  id: string;
  siteId: string;
  name: string;
  coordinates: { lng: number; lat: number };
  dischargeCfs: number | null;
  gaugeHeightFt: number | null;
  readingTimestamp: string | null;
  readingAgeHours: number | null;
  readingSuspect: boolean;
  /** Eddy rates this against a river; the ladder itself comes from /api/gauges. */
  curated: boolean;
  /** 0-100 vs this site's own day-of-year history; null when none is held. */
  flowPercentile: number | null;
}

export interface MapGaugesResponse {
  gauges: MapGaugeLite[];
  capped: boolean;
  total: number;
}

const DEFAULT_LIMIT = 300;
const MAX_LIMIT = 1000;

/** Degrade to an empty viewport at HTTP 200, never an error. */
const EMPTY: MapGaugesResponse = { gauges: [], capped: false, total: 0 };

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
  // A west > east box crosses the antimeridian. Rejected rather than silently
  // returning nothing: the Aleutians are the only place it happens, and a
  // caller that means it can send two boxes.
  if (west > east) return { bbox: null, error: 'bbox crossing the antimeridian must be split into two requests' };
  return { bbox: [west, south, east, north], error: null };
}

interface GaugeInBboxRow {
  id: string;
  site_id: string | null;
  name: string | null;
  curated: boolean;
  lng: number | null;
  lat: number | null;
  discharge_cfs: number | string | null;
  gauge_height_ft: number | string | null;
  reading_timestamp: string | null;
  qualifiers: string[] | null;
  flow_percentile: number | null;
  total: number | string;
}

async function _GET(request: NextRequest) {
  // 120/min rather than /api/gauges' 60: a panning session is legitimately
  // chattier than a page load. The client's debounce, viewport-containment
  // check and bbox quantization keep the real rate to a handful per minute.
  const limited = await rateLimit(`gauges-map:${getClientIp(request)}`, 120, 60 * 1000);
  if (limited) return limited;

  const params = request.nextUrl.searchParams;
  const { bbox, error } = parseBbox(params.get('bbox'));
  if (!bbox) {
    return NextResponse.json({ error }, { status: 400 });
  }

  // Shared rather than inline: the expression that used to be here clamped a
  // NEGATIVE limit to 1 instead of falling back to the default, so `?limit=-5`
  // returned a single gauge — and since this route orders by discharge, that
  // one gauge was the biggest river in the viewport, reported as `capped: true`
  // over a total of 1,240. See parseRowLimit.
  const limit = parseRowLimit(params.get('limit'), DEFAULT_LIMIT, MAX_LIMIT);
  const curatedOnly = params.get('curated') === '1';

  try {
    const supabase = createAdminClient();
    const { data, error: rpcError } = await supabase.rpc('gauges_in_bbox', {
      p_west: bbox[0],
      p_south: bbox[1],
      p_east: bbox[2],
      p_north: bbox[3],
      p_limit: limit,
      p_curated_only: curatedOnly,
    });

    if (rpcError) {
      console.error('[gauges/map] gauges_in_bbox failed:', rpcError.message);
      return NextResponse.json(EMPTY, { status: 200 });
    }

    const rows = (data ?? []) as GaugeInBboxRow[];
    const now = Date.now();

    const gauges: MapGaugeLite[] = [];
    for (const row of rows) {
      // The RPC reads coordinates through st_x/st_y, so unlike /api/gauges
      // there is no {0,0} fallback to filter — but a station row with a null
      // location would still arrive as nulls, and a pin at null island is
      // worse than a missing pin.
      if (row.lng === null || row.lat === null) continue;
      if (!row.site_id) continue;

      const readingTimestamp = row.reading_timestamp;
      const readingAgeHours = readingTimestamp
        ? (now - new Date(readingTimestamp).getTime()) / 3_600_000
        : null;

      // Same qualifier classifier the curated path uses, so "suspect" means the
      // identical thing on both tiers.
      const { suspect } = classifyQualifiers(row.qualifiers);

      gauges.push({
        id: row.id,
        siteId: row.site_id,
        name: row.name ?? row.site_id,
        coordinates: { lng: row.lng, lat: row.lat },
        dischargeCfs: toNum(row.discharge_cfs),
        gaugeHeightFt: toNum(row.gauge_height_ft),
        readingTimestamp,
        readingAgeHours,
        readingSuspect: suspect,
        curated: row.curated,
        flowPercentile: row.flow_percentile,
      });
    }

    // Every row carries the same window count; absent rows there is nothing to
    // have capped.
    const total = rows.length ? Number(rows[0].total) : 0;

    const body: MapGaugesResponse = {
      gauges,
      capped: total > gauges.length,
      total,
    };

    return NextResponse.json(body, { headers: cdnCacheHeaders(300, 900) });
  } catch (err) {
    // The map's curated layer must survive this route being down. An empty
    // viewport draws nothing extra; an error would blank the layer AND surface
    // a failure for something the user did not ask for.
    console.error('[gauges/map] failed:', err);
    return NextResponse.json(EMPTY, { status: 200 });
  }
}

export const GET = withX402Route(_GET, '/api/gauges/map');
