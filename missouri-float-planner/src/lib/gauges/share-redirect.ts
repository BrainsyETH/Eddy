import { NextResponse, type NextRequest } from 'next/server';
import { createPublicCatalogClient } from '@/lib/supabase/public-read';
import { riverPath } from '@/lib/navigation/river-path';
import { createGaugeRedirectCache } from './redirect-cache';

/** Resolve before React streams HTML: Messages follows HTTP redirects, not
 * the meta-refresh emitted by permanentRedirect inside a streamed page.
 * This reader uses public catalog fields only, with a shared 3s deadline.
 */
export async function gaugeRedirectPath(slug: string): Promise<string | null> {
  const supabase = createPublicCatalogClient();
  const signal = AbortSignal.timeout(3000);
  if (!/^\d+$/.test(slug)) {
    const { data, error } = await supabase.from('rivers').select('slug, state')
      .eq('slug', slug).eq('active', true).abortSignal(signal).maybeSingle();
    if (error) throw error;
    return data ? riverPath(data.state, data.slug) : null;
  }

  const { data: station, error: stationError } = await supabase.from('gauge_stations')
    .select('id').eq('usgs_site_id', slug).eq('active', true).abortSignal(signal).maybeSingle();
  if (stationError) throw stationError;
  if (!station) return null;
  const { data, error } = await supabase.from('river_gauges')
    .select('rivers!inner(slug, state, active)').eq('gauge_station_id', station.id)
    .eq('is_primary', true).eq('rivers.active', true).order('river_id').limit(1)
    .abortSignal(signal).maybeSingle();
  if (error) throw error;
  const river = data?.rivers as unknown as { slug: string; state: string } | undefined;
  return river ? riverPath(river.state, river.slug) : null;
}

const cachedGaugeRedirectPath = createGaugeRedirectCache(gaugeRedirectPath);

export async function gaugeShareRedirect(
  request: NextRequest,
  resolvePath = cachedGaugeRedirectPath,
): Promise<NextResponse | null> {
  const match = /^\/gauges\/([a-zA-Z0-9_-]+)\/?$/.exec(request.nextUrl.pathname);
  if (!match) return null; // Never intercept image routes, the index or APIs.
  try {
    const path = await resolvePath(match[1]);
    if (!path) return NextResponse.next();
    const destination = request.nextUrl.clone();
    destination.pathname = path; // Keep query strings; browsers retain fragments.
    // A gauge can move to another primary river. Keep browser redirects
    // temporary; only the bounded catalog lookup above is cached. Proxy runs
    // before the CDN, so a response cache header alone cannot save these reads.
    return NextResponse.redirect(destination, { status: 307, headers: { 'Cache-Control': 'no-store' } });
  } catch {
    // A provider outage is neither an orphan gauge nor a permanent 404.
    return new NextResponse('Gauge information is temporarily unavailable. Please try again.', {
      status: 503,
      headers: { 'Retry-After': '30', 'Cache-Control': 'no-store', 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }
}
