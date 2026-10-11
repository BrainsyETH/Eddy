import type { DailyStatistics } from '@/lib/usgs/gauges';
import type { ConditionCode } from '@/types/api';
import type { ReachRiverType } from '@shared/reach-types';
import {
  calculateTripDuration,
  type PublishedTiming,
} from '@/lib/calculations/trip-duration';
import type { SpeedCurve } from '@/lib/calculations/floatTime';
import { readSnapshotStatisticsForSites } from '@/lib/usgs/percentile-snapshot';
import {
  checked,
  numeric,
  station,
  type Access,
  type DataContext,
  type River,
} from './data';
import { screeningGauge, type Screening } from './search';

export interface PublishedSegment {
  put_in_id: string | null;
  take_out_id: string | null;
  canoe_time_min: number | null;
  canoe_time_max: number | null;
  raft_time_min: number | null;
  raft_time_max: number | null;
  tube_time_min: number | null;
  tube_time_max: number | null;
}

/** Matches get_segment_float_time's vessel and reverse conventions. A kayak
 * uses the published canoe timing; do not invent a faster published trip. */
export function publishedTiming(
  rows: PublishedSegment[],
  start: string,
  end: string,
  vessel: string,
): PublishedTiming | null {
  const direct = rows.find(
    (r) => r.put_in_id === start && r.take_out_id === end,
  );
  const row =
    direct ?? rows.find((r) => r.put_in_id === end && r.take_out_id === start);
  if (!row || (!direct && vessel === 'tube')) return null;
  const key = vessel === 'raft' ? 'raft' : vessel === 'tube' ? 'tube' : 'canoe';
  const min = row[`${key}_time_min`],
    max = row[`${key}_time_max`];
  if (min == null || max == null) return null;
  const factor = direct ? 1 : 1.5;
  return {
    min: Math.round(min * factor),
    max: Math.round(max * factor),
    minutes: Math.round(Math.floor((min + max) / 2) * factor),
  };
}

/** IO is bounded per river, never per endpoint pair. Gauge observations are
 * loaded by loadScreening in a batch; historical normals use the same snapshot
 * policy as the final route estimator. Final geometry/route checks still run. */
export async function loadCandidateDuration(
  ctx: DataContext,
  river: River,
  screen: Screening,
  vesselSlug: string,
  primeStatistics?: (stats: Map<string, DailyStatistics | null>) => void,
) {
  const [vessel, metadata, characteristics, published, statistics] =
    await Promise.all([
      ctx.db
        .from('vessel_types')
        .select('*')
        .eq('slug', vesselSlug)
        .maybeSingle(),
      ctx.db
        .from('rivers')
        .select('river_type')
        .eq('id', river.id)
        .maybeSingle(),
      ctx.db
        .from('river_characteristics')
        .select('speed_curve')
        .eq('river_id', river.id)
        .maybeSingle(),
      ctx.db
        .from('float_segments')
        .select(
          'put_in_id, take_out_id, canoe_time_min, canoe_time_max, raft_time_min, raft_time_max, tube_time_min, tube_time_max',
        )
        .eq('river_id', river.id)
        .order('id')
        .limit(501),
      readSnapshotStatisticsForSites(
        ctx.db,
        screen.links.flatMap((g) =>
          station(g)?.usgs_site_id ? [station(g)!.usgs_site_id] : [],
        ),
        new Date(ctx.now),
      ),
    ]);
  primeStatistics?.(
    new Map(
      screen.links.flatMap((g) => {
        const site = station(g)?.usgs_site_id;
        return site
          ? [[site, statistics.stats.get(site) ?? null] as const]
          : [];
      }),
    ),
  );
  const boat = checked(vessel, 'vessel speeds');
  const riverData = checked(metadata, 'river type');
  const curve = checked(characteristics, 'river speed curve');
  const rows = checked(published, 'published trip times') ?? [];
  if (!boat || !riverData || rows.length > 500)
    throw new Error('Duration inputs unavailable');
  const speeds = {
    speedLowWater: Number(boat.speed_low_water),
    speedNormal: Number(boat.speed_normal),
    speedHighWater: Number(boat.speed_high_water),
  };
  const byPair = new Map<string, PublishedSegment>();
  for (const row of rows) {
    const key = `${row.put_in_id}:${row.take_out_id}`;
    if (!byPair.has(key)) byPair.set(key, row);
  }
  return (putIn: Access, takeOut: Access) => {
    const start = numeric(putIn.river_mile_downstream),
      end = numeric(takeOut.river_mile_downstream);
    if (start == null || end == null || end <= start) return null;
    const gauge = screeningGauge(start, screen.links, screen.reaches);
    const reading = gauge
      ? screen.views?.get(gauge.gauge_station_id)
      : undefined;
    const condition = (
      gauge
        ? (screen.ratings.get(gauge.gauge_station_id) ?? 'unknown')
        : 'unknown'
    ) as ConditionCode;
    const timingRow =
      byPair.get(`${putIn.id}:${takeOut.id}`) ??
      byPair.get(`${takeOut.id}:${putIn.id}`);
    return calculateTripDuration({
      miles: end - start,
      speeds,
      condition,
      published: publishedTiming(
        timingRow ? [timingRow] : [],
        putIn.id,
        takeOut.id,
        vesselSlug,
      ),
      options: {
        riverType: riverData.river_type as ReachRiverType | null,
        speedCurve: curve?.speed_curve as SpeedCurve | null,
        dischargeCfs: condition === 'unknown' ? null : reading?.dischargeCfs,
        refCfs:
          condition === 'unknown'
            ? null
            : statistics.stats.get(reading?.usgsSiteId ?? '')?.p50,
      },
    });
  };
}
