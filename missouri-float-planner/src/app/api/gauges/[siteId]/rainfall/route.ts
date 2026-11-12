import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getClientIp, rateLimit } from '@/lib/rate-limit';
import { publicRainSite } from '@/lib/rainfall/public-policy';
import { readPublishedRain } from '@/lib/rainfall/public-store';
import type { RainDetail } from '@shared/rainfall';

export const dynamic = 'force-dynamic';
const cache = new Map<string, { until: number; value: Promise<RainDetail | null> }>();
export async function GET(request: Request, context: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await context.params;
  if (!/^\d{8,15}$/.test(siteId) || !publicRainSite(siteId)) return NextResponse.json({ available: false }, { status: 404 });
  const limited = await rateLimit(`rainfall:${getClientIp(request)}`, 60, 60_000);
  if (limited) return limited;
  try {
    let cached = cache.get(siteId);
    if (!cached || cached.until < Date.now()) {
      cached = { until: Date.now() + 5 * 60_000, value: readPublishedRain(createAdminClient(AbortSignal.timeout(10_000)), siteId) };
      cache.set(siteId, cached);
    }
    const detail = await cached.value;
    if (!detail) return NextResponse.json({ available: false }, { status: 404 });
    // Geometry/raster cells are fetched only when the detail is opened.
    const { boundary, shading, context: mapContext, ...summary } = detail;
    const data = new URL(request.url).searchParams.get('detail') === '1' ? { ...summary, boundary, shading, context: mapContext } : summary;
    return NextResponse.json(data, { headers: { 'Cache-Control': 'public, max-age=60, s-maxage=300' } });
  } catch {
    cache.delete(siteId);
    return NextResponse.json({ error: 'Rain data unavailable' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
