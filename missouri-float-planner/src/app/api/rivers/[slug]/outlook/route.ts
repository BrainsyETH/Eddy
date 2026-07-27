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
//
// ── ?gaugeId — the outlook for ONE station on the river ─────────────────────
//
// Without it this answers for the river's PRIMARY gauge, exactly as it always
// has, and that path is unchanged down to the query it runs.
//
// With it, every part of the answer moves to the station asked for. That is the
// point: the app's river screen lets you pick between the five gauges on the
// Current, and until now picking one changed the reading card and nothing else
// — the 72-hour strip still carried Van Buren's weather, and Eddy's read still
// described water ninety miles downstream of the stretch on screen. A second
// opinion that only moves one number is a second opinion you cannot act on.
//
// So a picked gauge changes four things together:
//
//   weather      fetched at the STATION, not at the river's curated town. The
//                town is the right answer for the river as a whole and the
//                wrong one for a specific gauge on it, and the panel names the
//                place it queried, so the two cannot silently diverge.
//   forecast     that station's own NWS hydrograph, or none.
//   condition    that station's latest reading against THIS river's ladder for
//                it — a gauge shared by two rivers grades differently for each.
//   the read     gauge_updates for that station, which is the per-gauge report
//                the generate-gauge-updates cron already writes, rather than
//                the river-level prose in eddy_updates. Same staleness guard
//                the /api/gauge-update endpoint applies, for the same reason:
//                prose written this morning must not sit under a badge that has
//                since moved.
//
// An unknown gaugeId falls back to the primary rather than erroring, and the
// response names the station it actually used.

import { NextRequest, NextResponse } from 'next/server';
import { cdnCacheHeaders, getCoordinates } from '@/lib/api-utils';
import { createAdminClient } from '@/lib/supabase/admin';
import { computeTrend } from '@/lib/gauge-trend';
import {
  applyFloodStageOverride,
  computeConditionFromDbRow,
  mapConditionCode,
  type ConditionThresholds,
} from '@/lib/conditions';
import { isGaugeReportCompatible } from '@/lib/eddy/gauge-update-policy';
import { toNum } from '@/lib/utils/num';
import { fetchAhpsForecast } from '@/lib/usgs/ahps-forecast';
import { fetchForecast, getWeatherPointForRiver } from '@/lib/weather/openweather';
import { overlayLiveConditions, WEBSITE_PROSE_STALE_HOURS } from '@/lib/social/live-conditions';
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
  /**
   * The station this whole answer was computed for.
   *
   * Echoed so a caller that asked for a specific gauge can tell whether it got
   * one: an unknown or unlinked `gaugeId` falls back to the river's primary
   * rather than failing, and a client that could not see the difference would
   * label the primary's forecast with the picked gauge's name.
   */
  gaugeStationId: string | null;
  /**
   * WHERE the weather above was measured — a town, not the river.
   *
   * The forecast is a point sample, and "72 hours" means nothing without
   * knowing 72 hours *where*. On a river with 90 miles of valley the difference
   * between the headwaters and the take-out is a real one, and this is the only
   * thing on the panel that discloses which end we asked about.
   *
   * Null when there is nothing honest to print, in which case the client shows
   * no label at all rather than falling back to the river's own name — a river
   * is not a weather station.
   */
  weatherLocation: string | null;
  /**
   * The long-form read: the same 4-6 sentence prose /rivers shows on the web,
   * as opposed to `sections.eddyRead`, which is one line.
   *
   * Null when no model prose exists for this river, and — importantly — also
   * null when the live river has moved far enough that the prose would
   * contradict the condition badge. See the overlay call below.
   */
  fullRead: string | null;
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
  gaugeStationId: null,
  weatherLocation: null,
  fullRead: null,
  generatedAt: null,
};

/**
 * The columns one river_gauges row has to carry to answer this endpoint.
 *
 * Declared once because it is now selected from two places — by station id when
 * a gauge was asked for, and by is_primary otherwise — and two copies of a
 * twenty-column select is how the fallback path quietly stops carrying a field
 * the main one added.
 */
const GAUGE_SELECT = `is_primary,
   threshold_unit, flood_stage_ft,
   level_too_low, level_low, level_optimal_min, level_optimal_max, level_high, level_dangerous,
   alt_level_too_low, alt_level_low, alt_level_optimal_min, alt_level_optimal_max,
   alt_level_high, alt_level_dangerous,
   gauge_station_id,
   gauge_stations(name, usgs_site_id, nws_lid, location)`;

async function _GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;
    // gauge_stations.id, which is what /api/gauges hands the app as MapGauge.id
    // — the same key the reading card and the gauge picker are keyed on.
    const requestedGaugeId = request.nextUrl.searchParams.get('gaugeId');
    const supabase = createAdminClient();

    const { data: river } = await supabase
      .from('rivers')
      .select('id, name')
      .eq('slug', slug)
      .maybeSingle();

    if (!river) {
      return NextResponse.json<RiverOutlookApiResponse>(EMPTY, { status: 404 });
    }

    // The station asked for, when one was and when it actually rates this
    // river. A gauge id that does not is not an error worth a 404: the picker
    // that sends it is built from this river's own gauges, so a miss means the
    // link was edited out from under an open screen, and the primary is a
    // better answer than none. `gaugeStationId` below discloses which won.
    const { data: requested } = requestedGaugeId
      ? await supabase
          .from('river_gauges')
          .select(GAUGE_SELECT)
          .eq('river_id', river.id)
          .eq('gauge_station_id', requestedGaugeId)
          .maybeSingle()
      : { data: null };

    const { data: primaryGauge } = requested
      ? { data: null }
      : await supabase
          .from('river_gauges')
          .select(GAUGE_SELECT)
          .eq('river_id', river.id)
          .eq('is_primary', true)
          .maybeSingle();

    const gauge = requested ?? primaryGauge;

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
    const gaugeCoords = station ? getCoordinates(station.location) : null;

    // True for the river's rated gauge, whether it was asked for by id or
    // arrived as the default. Everything below branches on THIS rather than on
    // `requestedGaugeId`, so asking for the primary explicitly and not asking at
    // all cannot produce two different answers.
    const usingPrimary = gauge.is_primary === true;

    // WEATHER IS FETCHED AT THE RIVER'S OWN WEATHER POINT, not at the gauge.
    //
    // It used to be the gauge, which was wrong in a way nothing on screen could
    // reveal until the panel started naming the place: rivers.weather_city is a
    // curated town — Van Buren, Steelville, Alton — and labelling a
    // gauge-sourced forecast with it would name somewhere we never asked about.
    // getWeatherPointForRiver returns the coordinates AND the name together, so
    // the label cannot drift from the query. All 24 active rivers have
    // weather_lat/weather_lon; the gauge stays as the fallback for anything
    // that somehow does not.
    //
    // UNLESS A SPECIFIC GAUGE WAS ASKED FOR. The curated town is the right
    // answer for "what is the weather on the Current" and the wrong one for
    // "what is the weather at Montauk", which is ninety miles of valley away
    // and is the question a picked gauge is asking. So a non-primary gauge
    // takes its own coordinates and whatever town OpenWeather resolves them to
    // — see weatherLocation below, which is fed from the same branch and can
    // therefore never name a place we did not query.
    const weatherPoint = usingPrimary ? await getWeatherPointForRiver(slug) : null;
    const coords = weatherPoint
      ? { lat: weatherPoint.lat, lng: weatherPoint.lon }
      : gaugeCoords;

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
    //
    // The last two are the picked-gauge pair, and they are the two halves of
    // the same question: what is this station reading right now, and does the
    // report written about it still describe that. Both resolve to nothing on
    // the primary path, which reads the river-level RPC and eddy_updates below.
    const [
      conditionResult,
      readingsResult,
      weatherResult,
      stagesResult,
      updateResult,
      latestReadingResult,
      gaugeUpdateResult,
    ] = await Promise.allSettled([
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
        .select('eddy_read, quote_text, summary_text, condition_code, gauge_height_ft, discharge_cfs, generated_at')
        .eq('river_slug', slug)
        .is('section_slug', null)
        .gt('expires_at', new Date().toISOString())
        .order('generated_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      // The newest reading this station published, at any age. The 9-hour
      // window above is a TREND window and empties on a quiet gauge; grading a
      // condition off it would report 'unknown' for a station that is simply
      // reporting every four hours.
      usingPrimary
        ? Promise.resolve({ data: null })
        : supabase
            .from('gauge_readings')
            .select('reading_timestamp, gauge_height_ft, discharge_cfs')
            .eq('gauge_station_id', gauge.gauge_station_id)
            .order('reading_timestamp', { ascending: false })
            .limit(1)
            .maybeSingle(),
      // The per-gauge report, written by the generate-gauge-updates cron and
      // otherwise only served through /api/gauge-update/[siteId]. This is what
      // makes changing gauge change Eddy's read rather than just the number
      // above it — the river-level prose in eddy_updates is about the rated
      // stretch and says so.
      usingPrimary || !station?.usgs_site_id
        ? Promise.resolve({ data: null })
        : supabase
            .from('gauge_updates')
            .select('eddy_read, quote_text, condition_code, generated_at')
            .eq('usgs_site_id', station.usgs_site_id)
            .gt('expires_at', new Date().toISOString())
            .order('generated_at', { ascending: false })
            .limit(1)
            .maybeSingle(),
    ]);

    const latestReading =
      latestReadingResult.status === 'fulfilled' ? latestReadingResult.value.data : null;

    /**
     * The condition this outlook is ABOUT.
     *
     * On the primary path, the river's own RPC — the same verdict the rivers
     * list, the alerts and the condition chip all carry, and nothing here may
     * be allowed to disagree with it.
     *
     * On a picked gauge, that station's newest reading against THIS river's
     * ladder for it. Not the station's primary ladder: 07014000 is primary for
     * the Huzzah and also rates the Courtois, and the same number is a
     * different verdict depending on which river is asking. Flood stage
     * outranks the ladder either way, exactly as it does everywhere else.
     */
    const conditionRow =
      conditionResult.status === 'fulfilled' ? conditionResult.value.data?.[0] : null;
    const currentCondition: ConditionCode = usingPrimary
      ? conditionRow
        ? mapConditionCode(conditionRow.condition_code)
        : 'unknown'
      : latestReading
        ? applyFloodStageOverride(
            computeConditionFromDbRow(
              toNum(latestReading.gauge_height_ft),
              gauge,
              toNum(latestReading.discharge_cfs),
            ).code,
            toNum(latestReading.gauge_height_ft),
            toNum(gauge.flood_stage_ft),
          )
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
    const update = usingPrimary && updateResult.status === 'fulfilled'
      ? updateResult.value.data
      : null;
    const gaugeUpdate =
      gaugeUpdateResult.status === 'fulfilled' ? gaugeUpdateResult.value.data : null;

    // The curated town, falling back to whatever OpenWeather resolved the
    // coordinates to. Two active rivers (Kings, Spring River MO) have
    // weather_lat/lon but no weather_city, and getWeatherPointForRiver's own
    // fallback for that is the RIVER's name — which is exactly what this field
    // must not be. Null rather than a wrong answer.
    //
    // On a picked gauge there is no curated town — `weatherPoint` is null by
    // construction — so this is always OpenWeather's own name for the place the
    // forecast was sampled at, which is the honest label for it.
    const weatherLocation =
      weatherPoint?.city ?? (weatherOk ? weatherResult.value!.city || null : null);

    // THE SAME GUARD /api/eddy-update APPLIES, and for the same reason.
    //
    // quote_text is written once a day against that morning's reading. If the
    // river has since crossed into a different floatability class, the prose
    // says "dialed in" while the badge a few hundred pixels up says High Water.
    // The website has never shipped that quote without this overlay, and the
    // app's river screen is the one place the two sit closest together — the
    // condition chip is directly above it. WEBSITE_PROSE_STALE_HOURS (24), not
    // the stricter social default: a routine multi-hour gauge gap should not
    // drop a reader to nothing.
    //
    // eddy_read is deliberately NOT put through it. It is one deterministic
    // line derived from the condition when no model wrote one, and
    // buildEddyTakeSections already reconciles it against currentCondition.
    let fullRead: string | null = null;

    // ── The picked gauge's own report ────────────────────────────────────────
    // A DIFFERENT ROW AND A DIFFERENT GUARD, not the river's prose relabelled.
    // gauge_updates is written per station by the generate-gauge-updates cron,
    // and isGaugeReportCompatible is the same check /api/gauge-update applies
    // before serving one: withhold when the reading behind the report is over a
    // day old, or when the river has since made a material move. Withholding
    // leaves buildEddyTakeSections' deterministic line, which is derived from
    // THIS gauge's condition — so the read still changes with the gauge even
    // when there is no written report for it, which for most stations there is
    // not.
    if (!usingPrimary && gaugeUpdate?.quote_text) {
      const compatible = isGaugeReportCompatible({
        storedCondition: gaugeUpdate.condition_code,
        liveCondition: currentCondition,
        readingTimestamp: latestReading?.reading_timestamp ?? null,
      });
      if (compatible) fullRead = gaugeUpdate.quote_text || null;
    }

    if (update?.quote_text) {
      try {
        const [overlaid] = await overlayLiveConditions(
          supabase,
          [{
            river_slug: slug,
            condition_code: update.condition_code,
            gauge_height_ft: update.gauge_height_ft,
            discharge_cfs: update.discharge_cfs,
            quote_text: update.quote_text,
            summary_text: update.summary_text,
          }],
          { proseStaleHours: WEBSITE_PROSE_STALE_HOURS, logLabel: 'river-outlook' },
        );
        fullRead = overlaid?.quote_text || null;
      } catch (error) {
        // Degrade to the short read rather than the stale long one. Withholding
        // is the safe direction here: the failure mode this guard exists to
        // prevent is showing prose, not hiding it.
        console.warn(`[RiverOutlook] Live-condition overlay failed for ${slug}:`, error);
      }
    }

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
      // Whichever report this outlook is about. Only one of the two can be
      // non-null — they are set on opposite sides of `usingPrimary`.
      generatedEddyRead: update?.eddy_read ?? gaugeUpdate?.eddy_read ?? null,
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
        gaugeStationId: gauge.gauge_station_id ?? null,
        weatherLocation,
        fullRead,
        generatedAt:
          update?.eddy_read
            ? update.generated_at
            : gaugeUpdate?.eddy_read
              ? gaugeUpdate.generated_at
              : null,
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
