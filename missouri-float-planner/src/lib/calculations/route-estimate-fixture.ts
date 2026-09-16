/** Offline DB/provider fixture for route-service regression and outfitter checks.
 * Published miles are fixture inputs, never a claim about production geometry.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';
import type { ConditionCode } from '@/types/api';
import type { DailyStatistics } from '@/lib/usgs/gauges';
import { estimateRoute } from './route-estimate';

export function routeFixture(options: {
  miles?: number; vessel?: 'canoe' | 'raft' | 'tube'; condition?: ConditionCode;
  riverType?: string; published?: { min: number; max: number };
  discharge?: number; reference?: number; wrongRiver?: boolean;
  speedCurve?: { low: number; too_low: number };
} = {}) {
  const calls: string[] = [];
  const slug = options.vessel ?? 'canoe';
  const speeds = { canoe: [2, 2.5, 3.5], raft: [1.5, 2, 2.5], tube: [1, 1.5, 2] }[slug];
  const endpoints = ['put-in', 'take-out'].map((id, i) => ({ id, name: id,
    river_id: options.wrongRiver && i ? 'other' : 'river', approved: true, is_float_endpoint: true,
    river_mile_downstream: i * (options.miles ?? 8), location_orig: { coordinates: [-91, 37] } }));
  const rows: Record<string, unknown> = {
    rivers: { id: 'river', slug: 'fixture', name: 'Fixture river', river_type: options.riverType ?? 'spring_fed_float' },
    access_points: endpoints,
    vessel_types: { id: slug, slug, name: slug, speed_low_water: speeds[0], speed_normal: speeds[1], speed_high_water: speeds[2] },
    river_gauges: [], river_characteristics: { speed_curve: options.speedCurve ?? null },
  };
  const client = {
    from(table: string) {
      calls.push(table);
      const query = { select: () => query, eq: (column: string, value: unknown) => {
          if (table === 'vessel_types' && value !== slug) throw new Error(`Wrong vessel lookup: ${column}=${value}`);
          return query;
        }, in: () => query,
        order: () => query, limit: () => query, not: () => query,
        single: () => Promise.resolve({ data: rows[table], error: null }),
        maybeSingle: () => Promise.resolve({ data: rows[table], error: null }),
        then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: rows[table], error: null }).then(resolve),
      };
      return query;
    },
    async rpc(name: string, args: Record<string, unknown>) {
      calls.push(name);
      if (name === 'get_float_segment') return { data: [{ distance_miles: String(options.miles ?? 8), start_river_mile: '0', end_river_mile: String(options.miles ?? 8) }] };
      if (name === 'get_river_condition_segment') return { data: [{ condition_code: options.condition ?? 'flowing', gauge_height_ft: 3, discharge_cfs: options.discharge ?? null, gauge_usgs_id: 'fixture-gauge' }] };
      if (name === 'get_segment_float_time') {
        if (args.p_vessel_type !== slug) throw new Error('Wrong vessel sent to published-time lookup');
        return { data: options.published ? [{ time_min_minutes: options.published.min, time_max_minutes: options.published.max, time_avg_minutes: (options.published.min + options.published.max) / 2 }] : [] };
      }
      throw new Error(`Unexpected RPC: ${name}`);
    },
  } as unknown as SupabaseClient<Database>;
  const providers = {
    fetchGaugeReadings: async () => { throw new Error('Unexpected live reading fallback'); },
    fetchDailyStatistics: async () => {
      calls.push('statistics');
      return options.reference ? { p50: options.reference } as DailyStatistics : null;
    },
  };
  return { calls, estimate: (mode: 'today' | 'typical' = 'today') => estimateRoute(client, {
    riverId: 'river', startId: 'put-in', endId: 'take-out', mode, vesselTypeId: options.vessel,
  }, providers) };
}
