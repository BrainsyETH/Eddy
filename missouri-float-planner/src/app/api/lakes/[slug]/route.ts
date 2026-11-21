// src/app/api/lakes/[slug]/route.ts
// GET /api/lakes/[slug] — one published lake: level, movement, history, wind,
// reviewed launches and the lake's neighbours. The body is a LakeSection
// (shared/lake-types.ts), the same object /lakes/[slug] renders, from the same
// loader, so the web page and the iOS screen cannot disagree.
//
// A lake answers here only when its public page is released
// (src/lib/lakes/public-pages.ts). Registry membership is not publication.

import { NextRequest, NextResponse } from 'next/server';
import { cdnCacheHeaders } from '@/lib/api-utils';
import { loadLakePage } from '@/lib/lakes/page-data';

export const dynamic = 'force-dynamic';

export async function GET(_request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    const data = await loadLakePage(slug, Date.now());
    if (!data) return NextResponse.json({ error: 'Lake not found' }, { status: 404 });
    // Shorter than a dam: the wind is the part of this body that moves fastest.
    return NextResponse.json(data.section, { headers: cdnCacheHeaders(300, 900) });
  } catch (error) {
    console.error('[api/lakes/:slug] failed:', error);
    return NextResponse.json({ error: 'Failed to fetch lake' }, { status: 500 });
  }
}
