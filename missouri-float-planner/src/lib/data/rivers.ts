// src/lib/data/rivers.ts
// Shared server-side data fetching for rivers
// Used by both the API route and server components

import { createAdminClient } from '@/lib/supabase/admin';
import { mapConditionCode } from '@/lib/conditions';
import { computeTrend, type GaugeUnit } from '@/lib/gauge-trend';
import { riverPath } from '@/lib/navigation/river-path';
import type { RiverListItem } from '@/types/api';

/**
 * How far back to pull readings for the row-level trend.
 *
 * computeTrend targets a 6h comparison, picking the reading nearest that mark.
 * Fetching exactly 6h would leave it nothing older than the target on a gauge
 * that reports sparsely, so the window carries margin.
 */
const TREND_LOOKBACK_HOURS = 9;

/**
 * Recent readings per gauge station, in two queries rather than one per river.
 *
 * getRivers already pays a per-river cost for the access-point count and the
 * condition RPC; adding a third fan-out for history would have put ~72 queries
 * behind a CDN-cached list endpoint. These two batch calls are flat regardless
 * of how many rivers are onboarded.
 */
async function fetchTrendInputs(supabase: ReturnType<typeof createAdminClient>) {
  const { data: primaryGauges } = await supabase
    .from('river_gauges')
    .select('river_id, gauge_station_id')
    .eq('is_primary', true);

  const stationByRiver = new Map<string, string>();
  for (const row of primaryGauges ?? []) {
    if (row.river_id && row.gauge_station_id) stationByRiver.set(row.river_id, row.gauge_station_id);
  }
  if (stationByRiver.size === 0) return { stationByRiver, readingsByStation: new Map() };

  const since = new Date(Date.now() - TREND_LOOKBACK_HOURS * 3_600_000).toISOString();
  const { data: rows } = await supabase
    .from('gauge_readings')
    .select('gauge_station_id, reading_timestamp, gauge_height_ft, discharge_cfs')
    .in('gauge_station_id', [...new Set(stationByRiver.values())])
    .gte('reading_timestamp', since)
    // computeTrend documents that it expects chronologically ascending input and
    // treats the LAST element as the most recent. Sorting here, not there.
    .order('reading_timestamp', { ascending: true });

  const readingsByStation = new Map<
    string,
    Array<{ timestamp: string; gaugeHeightFt: number | null; dischargeCfs: number | null }>
  >();
  for (const row of rows ?? []) {
    const list = readingsByStation.get(row.gauge_station_id) ?? [];
    list.push({
      timestamp: row.reading_timestamp,
      gaugeHeightFt: row.gauge_height_ft == null ? null : Number(row.gauge_height_ft),
      dischargeCfs: row.discharge_cfs == null ? null : Number(row.discharge_cfs),
    });
    readingsByStation.set(row.gauge_station_id, list);
  }

  return { stationByRiver, readingsByStation };
}

export async function getRivers(): Promise<RiverListItem[]> {
  const supabase = createAdminClient();
  const { stationByRiver, readingsByStation } = await fetchTrendInputs(supabase);

  // Try with active filter first, fall back to all rivers if column doesn't exist.
  // access_points is a LEFT join (not !inner): an active river with zero access
  // points still belongs in the list — it shows accessPointCount 0 until a human
  // places put-ins/take-outs in the geography editor. Previously the inner join
  // silently hid every newly-onboarded river until its first access point.
  let rivers;
  let error;

  const activeResult = await supabase
    .from('rivers')
    .select(`
      id,
      name,
      slug,
      state,
      river_type,
      length_miles,
      description,
      difficulty_rating,
      region,
      access_points(id)
    `)
    .eq('active', true)
    .order('name', { ascending: true });

  if (activeResult.error?.message?.includes('active')) {
    const fallbackResult = await supabase
      .from('rivers')
      .select(`
        id,
        name,
        slug,
        state,
        river_type,
        length_miles,
        description,
        difficulty_rating,
        region,
        access_points(id)
      `)
      .order('name', { ascending: true });

    rivers = fallbackResult.data;
    error = fallbackResult.error;
  } else {
    rivers = activeResult.data;
    error = activeResult.error;
  }

  if (error) {
    console.error('Error fetching rivers:', error);
    return [];
  }

  // Get current conditions for each river
  const riversWithConditions = await Promise.all(
    (rivers || []).map(async (river) => {
      const { count } = await supabase
        .from('access_points')
        .select('*', { count: 'exact', head: true })
        .eq('river_id', river.id)
        .eq('approved', true);

      const { data: conditionData } = await supabase.rpc('get_river_condition', {
        p_river_id: river.id,
      });

      const condition = conditionData?.[0];

      // The unit is not cosmetic: it decides WHICH reading a client is allowed to
      // show. A null unit means we could not establish one, and a consumer must
      // then show no reading rather than guess — see primaryReading() in eddy-ios.
      const thresholdUnit =
        condition?.threshold_unit === 'cfs' || condition?.threshold_unit === 'ft'
          ? (condition.threshold_unit as GaugeUnit)
          : null;

      // Trend is computed against the SAME unit the condition was computed from.
      // Trending stage while grading on discharge would let the row say "falling"
      // about a number it isn't showing.
      const stationId = stationByRiver.get(river.id);
      const trend = thresholdUnit && stationId
        ? computeTrend(readingsByStation.get(stationId), thresholdUnit, 6)
        : null;

      return {
        id: river.id,
        name: river.name,
        slug: river.slug,
        state: river.state || 'MO',
        riverType: river.river_type ?? null,
        path: riverPath(river.state || 'MO', river.slug),
        lengthMiles: parseFloat(river.length_miles),
        description: river.description,
        difficultyRating: river.difficulty_rating,
        region: river.region,
        accessPointCount: count || 0,
        currentCondition: condition
          ? {
              label: condition.condition_label,
              code: mapConditionCode(condition.condition_code),
              thresholdUnit,
              gaugeHeightFt:
                condition.gauge_height_ft == null ? null : Number(condition.gauge_height_ft),
              dischargeCfs:
                condition.discharge_cfs == null ? null : Number(condition.discharge_cfs),
              readingAgeHours:
                condition.reading_age_hours == null ? null : Number(condition.reading_age_hours),
              // Words only. GaugeTrend's `delta` is deliberately dropped here —
              // it is unit-dependent and would be meaningless on a cfs river.
              trend: trend
                ? {
                    direction: trend.direction,
                    label: trend.label,
                    windowHours: trend.windowHours,
                  }
                : null,
            }
          : null,
      };
    })
  );

  return riversWithConditions;
}

/**
 * A river's most recent published guide post: its blog slug + featured image.
 */
export interface RiverGuide {
  postSlug: string;
  image: string | null;
}

/**
 * Fetches the most recent published guide post for each given river slug
 * (blog_posts.river_slug), returning its blog slug + featured image. Mirrors the
 * guide-post lookup on the river detail page. Returns `null` for rivers without
 * a published post. Never throws — callers fall back to the blog index /
 * a placeholder image.
 */
export async function getRiverGuides(
  slugs: string[],
): Promise<Record<string, RiverGuide | null>> {
  const guides: Record<string, RiverGuide | null> = {};
  for (const slug of slugs) guides[slug] = null;
  if (slugs.length === 0) return guides;

  try {
    const supabase = createAdminClient();

    const { data: posts, error } = await supabase
      .from('blog_posts')
      .select('river_slug, slug, featured_image_url, published_at')
      .in('river_slug', slugs)
      .eq('status', 'published')
      .lte('published_at', new Date().toISOString())
      .order('published_at', { ascending: false });
    if (error || !posts?.length) return guides;

    for (const post of posts) {
      const riverSlug = post.river_slug as string | null;
      // Keep the most recent post per river (results are ordered desc).
      if (!riverSlug || guides[riverSlug] || typeof post.slug !== 'string' || !post.slug) continue;
      const image =
        typeof post.featured_image_url === 'string' && post.featured_image_url
          ? post.featured_image_url
          : null;
      guides[riverSlug] = { postSlug: post.slug, image };
    }
    return guides;
  } catch {
    return guides;
  }
}
