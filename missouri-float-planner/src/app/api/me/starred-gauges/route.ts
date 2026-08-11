// src/app/api/me/starred-gauges/route.ts
// GET    /api/me/starred-gauges           — list the caller's starred gauges
// POST   /api/me/starred-gauges           — star ({ gaugeId } or { usgsSiteId })
// DELETE /api/me/starred-gauges?gaugeId=… — unstar
//
// The gauge half of Favorites, and a direct mirror of starred-rivers: same
// local-first-with-the-server-as-a-replica model, same `requireUser` rather than
// `requirePermanentUser` (anonymous sessions are allowed by design so a star
// survives the anonymous → Sign-in-with-Apple upgrade), same fail-OPEN limits.
//
// ── Why this is a separate route rather than a kind on starred-rivers ───────
// /api/me/starred-rivers is consumed by shipped app builds. If it began
// returning gauges in `starred[]`, an old build would adopt each one as a river
// star with an empty slug, render it as a river row, and navigate to `/river/`
// on tap — a client regression caused purely by a server deploy. A new route is
// invisible to them.
//
// ── The limiter buckets are its own ────────────────────────────────────────
// Deliberately not shared with the rivers route: a gauge-sync storm must not be
// able to lock somebody out of starring a river.

import { NextRequest, NextResponse } from 'next/server';
import { jsonPrivate } from '@/lib/api-utils';
import { rateLimit } from '@/lib/rate-limit';
import { requireUser } from '@/lib/supabase/request';
import type { StarredGaugesResponse } from '@/types/api';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const auth = await requireUser(request);
    if (auth instanceof NextResponse) return auth;
    const { supabase, user } = auth;

    // Read on launch and after every local change syncs. Keyed on the USER,
    // never the IP: carrier NAT collapses thousands of mobile subscribers into
    // one bucket, so a per-IP limit would throttle a whole network because one
    // person's client misbehaved.
    const limited = await rateLimit(`me-gauge-stars-read:${user.id}`, 120, 15 * 60 * 1000);
    if (limited) return limited;

    const { data, error } = await supabase
      .from('starred_gauges')
      .select(
        'gauge_station_id, created_at, gauge_stations!inner(name, usgs_site_id, site_id_external, provider, active)'
      )
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error listing starred gauges:', error);
      return jsonPrivate({ error: 'Could not load starred gauges' }, { status: 500 });
    }

    // Untyped client: PostgREST types the to-one embed as an array; at
    // runtime it's a single object. Normalize either shape.
    type GaugeEmbed = {
      name: string;
      usgs_site_id: string | null;
      site_id_external: string | null;
      provider: string | null;
      active: boolean | null;
    };
    type StarredRow = {
      gauge_station_id: string;
      created_at: string;
      gauge_stations: GaugeEmbed | GaugeEmbed[];
    };

    const rows = (data ?? []) as StarredRow[];

    // The river each gauge rates, so a fresh install has somewhere to send a
    // synced-down star before /api/gauges lands. Primary associations only: a
    // gauge that rates two rivers should point at the one it is authoritative
    // for, and a secondary link is not that.
    const riverBySite = new Map<string, { name: string; slug: string }>();
    if (rows.length > 0) {
      const { data: links } = await supabase
        .from('river_gauges')
        .select('gauge_station_id, is_primary, rivers!inner(name, slug)')
        .in('gauge_station_id', rows.map((r) => r.gauge_station_id))
        .eq('is_primary', true);

      type LinkRow = {
        gauge_station_id: string;
        rivers: { name: string; slug: string } | { name: string; slug: string }[];
      };
      for (const link of (links ?? []) as LinkRow[]) {
        const river = Array.isArray(link.rivers) ? link.rivers[0] : link.rivers;
        if (river) riverBySite.set(link.gauge_station_id, river);
      }
    }

    const response: StarredGaugesResponse = {
      starred: rows.map((row) => {
        const gauge = Array.isArray(row.gauge_stations) ? row.gauge_stations[0] : row.gauge_stations;
        const river = riverBySite.get(row.gauge_station_id) ?? null;
        return {
          gaugeId: row.gauge_station_id,
          gaugeName: gauge?.name ?? '',
          // Kept under its 1.0 wire name for compatibility; since 1.1 it is the
          // provider-native site id and may be a USACE slug or NWS LID.
          usgsSiteId: gauge?.usgs_site_id ?? gauge?.site_id_external ?? '',
          provider: gauge?.provider ?? 'usgs',
          riverName: river?.name ?? null,
          riverSlug: river?.slug ?? null,
          starredAt: row.created_at,
        };
      }),
    };

    return jsonPrivate(response);
  } catch (error) {
    console.error('Error listing starred gauges:', error);
    return jsonPrivate({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireUser(request);
    if (auth instanceof NextResponse) return auth;
    const { supabase, user } = auth;

    const limited = await rateLimit(`me-gauge-stars-write:${user.id}`, 90, 15 * 60 * 1000);
    if (limited) return limited;

    const body = await request.json().catch(() => null) as
      | { gaugeId?: string; usgsSiteId?: string }
      | null;
    if (!body?.gaugeId && !body?.usgsSiteId) {
      return jsonPrivate({ error: 'gaugeId or usgsSiteId required' }, { status: 400 });
    }

    let gaugeId = body.gaugeId ?? null;
    if (!gaugeId && body.usgsSiteId) {
      const { data: gauge } = await supabase
        .from('gauge_stations')
        .select('id')
        .eq('usgs_site_id', body.usgsSiteId)
        .maybeSingle();
      gaugeId = gauge?.id ?? null;
    }
    if (!gaugeId) {
      return jsonPrivate({ error: 'Gauge not found' }, { status: 404 });
    }

    // Idempotent, and `ignoreDuplicates` is load-bearing rather than tidy:
    // mergeStars compares a local edit time against the server's created_at, so
    // a re-star that BUMPED that timestamp would let the server's copy win over
    // a newer local unstar. starred_rivers behaves the same way, and the two
    // kinds go through one merge function — they cannot afford to differ.
    const { error } = await supabase
      .from('starred_gauges')
      .upsert(
        { user_id: user.id, gauge_station_id: gaugeId },
        { onConflict: 'user_id,gauge_station_id', ignoreDuplicates: true }
      );

    if (error) {
      // FK violation = unknown gauge id.
      if (error.code === '23503') {
        return jsonPrivate({ error: 'Gauge not found' }, { status: 404 });
      }
      console.error('Error starring gauge:', error);
      return jsonPrivate({ error: 'Could not star gauge' }, { status: 500 });
    }

    return jsonPrivate({ ok: true, gaugeId });
  } catch (error) {
    console.error('Error starring gauge:', error);
    return jsonPrivate({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireUser(request);
    if (auth instanceof NextResponse) return auth;
    const { supabase, user } = auth;

    // Shares the write budget with POST — a toggle is both.
    const limited = await rateLimit(`me-gauge-stars-write:${user.id}`, 90, 15 * 60 * 1000);
    if (limited) return limited;

    const gaugeId = request.nextUrl.searchParams.get('gaugeId');
    if (!gaugeId) {
      return jsonPrivate({ error: 'gaugeId required' }, { status: 400 });
    }

    const { error } = await supabase
      .from('starred_gauges')
      .delete()
      .eq('user_id', user.id)
      .eq('gauge_station_id', gaugeId);

    if (error) {
      console.error('Error unstarring gauge:', error);
      return jsonPrivate({ error: 'Could not unstar gauge' }, { status: 500 });
    }

    return jsonPrivate({ ok: true });
  } catch (error) {
    console.error('Error unstarring gauge:', error);
    return jsonPrivate({ error: 'Internal server error' }, { status: 500 });
  }
}
