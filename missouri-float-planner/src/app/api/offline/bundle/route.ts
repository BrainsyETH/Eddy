// src/app/api/offline/bundle/route.ts
// GET /api/offline/bundle — the whole offline dataset for every river.
//
// One request, CDN-cached, ETag'd. The iOS app calls this on launch with
// If-None-Match and does nothing at all on a 304, which is the common case:
// the underlying data changes about monthly.
//
// See src/lib/offline/bundle.ts for what is in the payload and what is
// deliberately left out of it.

import { NextResponse } from 'next/server';
import { cdnCacheHeaders } from '@/lib/api-utils';
import { buildOfflineBundle } from '@/lib/offline/bundle';
import { etagFor } from '@/lib/offline/etag';

export const dynamic = 'force-dynamic';

/**
 * Cached at the edge for an hour, served stale for a day while revalidating.
 *
 * Longer than the 300s most read routes use, because this payload is the
 * slowest to assemble and the least urgent to refresh — a put-in added today
 * reaching phones tomorrow is fine, and the app re-checks on every launch
 * anyway.
 */
const S_MAXAGE = 3600;
const STALE_WHILE_REVALIDATE = 86400;

export async function GET(request: Request) {
  try {
    const bundle = await buildOfflineBundle();
    const etag = etagFor(bundle);

    // A 304 must carry the same cache headers as the 200 it stands in for.
    // Without them an intermediary can treat the revalidated response as
    // uncacheable and start asking on every launch again.
    const headers = { ...cdnCacheHeaders(S_MAXAGE, STALE_WHILE_REVALIDATE), ETag: etag };

    if (request.headers.get('if-none-match') === etag) {
      return new NextResponse(null, { status: 304, headers });
    }

    return NextResponse.json(bundle, { headers });
  } catch (error) {
    console.error('[offline/bundle] Error:', error);
    // No cache headers on the error path: a CDN holding a 500 for an hour
    // would take the offline cache down for every install that launches in
    // that window, including ones that have nothing cached yet.
    return NextResponse.json({ error: 'Failed to build offline bundle' }, { status: 500 });
  }
}
