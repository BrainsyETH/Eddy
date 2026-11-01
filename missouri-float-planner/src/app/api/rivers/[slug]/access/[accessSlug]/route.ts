import { publicRouteSegment } from '@/lib/calculations/public-segment';
// src/app/api/rivers/[slug]/access/[accessSlug]/route.ts
// GET /api/rivers/[slug]/access/[accessSlug] - Get access point detail

import { NextRequest, NextResponse } from 'next/server';
import { cdnCacheHeaders } from '@/lib/api-utils';
import { createClient } from '@/lib/supabase/server';
import { getAccessPointDetail } from '@/lib/access-points/detail';
import { agencySources } from '@/lib/access-points/source-line';
import { createAdminClient } from '@/lib/supabase/admin';
import { withX402Route } from '@/lib/x402-config';

// Force dynamic rendering (uses cookies for Supabase)
export const dynamic = 'force-dynamic';

async function _GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; accessSlug: string }> }
) {
  try {
    const { slug: riverSlug, accessSlug } = await params;
    const supabase = await createClient();

    const estimatesOnly = request.nextUrl.searchParams.get('view') === 'estimates';
    const timings: string[] = [];
    const result = await getAccessPointDetail(supabase, riverSlug, accessSlug, {
      // Opt-in lightweight representation; existing callers retain full estimates.
      includeEstimates: estimatesOnly || request.nextUrl.searchParams.get('includeEstimates') !== '0',
      estimatesOnly,
      segmentReader: publicRouteSegment,
      onTiming: (phase, durationMs) => timings.push(`${phase};dur=${durationMs.toFixed(1)}`),
    });

    if (!result.ok) {
      if (result.reason === 'river-not-found') {
        return NextResponse.json({ error: 'River not found' }, { status: 404 });
      }
      if (result.reason === 'not-found') {
        return NextResponse.json({ error: 'Access point not found' }, { status: 404 });
      }
      return NextResponse.json(
        { error: 'Access point has invalid coordinates' },
        { status: 500 }
      );
    }

    if (!estimatesOnly) {
      // Attribution only: which agencies' data this page uses. agency_gis_features
      // is service-role only by design, so read the provider codes here and
      // expose nothing else from it. A failure drops the line, never the page.
      try {
        const { data: links } = await createAdminClient()
          .from('agency_gis_features')
          .select('provider')
          .eq('access_point_id', result.data.accessPoint.id);
        result.data.accessPoint.dataSources = agencySources(links);
      } catch {
        result.data.accessPoint.dataSources = [];
      }
    }

    return NextResponse.json(estimatesOnly ? { nearbyAccessPoints: result.data.nearbyAccessPoints } : result.data, {
      headers: { ...cdnCacheHeaders(300, 3600), 'Server-Timing': timings.join(', ') },
    });
  } catch (error) {
    console.error('Error in access point detail endpoint:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export const GET = withX402Route<{ params: Promise<{ slug: string; accessSlug: string }> }>(_GET, '/api/rivers/:slug/access/:accessSlug');
