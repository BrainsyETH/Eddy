// GET /api/favorite-floats — actionable routes curated in Eddy's river guides.
//
// This is deliberately separate from /api/blog. The blog index is a narrow,
// CDN-cached article list; widening every row with guide_data would make every
// reader download route geometry metadata it does not need. The Today screen
// asks this purpose-built endpoint for a compact, planner-ready projection.

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
          id: `${float.riverSlug}:${float.fromSlug}:${float.toSlug}`,
          riverSlug: float.riverSlug,
          riverName: float.riverName,
          putInName: float.putInName,
          takeOutName: float.takeOutName,
          fromSlug: float.fromSlug,
          toSlug: float.toSlug,
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
