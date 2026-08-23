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
  window: { from: Date; to: Date | null }
): Promise<HistoricalData | null> {
  let query = supabase
    .from('gauge_readings')
    .select('reading_timestamp, gauge_height_ft, discharge_cfs, qualifiers')
    .eq('gauge_station_id', station.id)
    .gte('reading_timestamp', window.from.toISOString());
  if (window.to) query = query.lte('reading_timestamp', window.to.toISOString());
  const { data: rows, error } = await query.order('reading_timestamp', { ascending: true });

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
  window: { from: Date; to: Date | null }
): Promise<GaugeTypicalReading[]> {
  const end = window.to ?? new Date();
  const days = Math.min(
    366,
    Math.max(1, Math.ceil((end.getTime() - window.from.getTime()) / 86_400_000))
  );
  const dates = Array.from({ length: days + 1 }, (_, index) => {
    const date = new Date(end);
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

    // ── The request, validated rather than coerced ─────────────────────────
    // `days` keeps its original clamp-to-legal behaviour exactly — deployed
    // clients send ?days=1|7|30 and depend on it. The ADDITIVE parameters
    // (`from`, `to`, `resolution`) are REJECTED when invalid instead: a
    // client that asks for a reversed window typed it, and silently serving
    // some other window is worse than a 400 that says what was wrong.
    const fromParam = searchParams.get('from');
    const toParam = searchParams.get('to');
    const resolutionParam = searchParams.get('resolution');

    if (resolutionParam && !['auto', 'instant', 'daily'].includes(resolutionParam)) {
      return NextResponse.json(
        { error: `Invalid resolution '${resolutionParam}' — expected auto, instant, or daily` },
        { status: 400 }
      );
    }
    const resolution = (resolutionParam ?? 'auto') as 'auto' | 'instant' | 'daily';

    let from: Date | null = null;
    let to: Date | null = null;
    if (fromParam !== null || toParam !== null) {
      if (fromParam === null) {
        return NextResponse.json({ error: "'to' requires 'from'" }, { status: 400 });
      }
      from = new Date(fromParam);
      if (!Number.isFinite(from.getTime())) {
        return NextResponse.json({ error: `Invalid 'from' date: ${fromParam}` }, { status: 400 });
      }
      if (toParam !== null) {
        to = new Date(toParam);
        if (!Number.isFinite(to.getTime())) {
          return NextResponse.json({ error: `Invalid 'to' date: ${toParam}` }, { status: 400 });
        }
        if (to.getTime() <= from.getTime()) {
          return NextResponse.json(
            { error: "'to' must be after 'from'" },
            { status: 400 }
          );
        }
      }
    }

    const supabase = createAdminClient();
    const station = await findStation(supabase, siteId);
    const providerId = station?.provider ?? DEFAULT_PROVIDER_ID;
    const provider = getFlowProvider(providerId);
    // Provider-declared limits replace the old global 30-day clamp, which was
    // provider-blind in both directions: it capped USGS below what daily
    // values can serve and implied 30 days for sources that top out sooner.
    const capabilities = provider?.historyCapabilities ?? {
      maxInstantDays: 30,
      supportsDaily: false,
      supportsCustomRange: false,
    };

    if (from && !capabilities.supportsCustomRange) {
      return NextResponse.json(
        { error: `The ${providerId} provider does not support custom date ranges` },
        { status: 400 }
      );
    }

    // The window this response is ABOUT. Days-mode keeps its floor of 1; its
    // ceiling is now what the provider can actually serve — instantaneous to
    // maxInstantDays, a year of daily values beyond that where supported.
    const maxServableDays = capabilities.supportsDaily ? 366 : capabilities.maxInstantDays;
    const validDays = Math.min(Math.max(Number.isFinite(days) ? days : 7, 1), maxServableDays);
    let truncationReason: string | null =
      Number.isFinite(days) && days > maxServableDays
        ? `Requested ${days} days; the ${providerId} provider serves at most ${maxServableDays}`
        : null;

    const requestedFrom = from ?? new Date(Date.now() - validDays * 86_400_000);
    const requestedTo = to; // null = "now"
    const window = { from: requestedFrom, to: requestedTo };
    const windowDays = Math.max(
      1,
      Math.ceil(((requestedTo ?? new Date()).getTime() - requestedFrom.getTime()) / 86_400_000)
    );

    // Whether this request is served from daily values. Mirrors the USGS
    // provider's own dispatch so the response can SAY what it is before the
    // data arrives: a 1-year plot is daily data and must be labelled as such.
    const startAgeDays = (Date.now() - requestedFrom.getTime()) / 86_400_000;
    const instantServable =
      windowDays <= capabilities.maxInstantDays && startAgeDays <= capabilities.maxInstantDays + 1;
    const useDaily =
      resolution === 'daily' || (resolution === 'auto' && !instantServable && capabilities.supportsDaily);

    if (resolution === 'daily' && !capabilities.supportsDaily) {
      return NextResponse.json(
        { error: `The ${providerId} provider has no daily-values product` },
        { status: 400 }
      );
    }
    if (resolution === 'instant' && !instantServable) {
      return NextResponse.json(
        {
          error: `Instantaneous data covers roughly the last ${capabilities.maxInstantDays} days for this provider — use daily resolution for older windows`,
        },
        { status: 400 }
      );
    }

    // ── Source selection: freshness AND completeness, never point count
    // alone ────────────────────────────────────────────────────────────────
    // ~14,000 stations pass a bare MIN_DB_POINTS check on history frozen the
    // day the cron stopped polling them. Daily-resolution and custom-window
    // requests skip the DB outright — its rows are instantaneous and recent.
    let historicalData: HistoricalData | null = null;
    if (!useDaily && !from && station) {
      historicalData = await fetchHistoryFromDb(supabase, station, siteId, window);
    }

    const newest = historicalData?.readings.at(-1)?.timestamp;
    const oldest = historicalData?.readings[0]?.timestamp;
    const ageHours = newest ? (Date.now() - new Date(newest).getTime()) / 3_600_000 : Infinity;
    const stale = !Number.isFinite(ageHours) || ageHours > MAX_DB_AGE_HOURS;
    // Complete enough = the stored series actually reaches back near the
    // requested start. A window served from its back half reads as "the
    // river was quiet last week" when the truth is "we stopped recording".
    const coverageSlackMs = windowDays * 86_400_000 * 0.1;
    const dbIncomplete =
      !oldest || new Date(oldest).getTime() > requestedFrom.getTime() + coverageSlackMs;

    if (
      !historicalData ||
      historicalData.readings.length < MIN_DB_POINTS ||
      stale ||
      dbIncomplete
    ) {
      const live = provider
        ? await provider.fetchHistory(siteId, validDays, {
            from: from ?? undefined,
            to: to ?? undefined,
            resolution,
          })
        : null;
      // When the stored history is merely STALE or INCOMPLETE the live series
      // is the better answer even if it is shorter, so the length comparison
      // that guards the sparse case must not veto it.
      if (
        live &&
        (!historicalData ||
          stale ||
          dbIncomplete ||
          live.readings.length > historicalData.readings.length)
      ) {
        historicalData = live;
      }
    }

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
    //
    // Fetched BEFORE the not-found decision, because observed and forecast are
    // independently optional: NWPS forecasts stations it has no telemetry at
    // (and the reverse — BDPM7 observes with no forecast), so a station with a
    // forecast and no readings is a chart, not a 404. The old order returned
    // 404 before ever asking for the forecast.
    const usgsSiteId = station ? station.usgs_site_id : siteId;
    const [typical, forecastDoc] = await Promise.all([
      providerId === 'usgs' && usgsSiteId
        ? fetchTypicalRange(supabase, usgsSiteId, window)
        : Promise.resolve([] as GaugeTypicalReading[]),
      station?.nws_lid ? fetchNwsForecast(station.nws_lid) : Promise.resolve(null),
    ]);

    // 404 only when the station has NEITHER observed nor forecast data.
    if (!historicalData && !(forecastDoc?.points ?? []).length) {
      return NextResponse.json(
        { error: 'Historical data not available for this gauge' },
        { status: 404 }
      );
    }

    // readings: [] is a valid response body — forecast-only stations ship an
    // empty observed series, and clients build the domain from the forecast.
    const rawReadings = (historicalData?.readings ?? []) as GaugeHistoryReading[];
    const readings = sampleHistory(rawReadings, windowDays);
    const observedThrough = readings.at(-1)?.timestamp ?? null;

    // What the served series actually covers, against what was asked for.
    // Reported rather than inferred client-side, because only the server
    // knows whether a short answer is truncation or the whole record — a
    // 1-year stage request legitimately returns less than a year on a
    // station whose stage dailies are shallow.
    const coverageWindow = readings.length
      ? { from: readings[0].timestamp, to: readings.at(-1)!.timestamp }
      : null;
    const requestedWindow = {
      from: requestedFrom.toISOString(),
      to: (requestedTo ?? new Date()).toISOString(),
    };
    const coverageComplete = Boolean(
      coverageWindow &&
        new Date(coverageWindow.from).getTime() <=
          requestedFrom.getTime() + coverageSlackMs &&
        (requestedTo
          ? new Date(coverageWindow.to).getTime() >= requestedTo.getTime() - coverageSlackMs
          : !stale || historicalData?.statistic?.startsWith('daily') === true)
    );
    if (!truncationReason && coverageWindow && !coverageComplete) {
      truncationReason = 'The source holds less history than the requested window';
    }

    const servedStatistic = historicalData?.statistic ?? 'instantaneous';
    const servedResolution: 'instant' | 'daily' =
      servedStatistic === 'instantaneous' ? 'instant' : 'daily';

    // The generic, unit-declared twin of `typical`, which is retained
    // unchanged for deployed clients. Discharge only until the stage
    // publication policy in percentile-snapshot.ts opens.
    const seasonalRange = typical.map((row) => ({
      date: row.date,
      unit: 'cfs' as const,
      p25: row.p25Cfs,
      p50: row.p50Cfs,
      p75: row.p75Cfs,
      yearsOfRecord: row.yearsOfRecord,
    }));

    // Only the part of the forecast that is still ahead of the observed series.
    // NWPS reissues on a schedule, so its early points overlap what already
    // happened — drawing those as forecast would put a dashed "prediction" on
    // top of readings the gauge has already taken. With no observed series at
    // all, every forecast point is ahead of it.
    const observedTime = observedThrough ? new Date(observedThrough).getTime() : -Infinity;
    const forecast: GaugeForecastReading[] = (forecastDoc?.points ?? []).filter(
      (point) => new Date(point.timestamp).getTime() > observedTime
    );

    return NextResponse.json({
      siteId: historicalData?.siteId ?? siteId,
      siteName: historicalData?.siteName ?? station?.name ?? siteId,
      readings,
      observedThrough,
      sampled: readings.length < rawReadings.length,
      resolution: servedResolution,
      statistic: servedStatistic,
      requestedWindow,
      coverageWindow,
      coverageComplete,
      truncationReason,
      typical,
      seasonalRange,
      forecast,
      forecastIssuedAt: forecast.length ? forecastDoc?.issuedAt ?? null : null,
      sourceUrl: provider?.publicUrl(siteId) ?? null,
      stats: {
        minDischarge: historicalData?.minDischarge ?? null,
        maxDischarge: historicalData?.maxDischarge ?? null,
        minHeight: historicalData?.minHeight ?? null,
        maxHeight: historicalData?.maxHeight ?? null,
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
