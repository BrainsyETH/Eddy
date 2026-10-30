// src/lib/float-share/respond.ts
// The float share image route's decisions, with its two outside reads (the
// rate limiter and the name lookup) passed in, so tests can drive every
// answer: 400 for a malformed share, 308 to its one spelling, 422 for a
// well-formed share whose places no longer resolve, 503 for a failed read,
// and the PNG. The route (app/api/share/float/image) supplies the real ones.

import { NextResponse, type NextRequest } from 'next/server';
import { floatImagePath, parseFloatShare, shareMood, type FloatShareState } from '@shared/float-share';
import { FloatShareReadError, type FloatShareNames } from './names';
import { stickerDataUrl } from './sticker';
import { renderFloatShareImage } from '@/lib/og/float-share-image';

const noStore = { 'Cache-Control': 'no-store' };

export async function respondFloatShare(
  request: NextRequest,
  deps: {
    /** A response when this caller is over its limit. */
    limit: () => Promise<Response | null>;
    names: (state: FloatShareState) => Promise<FloatShareNames | null>;
  },
): Promise<Response> {
  const state = parseFloatShare(request.nextUrl.searchParams);
  if (!state) return NextResponse.json({ error: 'Invalid float share', code: 'invalid_share' }, { status: 400, headers: noStore });
  // One spelling per share, so reordered or padded queries cannot buy renders.
  const canonical = new URL(floatImagePath(state), request.url);
  if (request.nextUrl.search !== canonical.search) {
    return NextResponse.redirect(canonical, { status: 308, headers: { 'Cache-Control': 'public, max-age=300' } });
  }
  const limited = await deps.limit();
  if (limited) {
    limited.headers.set('Cache-Control', 'no-store');
    return limited;
  }
  try {
    const names = await deps.names(state);
    // A well-formed share whose places no longer resolve (an access point
    // removed or merged since the float): 422, distinct from a malformed 400,
    // because only this one is about the float's places. The app says so only
    // for this status.
    if (!names) {
      return NextResponse.json(
        { error: 'This float’s river or access points are no longer available', code: 'places_unavailable' },
        { status: 422, headers: noStore },
      );
    }
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
