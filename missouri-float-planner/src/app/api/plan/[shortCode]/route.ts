// src/app/api/plan/[shortCode]/route.ts
// GET /api/plan/[shortCode] - Get a saved plan by short code

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { PlanResponse } from '@/types/api';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ shortCode: string }> }
) {
  try {
    const { shortCode } = await params;
    const supabase = await createClient();

    // Get saved plan
    const { data: savedPlan, error: planError } = await supabase
      .from('float_plans')
      .select('*')
      .eq('short_code', shortCode)
      .single();

    if (planError || !savedPlan) {
      return NextResponse.json(
        { error: 'Plan not found' },
        { status: 404 }
      );
    }

    // Update view count
    await supabase
      .from('float_plans')
      .update({
        view_count: (savedPlan.view_count || 0) + 1,
        last_viewed_at: new Date().toISOString(),
      })
      .eq('id', savedPlan.id);

    // Recalculate plan with current data
    const planUrl = new URL('/api/plan', request.nextUrl.origin);
    planUrl.searchParams.set('riverId', savedPlan.river_id);
    planUrl.searchParams.set('startId', savedPlan.start_access_id);
    planUrl.searchParams.set('endId', savedPlan.end_access_id);
    planUrl.searchParams.set('vesselTypeId', savedPlan.vessel_type_id);

    const planResponse = await fetch(planUrl.toString());

    if (!planResponse.ok) {
      return NextResponse.json(
        { error: 'Could not recalculate plan' },
        { status: 500 }
      );
    }

    const { plan } = await planResponse.json();

    return NextResponse.json<PlanResponse>({ plan });
  } catch (error) {
    console.error('Error fetching saved plan:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
