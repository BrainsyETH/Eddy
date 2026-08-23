// src/app/api/plan/save/route.ts
// POST /api/plan/save - Save a float plan and get shareable URL

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { resolveFloatEndpoints, endpointFailureStatus } from '@/lib/access-points/endpoint-resolver';
import type { SavePlanRequest, SavePlanResponse, SavePlanSnapshot } from '@/types/api';

// Force dynamic rendering (uses cookies for Supabase)
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    // Rate limit: 20 plan saves per IP per 15 minutes (public write to float_plans).
    const rateLimitResult = await rateLimit(`plan-save:${getClientIp(request)}`, 20, 15 * 60 * 1000);
    if (rateLimitResult) return rateLimitResult;

    const body = await request.json() as SavePlanRequest;

    const { riverId, startId, endId, vesselTypeId, snapshot } = body;

    if (!riverId || !startId || !endId || !vesselTypeId) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // Validate the endpoints BEFORE anything is persisted. The snapshot path
    // below never calls /api/plan, so without this a saved plan — and the short
    // code shared from it — could name a point that is unapproved, not a launch,
    // or on another river entirely. A stored plan replays for as long as the
    // link lives, so an unchecked write outlives the request that made it.
    const endpoints = await resolveFloatEndpoints(supabase, {
      riverId,
      putInId: startId,
      takeOutId: endId,
      columns: 'id',
    });

    if (!endpoints.ok) {
      return NextResponse.json(
        { error: endpoints.detail },
        { status: endpointFailureStatus(endpoints.reason) }
      );
    }

    // The interactive planner already computed the plan and sends its snapshot,
    // so we persist those numbers directly. Only fall back to the full (and
    // slow — USGS + Mapbox) /api/plan recompute for legacy callers that don't.
    // This is what makes "Share" feel instant: the click no longer waits on a
    // second server-to-server plan calculation.
    let snap: SavePlanSnapshot;
    if (snapshot && typeof snapshot.distanceMiles === 'number') {
      snap = snapshot;
    } else {
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
      snap = {
        distanceMiles: plan.distance.miles,
        estimatedFloatMinutes: plan.floatTime?.minutes ?? null,
        driveBackMinutes: plan.driveBack?.minutes ?? null,
        conditionCode: plan.condition?.code ?? null,
        gaugeHeightFt: plan.condition?.gaugeHeightFt ?? null,
        dischargeCfs: plan.condition?.dischargeCfs ?? null,
        gaugeName: plan.condition?.gaugeName ?? null,
      };
    }

    // Generate a unique short code. `maybeSingle()` returns null (not an error)
    // on the common no-collision path, so the loop stays quiet.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: shortCodeData } = await (supabase.rpc as any)('generate_short_code', {
      length: 8,
    });

    let shortCode = shortCodeData;
    let attempts = 0;
    const maxAttempts = 10;

    // Ensure uniqueness. Owned plans are invisible to anon SELECT since
    // 00184, so the collision check runs through a SECURITY DEFINER helper
    // that sees every row.
    while (attempts < maxAttempts) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: available } = await (supabase.rpc as any)(
        'float_plan_code_available',
        { p_short_code: shortCode }
      );

      if (available === true) {
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
    const { error: insertError } = await supabase.from('float_plans').insert({
      short_code: shortCode,
      river_id: riverId,
      start_access_id: startId,
      end_access_id: endId,
      vessel_type_id: vesselTypeId,
      distance_miles: snap.distanceMiles,
      estimated_float_minutes: snap.estimatedFloatMinutes,
      drive_back_minutes: snap.driveBackMinutes,
      condition_at_creation: snap.conditionCode,
      gauge_reading_at_creation: snap.gaugeHeightFt,
      discharge_cfs_at_creation: snap.dischargeCfs,
      gauge_name_at_creation: snap.gaugeName,
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
