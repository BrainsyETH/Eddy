import { unstable_cache } from 'next/cache';
import { estimateRoute } from '@/lib/calculations/route-estimate';
// GET /api/favorite-floats — the planner-ready projection of hand-curated
// sections from Eddy's published river guides.

import { NextRequest, NextResponse } from 'next/server';
import { cdnCacheHeaders } from '@/lib/api-utils';
import { createAdminClient } from '@/lib/supabase/admin';
import { listFavoriteFloats } from '@/lib/social/favorite-floats';
import { withX402Route } from '@/lib/x402-config';

export const dynamic = 'force-dynamic';

// Cache typical route calculations independently of the list/CDN response.
// Errors are caught outside the cache so transient failures are retried.
const cachedEstimate = unstable_cache(async (riverId: string, startId: string, endId: string) =>
  estimateRoute(createAdminClient(), { riverId, startId, endId, mode: 'typical' }),
  ['favorite-typical-estimate-v2'], { revalidate: 3600 });

async function _GET(request: NextRequest) {
  const nullableTimes = request.nextUrl.searchParams.get('v') === '2';
  try {
    const supabase = createAdminClient();
    const floats = await listFavoriteFloats(supabase);
    const estimates = nullableTimes ? await Promise.all(floats.map(float =>
      cachedEstimate(float.riverId, float.putInId, float.takeOutId).catch(() => null))) : [];
    return NextResponse.json(
      {
        floats: floats.map((float, index) => ({
          id: `${float.riverSlug}:${float.putInId}:${float.takeOutId}`,
          riverId: float.riverId,
          riverSlug: float.riverSlug,
          riverName: float.riverName,
          putInId: float.putInId,
          putInName: float.putInName,
          takeOutId: float.takeOutId,
          takeOutName: float.takeOutName,
          distanceMiles: estimates[index]?.distanceMiles ?? float.distanceMi,
          durationHours: nullableTimes ? (estimates[index]?.floatTime ? estimates[index]!.floatTime!.minutes / 60 : null) : Math.round((float.distanceMi / 2) * 10) / 10,
          durationUnavailableReason: nullableTimes ? (estimates[index]?.withholdReason ?? (estimates[index]?.floatTime ? null : 'unavailable')) : undefined,
          durationFormatted: estimates[index]?.floatTime?.formatted ?? null,
          estimateBasis: nullableTimes ? 'typical' : 'legacy_editorial',
          difficulty: float.difficulty,
          tagline: float.tagline,
          bestFor: float.bestFor,
          bestForTags: float.bestForTags,
          guideSlug: float.postSlug,
          photoUrl: float.photoUrl ?? null,
        })),
      },
      { headers: cdnCacheHeaders(900, 3600) },
    );
  } catch (error) {
    console.error('[api/favorite-floats] failed:', error);
    return NextResponse.json({ error: 'Could not fetch favorite floats' }, { status: 500 });
  }
}

export const GET = withX402Route(_GET, '/api/favorite-floats');
