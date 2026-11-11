import { NextResponse } from 'next/server';
import { cdnCacheHeaders } from '@/lib/api-utils';
import { fetchMoContextSites, type MoContextSite } from '@/lib/usgs/mo-sites';
import { getClientIp, rateLimit } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

export interface MoSitesResponse {
  generatedAt: string;
  sites: MoContextSite[];
  /** True when the server cap dropped lower-flow sites. */
  capped: boolean;
}

export async function GET(request: Request) {
  try {
    // Reaches USGS on a CDN miss, and any query string is a miss. Per-IP, and
    // fail-open like the other public read routes (see lib/rate-limit.ts).
    const limited = await rateLimit(`usgs-sites:${getClientIp(request)}`, 30, 60_000);
    if (limited) return limited;

    const { sites, capped } = await fetchMoContextSites();
    const body: MoSitesResponse = {
      generatedAt: new Date().toISOString(),
      sites,
      capped,
    };
    return NextResponse.json(body, {
      headers: cdnCacheHeaders(900, 1800),
    });
  } catch {
    // Context layer is strictly optional — degrade to curated-only.
    const body: MoSitesResponse = {
      generatedAt: new Date().toISOString(),
      sites: [],
      capped: false,
    };
    return NextResponse.json(body, { status: 200 });
  }
}
