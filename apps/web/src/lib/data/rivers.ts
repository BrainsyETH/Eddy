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
