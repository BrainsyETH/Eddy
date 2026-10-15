import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';
import type { ConditionCode } from '@/types/api';
import type { ReachRiverType } from '@shared/reach-types';
import { conditionAvailability, unknownConditionLabel, type ConditionAvailability } from '@shared/condition-availability';
import { STALE_READING_HOURS } from '@shared/reading-staleness';
import { resolveFloatEndpoints, endpointFailureStatus } from '@/lib/access-points/endpoint-resolver';
import { fetchGaugeReadings, fetchDailyStatistics, classifyQualifiers } from '@/lib/usgs/gauges';
import { applyFloodStageOverride, computeConditionFromDbRow, getConditionShortLabel } from '@/lib/conditions';
import { floatTimeWithholding, formatFloatTime, formatFloatTimeRange, formatFloatTimeRangeCompact, type SpeedCurve } from './floatTime';
import { calculateTripDuration } from './trip-duration';
import { toNum } from '@/lib/utils/num';

function dbRatingStatus(row: Record<string, unknown>): 'rated' | 'unrated' {
  return ['level_too_low', 'level_low', 'level_optimal_min', 'level_optimal_max', 'level_high', 'level_dangerous']
    .some(key => row[key] != null) ? 'rated' : 'unrated';
}

type AccessPointRow = Database['public']['Tables']['access_points']['Row'];
export class RouteEstimateError extends Error {
  constructor(message: string, public readonly status: number) { super(message); }
}

export type RouteSegment = Database['public']['Functions']['get_float_segment']['Returns'][number];
export type SegmentReader = (startId: string, endId: string) => Promise<RouteSegment>;

export async function readRouteSegment(supabase: SupabaseClient<Database>, startId: string, endId: string): Promise<RouteSegment> {
  const { data, error } = await supabase.rpc('get_float_segment', {
    p_start_access_id: startId, p_end_access_id: endId,
  });
  if (error || !data?.length) throw new RouteEstimateError('Could not calculate float segment', 500);
  return data[0];
}

/** Request-scoped only: nearby routes share metadata, never live readings. */
export function createRouteEstimateContext(supabase: SupabaseClient<Database>, segmentReader?: SegmentReader) {
  const rivers = new Map<string, ReturnType<typeof readRiver>>();
  const vessels = new Map<string, ReturnType<typeof readVessel>>();
  return {
    segment: segmentReader ?? ((startId: string, endId: string) => readRouteSegment(supabase, startId, endId)),
    river(id: string) {
      if (!rivers.has(id)) rivers.set(id, readRiver(supabase, id));
      return rivers.get(id)!;
    },
    vessel(id?: string | null) {
      const key = id ?? 'default:canoe';
      if (!vessels.has(key)) vessels.set(key, readVessel(supabase, id));
      return vessels.get(key)!;
    },
  };
}

async function readRiver(supabase: SupabaseClient<Database>, riverId: string) {
    // Get river details
    const { data: river, error: riverError } = await supabase
      .from('rivers')
      // river_type rides along on the query that already has to succeed.
      // Resolving it separately (through the 5-minute getRiverContext cache,
      // behind a swallowed catch) meant the tailwater float-time refusal
      // failed OPEN on a cache miss or a transient error — the wrong
      // direction for a guard whose whole job is to withhold a number.
      .select('id, name, slug, river_type, float_tip')
      .eq('id', riverId)
      .maybeSingle();

    if (riverError) throw new RouteEstimateError('Could not look up the river', 500);
    if (!river) {
      throw new RouteEstimateError('River not found', 404);
    }

    return river;
}

async function readVessel(supabase: SupabaseClient<Database>, vesselTypeId?: string | null) {
    // Use an explicit canoe default so editorial and planner requests agree.
    let vesselType;
    if (vesselTypeId) {
      const { data: vt, error: vesselError } = await supabase
        .from('vessel_types')
        .select('*')
        .eq('id', vesselTypeId)
        .maybeSingle();
      if (vesselError) throw new RouteEstimateError('Could not look up the vessel type', 500);
      if (!vt) throw new RouteEstimateError('Vessel type not found', 404);
      vesselType = vt;
    }

    if (!vesselType) {
      const { data: defaultVessel, error: defaultVesselError } = await supabase
        .from('vessel_types')
        .select('*')
        .eq('slug', 'canoe')
        .maybeSingle();
      if (defaultVesselError) throw new RouteEstimateError('Could not look up the vessel type', 500);
      vesselType = defaultVessel;
    }

    if (!vesselType) {
      throw new RouteEstimateError('Vessel type not found', 404);
    }

    return vesselType;
}

/** Read-only route calculation shared by planners, chat, embeds and social.
 * Resolves the exact endpoints, vessel, segment gauges and published times once.
 * Does not calculate shuttles, write caches or save plans.
 */
export async function estimateRoute(supabase: SupabaseClient<Database>, {
  riverId, startId, endId, vesselTypeId, startRiverMile, mode = 'today',
}: { riverId: string; startId: string; endId: string; vesselTypeId?: string | null; startRiverMile?: number; mode?: 'today' | 'typical' }, providers = { fetchGaugeReadings, fetchDailyStatistics }, context = createRouteEstimateContext(supabase)) {
    // Get access points. The resolver is the only thing that decides whether a
    // float may be built from these two ids: it requires both to be approved,
    // both to be float endpoints (so a park with no ramp is refused rather than
    // merely hidden by the UI), and both to be on THIS river — which this route
    // never checked, though `riverId` was already in hand above.
    const [river, vesselType, endpoints] = await Promise.all([
      context.river(riverId),
      context.vessel(vesselTypeId),
      resolveFloatEndpoints<AccessPointRow>(supabase, {
        riverId, putInId: startId, takeOutId: endId,
      }),
    ]);

    if (!endpoints.ok) {
      throw new RouteEstimateError(endpoints.detail, endpointFailureStatus(endpoints.reason));
    }

    const { putIn, takeOut } = endpoints;

    if (!putIn || !takeOut) {
      throw new RouteEstimateError('Invalid access points', 400);
    }

    // Geometry may be cached by public callers; endpoint eligibility and all
    // flow/safety checks still execute for every estimate.
    const segmentData = await context.segment(startId, endId);
    let distanceMiles = segmentData.distance_miles != null ? parseFloat(String(segmentData.distance_miles)) : NaN;
    let putInMile = segmentData.start_river_mile != null ? parseFloat(String(segmentData.start_river_mile)) : NaN;

    if (isNaN(distanceMiles) || distanceMiles <= 0) {
      throw new RouteEstimateError('Could not calculate distance between access points', 500);
    }

    // A location start is bounded by two validated access points. Use its own
    // mile for gauge selection and remaining distance, never the upstream launch.
    if (startRiverMile !== undefined) {
      const endMile = Number(segmentData.end_river_mile);
      if (!Number.isFinite(startRiverMile) || !Number.isFinite(putInMile) || !Number.isFinite(endMile) ||
          startRiverMile < putInMile || startRiverMile >= endMile) {
        throw new RouteEstimateError('Starting position is outside this float stretch', 400);
      }
      distanceMiles = endMile - startRiverMile;
      putInMile = startRiverMile;
    }

    // Get put-in coordinates for segment-aware gauge selection (fallback)
    // Use location_orig first — location_snap is snapped to simplified seed geometry
    const putInCoords = startRiverMile !== undefined ? undefined : (putIn.location_orig as { coordinates?: number[] } | null)?.coordinates
      || (putIn.location_snap as { coordinates?: number[] } | null)?.coordinates;

    // Typical estimates are explicitly independent of today's water.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let condition: any;
    let conditionCode: ConditionCode = 'flowing';
    let ratingStatus: ConditionAvailability['ratingStatus'] = 'unknown';
    let measurementUnit: 'ft' | 'cfs' | undefined;
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
    if (conditionCode !== 'unknown' && conditionCode !== 'dangerous') ratingStatus = 'rated';
    measurementUnit = condition?.threshold_unit;

    // Unknown can mean an unrated gauge or missing readings. The shared
    // classifier must preserve unknown when a fresh reading has no ladder.
    if (conditionCode === 'unknown' || !condition?.gauge_height_ft) {
      // Get gauge info for this river (segment-aware or primary)
      const gaugeUsgsSiteId = condition?.gauge_usgs_id;

      if (gaugeUsgsSiteId) {
        // Fetch live USGS reading
        const usgsReadings = await providers.fetchGaugeReadings([gaugeUsgsSiteId]);
        const usgsReading = usgsReadings.find(r => r.siteId === gaugeUsgsSiteId);

        // Rating metadata is needed even when the gauge has no observation.
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
          ratingStatus = dbRatingStatus(gaugeThresholds);
          measurementUnit = gaugeThresholds.threshold_unit === 'cfs' ? 'cfs' : 'ft';
        }
        if (gaugeThresholds && usgsReading && (usgsReading.gaugeHeightFt != null || usgsReading.dischargeCfs != null)) {
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
            threshold_unit: measurementUnit,
            reading_timestamp: usgsReading.readingTimestamp,
            reading_age_hours: readingAgeHours,
            accuracy_warning: stale || qual.suspect,
            accuracy_warning_reason: qual.suspect
              ? qual.note
              : stale ? `Reading is ${Math.round(readingAgeHours!)} hours old` : null,
          };
          conditionCode = computed.code;
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
          ratingStatus = dbRatingStatus(primaryGauge);
          measurementUnit = primaryGauge.threshold_unit === 'cfs' ? 'cfs' : 'ft';
          const gaugeStation = Array.isArray(primaryGauge.gauge_stations)
            ? primaryGauge.gauge_stations[0]
            : primaryGauge.gauge_stations;
          const usgsSiteId = gaugeStation?.usgs_site_id;

          if (usgsSiteId) {
            const usgsReadings = await providers.fetchGaugeReadings([usgsSiteId]);
            const usgsReading = usgsReadings.find(r => r.siteId === usgsSiteId);

            if (usgsReading && (usgsReading.gaugeHeightFt != null || usgsReading.dischargeCfs != null)) {
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
                threshold_unit: measurementUnit,
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
      const spanMinMile = putInMile;
      const spanMaxMile = Math.max(parseFloat(String(segmentData.start_river_mile)), parseFloat(String(segmentData.end_river_mile)));

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
    const { data: segmentTime } = startRiverMile !== undefined ? { data: null } : await (supabase.rpc as any)('get_segment_float_time', {
      p_put_in_id: startId,
      p_take_out_id: endId,
      p_vessel_type: vesselType.slug,
    });

    const withholdReason = floatTimeWithholding(conditionCode, river.river_type as ReachRiverType | null);
    const estimateBasis: 'today' | 'typical' = mode === 'typical' || conditionCode === 'unknown' ? 'typical' : 'today';
    const st = segmentTime?.[0];
    const published = st ? { min: st.time_min_minutes, max: st.time_max_minutes, minutes: st.time_avg_minutes } : null;
    const { data: characteristics } = withholdReason ? { data: null } : await supabase.from('river_characteristics')
      .select('speed_curve').eq('river_id', riverId).maybeSingle();
    const floatTimeResult = calculateTripDuration({
      miles: distanceMiles,
      speeds: { speedLowWater, speedNormal, speedHighWater },
      condition: conditionCode,
      published,
      options: {
        dischargeCfs: estimateBasis === 'today' ? dischargeCfs : null,
        refCfs: estimateBasis === 'today' ? refCfs : null,
        speedCurve: characteristics?.speed_curve as SpeedCurve | null,
        riverType: river.river_type as ReachRiverType | null,
      },
    });

    const floatTime = floatTimeResult ? {
      ...floatTimeResult,
      formattedCompact: floatTimeResult.timeRange ? formatFloatTimeRangeCompact(floatTimeResult.timeRange.min, floatTimeResult.timeRange.max) : formatFloatTime(floatTimeResult.minutes),
      formatted: floatTimeResult.timeRange
        ? formatFloatTimeRange(floatTimeResult.timeRange.min, floatTimeResult.timeRange.max)
        : formatFloatTime(floatTimeResult.minutes),
    } : null;
    const observation = {
      gaugeHeightFt: toNum(condition?.gauge_height_ft), dischargeCfs: toNum(condition?.discharge_cfs),
      thresholdUnit: measurementUnit, readingTimestamp: condition?.reading_timestamp,
      readingAgeHours: condition?.reading_age_hours,
    };
    const availability = conditionAvailability({ ...observation, availability: { ratingStatus, readingStatus: 'unavailable' } });
    const conditionStatusLabel = unknownConditionLabel({ ...observation, availability });
    return { river, putIn, takeOut, vesselType, segmentData, distanceMiles, availability, conditionStatusLabel,
      condition, anchorCondition, contributingGauges, spanCheckComplete, conditionCode, dailyStats, spanWarnings, floatTimeResult, floatTime,
      withholdReason, estimateBasis, estimatedAt: new Date().toISOString() };
}
