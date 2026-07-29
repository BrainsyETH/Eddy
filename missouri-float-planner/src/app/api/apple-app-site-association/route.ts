// src/app/api/apple-app-site-association/route.ts
// Serves the AASA document. Reached at /.well-known/apple-app-site-association
// through a REWRITE in next.config.mjs — a rewrite, not a redirect, because
// Apple's CDN does not follow redirects for this file and a 3xx here breaks
// universal links silently.
//
// The content lives in src/lib/navigation/apple-app-site-association.ts.

import { NextResponse } from 'next/server';
import { appleAppSiteAssociation } from '@/lib/navigation/apple-app-site-association';

export const dynamic = 'force-dynamic';

export function GET() {
  return NextResponse.json(appleAppSiteAssociation(), {
    headers: {
      // Required. Served as anything else — application/octet-stream is what a
      // static host picks for an extensionless file — and iOS ignores it
      // without reporting anything.
      'Content-Type': 'application/json',
      // Apple's CDN caches this aggressively on its own, so a short shared
      // cache is enough and keeps a mistake from living for a day at our edge
      // on top of however long it lives at theirs.
      'Cache-Control': 'public, max-age=300, s-maxage=300',
    },
  });
}
