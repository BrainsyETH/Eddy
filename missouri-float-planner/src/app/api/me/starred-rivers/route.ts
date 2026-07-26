// src/app/api/me/starred-rivers/route.ts
// GET    /api/me/starred-rivers            — list the caller's starred rivers
// POST   /api/me/starred-rivers            — star a river ({ riverId } or { riverSlug })
// DELETE /api/me/starred-rivers?riverId=…  — unstar
//
// Favorites are local-first on device; this is the sync target. Anonymous
// sessions are allowed by design (stars must survive the anonymous →
// Sign-in-with-Apple upgrade), so this uses requireUser, not
// requirePermanentUser.
//
// These limits fail OPEN (no failClosed), unlike /api/me/device-tokens. The
// writes here are tiny idempotent upserts scoped by RLS, so unlimited access
// during a limiter outage is far less harmful than blocking someone from
// saving a favourite because Upstash hiccuped.

import { NextRequest, NextResponse } from 'next/server';
import { jsonPrivate } from '@/lib/api-utils';
import { rateLimit } from '@/lib/rate-limit';
import { requireUser } from '@/lib/supabase/request';
import type { StarredRiversResponse } from '@/types/api';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const auth = await requireUser(request);
    if (auth instanceof NextResponse) return auth;
    const { supabase, user } = auth;

    // Read on launch and after every local change syncs.
    // Keyed on the USER, never the IP: carrier NAT collapses thousands of
    // mobile subscribers into one bucket, so a per-IP limit would throttle
    // a whole network because one person's client misbehaved.
    const limited = await rateLimit(`me-stars-read:${user.id}`, 120, 15 * 60 * 1000);
    if (limited) return limited;

    const { data, error } = await supabase
      .from('starred_rivers')
      .select('river_id, created_at, rivers!inner(name, slug, active)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error listing starred rivers:', error);
      return jsonPrivate({ error: 'Could not load starred rivers' }, { status: 500 });
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

    return jsonPrivate(response);
  } catch (error) {
    console.error('Error listing starred rivers:', error);
    return jsonPrivate({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireUser(request);
    if (auth instanceof NextResponse) return auth;
    const { supabase, user } = auth;

    // One per star tap, plus a full push after an offline spell.
    // Keyed on the USER, never the IP: carrier NAT collapses thousands of
    // mobile subscribers into one bucket, so a per-IP limit would throttle
    // a whole network because one person's client misbehaved.
    const limited = await rateLimit(`me-stars-write:${user.id}`, 90, 15 * 60 * 1000);
    if (limited) return limited;

    const body = await request.json().catch(() => null) as
      | { riverId?: string; riverSlug?: string }
      | null;
    if (!body?.riverId && !body?.riverSlug) {
      return jsonPrivate({ error: 'riverId or riverSlug required' }, { status: 400 });
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
      return jsonPrivate({ error: 'River not found' }, { status: 404 });
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
        return jsonPrivate({ error: 'River not found' }, { status: 404 });
      }
      console.error('Error starring river:', error);
      return jsonPrivate({ error: 'Could not star river' }, { status: 500 });
    }

    return jsonPrivate({ ok: true, riverId });
  } catch (error) {
    console.error('Error starring river:', error);
    return jsonPrivate({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireUser(request);
    if (auth instanceof NextResponse) return auth;
    const { supabase, user } = auth;

    // Shares the write budget with POST — a toggle is both.
    // Keyed on the USER, never the IP: carrier NAT collapses thousands of
    // mobile subscribers into one bucket, so a per-IP limit would throttle
    // a whole network because one person's client misbehaved.
    const limited = await rateLimit(`me-stars-write:${user.id}`, 90, 15 * 60 * 1000);
    if (limited) return limited;

    const riverId = request.nextUrl.searchParams.get('riverId');
    if (!riverId) {
      return jsonPrivate({ error: 'riverId required' }, { status: 400 });
    }

    const { error } = await supabase
      .from('starred_rivers')
      .delete()
      .eq('user_id', user.id)
      .eq('river_id', riverId);

    if (error) {
      console.error('Error unstarring river:', error);
      return jsonPrivate({ error: 'Could not unstar river' }, { status: 500 });
    }

    return jsonPrivate({ ok: true, riverId });
  } catch (error) {
    console.error('Error unstarring river:', error);
    return jsonPrivate({ error: 'Internal server error' }, { status: 500 });
  }
}
