// src/app/api/rivers/[slug]/access/[accessSlug]/route.ts
// GET /api/rivers/[slug]/access/[accessSlug] - Get access point detail

import { NextRequest, NextResponse } from 'next/server';
import { cdnCacheHeaders } from '@/lib/api-utils';
import { createClient } from '@/lib/supabase/server';
import { getAccessPointDetail } from '@/lib/access-points/detail';
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

    const result = await getAccessPointDetail(supabase, riverSlug, accessSlug);

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

    return NextResponse.json(result.data, { headers: cdnCacheHeaders(300, 3600) });
  } catch (error) {
    console.error('Error in access point detail endpoint:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export const GET = withX402Route<{ params: Promise<{ slug: string; accessSlug: string }> }>(_GET, '$0.005', 'Access point detail data');
