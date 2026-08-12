// src/app/api/dams/route.ts
// GET /api/dams — every USACE dam Eddy tracks, with its current state.
//
// Read-through to CWMS and SWPA rather than served from a table: the Corps
// rewrites its forecast daily and SWPA republishes a rolling week, so there is
// nothing here worth storing. The CDN absorbs the upstream latency.
//
// Cached more coarsely than gauge endpoints because generation schedules post
// once each afternoon and pool elevation moves slowly.

import { NextResponse } from 'next/server';
import { cdnCacheHeaders } from '@/lib/api-utils';
import { fetchAllDamSummaries } from '@/lib/data/dams';
import { withX402Route } from '@/lib/x402-config';

export const dynamic = 'force-dynamic';

async function _GET() {
  try {
    const dams = await fetchAllDamSummaries();
    return NextResponse.json(
      { dams },
      { headers: cdnCacheHeaders(900, 3600) }
    );
  } catch (error) {
    console.error('[api/dams] failed:', error);
    return NextResponse.json({ error: 'Failed to fetch dams' }, { status: 500 });
  }
}

export const GET = withX402Route(_GET, '/api/dams');
