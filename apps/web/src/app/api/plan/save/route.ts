// src/app/api/plan/save/route.ts
// POST /api/plan/save - Save a float plan and get shareable URL

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { SavePlanRequest, SavePlanResponse } from '@/types/api';

// Force dynamic rendering (uses cookies for Supabase)
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as SavePlanRequest;

    const { riverId, startId, endId, vesselTypeId } = body;

    if (!riverId || !startId || !endId || !vesselTypeId) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // Calculate plan to get snapshot data
    const planResponse = await fetch(
      `${request.nextUrl.origin}/api/plan?riverId=${riverId}&startId=${startId}&endId=${endId}&vesselTypeId=${vesselTypeId}`
    );

    if (!planResponse.ok) {
      return NextResponse.json(
        { error: 'Could not calculate plan' },
        { status: 500 }
      );
    }

    const { plan } = await planResponse.json();

    // Generate unique short code
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: shortCodeData } = await (supabase.rpc as any)('generate_short_code', {
      length: 8,
    });

    let shortCode = shortCodeData;
    let attempts = 0;
    const maxAttempts = 10;

    // Ensure uniqueness
    while (attempts < maxAttempts) {
      const { data: existing } = await supabase
        .from('float_plans')
        .select('id')
        .eq('short_code', shortCode)
        .single();

      if (!existing) {
        break; // Code is unique
      }

      // Generate new code
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: newCode } = await (supabase.rpc as any)('generate_short_code', {
        length: 8,
      });
      shortCode = newCode;
      attempts++;
    }

    if (attempts >= maxAttempts) {
      return NextResponse.json(
        { error: 'Could not generate unique code' },
        { status: 500 }
      );
    }

    // Save plan
    // Note: discharge_cfs_at_creation and gauge_name_at_creation will be enabled after migrations 00020 and 00021 are applied
    const { error: insertError } = await supabase.from('float_plans').insert({
      short_code: shortCode,
      river_id: riverId,
      start_access_id: startId,
      end_access_id: endId,
      vessel_type_id: vesselTypeId,
      distance_miles: plan.distance.miles,
      estimated_float_minutes: plan.floatTime?.minutes || null,
      drive_back_minutes: plan.driveBack.minutes,
      condition_at_creation: plan.condition.code,
      gauge_reading_at_creation: plan.condition.gaugeHeightFt,
      discharge_cfs_at_creation: plan.condition.dischargeCfs, // TODO: Uncomment after migration 00020
      gauge_name_at_creation: plan.condition.gaugeName, // TODO: Uncomment after migration 00021
    });

    if (insertError) {
      console.error('Error saving plan:', insertError);
      return NextResponse.json(
        { error: 'Could not save plan' },
        { status: 500 }
      );
    }

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || request.nextUrl.origin;
    const url = `${baseUrl}/plan/${shortCode}`;

    const response: SavePlanResponse = {
      shortCode,
      url,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Error saving float plan:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
