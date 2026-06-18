// src/lib/data/rivers.ts
// Shared server-side data fetching for rivers
// Used by both the API route and server components

import { createAdminClient } from '@/lib/supabase/admin';
import { mapConditionCode } from '@/lib/conditions';
import type { RiverListItem } from '@/types/api';

export async function getRivers(): Promise<RiverListItem[]> {
  const supabase = createAdminClient();

  // Try with active filter first, fall back to all rivers if column doesn't exist
  let rivers;
  let error;

  const activeResult = await supabase
    .from('rivers')
    .select(`
      id,
      name,
      slug,
      length_miles,
      description,
      difficulty_rating,
      region,
      access_points!inner(id)
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
        length_miles,
        description,
        difficulty_rating,
        region,
        access_points!inner(id)
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

      return {
        id: river.id,
        name: river.name,
        slug: river.slug,
        lengthMiles: parseFloat(river.length_miles),
        description: river.description,
        difficultyRating: river.difficulty_rating,
        region: river.region,
        accessPointCount: count || 0,
        currentCondition: condition
          ? {
              label: condition.condition_label,
              code: mapConditionCode(condition.condition_code),
            }
          : null,
      };
    })
  );

  return riversWithConditions;
}

/**
 * Fetches a representative hero image (the first access-point photo, ordered by
 * river mile) for each given river slug. Mirrors the image logic used on the
 * river detail page. Returns a `slug -> imageUrl` map with `null` for rivers
 * that have no access-point photos yet. Never throws — callers fall back to a
 * placeholder.
 */
export async function getRiverHeroImages(
  slugs: string[],
): Promise<Record<string, string | null>> {
  const images: Record<string, string | null> = {};
  for (const slug of slugs) images[slug] = null;
  if (slugs.length === 0) return images;

  try {
    const supabase = createAdminClient();

    const { data: rivers, error: riversError } = await supabase
      .from('rivers')
      .select('id, slug')
      .in('slug', slugs);
    if (riversError || !rivers?.length) return images;

    const idToSlug = new Map<string, string>(rivers.map((r) => [r.id, r.slug]));

    const { data: accessPoints, error: apError } = await supabase
      .from('access_points')
      .select('river_id, image_urls, river_mile_downstream')
      .eq('approved', true)
      .in('river_id', rivers.map((r) => r.id))
      .not('image_urls', 'is', null)
      .order('river_mile_downstream', { ascending: true, nullsFirst: false });
    if (apError || !accessPoints?.length) return images;

    for (const ap of accessPoints) {
      const slug = idToSlug.get(ap.river_id);
      if (!slug || images[slug]) continue; // keep the first (lowest-mile) image
      const firstImage = Array.isArray(ap.image_urls)
        ? ap.image_urls.find((u: unknown): u is string => typeof u === 'string' && u.length > 0)
        : null;
      if (firstImage) images[slug] = firstImage;
    }
    return images;
  } catch {
    return images;
  }
}
