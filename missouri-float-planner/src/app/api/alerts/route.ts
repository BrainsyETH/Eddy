// src/app/api/alerts/route.ts
// GET /api/alerts — public feed of river condition changes.
//
// The Alerts FEED is free to read; only real-time push is paid. That split is
// deliberate: a free user may never sign in at all, so this endpoint must work
// with no auth and no account. The app filters to locally-starred rivers on the
// client, which is why there is no per-user server state here.
//
// LATENCY HONESTY: each event carries `readingAt` — when the river was actually
// measured — alongside `detectedAt`. UI must quote the former. USGS reporting lag
// plus the cron cadence means detection trails reality by roughly 20–75 minutes,
// so surfacing `detectedAt` as though it were the moment the river changed would
// overstate what we know. See ALERT_LATENCY_NOTE in packages/eddy-types.
//
// `info` events are excluded by default. The outbox records every transition
// (good↔flowing jitter included) so the data is complete, but most of it is not
// news; pass `kinds=` explicitly to see everything.

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { cdnCacheHeaders } from '@/lib/api-utils';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import type { AlertsResponse, AlertFeedEntry } from '@/types/api';

export const dynamic = 'force-dynamic';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;
/** Kinds worth showing in a feed. `info` is recorded but not news. */
const DEFAULT_KINDS = ['floatable', 'warning', 'easing', 'recovery'];
const VALID_KINDS = new Set([...DEFAULT_KINDS, 'info']);

export async function GET(request: NextRequest) {
  try {
    const rateLimitResult = await rateLimit(`alerts:${getClientIp(request)}`, 60, 60 * 1000);
    if (rateLimitResult) return rateLimitResult;

    const params = request.nextUrl.searchParams;

    const limit = Math.min(
      Math.max(parseInt(params.get('limit') ?? String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT, 1),
      MAX_LIMIT
    );

    // Optional river filter. The app normally filters client-side (it knows the
    // user's stars without an account), but passing ids keeps the payload small
    // for someone watching only a few rivers.
    const riverIds = (params.get('riverIds') ?? '')
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean);

    const kinds = (params.get('kinds') ?? '')
      .split(',')
      .map((k) => k.trim())
      .filter((k) => VALID_KINDS.has(k));

    const supabase = createAdminClient();
    let query = supabase
      .from('river_condition_events')
      .select(
        'id, river_id, old_condition_code, new_condition_code, kind, reading_value, reading_unit, reading_at, detected_at, rivers!inner(name, slug)'
      )
      .in('kind', kinds.length > 0 ? kinds : DEFAULT_KINDS)
      .order('detected_at', { ascending: false })
      .limit(limit);

    if (riverIds.length > 0) query = query.in('river_id', riverIds);

    const { data, error } = await query;

    if (error) {
      console.error('[alerts] query failed:', error);
      return NextResponse.json({ error: 'Could not load alerts' }, { status: 500 });
    }

    // Untyped client: PostgREST types the to-one embed as an array; at runtime
    // it is a single object. Normalize either shape.
    type RiverEmbed = { name: string; slug: string };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const alerts: AlertFeedEntry[] = (data ?? []).map((row: any) => {
      const river: RiverEmbed | undefined = Array.isArray(row.rivers) ? row.rivers[0] : row.rivers;
      return {
        id: row.id,
        riverId: row.river_id,
        riverName: river?.name ?? '',
        riverSlug: river?.slug ?? '',
        oldConditionCode: row.old_condition_code,
        newConditionCode: row.new_condition_code,
        kind: row.kind,
        readingValue: row.reading_value === null ? null : Number(row.reading_value),
        readingUnit: row.reading_unit,
        readingAt: row.reading_at,
        detectedAt: row.detected_at,
      };
    });

    // Events arrive at most every 15 minutes, so a short edge cache costs
    // nothing in freshness and absorbs the mass app-open that follows a push.
    return NextResponse.json<AlertsResponse>(
      { alerts },
      { headers: cdnCacheHeaders(60, 300) }
    );
  } catch (err) {
    console.error('[alerts] unexpected error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
