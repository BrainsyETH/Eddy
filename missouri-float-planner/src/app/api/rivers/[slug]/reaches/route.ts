// src/app/api/rivers/[slug]/reaches/route.ts
// GET /api/rivers/[slug]/reaches — the river's hydrologically distinct reaches.
//
// Exists for eddy-ios, which cannot query Supabase directly the way the web
// river page does (it calls fetchRiverReaches() server-side inside its own
// render). Returns [] for every river without reach data, which is all of them
// but the Black today.
//
// The dam panel deliberately avoided adding /api/rivers/[slug]/dam and reused
// the ten-item /api/dams instead. That trick is not available here: no existing
// endpoint carries a reach's gauge, type or report, so this is the cheap option
// rather than the expensive one.

import { NextRequest, NextResponse } from 'next/server';
import { cdnCacheHeaders } from '@/lib/api-utils';
import { createClient } from '@/lib/supabase/server';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { fetchRiverReaches, type RiverReach } from '@/lib/data/river-reaches';
import type { RiverType } from '@/lib/rivers/context';

export const dynamic = 'force-dynamic';

export interface RiverReachesResponse {
  reaches: RiverReach[];
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const rateLimitResult = await rateLimit(`reaches:${getClientIp(request)}`, 60, 60 * 1000);
    if (rateLimitResult) return rateLimitResult;

    const { slug } = await params;
    const supabase = await createClient();

    const { data: river, error: riverError } = await supabase
      .from('rivers')
      .select('id, river_type')
      .eq('slug', slug)
      .single();

    if (riverError || !river) {
      return NextResponse.json({ error: 'River not found' }, { status: 404 });
    }

    const reaches = await fetchRiverReaches(
      river.id,
      slug,
      ((river as { river_type?: string }).river_type || 'spring_fed_float') as RiverType,
    );

    // null means "no hydrological difference worth showing" — an empty list is
    // the honest wire form of that, and lets the client render nothing without
    // special-casing.
    return NextResponse.json<RiverReachesResponse>(
      { reaches: reaches ?? [] },
      { headers: cdnCacheHeaders(300, 1800) },
    );
  } catch (e) {
    console.error('[Reaches] Unexpected error:', e);
    return NextResponse.json({ error: 'Failed to load reaches' }, { status: 500 });
  }
}
