import { ImageResponse } from 'next/og';
import { NextRequest, NextResponse } from 'next/server';
import { parseChartShare } from '@shared/chart-share';
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
  const limited = await rateLimit(`chart-image:${getClientIp(request)}`, 12, 60_000, { failClosed: true });
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
