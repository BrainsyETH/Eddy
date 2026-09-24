// src/app/api/gauges/points/route.ts
// GET /api/gauges/points — every non-curated gauge, compactly, for the
// zoomed-out map. See src/lib/gauges/points.ts for the format and the reason.
//
// ── Loading 14,000 rows through PostgREST ──────────────────────────────────
// Positions come from the gauge_points RPC (st_x/st_y, keyset-paged, 5,000 a
// page) — the same bulk reader the ingestion scripts use, so this route needs
// no new SQL. Readings come from gauge_latest in 1,000-row pages, fetched in
// parallel once the first page reports the count. The two are joined in
// memory; the whole body is CDN-cached, so this cost is paid a few times an
// hour, not once per phone.

import { NextRequest, NextResponse } from 'next/server';
import { cdnCacheHeaders } from '@/lib/api-utils';
import { createAdminClient } from '@/lib/supabase/admin';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { withX402Route } from '@/lib/x402-config';
import {
  buildGaugePoints,
  type LatestPointRow,
  type StationPointRow,
} from '@/lib/gauges/points';

export const dynamic = 'force-dynamic';

const STATION_PAGE = 5000;
const LATEST_PAGE = 1000;
const LATEST_COLUMNS =
  'gauge_station_id, discharge_cfs, gauge_height_ft, reading_timestamp, qualifiers, flow_percentile';

type Admin = ReturnType<typeof createAdminClient>;

async function loadStations(supabase: Admin): Promise<StationPointRow[]> {
  const out: StationPointRow[] = [];
  let after: string | null = null;
  // Bounded rather than while(true): 20 pages is 100,000 stations, several
  // times the national network. A runaway cursor is a bug, not a big country.
  for (let page = 0; page < 20; page++) {
    const { data, error } = await supabase.rpc('gauge_points', {
      p_after: after ?? undefined,
      p_limit: STATION_PAGE,
    });
    if (error) throw new Error(`gauge_points: ${error.message}`);
    const rows = (data ?? []) as StationPointRow[];
    out.push(...rows);
    if (rows.length < STATION_PAGE) break;
    after = rows[rows.length - 1].id;
  }
  return out;
}

async function loadLatest(supabase: Admin): Promise<LatestPointRow[]> {
  const first = await supabase
    .from('gauge_latest')
    .select(LATEST_COLUMNS, { count: 'exact' })
    .order('gauge_station_id')
    .range(0, LATEST_PAGE - 1);
  if (first.error) throw new Error(`gauge_latest: ${first.error.message}`);

  const rows = (first.data ?? []) as LatestPointRow[];
  const total = first.count ?? rows.length;
  const pages: Promise<LatestPointRow[]>[] = [];
  for (let from = LATEST_PAGE; from < total; from += LATEST_PAGE) {
    pages.push(
      Promise.resolve(
        supabase
          .from('gauge_latest')
          .select(LATEST_COLUMNS)
          .order('gauge_station_id')
          .range(from, from + LATEST_PAGE - 1),
      ).then(({ data, error }) => {
        if (error) throw new Error(`gauge_latest: ${error.message}`);
        return (data ?? []) as LatestPointRow[];
      }),
    );
  }
  for (const page of await Promise.all(pages)) rows.push(...page);
  return rows;
}

async function _GET(request: NextRequest) {
  // One request per phone per quarter hour at most; the CDN answers the rest.
  const limited = await rateLimit(`gauges-points:${getClientIp(request)}`, 30, 60 * 1000);
  if (limited) return limited;

  try {
    const supabase = createAdminClient();
    const [stations, latest] = await Promise.all([loadStations(supabase), loadLatest(supabase)]);
    const body = buildGaugePoints(stations, latest);
    // The national readings refresh hourly, so fifteen minutes of CDN
    // freshness costs nothing a reader could notice.
    return NextResponse.json(body, { headers: cdnCacheHeaders(900, 3600) });
  } catch (err) {
    // A failed index is not an empty country; the phone keeps what it has.
    console.error('[gauges/points] failed:', err);
    return NextResponse.json({ error: 'Gauge index temporarily unavailable' }, { status: 503 });
  }
}

export const GET = withX402Route(_GET, '/api/gauges/points');
