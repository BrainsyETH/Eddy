// src/lib/data/rivers.ts
// Shared server-side data fetching for rivers
// Used by both the API route and server components

import { createAdminClient } from '@/lib/supabase/admin';
import { mapConditionCode } from '@/lib/conditions';
import { computeTrend, type GaugeUnit } from '@shared/gauge-trend';
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
 * Adding a per-river fan-out for history would have put ~72 queries behind a
 * CDN-cached list endpoint. These two batch calls are flat regardless of how
 * many rivers are onboarded — as is the access-point count beside them now.
 * The condition RPC is the only per-river call left.
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

/**
 * One row of get_river_condition, whichever function produced it.
 *
 * Structural rather than the generated Database type: `get_river_conditions`
 * postdates the last `npm run db:gen-types` run, and the six existing call
 * sites for the single-river RPC already cast for exactly that reason.
 */
interface ConditionRow {
  condition_label: string | null;
  condition_code: string | null;
  gauge_height_ft: number | string | null;
  discharge_cfs: number | string | null;
  reading_age_hours: number | string | null;
  threshold_unit: string | null;
}

/**
 * Every river's condition in ONE call — or null when the database has not been
 * given the function yet.
 *
 * ── Why null and not a throw ──────────────────────────────────────────────
 *
 * A deploy and a migration are two separate acts here: `make check-db` is
 * outside `make check` on purpose, because it needs credentials CI does not
 * have. So a build carrying this code can meet a database that has not run
 * 20260831120000 yet, and the honest behaviour then is to fall back to the
 * per-river RPC below — twenty-four calls, as before, rather than a rivers
 * list with no conditions on it at all. Same posture as fetchStarredGauges in
 * the iOS client, and for the same reason.
 *
 * ANY failure returns null, not just a missing-function error. The fallback is
 * correct for every one of them and cheap enough to be worth not having to
 * classify PostgREST's error strings.
 */
async function fetchConditionsByRiver(
  supabase: ReturnType<typeof createAdminClient>,
): Promise<Map<string, ConditionRow> | null> {
  try {
    // The same cast the six single-river call sites carry, for the same
    // reason: the function postdates the last `npm run db:gen-types` run.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase.rpc as any)('get_river_conditions');
    if (error || !Array.isArray(data)) return null;

    const byRiver = new Map<string, ConditionRow>();
    for (const row of data as (ConditionRow & { river_id: string | null })[]) {
      if (row.river_id) byRiver.set(row.river_id, row);
    }
    // An empty result is treated as "the function is not there", not as "no
    // river has a condition". The second is a state this database has never
    // been in — every active river has a rated primary gauge — and reading it
    // as an answer would blank every card on the list in silence.
    return byRiver.size > 0 ? byRiver : null;
  } catch {
    return null;
  }
}

/**
 * Approved access points per river, as ONE query rather than one per river.
 *
 * This was a `head: true` count inside the per-river map — 24 round trips to
 * answer a question with 312 rows behind it, every one of them waiting on the
 * connection pool alongside the condition RPC beside it.
 *
 * PostgREST has no GROUP BY, so the ids come back and are counted here. One
 * column, one row per access point — 312 of them today.
 *
 * PAGED, because PostgREST caps a response and a cap here would not look like
 * an error: it would look like the rivers at the end of the alphabet lost their
 * put-ins. A silent undercount is the one failure mode a count has, so the loop
 * runs until a page comes back short.
 */
const ACCESS_POINT_PAGE = 1000;

async function fetchApprovedAccessPointCounts(
  supabase: ReturnType<typeof createAdminClient>,
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();

  for (let from = 0; ; from += ACCESS_POINT_PAGE) {
    const { data, error } = await supabase
      .from('access_points')
      .select('river_id')
      .eq('approved', true)
      // A total order, or a row can appear on two pages and be counted twice
      // while another is never seen at all.
      .order('id', { ascending: true })
      .range(from, from + ACCESS_POINT_PAGE - 1);

    if (error) {
      // A count is decoration next to the condition; a river with an unknown
      // number of put-ins still belongs in the list. Callers see 0, which is
      // what the failed per-river count returned too.
      console.error('Error counting access points:', error);
      return counts;
    }

    const rows = data ?? [];
    for (const row of rows) {
      const riverId = row.river_id as string | null;
      if (riverId) counts.set(riverId, (counts.get(riverId) ?? 0) + 1);
    }

    if (rows.length < ACCESS_POINT_PAGE) return counts;
  }
}

export async function getRivers(): Promise<RiverListItem[]> {
  const supabase = createAdminClient();
  const [{ stationByRiver, readingsByStation }, accessPointCounts, conditionsByRiver] =
    await Promise.all([
      fetchTrendInputs(supabase),
      fetchApprovedAccessPointCounts(supabase),
      fetchConditionsByRiver(supabase),
    ]);

  // Try with active filter first, fall back to all rivers if column doesn't exist.
  //
  // Access points are NOT joined here. They used to be — `access_points(id)`,
  // every id for every river — and nothing ever read the result: the count came
  // from a separate per-river query beside it. A river with zero approved
  // access points still belongs in the list either way, which is what the old
  // LEFT join (not !inner) was protecting, and a Map lookup that misses simply
  // yields 0. See fetchApprovedAccessPointCounts.
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
      region
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
        region
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

  // Get current conditions for each river — from the ONE batched call above
  // when the database has it, and from a call per river when it does not.
  //
  // The fan-out below is what this endpoint used to do unconditionally, and it
  // is why the rivers list was the slowest read route in the app: twenty-four
  // statements, each taking a pooled connection while the rest queued for one.
  // See fetchConditionsByRiver, and migration 20260831120000 for the function
  // that replaced it.
  const riversWithConditions = await Promise.all(
    (rivers || []).map(async (river) => {
      const condition = conditionsByRiver
        ? conditionsByRiver.get(river.id)
        : (await supabase.rpc('get_river_condition', { p_river_id: river.id })).data?.[0];

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
        accessPointCount: accessPointCounts.get(river.id) ?? 0,
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
