import { ImageResponse } from 'next/og';
import { NextRequest, NextResponse } from 'next/server';
import { chartImagePath, parseChartShare } from '@shared/chart-share';
import { loadChartShareData } from '@/lib/gauges/chart-share-data';
import { ChartShareImage } from '@/lib/og/chart-share-image';
import { loadOgFonts } from '@/lib/og/fonts';
import { getClientIp, rateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: NextRequest, { params }: { params: Promise<{ provider: string; siteId: string }> }) {
  const { provider, siteId } = await params;
  const state = parseChartShare(provider, siteId, request.nextUrl.searchParams);
  if (!state) return NextResponse.json({ error: 'Invalid chart link' }, { status: 400, headers: { 'Cache-Control': 'no-store' } });
  // Tracking keys, ordering and alternate encodings must not buy another render.
  // Normalize before any upstream work, so all variants share one image cache key.
  const canonical = new URL(chartImagePath(state), request.url);
  if (request.nextUrl.search !== canonical.search) {
    return NextResponse.redirect(canonical, { status: 308, headers: { 'Cache-Control': 'public, max-age=300' } });
  }
  // Shared crawler IPs need room for bursts; user agents never bypass this limit.
  const limited = await rateLimit(`chart-image:${getClientIp(request)}`, 60, 60_000, { failClosed: true });
  if (limited) { limited.headers.set('Cache-Control', 'no-store'); return limited; }
  try {
    const data = await loadChartShareData(state, request.headers);
    const image = new ImageResponse(<ChartShareImage data={data} />, { width: 1200, height: 630, fonts: loadOgFonts() });
    // Consume the render so errors receive no-store, rather than caching a broken stream.
    return new Response(await image.arrayBuffer(), { headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=60, s-maxage=300' } });
  } catch {
    return NextResponse.json({ error: 'Chart image unavailable. Please try again.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
