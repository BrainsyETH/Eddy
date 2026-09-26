import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';
import type { ConditionCode } from '@/types/api';
import type { ReachRiverType } from '@shared/reach-types';
import { STALE_READING_HOURS } from '@shared/reading-staleness';
import { resolveFloatEndpoints, endpointFailureStatus } from '@/lib/access-points/endpoint-resolver';
import { fetchGaugeReadings, fetchDailyStatistics, classifyQualifiers } from '@/lib/usgs/gauges';
import { applyFloodStageOverride, computeConditionFromDbRow, getConditionShortLabel } from '@/lib/conditions';
import { calculateFloatTime, floatTimeWithholding, formatFloatTime, formatFloatTimeRange, formatFloatTimeRangeCompact, type SpeedCurve } from './floatTime';
import { toNum } from '@/lib/utils/num';

type AccessPointRow = Database['public']['Tables']['access_points']['Row'];
export class RouteEstimateError extends Error {
  constructor(message: string, public readonly status: number) { super(message); }
}
function scaleKnownTimeForCondition(minutes: number, code: ConditionCode): number {
  const factor =
    code === 'too_low' ? 2.0 :
    code === 'low' ? 1.33 :
    code === 'high' ? 0.85 :
    1.0; // good / flowing / unknown → published normal-flow time
  return Math.round(minutes * factor);
}

/** Read-only route calculation shared by planners, chat, embeds and social.
 * Resolves the exact endpoints, vessel, segment gauges and published times once.
 * Does not calculate shuttles, write caches or save plans.
 */
export async function estimateRoute(supabase: SupabaseClient<Database>, {
  riverId, startId, endId, vesselTypeId, mode = 'today',
}: { riverId: string; startId: string; endId: string; vesselTypeId?: string | null; mode?: 'today' | 'typical' }, providers = { fetchGaugeReadings, fetchDailyStatistics }) {
    // Get river details
    const { data: river, error: riverError } = await supabase
      .from('rivers')
      // river_type rides along on the query that already has to succeed.
      // Resolving it separately (through the 5-minute getRiverContext cache,
      // behind a swallowed catch) meant the tailwater float-time refusal
      // failed OPEN on a cache miss or a transient error — the wrong
      // direction for a guard whose whole job is to withhold a number.
      .select('id, name, slug, river_type')
      .eq('id', riverId)
      .single();

    if (riverError) throw new RouteEstimateError('Could not look up the river', 500);
    if (!river) {
      throw new RouteEstimateError('River not found', 404);
    }

    // Get access points. The resolver is the only thing that decides whether a
    // float may be built from these two ids: it requires both to be approved,
    // both to be float endpoints (so a park with no ramp is refused rather than
    // merely hidden by the UI), and both to be on THIS river — which this route
    // never checked, though `riverId` was already in hand above.
    const endpoints = await resolveFloatEndpoints<AccessPointRow>(supabase, {
      riverId,
      putInId: startId,
      takeOutId: endId,
    });

    if (!endpoints.ok) {
      throw new RouteEstimateError(endpoints.detail, endpointFailureStatus(endpoints.reason));
    }

    const { putIn, takeOut } = endpoints;

    if (!putIn || !takeOut) {
      throw new RouteEstimateError('Invalid access points', 400);
    }

    // Use an explicit canoe default so editorial and planner requests agree.
    let vesselType;
    if (vesselTypeId) {
      const { data: vt, error: vesselError } = await supabase
        .from('vessel_types')
        .select('*')
        .eq('id', vesselTypeId)
        .single();
      if (vesselError) throw new RouteEstimateError('Could not look up the vessel type', 500);
      if (!vt) throw new RouteEstimateError('Vessel type not found', 404);
      vesselType = vt;
    }

    if (!vesselType) {
      const { data: defaultVessel, error: defaultVesselError } = await supabase
        .from('vessel_types')
        .select('*')
        .eq('slug', 'canoe')
        .single();
      if (defaultVesselError) throw new RouteEstimateError('Could not look up the vessel type', 500);
      vesselType = defaultVessel;
    }

    if (!vesselType) {
      throw new RouteEstimateError('Vessel type not found', 404);
    }

    // Get float segment using database function
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: segment, error: segmentError } = await (supabase.rpc as any)(
      'get_float_segment',
      {
        p_start_access_id: startId,
        p_end_access_id: endId,
      }
    );

    if (segmentError || !segment || segment.length === 0) {
      throw new RouteEstimateError('Could not calculate float segment', 500);
    }

    const segmentData = segment[0];
    const distanceMiles = segmentData.distance_miles != null ? parseFloat(segmentData.distance_miles) : NaN;
    const putInMile = segmentData.start_river_mile != null ? parseFloat(segmentData.start_river_mile) : NaN;

    if (isNaN(distanceMiles) || distanceMiles <= 0) {
      throw new RouteEstimateError('Could not calculate distance between access points', 500);
    }

    // Get put-in coordinates for segment-aware gauge selection (fallback)
    // Use location_orig first — location_snap is snapped to simplified seed geometry
    const putInCoords = (putIn.location_orig as { coordinates?: number[] } | null)?.coordinates
      || (putIn.location_snap as { coordinates?: number[] } | null)?.coordinates;

    // Typical estimates are explicitly independent of today's water.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let condition: any;
    let conditionCode: ConditionCode = 'flowing';
    const spanWarnings: string[] = [];
    let anchorCondition: Record<string, unknown> | null = null;
    const contributingGauges: Array<{ name: string; usgsSiteId: string; riverMile: number; conditionCode: string; gaugeHeightFt: number | null; dischargeCfs: number | null; observedAt: string | null; effect: 'escalated' | 'low_water' }> = [];
    let spanCheckComplete = true;
    let dailyStats: Awaited<ReturnType<typeof fetchDailyStatistics>> = null;
    if (mode === 'today') {
    // Get river condition using position-based gauge selection
    // Logic: Use gauge at or upstream of put-in mile
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: conditionData } = await (supabase.rpc as any)('get_river_condition_segment', {
      p_river_id: riverId,
      p_put_in_mile: putInMile,
      p_put_in_point: putInCoords
        ? `SRID=4326;POINT(${putInCoords[0]} ${putInCoords[1]})`
        : null,
    });

    condition = conditionData?.[0];
    conditionCode = condition?.condition_code || 'unknown';

    // If database returns unknown (no gauge readings), fall back to live USGS data
    if (conditionCode === 'unknown' || !condition?.gauge_height_ft) {
      // Get gauge info for this river (segment-aware or primary)
      const gaugeUsgsSiteId = condition?.gauge_usgs_id;

      if (gaugeUsgsSiteId) {
        // Fetch live USGS reading
        const usgsReadings = await providers.fetchGaugeReadings([gaugeUsgsSiteId]);
        const usgsReading = usgsReadings.find(r => r.siteId === gaugeUsgsSiteId);

        if (usgsReading && usgsReading.gaugeHeightFt !== null) {
          // Get thresholds for this gauge
          const { data: gaugeThresholds } = await supabase
            .from('river_gauges')
            .select(`
              level_too_low,
              level_low,
              level_optimal_min,
              level_optimal_max,
              level_high,
              level_dangerous,
              threshold_unit,
              gauge_stations!inner (usgs_site_id)
            `)
            .eq('river_id', riverId)
            .eq('gauge_stations.usgs_site_id', gaugeUsgsSiteId)
            .limit(1)
            .maybeSingle();

          if (gaugeThresholds) {
            // Thread threshold_unit + discharge so stage/CFS are never conflated (F7).
            const computed = computeConditionFromDbRow(
              usgsReading.gaugeHeightFt,
              gaugeThresholds,
              usgsReading.dischargeCfs
            );

            const readingAgeHours = usgsReading.readingTimestamp
              ? (Date.now() - new Date(usgsReading.readingTimestamp).getTime()) / (1000 * 60 * 60)
              : null;
            const stale = readingAgeHours != null && readingAgeHours > STALE_READING_HOURS;
            const qual = classifyQualifiers(usgsReading.qualifiers);

            // Update condition with live USGS data
            condition = {
              ...condition,
              condition_label: computed.label,
              condition_code: computed.code,
              gauge_height_ft: usgsReading.gaugeHeightFt,
              discharge_cfs: usgsReading.dischargeCfs,
              reading_timestamp: usgsReading.readingTimestamp,
              reading_age_hours: readingAgeHours,
              accuracy_warning: stale || qual.suspect,
              accuracy_warning_reason: qual.suspect
                ? qual.note
                : stale ? `Reading is ${Math.round(readingAgeHours!)} hours old` : null,
            };
            conditionCode = computed.code;
          }
        }
      } else {
        // No gauge from segment-aware lookup, try primary gauge
        const { data: primaryGauge } = await supabase
          .from('river_gauges')
          .select(`
            level_too_low,
            level_low,
            level_optimal_min,
            level_optimal_max,
            level_high,
            level_dangerous,
            threshold_unit,
            gauge_stations (
              id,
              name,
              usgs_site_id
            )
          `)
          .eq('river_id', riverId)
          .eq('is_primary', true)
          .limit(1)
          .maybeSingle();

        if (primaryGauge) {
          const gaugeStation = Array.isArray(primaryGauge.gauge_stations)
            ? primaryGauge.gauge_stations[0]
            : primaryGauge.gauge_stations;
          const usgsSiteId = gaugeStation?.usgs_site_id;

          if (usgsSiteId) {
            const usgsReadings = await providers.fetchGaugeReadings([usgsSiteId]);
            const usgsReading = usgsReadings.find(r => r.siteId === usgsSiteId);

            if (usgsReading && usgsReading.gaugeHeightFt !== null) {
              const computed = computeConditionFromDbRow(
                usgsReading.gaugeHeightFt,
                primaryGauge,
                usgsReading.dischargeCfs
              );

              const readingAgeHours = usgsReading.readingTimestamp
                ? (Date.now() - new Date(usgsReading.readingTimestamp).getTime()) / (1000 * 60 * 60)
                : null;
              const stale = readingAgeHours != null && readingAgeHours > STALE_READING_HOURS;
              const qual = classifyQualifiers(usgsReading.qualifiers);

              condition = {
                condition_label: computed.label,
                condition_code: computed.code,
                gauge_height_ft: usgsReading.gaugeHeightFt,
                discharge_cfs: usgsReading.dischargeCfs,
                reading_timestamp: usgsReading.readingTimestamp,
                reading_age_hours: readingAgeHours,
                gauge_name: gaugeStation?.name,
                gauge_usgs_id: usgsSiteId,
                accuracy_warning: stale || qual.suspect,
                accuracy_warning_reason: qual.suspect
                  ? qual.note
                  : stale ? `Reading is ${Math.round(readingAgeHours!)} hours old` : null,
              };
              conditionCode = computed.code;
            }
          }
        }
      }
    }

    anchorCondition = condition ? { ...condition } : null;

    // --- Within-span multi-gauge check (gauge-to-segment representativeness) ---
    // The anchor gauge sits at/upstream of the put-in, but a long float can pass
    // other gauges reading very different water (tributaries and big springs add
    // flow between gauges). If another gauge INSIDE the float span classifies
    // worse than the anchor (high/dangerous), the trip passes through that water:
    // escalate the condition. A too-low in-span gauge gets a scraping warning.

    try {
      const spanMinMile = Math.min(parseFloat(segmentData.start_river_mile), parseFloat(segmentData.end_river_mile));
      const spanMaxMile = Math.max(parseFloat(segmentData.start_river_mile), parseFloat(segmentData.end_river_mile));

      const { data: riverGaugeRows, error: spanGaugeError } = await supabase
        .from('river_gauges')
        .select(`
          level_too_low, level_low, level_optimal_min, level_optimal_max,
          level_high, level_dangerous, threshold_unit, river_mile, flood_stage_ft,
          gauge_stations!inner (id, name, usgs_site_id, active)
        `)
        .eq('river_id', riverId)
        .not('river_mile', 'is', null);

      if (spanGaugeError) throw new Error('Could not check gauges along this route');
      const inSpanGauges = (riverGaugeRows || [])
        .map((g) => ({
          row: g,
          mile: toNum(g.river_mile),
          station: Array.isArray(g.gauge_stations) ? g.gauge_stations[0] : g.gauge_stations,
        }))
        .filter(({ mile, station }) =>
          mile != null && mile >= spanMinMile && mile <= spanMaxMile &&
          station?.active &&
          station?.usgs_site_id !== condition?.gauge_usgs_id
        );

      if (inSpanGauges.length > 0) {
        const latestReadings = await Promise.all(
          inSpanGauges.map(({ station }) =>
            supabase
              .from('gauge_readings')
              .select('gauge_height_ft, discharge_cfs, reading_timestamp, qualifiers')
              .eq('gauge_station_id', station.id)
              .order('reading_timestamp', { ascending: false })
              .limit(1)
              .maybeSingle()
          )
        );

        const SEVERITY_RANK: Record<string, number> = { high: 1, dangerous: 2 };
        for (let i = 0; i < inSpanGauges.length; i++) {
          const { row, station, mile } = inSpanGauges[i];
          const reading = latestReadings[i]?.data;
          if (latestReadings[i]?.error || !reading) { spanCheckComplete = false; continue; }
          const ageHours = reading.reading_timestamp
            ? (Date.now() - new Date(reading.reading_timestamp).getTime()) / (1000 * 60 * 60)
            : Infinity;
          if (!Number.isFinite(ageHours) || ageHours < -5 / 60 || classifyQualifiers(reading.qualifiers ?? []).suspect) { spanCheckComplete = false; continue; }
          if (ageHours > STALE_READING_HOURS) spanCheckComplete = false;
          if (ageHours > 12) { spanCheckComplete = false; continue; } // never escalate off stale data

          const spanCondition = computeConditionFromDbRow(
            toNum(reading.gauge_height_ft),
            row,
            toNum(reading.discharge_cfs)
          );

          spanCondition.code = applyFloodStageOverride(spanCondition.code, toNum(reading.gauge_height_ft), toNum(row.flood_stage_ft));
          spanCondition.label = getConditionShortLabel(spanCondition.code);
          if (spanCondition.code === 'unknown') spanCheckComplete = false;

          if ((SEVERITY_RANK[spanCondition.code] ?? 0) > (SEVERITY_RANK[conditionCode] ?? 0)) {
            contributingGauges.push({ name: station.name, usgsSiteId: station.usgs_site_id, riverMile: mile!, conditionCode: spanCondition.code, gaugeHeightFt: toNum(reading.gauge_height_ft), dischargeCfs: toNum(reading.discharge_cfs), observedAt: reading.reading_timestamp, effect: 'escalated' });
            conditionCode = spanCondition.code as ConditionCode;
            condition = {
              ...condition,
              condition_code: spanCondition.code,
              condition_label: spanCondition.label,
            };
            spanWarnings.push(
              `${station.name} (mile ${mile}) reads "${spanCondition.label}" within this float — conditions reflect the worst gauge on your route`
            );
          } else if (spanCondition.code === 'too_low' && conditionCode !== 'too_low' && conditionCode !== 'unknown') {
            contributingGauges.push({ name: station.name, usgsSiteId: station.usgs_site_id, riverMile: mile!, conditionCode: spanCondition.code, gaugeHeightFt: toNum(reading.gauge_height_ft), dischargeCfs: toNum(reading.discharge_cfs), observedAt: reading.reading_timestamp, effect: 'low_water' });
            spanWarnings.push(
              `${station.name} (mile ${mile}) reads very low — expect dragging on that stretch`
            );
          }
        }
      }
    } catch (spanError) {
      spanCheckComplete = false;
      console.warn('Span gauge check failed (non-fatal):', spanError);
    }

    // Fetch daily discharge statistics once. Used as the reference flow (Q_ref) for
    // the flow-dependent speed model, and reused for the supplementary percentile below.

    if (condition?.gauge_usgs_id) {
      try {
        dailyStats = await providers.fetchDailyStatistics(condition.gauge_usgs_id);
      } catch (statsError) {
        console.warn('Failed to fetch statistics for plan:', statsError);
      }
    }
    }
    const refCfs = dailyStats?.p50 ?? null;
    const dischargeCfs = toNum(condition?.discharge_cfs);

    const speedLowWater = vesselType.speed_low_water != null ? parseFloat(String(vesselType.speed_low_water)) : 0;
    const speedNormal = vesselType.speed_normal != null ? parseFloat(String(vesselType.speed_normal)) : 0;
    const speedHighWater = vesselType.speed_high_water != null ? parseFloat(String(vesselType.speed_high_water)) : 0;

    // Try to get known float time from float_segments table first
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: segmentTime } = await (supabase.rpc as any)('get_segment_float_time', {
      p_put_in_id: startId,
      p_take_out_id: endId,
      p_vessel_type: vesselType.slug,
    });

    let floatTimeResult: {
      minutes: number;
      speedMph: number;
      isEstimate: boolean;
      basis: 'trip' | 'moving';
      timeRange?: { min: number; max: number };
    } | null = null;

    // Dangerous water gets NO float time (neither known nor estimated).


    // Neither does regulated water, and for a different reason. Dangerous
    // water has a float time we decline to quote; a tailwater has one we
    // cannot compute, because every model here takes ONE discharge and holds
    // it for the whole trip while the release can change mid-float.
    //
    // This gate has to sit HERE rather than only inside calculateFloatTime:
    // the published-times branch below never calls that function, so a
    // float_segments row on a tailwater would serve a stored time straight
    // past the refusal. Read off the river row, so it cannot fail open.
    const withholdReason = floatTimeWithholding(
      conditionCode,
      river.river_type as ReachRiverType | null,
    );
    const withholdFloatTime = withholdReason !== null;

    if (!withholdFloatTime && segmentTime && segmentTime.length > 0 && segmentTime[0].time_avg_minutes > 0
      && segmentTime[0].time_min_minutes > 0
      && segmentTime[0].time_max_minutes >= segmentTime[0].time_min_minutes) {
      // Known, published (trip-basis) times — scale by current flow, never serve raw.
      const st = segmentTime[0];
      const avg = scaleKnownTimeForCondition(st.time_avg_minutes, conditionCode);
      const rMin = st.time_min_minutes ? scaleKnownTimeForCondition(st.time_min_minutes, conditionCode) : undefined;
      const rMax = st.time_max_minutes ? scaleKnownTimeForCondition(st.time_max_minutes, conditionCode) : undefined;
      floatTimeResult = {
        minutes: avg,
        speedMph: avg > 0 ? distanceMiles / (avg / 60) : 0,
        isEstimate: false,
        basis: 'trip',
        timeRange: rMin != null && rMax != null ? { min: rMin, max: rMax } : undefined,
      };
    } else if (!withholdFloatTime) {
      // Flow-dependent estimate (falls back to the condition-band step if no
      // discharge), using this river's calibrated low-water speed curve when
      // one exists (river_characteristics.speed_curve).
      const { data: characteristics } = await supabase.from('river_characteristics')
        .select('speed_curve').eq('river_id', riverId).maybeSingle();
      const calcResult = calculateFloatTime(
        distanceMiles,
        { speedLowWater, speedNormal, speedHighWater },
        conditionCode,
        {
          dischargeCfs,
          refCfs,
          basis: 'trip',
          speedCurve: characteristics?.speed_curve as SpeedCurve | null,
          // Belt and braces behind withholdFloatTime above, and from the river
          // ROW rather than the cached context so the two agree even when the
          // cache does not answer.
          riverType: river.river_type as ReachRiverType | null,
        }
      );

      if (calcResult) {
        floatTimeResult = {
          minutes: calcResult.minutes,
          speedMph: calcResult.speedMph,
          isEstimate: true,
          basis: calcResult.basis,
          timeRange: { min: calcResult.minMinutes, max: calcResult.maxMinutes },
        };
      }
    }

    const floatTime = floatTimeResult ? {
      ...floatTimeResult,
      formattedCompact: floatTimeResult.timeRange ? formatFloatTimeRangeCompact(floatTimeResult.timeRange.min, floatTimeResult.timeRange.max) : formatFloatTime(floatTimeResult.minutes),
      formatted: floatTimeResult.timeRange
        ? formatFloatTimeRange(floatTimeResult.timeRange.min, floatTimeResult.timeRange.max)
        : formatFloatTime(floatTimeResult.minutes),
    } : null;
    return { river, putIn, takeOut, vesselType, segmentData, distanceMiles,
      condition, anchorCondition, contributingGauges, spanCheckComplete, conditionCode, dailyStats, spanWarnings, floatTimeResult, floatTime,
      withholdReason, estimateBasis: mode, estimatedAt: new Date().toISOString() };
}
