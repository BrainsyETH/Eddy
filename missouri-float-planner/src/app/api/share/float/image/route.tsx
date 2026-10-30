import { NextRequest, NextResponse } from 'next/server';
import { floatImagePath, parseFloatShare, shareMood } from '@shared/float-share';
import { FloatShareReadError, loadFloatShareNames } from '@/lib/float-share/names';
import { stickerDataUrl } from '@/lib/float-share/sticker';
import { renderFloatShareImage } from '@/lib/og/float-share-image';
import { createClient } from '@/lib/supabase/server';
import { getClientIp, rateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const noStore = { 'Cache-Control': 'no-store' };

/**
 * A float's 9:16 share image (shared/float-share.ts; ADR 0015, "Float share
 * images"). Stateless, and an attachment, not a link preview: anything the
 * app should not share is an error the app reports, never a stand-in picture,
 * because the share control treats any PNG as the image it asked for. The
 * link that travels with it is the river's page, which has its own preview.
 */
export async function GET(request: NextRequest) {
  const state = parseFloatShare(request.nextUrl.searchParams);
  if (!state) return NextResponse.json({ error: 'Invalid float share' }, { status: 400, headers: noStore });
  // One spelling per share, so reordered or padded queries cannot buy renders.
  const canonical = new URL(floatImagePath(state), request.url);
  if (request.nextUrl.search !== canonical.search) {
    return NextResponse.redirect(canonical, { status: 308, headers: { 'Cache-Control': 'public, max-age=300' } });
  }
  const limited = await rateLimit(`float-image:${getClientIp(request)}`, 30, 60_000, { failClosed: true });
  if (limited) {
    limited.headers.set('Cache-Control', 'no-store');
    return limited;
  }
  try {
    const names = await loadFloatShareNames(await createClient(), state);
    if (!names) return NextResponse.json({ error: 'Unknown river or access point' }, { status: 400, headers: noStore });
    const mood = shareMood(state);
    const image = renderFloatShareImage({ state, names, mood, sticker: await stickerDataUrl(mood) });
    // Consume the render so a failure gets no-store, rather than caching a broken stream.
    return new Response(await image.arrayBuffer(), {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=300, s-maxage=3600',
        // The link that travels with the image: the river's web page, never an app route.
        'X-Eddy-Share-Path': names.riverPath,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof FloatShareReadError ? 'Float share unavailable. Please try again.' : 'Image unavailable. Please try again.' },
      { status: 503, headers: noStore },
    );
  }
}
