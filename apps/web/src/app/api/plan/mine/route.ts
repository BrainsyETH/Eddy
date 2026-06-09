// src/app/api/plan/mine/route.ts
// GET /api/plan/mine - Saved float plans for the signed-in user.
// Accepts web cookie sessions and mobile Authorization: Bearer tokens.

import { NextRequest, NextResponse } from 'next/server';
import { createClientForRequest } from '@/lib/supabase/request';
import type { MyPlansResponse, SavedPlanSummary } from '@/types/api';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClientForRequest(request);
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
    }

    const { data, error } = await supabase
      .from('float_plans')
      .select(
        `
        short_code,
        created_at,
        distance_miles,
        estimated_float_minutes,
        condition_at_creation,
        rivers ( name ),
        start_access:access_points!float_plans_start_access_id_fkey ( name ),
        end_access:access_points!float_plans_end_access_id_fkey ( name )
      `
      )
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) {
      console.error('Error fetching saved plans:', error);
      return NextResponse.json(
        { error: 'Could not load saved plans' },
        { status: 500 }
      );
    }

    // Supabase nests joined rows; flatten to the response shape.
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const plans: SavedPlanSummary[] = (data ?? []).map((row: any) => ({
      shortCode: row.short_code,
      createdAt: row.created_at,
      riverName: row.rivers?.name ?? null,
      startName: row.start_access?.name ?? null,
      endName: row.end_access?.name ?? null,
      distanceMiles: row.distance_miles,
      estimatedFloatMinutes: row.estimated_float_minutes,
      conditionAtCreation: row.condition_at_creation,
    }));
    /* eslint-enable @typescript-eslint/no-explicit-any */

    return NextResponse.json<MyPlansResponse>({ plans });
  } catch (error) {
    console.error('Error in /api/plan/mine:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
