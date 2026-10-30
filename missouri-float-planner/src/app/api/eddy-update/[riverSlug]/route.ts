// src/app/api/eddy-update/[riverSlug]/route.ts
// Returns the latest AI-generated Eddy update for a river.
// Optionally filtered by section via ?section=upper-current
//
// The query, the live-condition safety overlay and the public/Premium tiering
// live in src/lib/eddy/latest-update.ts, shared with the server-rendered
// embeds so an iframe never shows prose this route would withhold.

import { NextRequest, NextResponse } from 'next/server';
import { optionalAuthCacheHeaders } from '@/lib/api-utils';
import { createAdminClient } from '@/lib/supabase/admin';
import { withX402Route } from '@/lib/x402-config';
import { optionalEntitlement } from '@/lib/entitlement';
import { loadLatestEddyUpdate, type LatestEddyUpdate } from '@/lib/eddy/latest-update';

export const dynamic = 'force-dynamic';

export interface EddyUpdateResponse {
  available: boolean;
  update: LatestEddyUpdate | null;
}

async function _GET(
  request: NextRequest,
  { params }: { params: Promise<{ riverSlug: string }> }
) {
  const responseHeaders = optionalAuthCacheHeaders(
    Boolean(request.headers.get('authorization')),
    300,
    1800,
  );
  try {
    const { riverSlug } = await params;
    const auth = await optionalEntitlement(request);
    // A bearer token is an explicit request for the premium representation.
    // Preserve verification failures so the caller can refresh an expired
    // token, show the paywall for a 402, or retry a transient 500. Collapsing
    // all four responses into `entitled = false` made a broken auth service
    // indistinguishable from a free account.
    if (auth instanceof NextResponse) return auth;
    const entitled = auth !== null;

    const sectionSlug = request.nextUrl.searchParams.get('section') || null;
    const result = await loadLatestEddyUpdate(createAdminClient(), riverSlug, { entitled, sectionSlug });

    if (result.state === 'error') {
      return NextResponse.json<EddyUpdateResponse>(
        { available: false, update: null },
        { status: 500, headers: responseHeaders }
      );
    }
    if (!result.update) {
      // No safe update — the frontend falls back to a static quote.
      return NextResponse.json<EddyUpdateResponse>({ available: false, update: null }, { headers: responseHeaders });
    }
    return NextResponse.json<EddyUpdateResponse>({ available: true, update: result.update }, { headers: responseHeaders });
  } catch (error) {
    console.error('[EddyUpdate] Unexpected error:', error);
    return NextResponse.json<EddyUpdateResponse>(
      { available: false, update: null },
      { status: 500, headers: responseHeaders }
    );
  }
}

export const GET = withX402Route<{ params: Promise<{ riverSlug: string }> }>(_GET, '/api/eddy-update/:riverSlug');
