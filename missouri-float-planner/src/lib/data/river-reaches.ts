// src/lib/data/river-reaches.ts
// Server-side reader for a river's reaches (river_sections), for rivers whose
// halves behave differently enough that one condition badge would be a lie.
//
// WHY THIS EXISTS: the Black River is one row with Clearwater Dam in the middle
// of it. Above the dam is a spring-fed float out of Lesterville; below it is a
// flood-control tailwater that rises on a release schedule with no local rain.
// rivers.river_type can only say one of those. Migration 00204 lets a
// river_sections row carry its own mile range, gauge and river_type, so the
// difference can be shown *inside* the one river page rather than by splitting
// the river into two rows — a river should stay one page, one slug, one search
// result.
//
// Returns null for the ~24 rivers with no reach data, which is most of them.

import { createAdminClient } from '@/lib/supabase/admin';
import type { ConditionCode } from '@/types/api';
import type { RiverReach } from '@shared/reach-types';
import type { RiverType } from '@/lib/rivers/context';

// The wire shape lives in shared/ so eddy-ios can import the same definition
// rather than restating it — see that file's header for why it cannot live in
// packages/eddy-types. Re-exported here so existing imports keep working.
export type { RiverReach, ReachReport, RiverReachesResponse } from '@shared/reach-types';

/**
 * A representative mile inside a reach, for the condition lookup. Any mile in
 * range resolves to the reach's own gauge once primary_gauge_station_id is set;
 * this just has to land inside the bounds.
 */
function probeMile(start: number | null, end: number | null): number | null {
  if (start != null && end != null) return (start + end) / 2;
  if (start != null) return start + 1;
  if (end != null) return Math.max(0, end - 1);
  return null;
}

/**
 * Reaches for a river, or null when there is no hydrological difference to show.
 *
 * GATED ON river_type, NOT on section count. 18 rivers carry river_sections and
 * most use them as a float-segment catalogue — the Big Piney has eight, from
 * "mineral-springs-to-boiling-spring" down. Those are put-in/take-out pairs, not
 * different water, and listing them here would bury the one case that matters
 * under seven that do not. A reach earns this panel only by declaring its own
 * river_type, which today only the Black below Clearwater Dam does.
 */
export async function fetchRiverReaches(
  riverId: string,
  riverSlug: string,
  riverType: RiverType,
): Promise<RiverReach[] | null> {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from('river_sections')
    .select('section_slug, name, description, sort_order, river_mile_start, river_mile_end, river_type, primary_gauge_station_id')
    .eq('river_id', riverId)
    .order('sort_order');

  if (error || !data || data.length < 2) return null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const anyReachDiffers = data.some((row: any) => row.river_type != null && row.river_type !== riverType);
  if (!anyReachDiffers) return null;

  const reaches = await Promise.all(
    data.map(async (row) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const r = row as any;
      const start = r.river_mile_start != null ? Number(r.river_mile_start) : null;
      const end = r.river_mile_end != null ? Number(r.river_mile_end) : null;
      const mile = probeMile(start, end);

      let cond: {
        condition_code?: string;
        condition_label?: string;
        gauge_name?: string;
        gauge_height_ft?: number | null;
        discharge_cfs?: number | null;
      } | null = null;

      // Only reaches with bounds can be read separately; an unbounded reach has
      // no put-in mile to resolve and would just echo the whole-river gauge.
      if (mile != null) {
        cond = await (supabase.rpc as never as (
          fn: string,
          args: Record<string, unknown>,
        ) => Promise<{ data: unknown[] | null }>)('get_river_condition_segment', {
          p_river_id: riverId,
          p_put_in_mile: mile,
        })
          .then((res) => (res.data?.[0] ?? null) as typeof cond)
          .catch(() => null);
      }

      // Same shape as /api/eddy-update/[riverSlug]?section= — newest non-expired
      // row for this section. Read here rather than client-side so it lands in
      // the first paint, inside the page's revalidate window.
      const { data: reportRow } = await supabase
        .from('eddy_updates')
        .select('quote_text, summary_text, generated_at')
        .eq('river_slug', riverSlug)
        .eq('section_slug', r.section_slug)
        .gt('expires_at', new Date().toISOString())
        .order('generated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      return {
        sectionSlug: r.section_slug,
        name: r.name,
        description: r.description ?? null,
        riverType: (r.river_type ?? riverType) as RiverType,
        differsFromRiver: r.river_type != null && r.river_type !== riverType,
        riverMileStart: start,
        riverMileEnd: end,
        conditionCode: (cond?.condition_code ?? 'unknown') as ConditionCode,
        conditionLabel: cond?.condition_label ?? null,
        gaugeName: cond?.gauge_name ?? null,
        gaugeHeightFt: cond?.gauge_height_ft ?? null,
        dischargeCfs: cond?.discharge_cfs ?? null,
        report: reportRow?.quote_text
          ? {
              summaryText: reportRow.summary_text ?? null,
              quoteText: reportRow.quote_text,
              generatedAt: reportRow.generated_at,
            }
          : null,
      } satisfies RiverReach;
    }),
  );

  return reaches;
}

/** Short human label for a hydrology type, for the reach chip. */
export function riverTypeLabel(type: RiverType): string {
  switch (type) {
    case 'dam_tailwater':
      return 'Dam-controlled';
    case 'spring_fed_float':
      return 'Spring-fed';
    case 'rain_flashy':
      return 'Rain-driven';
    case 'snowmelt':
      return 'Snowmelt';
    case 'flatwater':
      return 'Flatwater';
    default:
      return type;
  }
}
