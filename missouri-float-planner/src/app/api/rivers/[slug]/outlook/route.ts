// src/app/api/rivers/[slug]/outlook/route.ts
// The 72-hour outlook and Eddy's take for one river, computed server-side.
//
// WHY THIS EXISTS AS AN ENDPOINT
//
// On the website this is assembled in the browser: useRiverOutlook fans out to
// weather, the NWS forecast and gauge history, then buildRiverOutlookState and
// buildEddyTakeSections turn the three into a decision. That is fine on a
// desktop and wrong on a phone at a put-in, where three round trips over one
// bar of LTE is three chances to fail. So the phone gets the finished object.
//
// It reuses the SAME pure functions the website calls, which is the point: the
// split between "Eddy's read" (now) and "Watch for" (ahead), the material-change
// comparison that stops a peak nudging Flowing into Good from firing a warning,
// and the refusal to promise more than the data supports all live in
// src/lib/river-outlook.ts and are not restated here.
//
// UNITS: the NWS publishes stage only. A cfs-rated river — 18 of 24 active ones
// — must therefore be graded against its FOOT ladder for forecast days, never
// against the discharge thresholds its live condition uses. That is what
// stageThresholds below is for, and getting it wrong would print a condition
// badge computed by comparing feet to cubic feet per second.

import { NextRequest, NextResponse } from 'next/server';
import { cdnCacheHeaders, getCoordinates } from '@/lib/api-utils';
import { createAdminClient } from '@/lib/supabase/admin';
import { computeTrend } from '@/lib/gauge-trend';
import { mapConditionCode, type ConditionThresholds } from '@/lib/conditions';
import { fetchAhpsForecast } from '@/lib/usgs/ahps-forecast';
import { fetchForecast } from '@/lib/weather/openweather';
import {
  HEAT_ADVISORY_TEMP_F,
  buildEddyTakeSections,
  buildRiverOutlookState,
  getRainPresentation,
  type OutlookWeatherDay,
} from '@/lib/river-outlook';
import type { EddyTakeSections } from '@/lib/eddy/take-sections';
import type { ConditionCode } from '@/types/api';
import { withX402Route } from '@/lib/x402-config';

export const dynamic = 'force-dynamic';

/** Matches the trend window used by the river list, so the two never disagree. */
const TREND_LOOKBACK_HOURS = 9;

export interface RiverOutlookDayResponse {
  date: string;
  weather: OutlookWeatherDay | null;
  river: { valueFt: number | null; conditionCode: ConditionCode | null };
  /**
   * Rain and heat emphasis, decided HERE rather than on each client.
   *
   * "Is 30% rain worth mentioning" and "is 95F a heat day" are product
   * judgements — LOW_RAIN_CHANCE, SIGNIFICANT_RAIN_CHANCE and
   * HEAT_ADVISORY_TEMP_F in src/lib/river-outlook.ts, set at the NWS
   * heat-advisory neighbourhood so the flag stays rare enough to mean
   * something in a Missouri July. Shipping the thresholds to every client
   * invites them to drift; shipping the verdict cannot.
   */
  rainKind: 'none' | 'unlikely' | 'possible' | 'significant';
  rainLabel: string;
  heatAdvisory: boolean;
}

export interface RiverOutlookApiResponse {
  available: boolean;
  sections: EddyTakeSections | null;
  days: RiverOutlookDayResponse[];
  /** 'official' when NWS publishes a hydrograph, else weather-only guidance. */
  sourceKind: 'checking' | 'official' | 'guidance';
  sourceLabel: string;
  hasOfficialForecast: boolean;
  isGuidance: boolean;
  trend: { direction: 'rising' | 'falling' | 'steady'; label: string; windowHours: number } | null;
  currentCondition: ConditionCode;
  gaugeName: string | null;
  /** Present only when a model wrote the read; null means it is deterministic. */
  generatedAt: string | null;
}

const EMPTY: RiverOutlookApiResponse = {
  available: false,
  sections: null,
  days: [],
  sourceKind: 'guidance',
  sourceLabel: 'Current river trend + weather outlook',
  hasOfficialForecast: false,
  isGuidance: false,
  trend: null,
  currentCondition: 'unknown',
  gaugeName: null,
  generatedAt: null,
};

async function _GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;
    const supabase = createAdminClient();

    const { data: river } = await supabase
      .from('rivers')
      .select('id, name')
      .eq('slug', slug)
      .maybeSingle();

    if (!river) {
      return NextResponse.json<RiverOutlookApiResponse>(EMPTY, { status: 404 });
    }

    const { data: gauge } = await supabase
      .from('river_gauges')
      .select(
        `threshold_unit,
         level_too_low, level_low, level_optimal_min, level_optimal_max, level_high, level_dangerous,
         alt_level_too_low, alt_level_low, alt_level_optimal_min, alt_level_optimal_max,
         alt_level_high, alt_level_dangerous,
         gauge_station_id,
         gauge_stations(name, usgs_site_id, nws_lid, location)`,
      )
      .eq('river_id', river.id)
      .eq('is_primary', true)
      .maybeSingle();

    if (!gauge) {
      // A river with no primary gauge is an ordinary state, not a fault — the
      // app hides the panel rather than showing an error.
      return NextResponse.json<RiverOutlookApiResponse>(EMPTY, {
        headers: cdnCacheHeaders(300, 1800),
      });
    }

    const station = (Array.isArray(gauge.gauge_stations)
      ? gauge.gauge_stations[0]
      : gauge.gauge_stations) as
      | { name: string; usgs_site_id: string; nws_lid: string | null; location: unknown }
      | null;

    // gauge_stations stores a PostGIS point, not lat/lng columns. getCoordinates
    // is the repo's canonical reader for it and already handles the GeoJSON, WKT
    // and EWKB shapes PostgREST can return depending on the query.
    const coords = station ? getCoordinates(station.location) : null;

    const primaryUnit = gauge.threshold_unit === 'cfs' ? 'cfs' : 'ft';

    // The FOOT ladder, whichever column it happens to live in. When the gauge is
    // rated in cfs its primary level_* columns are discharge, and the foot values
    // (if any) are the alt set — so this is not a "fallback", it is a lookup by
    // unit. Null means we cannot grade a forecast stage at all, and the outlook
    // then shows weather with no condition badges rather than inventing one.
    const stageThresholds: ConditionThresholds | null = (() => {
      const feet = primaryUnit === 'ft'
        ? {
            levelTooLow: gauge.level_too_low,
            levelLow: gauge.level_low,
            levelOptimalMin: gauge.level_optimal_min,
            levelOptimalMax: gauge.level_optimal_max,
            levelHigh: gauge.level_high,
            levelDangerous: gauge.level_dangerous,
          }
        : {
            levelTooLow: gauge.alt_level_too_low,
            levelLow: gauge.alt_level_low,
            levelOptimalMin: gauge.alt_level_optimal_min,
            levelOptimalMax: gauge.alt_level_optimal_max,
            levelHigh: gauge.alt_level_high,
            levelDangerous: gauge.alt_level_dangerous,
          };
      const hasAny = Object.values(feet).some((value) => value != null);
      return hasAny ? { ...feet, thresholdUnit: 'ft' } : null;
    })();

    const since = new Date(Date.now() - TREND_LOOKBACK_HOURS * 3_600_000).toISOString();
    const weatherKey = process.env.OPENWEATHER_API_KEY;

    // Every source degrades independently. A river with no NWS LID, a weather
    // outage and a quiet gauge should still return a bottom line, because the
    // bottom line is derived from the CURRENT condition and nothing else.
    const [conditionResult, readingsResult, weatherResult, stagesResult, updateResult] =
      await Promise.allSettled([
        supabase.rpc('get_river_condition', { p_river_id: river.id }),
        supabase
          .from('gauge_readings')
          .select('reading_timestamp, gauge_height_ft, discharge_cfs')
          .eq('gauge_station_id', gauge.gauge_station_id)
          .gte('reading_timestamp', since)
          .order('reading_timestamp', { ascending: true }),
        coords && weatherKey
          ? fetchForecast(coords.lat, coords.lng, weatherKey)
          : Promise.resolve(null),
        station?.nws_lid ? fetchAhpsForecast(station.nws_lid) : Promise.resolve([]),
        supabase
          .from('eddy_updates')
          .select('eddy_read, generated_at')
          .eq('river_slug', slug)
          .is('section_slug', null)
          .gt('expires_at', new Date().toISOString())
          .order('generated_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

    const conditionRow =
      conditionResult.status === 'fulfilled' ? conditionResult.value.data?.[0] : null;
    const currentCondition: ConditionCode = conditionRow
      ? mapConditionCode(conditionRow.condition_code)
      : 'unknown';

    const readings =
      readingsResult.status === 'fulfilled'
        ? (readingsResult.value.data ?? []).map((row) => ({
            timestamp: row.reading_timestamp,
            gaugeHeightFt: row.gauge_height_ft == null ? null : Number(row.gauge_height_ft),
            dischargeCfs: row.discharge_cfs == null ? null : Number(row.discharge_cfs),
          }))
        : [];
    // Trend follows the unit the condition was GRADED in, not the forecast unit.
    const trend = computeTrend(readings, primaryUnit, 6);

    const weatherOk = weatherResult.status === 'fulfilled' && weatherResult.value != null;
    const weatherDays = weatherOk ? weatherResult.value!.days : [];
    const riverStages = stagesResult.status === 'fulfilled' ? stagesResult.value : [];
    const update = updateResult.status === 'fulfilled' ? updateResult.value.data : null;

    const outlook = buildRiverOutlookState({
      weatherDays,
      // Nothing is pending server-side: every fetch above has already settled,
      // so 'checking' — a loading state — must never be reported to the client.
      weatherPending: false,
      weatherError: !weatherOk,
      riverStages,
      riverPending: false,
      trend,
      stageThresholds,
    });

    const sections = buildEddyTakeSections({
      outlook,
      currentCondition,
      generatedEddyRead: update?.eddy_read ?? null,
    });

    return NextResponse.json<RiverOutlookApiResponse>(
      {
        available: true,
        sections,
        days: outlook.days.map((day) => {
          const rain = day.weather
            ? getRainPresentation(day.weather.precipitation)
            : { kind: 'none' as const, label: 'No rain' };
          return {
            date: day.date,
            weather: day.weather,
            river: { valueFt: day.river.valueFt, conditionCode: day.river.conditionCode },
            rainKind: rain.kind,
            rainLabel: rain.label,
            heatAdvisory: (day.weather?.tempHigh ?? 0) >= HEAT_ADVISORY_TEMP_F,
          };
        }),
        sourceKind: outlook.sourceKind,
        sourceLabel: outlook.sourceLabel,
        hasOfficialForecast: outlook.hasOfficialForecast,
        isGuidance: outlook.isGuidance,
        trend: trend
          ? { direction: trend.direction, label: trend.label, windowHours: trend.windowHours }
          : null,
        currentCondition,
        gaugeName: station?.name ?? null,
        generatedAt: update?.eddy_read ? update.generated_at : null,
      },
      // Short CDN life with a long stale window: the weather and NWS inputs
      // refresh hourly at best, and a slightly stale outlook beside a live
      // condition is better than a spinner on a phone with no signal to spare.
      { headers: cdnCacheHeaders(300, 1800) },
    );
  } catch (error) {
    console.error('[RiverOutlook] Unexpected error:', error);
    return NextResponse.json<RiverOutlookApiResponse>(EMPTY, { status: 500 });
  }
}

export const GET = withX402Route<{ params: Promise<{ slug: string }> }>(
  _GET,
  '/api/rivers/:slug/outlook',
);
