// src/lib/data/rivers.ts
// Shared server-side data fetching for rivers
// Used by both the API route and server components

import { createAdminClient } from '@/lib/supabase/admin';
import { mapConditionCode } from '@/lib/conditions';
import { riverPath } from '@/lib/navigation/river-path';
import type { RiverListItem } from '@/types/api';

export async function getRivers(): Promise<RiverListItem[]> {
  const supabase = createAdminClient();

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
