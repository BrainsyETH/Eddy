// src/lib/og/snapshot.ts
// Shared helper for OG condition cards: recent gauge heights for a sparkline.

import type { SupabaseClient } from '@supabase/supabase-js';

/** Recent gauge heights (oldest → newest), downsampled to ≤17 points for a
 *  compact trend sparkline. Returns [] when no readings are available. */
export async function recentHeights(
  supabase: SupabaseClient,
  stationId: string,
  fetchLimit = 48,
): Promise<number[]> {
  const { data } = await supabase
    .from('gauge_readings')
    .select('gauge_height_ft')
    .eq('gauge_station_id', stationId)
    .order('reading_timestamp', { ascending: false })
    .limit(fetchLimit);

  const vals = ((data ?? []) as { gauge_height_ft: string | number | null }[])
    .map((r) =>
      r.gauge_height_ft == null
        ? null
        : typeof r.gauge_height_ft === 'string'
          ? parseFloat(r.gauge_height_ft)
          : r.gauge_height_ft,
    )
    .filter((n): n is number => typeof n === 'number' && !Number.isNaN(n))
    .reverse();

  if (vals.length <= 17) return vals;
  const step = vals.length / 16;
  const out: number[] = [];
  for (let i = 0; i < 16; i++) out.push(vals[Math.floor(i * step)]);
  out.push(vals[vals.length - 1]);
  return out;
}
