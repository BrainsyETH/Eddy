import { NextResponse } from 'next/server';
import { fetchMoContextSites, type MoContextSite } from '@/lib/usgs/mo-sites';

export const dynamic = 'force-dynamic';

export interface MoSitesResponse {
  generatedAt: string;
  sites: MoContextSite[];
  /** True when the server cap dropped lower-flow sites. */
  capped: boolean;
}

export async function GET() {
  try {
    const { sites, capped } = await fetchMoContextSites();
    const body: MoSitesResponse = {
      generatedAt: new Date().toISOString(),
      sites,
      capped,
    };
    return NextResponse.json(body, {
      headers: { 'Cache-Control': 's-maxage=900, stale-while-revalidate=1800' },
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
