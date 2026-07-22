// src/app/api/me/profile/route.ts
// GET  /api/me/profile — the caller's profile + entitlement snapshot
// PATCH /api/me/profile — update editable profile fields
//
// First of the /api/me/* family (iOS Phase 0): Bearer-token auth, RLS-scoped
// queries. Works for anonymous sessions too — an anonymous user has a profile
// (created by the auth trigger) and simply no entitlement row.

import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/supabase/request';
import type { MeProfileResponse } from '@/types/api';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const auth = await requireUser(request);
    if (auth instanceof NextResponse) return auth;
    const { supabase, user } = auth;

    let { data: profile } = await supabase
      .from('profiles')
      .select('id, display_name, home_region, created_at, updated_at')
      .eq('id', user.id)
      .maybeSingle();

    // The on_auth_user_created trigger backfills profiles for new users;
    // self-heal for any user that predates it.
    if (!profile) {
      const { data: created, error: createError } = await supabase
        .from('profiles')
        .insert({ id: user.id })
        .select('id, display_name, home_region, created_at, updated_at')
        .single();
      if (createError) {
        console.error('Error creating profile:', createError);
        return NextResponse.json({ error: 'Could not load profile' }, { status: 500 });
      }
      profile = created;
    }

    const { data: entitlement } = await supabase
      .from('entitlements')
      .select('entitlement_id, expires_at, will_renew, product_id, store, billing_issue_detected_at')
      .eq('user_id', user.id)
      .eq('entitlement_id', 'eddy_plus')
      .maybeSingle();

    const response: MeProfileResponse = {
      profile: {
        id: profile.id,
        displayName: profile.display_name,
        homeRegion: profile.home_region,
        createdAt: profile.created_at,
      },
      isAnonymous: user.is_anonymous ?? false,
      entitlement: entitlement
        ? {
            entitlementId: entitlement.entitlement_id,
            // Entitlement state is the latest expires_at, never a stored
            // boolean — computed here so clients can't drift on clock rules.
            isActive: !!entitlement.expires_at && new Date(entitlement.expires_at) > new Date(),
            expiresAt: entitlement.expires_at,
            willRenew: entitlement.will_renew,
            productId: entitlement.product_id,
            billingIssue: !!entitlement.billing_issue_detected_at,
          }
        : null,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Error fetching profile:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireUser(request);
    if (auth instanceof NextResponse) return auth;
    const { supabase, user } = auth;

    const body = await request.json().catch(() => null) as
      | { displayName?: string | null; homeRegion?: string | null }
      | null;
    if (!body || (body.displayName === undefined && body.homeRegion === undefined)) {
      return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
    }

    const updates: Record<string, string | null> = {};
    if (body.displayName !== undefined) {
      const name = body.displayName === null ? null : String(body.displayName).trim().slice(0, 80);
      updates.display_name = name || null;
    }
    if (body.homeRegion !== undefined) {
      const region = body.homeRegion === null ? null : String(body.homeRegion).trim().slice(0, 80);
      updates.home_region = region || null;
    }

    const { data: profile, error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', user.id)
      .select('id, display_name, home_region, created_at')
      .single();

    if (error) {
      console.error('Error updating profile:', error);
      return NextResponse.json({ error: 'Could not update profile' }, { status: 500 });
    }

    return NextResponse.json({
      profile: {
        id: profile.id,
        displayName: profile.display_name,
        homeRegion: profile.home_region,
        createdAt: profile.created_at,
      },
    });
  } catch (error) {
    console.error('Error updating profile:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
