// src/app/api/plan/[shortCode]/route.ts
// GET /api/plan/[shortCode] - Get a saved plan by short code

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { PlanResponse } from '@/types/api';

// Force dynamic rendering (uses cookies for Supabase)
export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ shortCode: string }> }
) {
  try {
    const { shortCode } = await params;
    const supabase = await createClient();

    // Share-code lookup goes through the SECURITY DEFINER RPC (00184):
    // owned plans are no longer world-SELECTable, and the RPC also bumps
    // view_count atomically (the old anon-client UPDATE silently no-oped
    // once the permissive UPDATE policy was dropped).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: planRows, error: planError } = await (supabase.rpc as any)(
      'get_float_plan_by_code',
      { p_short_code: shortCode, p_increment_view: true }
    );

    const savedPlan = Array.isArray(planRows) ? planRows[0] : null;
    if (planError || !savedPlan) {
      return NextResponse.json(
        { error: 'Plan not found' },
        { status: 404 }
      );
    }

    // Recalculate plan with current data
    const planUrl = new URL('/api/plan', request.nextUrl.origin);
    planUrl.searchParams.set('riverId', savedPlan.river_id ?? '');
    planUrl.searchParams.set('startId', savedPlan.start_access_id ?? '');
    planUrl.searchParams.set('endId', savedPlan.end_access_id ?? '');
    planUrl.searchParams.set('vesselTypeId', savedPlan.vessel_type_id ?? '');

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
