// src/app/api/rivers/route.ts
// GET /api/rivers - List all rivers

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { mapConditionCode } from '@/lib/conditions';
import type { RiversResponse } from '@/types/api';

// Force dynamic rendering (uses cookies for Supabase)
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const supabase = await createClient();

    // Get all rivers with access point counts
    // Try with active filter first, fall back to all rivers if column doesn't exist
    let rivers;
    let error;

    // First try with active filter (for databases with the migration applied)
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
      // Column doesn't exist yet, fetch all rivers
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
      return NextResponse.json(
        { error: 'Could not fetch rivers' },
        { status: 500 }
      );
    }

    // Get current conditions for each river
    const riversWithConditions = await Promise.all(
      (rivers || []).map(async (river) => {
        // Count approved access points
        const { count } = await supabase
          .from('access_points')
          .select('*', { count: 'exact', head: true })
          .eq('river_id', river.id)
          .eq('approved', true);

        // Get current condition
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

    const response: RiversResponse = {
      rivers: riversWithConditions,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Error in rivers endpoint:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
