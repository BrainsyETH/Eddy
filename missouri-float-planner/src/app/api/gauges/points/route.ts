// src/app/api/gauges/points/route.ts
// GET /api/gauges/points — every non-curated gauge, compactly, for the
// zoomed-out map. See src/lib/gauges/points.ts for the format and the reason.
//
// ── Loading 14,000 rows through PostgREST ──────────────────────────────────
// Positions come from the gauge_points RPC (st_x/st_y, keyset-paged) — the
// same bulk reader the ingestion scripts use, so this route needs no new SQL.
// Readings come from gauge_latest in 1,000-row ranges, fetched in parallel
// once a head request reports the count. Both walkers live in
// src/lib/gauges/points.ts, where the suite runs them against a capped fake. The two are joined in
// memory; the whole body is CDN-cached, so this cost is paid a few times an
// hour, not once per phone.

import { NextRequest, NextResponse } from 'next/server';
import { cdnCacheHeaders } from '@/lib/api-utils';
import { createAdminClient } from '@/lib/supabase/admin';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { withX402Route } from '@/lib/x402-config';
import {
  buildGaugePoints,
  collectKeyset,
  collectRanges,
  type LatestPointRow,
  type StationPointRow,
} from '@/lib/gauges/points';

export const dynamic = 'force-dynamic';

// Both match the project's PostgREST cap. The walkers do not depend on it —
// see collectKeyset/collectRanges — but asking for more than the server will
// send only buys a short page.
const STATION_PAGE = 1000;
const LATEST_PAGE = 1000;
const LATEST_COLUMNS =
  'gauge_station_id, discharge_cfs, gauge_height_ft, reading_timestamp, qualifiers, flow_percentile';

type Admin = ReturnType<typeof createAdminClient>;

function loadStations(supabase: Admin): Promise<StationPointRow[]> {
  return collectKeyset(
    async (after) => {
      const { data, error } = await supabase.rpc('gauge_points', {
        p_after: after ?? undefined,
        p_limit: STATION_PAGE,
      });
      if (error) throw new Error(`gauge_points: ${error.message}`);
      return (data ?? []) as StationPointRow[];
    },
    (row) => row.id,
  );
}

async function loadLatest(supabase: Admin): Promise<LatestPointRow[]> {
  const { count, error } = await supabase
    .from('gauge_latest')
    .select('gauge_station_id', { count: 'exact', head: true });
  if (error) throw new Error(`gauge_latest count: ${error.message}`);
  return collectRanges(count ?? 0, LATEST_PAGE, async (from, to) => {
    const { data, error: pageError } = await supabase
      .from('gauge_latest')
      .select(LATEST_COLUMNS)
      .order('gauge_station_id')
      .range(from, to);
    if (pageError) throw new Error(`gauge_latest: ${pageError.message}`);
    return (data ?? []) as LatestPointRow[];
  });
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
