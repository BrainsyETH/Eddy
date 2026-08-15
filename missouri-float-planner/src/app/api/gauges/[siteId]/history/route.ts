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
import { fetchNwsForecast } from '@/lib/nws/forecast';
import { createAdminClient } from '@/lib/supabase/admin';
import { type HistoricalData } from '@/lib/usgs/gauges';
import { leapDayOfYearForDate } from '@/lib/usgs/percentile-snapshot';
import { toNum } from '@/lib/utils/num';
import { withX402Route } from '@/lib/x402-config';
import { samplePreservingExtrema } from '@shared/chart-model';
import type {
  GaugeForecastReading,
  GaugeHistoryReading,
  GaugeTypicalReading,
} from '@/types/api';

export const dynamic = 'force-dynamic';

// Below this many stored points we treat the DB history as too sparse (e.g. a
// brand-new gauge with no accumulated readings) and fall back to live USGS.
const MIN_DB_POINTS = 6;

/** USGS discharge, the only parameter usgs_daily_percentiles is snapshotted for. */
const PARAM_DISCHARGE = '00060';

interface Station {
  id: string;
  name: string | null;
  provider: string | null;
  nws_lid: string | null;
  usgs_site_id: string | null;
}

/**
 * Resolve a station by whichever id column its provider uses.
 *
 * Two lookups rather than a PostgREST `.or()`: the filter grammar needs
 * quoting care around values containing dashes, and dam slugs
 * ('swl-clearwater-dam') are exactly that shape.
 *
 * Called ONCE per request and threaded through everything that needs it. It
 * used to run again inside the live-fallback branch, and the context queries
 * added below would have made that three resolutions — up to six round trips
 * for one chart.
 */
async function findStation(
  supabase: ReturnType<typeof createAdminClient>,
  siteId: string
): Promise<Station | null> {
  const columns = 'id, name, provider, nws_lid, usgs_site_id';
  const byUsgs = await supabase
    .from('gauge_stations')
    .select(columns)
    .eq('usgs_site_id', siteId)
    .maybeSingle();
  if (byUsgs.data) return byUsgs.data as Station;

  const byExternal = await supabase
    .from('gauge_stations')
    .select(columns)
    .eq('site_id_external', siteId)
    .maybeSingle();
  return (byExternal.data as Station | null) ?? null;
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

async function fetchHistoryFromDb(
  supabase: ReturnType<typeof createAdminClient>,
  station: Station,
  siteId: string,
  days: number
): Promise<HistoricalData | null> {
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

/**
 * Reduce the series to something a chart can draw, WITHOUT deleting the peak.
 *
 * This route used to keep `index % step === 0`. On a hydrograph that is the one
 * sampling rule you cannot use: an Ozark flash crest is one or two readings
 * wide, so a stride that misses them erases the single number the whole chart
 * exists to show, and leaves a smooth line nobody can tell is wrong.
 *
 * Budgets are per WINDOW, not per hour: a day keeps quarter-hour detail, and a
 * month trades density for legibility. Each unit gets its own pass so a station
 * publishing both stage and discharge does not have one of them sampled against
 * the other's shape — the union is deduped by reference and re-sorted.
 */
function sampleHistory(readings: GaugeHistoryReading[], days: number): GaugeHistoryReading[] {
  const maxPoints = days <= 1 ? 192 : days <= 7 ? 336 : 360;
  if (readings.length <= maxPoints) return readings;

  const units = (['ft', 'cfs'] as const).filter((unit) =>
    readings.some((reading) => (unit === 'ft' ? reading.gaugeHeightFt : reading.dischargeCfs) !== null)
  );
  const budget = Math.max(4, Math.floor(maxPoints / Math.max(1, units.length)));

  const retained = new Set<GaugeHistoryReading>();
  for (const unit of units) {
    for (const reading of samplePreservingExtrema(readings, budget, (item) =>
      unit === 'ft' ? item.gaugeHeightFt : item.dischargeCfs
    )) {
      retained.add(reading);
    }
  }
  return [...retained].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );
}

/**
 * YYYY-MM-DD from the same calendar fields leapDayOfYearForDate() reads, so the
 * date a row is labelled with is the date its day-of-year was looked up under.
 *
 * SERVER-local, which in production is UTC — not the reader's local date. The
 * two disagree only within a few hours of midnight, and a percentile moves
 * imperceptibly across one day, so the mismatch is not worth a timezone round
 * trip. It is worth not claiming otherwise.
 */
function serverDateKey(date: Date): string {
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/**
 * Day-of-year discharge percentiles across the window — "what this river
 * normally does on this date", which is the only context an UNRATED gauge can
 * honestly carry (see shared/flow-band.ts for why that matters).
 *
 * Keyed on the station's USGS site number rather than the requested siteId:
 * findStation also matches site_id_external, and a dam slug or NWS LID keyed
 * against usgs_daily_percentiles.site_no matches nothing.
 *
 * Dates are built at noon and read with the same calendar fields
 * leapDayOfYearForDate() uses (getMonth()/getDate()), matching USGS's own
 * calendar-day statistics. Noon keeps a DST shift from moving the date.
 */
async function fetchTypicalRange(
  supabase: ReturnType<typeof createAdminClient>,
  usgsSiteId: string,
  days: number
): Promise<GaugeTypicalReading[]> {
  const dates = Array.from({ length: days + 1 }, (_, index) => {
    const date = new Date();
    date.setHours(12, 0, 0, 0);
    date.setDate(date.getDate() - (days - index));
    return date;
  });

  const dayIds = [...new Set(dates.map(leapDayOfYearForDate).filter((id): id is number => id !== null))];
  if (!dayIds.length) return [];

  const { data, error } = await supabase
    .from('usgs_daily_percentiles')
    .select('day_of_year, p25, p50, p75, count_years')
    .eq('site_no', usgsSiteId)
    .eq('parameter_code', PARAM_DISCHARGE)
    .in('day_of_year', dayIds);
  if (error || !data) return [];

  const byDay = new Map(data.map((row) => [row.day_of_year, row]));
  return dates.flatMap((date) => {
    const id = leapDayOfYearForDate(date);
    const row = id === null ? undefined : byDay.get(id);
    return row
      ? [{
          date: serverDateKey(date),
          p25Cfs: toNum(row.p25),
          p50Cfs: toNum(row.p50),
          p75Cfs: toNum(row.p75),
          yearsOfRecord: row.count_years ?? null,
        }]
      : [];
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
    const supabase = createAdminClient();
    const station = await findStation(supabase, siteId);
    let historicalData = station
      ? await fetchHistoryFromDb(supabase, station, siteId, validDays)
      : null;

    const newest = historicalData?.readings.at(-1)?.timestamp;
    const ageHours = newest ? (Date.now() - new Date(newest).getTime()) / 3_600_000 : Infinity;
    const stale = !Number.isFinite(ageHours) || ageHours > MAX_DB_AGE_HOURS;

    const providerId = station?.provider ?? DEFAULT_PROVIDER_ID;
    const provider = getFlowProvider(providerId);

    if (!historicalData || historicalData.readings.length < MIN_DB_POINTS || stale) {
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

    // Both context queries are independent of each other and of the series, so
    // they overlap. Each degrades to nothing on its own rather than failing the
    // chart: a river with no percentile record and no NWS forecast point is the
    // ordinary case, not an error.
    // A station absent from gauge_stations reached its data through the default
    // (USGS) provider, which means the requested siteId IS a USGS site number.
    // Reading `station?.usgs_site_id` alone would deny those sites their
    // percentile context for no reason. A station that IS registered gets only
    // what its row declares — a dam slug matched via site_id_external must not
    // be keyed against usgs_daily_percentiles.site_no.
    const usgsSiteId = station ? station.usgs_site_id : siteId;
    const [typical, forecastDoc] = await Promise.all([
      providerId === 'usgs' && usgsSiteId
        ? fetchTypicalRange(supabase, usgsSiteId, validDays)
        : Promise.resolve([] as GaugeTypicalReading[]),
      station?.nws_lid ? fetchNwsForecast(station.nws_lid) : Promise.resolve(null),
    ]);

    // Only the part of the forecast that is still ahead of the observed series.
    // NWPS reissues on a schedule, so its early points overlap what already
    // happened — drawing those as forecast would put a dashed "prediction" on
    // top of readings the gauge has already taken.
    const observedTime = observedThrough ? new Date(observedThrough).getTime() : -Infinity;
    const forecast: GaugeForecastReading[] = (forecastDoc?.points ?? []).filter(
      (point) => new Date(point.timestamp).getTime() > observedTime
    );

    return NextResponse.json({
      siteId: historicalData.siteId,
      siteName: historicalData.siteName,
      readings,
      observedThrough,
      sampled: readings.length < rawReadings.length,
      typical,
      forecast,
      forecastIssuedAt: forecast.length ? forecastDoc?.issuedAt ?? null : null,
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
