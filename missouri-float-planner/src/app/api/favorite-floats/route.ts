// GET /api/favorite-floats — the planner-ready projection of hand-curated
// sections from Eddy's published river guides.

import { NextResponse } from 'next/server';
import { cdnCacheHeaders } from '@/lib/api-utils';
import { createAdminClient } from '@/lib/supabase/admin';
import { listFavoriteFloats } from '@/lib/social/favorite-floats';
import { withX402Route } from '@/lib/x402-config';

export const dynamic = 'force-dynamic';

async function _GET() {
  try {
    const floats = await listFavoriteFloats(createAdminClient());
    return NextResponse.json(
      {
        floats: floats.map((float) => ({
          id: `${float.riverSlug}:${float.putInId}:${float.takeOutId}`,
          riverId: float.riverId,
          riverSlug: float.riverSlug,
          riverName: float.riverName,
          putInId: float.putInId,
          putInName: float.putInName,
          takeOutId: float.takeOutId,
          takeOutName: float.takeOutName,
          distanceMiles: float.distanceMi,
          durationHours: float.hoursCanoe,
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
