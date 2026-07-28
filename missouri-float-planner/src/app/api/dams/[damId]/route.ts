// src/app/api/dams/[damId]/route.ts
// GET /api/dams/[damId] — one dam, with the multi-day hourly generation
// schedule the index omits.
//
// damId is an Eddy slug ('swl-table-rock-dam'), not a CWMS location name —
// those contain spaces and percent signs and cannot be a URL segment. See
// src/lib/flow-providers/usace-registry.ts.

import { NextRequest, NextResponse } from 'next/server';
import { cdnCacheHeaders } from '@/lib/api-utils';
import { fetchDamSnapshot } from '@/lib/data/dams';
import { withX402Route } from '@/lib/x402-config';

export const dynamic = 'force-dynamic';

async function _GET(
  _request: NextRequest,
  { params }: { params: Promise<{ damId: string }> }
) {
  try {
    const { damId } = await params;
    const dam = await fetchDamSnapshot(damId, { scheduleDays: 3 });

    if (!dam) {
      return NextResponse.json({ error: 'Dam not found' }, { status: 404 });
    }

    return NextResponse.json(dam, { headers: cdnCacheHeaders(900, 3600) });
  } catch (error) {
    console.error('[api/dams/:damId] failed:', error);
    return NextResponse.json({ error: 'Failed to fetch dam' }, { status: 500 });
  }
}

export const GET = withX402Route<{ params: Promise<{ damId: string }> }>(
  _GET,
  '/api/dams/:damId',
);
