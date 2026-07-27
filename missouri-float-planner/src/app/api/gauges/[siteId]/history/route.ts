// src/app/api/gauges/[siteId]/history/route.ts
// GET /api/gauges/[siteId]/history - Historical gauge data for the trend chart.
//
// Served from the gauge_readings table, which the update-gauges cron fills
// continuously (hourly, or every 15 min for rapidly-changing gauges). This
// keeps the trend chart off the live USGS API at render time — the previous
// behaviour, where every river card fired its own USGS request on load, led to
// burst rate-limiting and "trend data unavailable". A live USGS fetch is only
// used as a fallback when the DB has too little history (e.g. a new station).

import { NextRequest, NextResponse } from 'next/server';
import { cdnCacheHeaders } from '@/lib/api-utils';
import { createAdminClient } from '@/lib/supabase/admin';
import { fetchHistoricalReadings, type HistoricalData } from '@/lib/usgs/gauges';
import { toNum } from '@/lib/utils/num';
import { withX402Route } from '@/lib/x402-config';

export const dynamic = 'force-dynamic';

// Below this many stored points we treat the DB history as too sparse (e.g. a
// brand-new gauge with no accumulated readings) and fall back to live USGS.
const MIN_DB_POINTS = 6;

// A stored history whose newest point is older than this is STALE, and a count
// check alone will not notice.
//
// Since 00196 the update-gauges cron polls only curated and starred stations.
// Every other station in gauge_stations — the ~213 Missouri sites imported
// before that and the ~14,000 national ones — has whatever history it had
// frozen at that moment. Those rows are plentiful, so the MIN_DB_POINTS test
// passes happily and the route would serve a week-old chart as current. Age is
// the check that catches it; the live USGS fallback below already exists and
// is exactly the right answer.
const MAX_DB_AGE_HOURS = 6;

async function fetchHistoryFromDb(siteId: string, days: number): Promise<HistoricalData | null> {
  const supabase = createAdminClient();

  const { data: station } = await supabase
    .from('gauge_stations')
    .select('id, name')
    .eq('usgs_site_id', siteId)
    .single();

  if (!station) return null;

  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const { data: rows, error } = await supabase
    .from('gauge_readings')
    .select('reading_timestamp, gauge_height_ft, discharge_cfs')
    .eq('gauge_station_id', station.id)
    .gte('reading_timestamp', since)
    .order('reading_timestamp', { ascending: true });

  if (error || !rows) return null;

  const readings = rows
    .filter((r) => r.gauge_height_ft !== null || r.discharge_cfs !== null)
    .map((r) => ({
      timestamp: r.reading_timestamp as string,
      gaugeHeightFt: toNum(r.gauge_height_ft),
      dischargeCfs: toNum(r.discharge_cfs),
    }));

  if (readings.length === 0) return null;

  const dischargeValues = readings.map((r) => r.dischargeCfs).filter((v): v is number => v !== null);
  const heightValues = readings.map((r) => r.gaugeHeightFt).filter((v): v is number => v !== null);

  return {
    siteId,
    siteName: (station.name as string) || siteId,
    readings,
    minDischarge: dischargeValues.length > 0 ? Math.min(...dischargeValues) : null,
    maxDischarge: dischargeValues.length > 0 ? Math.max(...dischargeValues) : null,
    minHeight: heightValues.length > 0 ? Math.min(...heightValues) : null,
    maxHeight: heightValues.length > 0 ? Math.max(...heightValues) : null,
  };
}

async function _GET(
  request: NextRequest,
  { params }: { params: Promise<{ siteId: string }> }
) {
  try {
    const { siteId } = await params;
    const { searchParams } = new URL(request.url);
    const days = parseInt(searchParams.get('days') || '7', 10);

    // Validate days parameter (max 30 days)
    const validDays = Math.min(Math.max(days, 1), 30);

    // Prefer the cron-populated DB; fall back to live USGS when it is sparse
    // OR stale. Stale is the case that matters for any station the cron no
    // longer polls — see MAX_DB_AGE_HOURS.
    let historicalData = await fetchHistoryFromDb(siteId, validDays);

    const newest = historicalData?.readings.at(-1)?.timestamp;
    const ageHours = newest ? (Date.now() - new Date(newest).getTime()) / 3_600_000 : Infinity;
    const stale = !Number.isFinite(ageHours) || ageHours > MAX_DB_AGE_HOURS;

    if (!historicalData || historicalData.readings.length < MIN_DB_POINTS || stale) {
      const usgs = await fetchHistoricalReadings(siteId, validDays);
      // When the stored history is merely STALE the live series is the better
      // answer even if it is shorter, so the length comparison that guards the
      // sparse case must not veto it.
      if (usgs && (!historicalData || stale || usgs.readings.length > historicalData.readings.length)) {
        historicalData = usgs;
      }
    }

    if (!historicalData) {
      return NextResponse.json(
        { error: 'Historical data not available for this gauge' },
        { status: 404 }
      );
    }

    // Downsample readings for chart display (~1 point per hour)
    const maxPoints = validDays * 24;
    let readings = historicalData.readings;

    if (readings.length > maxPoints) {
      const step = Math.ceil(readings.length / maxPoints);
      readings = readings.filter((_, index) => index % step === 0);
    }

    return NextResponse.json({
      siteId: historicalData.siteId,
      siteName: historicalData.siteName,
      readings,
      stats: {
        minDischarge: historicalData.minDischarge,
        maxDischarge: historicalData.maxDischarge,
        minHeight: historicalData.minHeight,
        maxHeight: historicalData.maxHeight,
      },
    }, { headers: cdnCacheHeaders(900, 3600) });
  } catch (error) {
    console.error('Error fetching historical gauge data:', error);
    return NextResponse.json(
      { error: 'Failed to fetch historical data' },
      { status: 500 }
    );
  }
}

export const GET = withX402Route<{ params: Promise<{ siteId: string }> }>(_GET, '/api/gauges/:siteId/history');
