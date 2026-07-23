// src/app/api/me/starred-rivers/route.ts
// GET    /api/me/starred-rivers            — list the caller's starred rivers
// POST   /api/me/starred-rivers            — star a river ({ riverId } or { riverSlug })
// DELETE /api/me/starred-rivers?riverId=…  — unstar
//
// Favorites are local-first on device; this is the sync target. Anonymous
// sessions are allowed by design (stars must survive the anonymous →
// Sign-in-with-Apple upgrade), so this uses requireUser, not
// requirePermanentUser.

import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/supabase/request';
import type { StarredRiversResponse } from '@/types/api';
import { apiError } from '@/lib/api/errors';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const auth = await requireUser(request);
    if (auth instanceof NextResponse) return auth;
    const { supabase, user } = auth;

    const { data, error } = await supabase
      .from('starred_rivers')
      .select('river_id, created_at, rivers!inner(name, slug, active)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error listing starred rivers:', error);
      return apiError(500, 'internal_error', 'Could not load starred rivers');
    }

    // Untyped client: PostgREST types the to-one embed as an array; at
    // runtime it's a single object. Normalize either shape.
    type RiverEmbed = { name: string; slug: string; active: boolean | null };
    type StarredRow = { river_id: string; created_at: string; rivers: RiverEmbed | RiverEmbed[] };

    const response: StarredRiversResponse = {
      starred: ((data ?? []) as StarredRow[]).map((row) => {
        const river = Array.isArray(row.rivers) ? row.rivers[0] : row.rivers;
        return {
          riverId: row.river_id,
          riverName: river?.name ?? '',
          riverSlug: river?.slug ?? '',
          starredAt: row.created_at,
        };
      }),
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Error listing starred rivers:', error);
    return apiError(500, 'internal_error', 'Internal server error');
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireUser(request);
    if (auth instanceof NextResponse) return auth;
    const { supabase, user } = auth;

    const body = await request.json().catch(() => null) as
      | { riverId?: string; riverSlug?: string }
      | null;
    if (!body?.riverId && !body?.riverSlug) {
      return apiError(400, 'validation_failed', 'riverId or riverSlug required');
    }

    let riverId = body.riverId ?? null;
    if (!riverId && body.riverSlug) {
      const { data: river } = await supabase
        .from('rivers')
        .select('id')
        .eq('slug', body.riverSlug)
        .maybeSingle();
      riverId = river?.id ?? null;
    }
    if (!riverId) {
      return apiError(404, 'not_found', 'River not found');
    }

    // Idempotent: re-starring is a no-op, not an error.
    const { error } = await supabase
      .from('starred_rivers')
      .upsert(
        { user_id: user.id, river_id: riverId },
        { onConflict: 'user_id,river_id', ignoreDuplicates: true }
      );

    if (error) {
      // FK violation = unknown river id.
      if (error.code === '23503') {
        return apiError(404, 'not_found', 'River not found');
      }
      console.error('Error starring river:', error);
      return apiError(500, 'internal_error', 'Could not star river');
    }

    return NextResponse.json({ ok: true, riverId });
  } catch (error) {
    console.error('Error starring river:', error);
    return apiError(500, 'internal_error', 'Internal server error');
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireUser(request);
    if (auth instanceof NextResponse) return auth;
    const { supabase, user } = auth;

    const riverId = request.nextUrl.searchParams.get('riverId');
    if (!riverId) {
      return apiError(400, 'validation_failed', 'riverId required');
    }

    const { error } = await supabase
      .from('starred_rivers')
      .delete()
      .eq('user_id', user.id)
      .eq('river_id', riverId);

    if (error) {
      console.error('Error unstarring river:', error);
      return apiError(500, 'internal_error', 'Could not unstar river');
    }

    return NextResponse.json({ ok: true, riverId });
  } catch (error) {
    console.error('Error unstarring river:', error);
    return apiError(500, 'internal_error', 'Internal server error');
  }
}
