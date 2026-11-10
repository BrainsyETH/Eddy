import { NextResponse, type NextRequest } from 'next/server';
import { createPublicCatalogClient } from '@/lib/supabase/public-read';
import { createGaugeRedirectCache } from '@/lib/gauges/redirect-cache';
import { ACCESS_SLUG_RENAMES } from '@/lib/access-slugs';
import { mergedAccessSlug } from '@/lib/access-points/merged-slugs';
import { riverPath } from './river-path';
import { stateCodeFromSlug } from './states';

async function lookupRiverPath(slug: string): Promise<string | null> {
  const { data, error } = await createPublicCatalogClient().from('rivers')
    .select('slug, state').eq('slug', slug).eq('active', true)
    .abortSignal(AbortSignal.timeout(3000)).maybeSingle();
  if (error) throw error;
  return data?.state ? riverPath(data.state, data.slug) : null;
}

// Same bounded, coalescing catalog cache used by gauge share links. Canonical
// pages and state indexes never do this lookup; only the retired URL shapes do.
const cachedRiverPath = createGaugeRedirectCache(lookupRiverPath);

function canonicalAccessSlug(river: string, slug: string): string {
  const renamed = ACCESS_SLUG_RENAMES.find(entry => entry.river === river && entry.legacy === slug)?.canonical;
  if (renamed) return mergedAccessSlug(river, renamed) ?? renamed;
  // These two verified public aliases also live in next.config.mjs for URLs
  // that already contain a state. Skip that extra hop for legacy links.
  if (river === 'buffalo' && slug === 'hasty-launch') return 'hasty';
  if (river === 'buffalo' && slug === 'maumee-north') return 'north-maumee';
  return mergedAccessSlug(river, slug) ?? slug;
}

/** Redirect before React streams: permanentRedirect in a streamed page sends
 * HTTP 200 plus a meta refresh, which is not an HTTP permanent redirect. */
export async function legacyRiverRedirect(
  request: NextRequest,
  resolvePath = cachedRiverPath,
): Promise<NextResponse | null> {
  const match = /^\/rivers\/([a-z0-9-]+)(?:\/access\/([a-z0-9-]+))?\/?$/.exec(request.nextUrl.pathname);
  if (!match || stateCodeFromSlug(match[1])) return null;
  try {
    const path = await resolvePath(match[1]);
    if (!path) return null; // Let the route return its real not-found page.
    const destination = request.nextUrl.clone();
    destination.pathname = match[2]
      ? `${path}/access/${canonicalAccessSlug(match[1], match[2])}`
      : path;
    return NextResponse.redirect(destination, 308);
  } catch {
    // An unavailable catalog is not a missing river or a guessed state.
    return new NextResponse('River information is temporarily unavailable. Please try again.', {
      status: 503,
      headers: { 'Retry-After': '30', 'Cache-Control': 'no-store', 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }
}
