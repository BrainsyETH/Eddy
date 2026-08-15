// src/app/api/gauges/[siteId]/history/route.ts
// GET /api/gauges/[siteId]/history - Historical gauge data for the trend chart.
//
// Served from the gauge_readings table, which the update-gauges cron fills
// continuously (hourly, or every 15 min for rapidly-changing gauges). This
// keeps the trend chart off the live USGS API at render time — the previous
// behaviour, where every river card fired its own USGS request on load, led to
// burst rate-limiting and "trend data unavailable". A live fetch is only used
// as a fallback when the DB has too little history (e.g. a new station), and it
// goes through the provider registry so this route stays provider-agnostic.
//
// siteId is whichever id the station's provider uses: a USGS site number, an
// NWS LID, or a USACE dam slug. Both id columns are checked.

import { NextRequest, NextResponse } from 'next/server';
import { cdnCacheHeaders } from '@/lib/api-utils';
import { DEFAULT_PROVIDER_ID, getFlowProvider } from '@/lib/flow-providers';
import { createAdminClient } from '@/lib/supabase/admin';
import { type HistoricalData } from '@/lib/usgs/gauges';
import { fetchAhpsForecast } from '@/lib/usgs/ahps-forecast';
import { leapDayOfYearForDate } from '@/lib/usgs/percentile-snapshot';
import { toNum } from '@/lib/utils/num';
import { withX402Route } from '@/lib/x402-config';
import { samplePreservingExtrema } from '@shared/chart-model';

type GaugeHistoryReading = HistoricalData['readings'][number];
interface GaugeTypicalReading {
  date: string;
  p25Cfs: number | null;
  p50Cfs: number | null;
  p75Cfs: number | null;
  yearsOfRecord: number | null;
}

export const dynamic = 'force-dynamic';

// Below this many stored points we treat the DB history as too sparse (e.g. a
// brand-new gauge with no accumulated readings) and fall back to live USGS.
const MIN_DB_POINTS = 6;

/**
 * Resolve a station by whichever id column its provider uses.
 *
 * Two lookups rather than a PostgREST `.or()`: the filter grammar needs
 * quoting care around values containing dashes, and dam slugs
 * ('swl-clearwater-dam') are exactly that shape.
 */
async function findStation(
  supabase: ReturnType<typeof createAdminClient>,
  siteId: string
): Promise<{
  id: string;
  name: string | null;
  provider: string | null;
  nws_lid: string | null;
} | null> {
  const byUsgs = await supabase
    .from('gauge_stations')
    .select('id, name, provider, nws_lid')
    .eq('usgs_site_id', siteId)
    .maybeSingle();
  if (byUsgs.data) return byUsgs.data;

  const byExternal = await supabase
    .from('gauge_stations')
    .select('id, name, provider, nws_lid')
    .eq('site_id_external', siteId)
    .maybeSingle();
  return byExternal.data ?? null;
}

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

  const station = await findStation(supabase, siteId);
  if (!station) return null;

  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const { data: rows, error } = await supabase
    .from('gauge_readings')
    .select('reading_timestamp, gauge_height_ft, discharge_cfs, qualifiers')
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
      qualifiers: r.qualifiers ?? [],
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

function sampleHistory(readings: GaugeHistoryReading[], days: number): GaugeHistoryReading[] {
  // 24h retains quarter-hour detail; longer windows trade density for legibility.
  const maxPoints = days <= 1 ? 192 : days <= 7 ? 336 : 360;
  if (readings.length <= maxPoints) return readings;
  const units = [
    readings.some((reading) => reading.gaugeHeightFt !== null) ? 'ft' : null,
    readings.some((reading) => reading.dischargeCfs !== null) ? 'cfs' : null,
  ].filter((unit): unit is 'ft' | 'cfs' => unit !== null);
  const budget = Math.max(4, Math.floor(maxPoints / Math.max(1, units.length)));
  const retained = new Set<GaugeHistoryReading>();
  for (const unit of units) {
    for (const reading of samplePreservingExtrema(readings, budget, (item) =>
      unit === 'ft' ? item.gaugeHeightFt : item.dischargeCfs)) retained.add(reading);
  }
  return [...retained].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
  );
}

async function fetchTypicalRange(siteId: string, days: number): Promise<GaugeTypicalReading[]> {
  const dates = Array.from({ length: days + 1 }, (_, index) => {
    const date = new Date();
    date.setUTCHours(12, 0, 0, 0);
    date.setUTCDate(date.getUTCDate() - (days - index));
    return date;
  });
  const dayIds = [...new Set(dates.map(leapDayOfYearForDate).filter((id): id is number => id !== null))];
  if (!dayIds.length) return [];
  const { data, error } = await createAdminClient()
    .from('usgs_daily_percentiles')
    .select('day_of_year, p25, p50, p75, count_years')
    .eq('site_no', siteId)
    .eq('parameter_code', '00060')
    .in('day_of_year', dayIds);
  if (error || !data) return [];
  const byDay = new Map(data.map((row) => [row.day_of_year, row]));
  return dates.flatMap((date) => {
    const id = leapDayOfYearForDate(date);
    const row = id === null ? null : byDay.get(id);
    return row ? [{
      date: date.toISOString().slice(0, 10),
      p25Cfs: toNum(row.p25),
      p50Cfs: toNum(row.p50),
      p75Cfs: toNum(row.p75),
      yearsOfRecord: row.count_years ?? null,
    }] : [];
  });
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

    // Prefer the cron-populated DB; fall back to the live upstream when it is
    // sparse OR stale. Stale is the case that matters for any station the cron
    // no longer polls — see MAX_DB_AGE_HOURS.
    //
    // The fallback goes through the provider registry rather than straight to
    // USGS: this route is provider-agnostic, and a usace or nws station
    // reaching fetchHistoricalReadings would query waterservices with an id
    // that means nothing there.
    const station = await findStation(createAdminClient(), siteId);
    let historicalData = await fetchHistoryFromDb(siteId, validDays);

    const newest = historicalData?.readings.at(-1)?.timestamp;
    const ageHours = newest ? (Date.now() - new Date(newest).getTime()) / 3_600_000 : Infinity;
    const stale = !Number.isFinite(ageHours) || ageHours > MAX_DB_AGE_HOURS;

    if (!historicalData || historicalData.readings.length < MIN_DB_POINTS || stale) {
      const provider = getFlowProvider(station?.provider ?? DEFAULT_PROVIDER_ID);
      const live = provider ? await provider.fetchHistory(siteId, validDays) : null;
      // When the stored history is merely STALE the live series is the better
      // answer even if it is shorter, so the length comparison that guards the
      // sparse case must not veto it.
      if (live && (!historicalData || stale || live.readings.length > historicalData.readings.length)) {
        historicalData = live;
      }
    }

    if (!historicalData) {
      return NextResponse.json(
        { error: 'Historical data not available for this gauge' },
        { status: 404 }
      );
    }

    const rawReadings = historicalData.readings as GaugeHistoryReading[];
    const readings = sampleHistory(rawReadings, validDays);
    const observedThrough = readings.at(-1)?.timestamp ?? null;
    const providerId = station?.provider ?? DEFAULT_PROVIDER_ID;
    const provider = getFlowProvider(providerId);
    const [typical, ahpsForecast] = await Promise.all([
      providerId === 'usgs' ? fetchTypicalRange(siteId, validDays) : Promise.resolve([]),
      station?.nws_lid ? fetchAhpsForecast(station.nws_lid) : Promise.resolve([]),
    ]);
    const observedTime = observedThrough ? new Date(observedThrough).getTime() : -Infinity;
    const forecast = ahpsForecast
      .filter((point) => new Date(point.dateTime).getTime() > observedTime)
      .map((point) => ({
        timestamp: point.dateTime,
        gaugeHeightFt: point.valueFt,
        dischargeCfs: null,
      }));

    return NextResponse.json({
      siteId: historicalData.siteId,
      siteName: historicalData.siteName,
      readings,
      observedThrough,
      sampled: readings.length < rawReadings.length,
      typical,
      forecast,
      // AHPS XML does not consistently expose an issuance timestamp. Avoid
      // presenting request time as forecast issuance time.
      forecastIssuedAt: null,
      sourceUrl: provider?.publicUrl(siteId) ?? null,
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
