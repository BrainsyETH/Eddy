import { NextRequest, NextResponse } from 'next/server';
import { cdnCacheHeaders } from '@/lib/api-utils';
import { fetchMODataset } from '@/lib/usgs/mo-statewide-data';
import { getClientIp, rateLimit } from '@/lib/rate-limit';
import { fetchNwsForecastStages, upcomingPeak } from '@/lib/nws/forecast';

export const dynamic = 'force-dynamic';

/**
 * Official NWS forecasts (NWPS, via src/lib/nws/forecast.ts) for every primary
 * gauge that carries an `nws_lid`, keyed by USGS site number to match the rest
 * of the /river-map data shape.
 *
 * `stages` is the whole forecast hydrograph in feet, which is what the river
 * outlook buckets into days. `peakFt` / `peakAt` are the highest stage still
 * ahead in the next 72 hours — not the series maximum, which on a day-old
 * forecast can be a point that has already passed.
 */
export interface MoForecastDatum {
  dateTime: string;
  valueFt: number;
}

export interface MoForecastEntry {
  site_no: string;
  nws_lid: string;
  river_id: string;
  river_slug: string;
  river_name: string;
  stages: MoForecastDatum[];
  peakFt: number | null;
  peakAt: string | null;
}

export interface MoForecastResponse {
  generatedAt: string;
  entries: MoForecastEntry[];
}

export async function GET(request: NextRequest) {
  try {
    // Reaches USGS on a CDN miss, and any query string is a miss. Per-IP, and
    // fail-open like the other public read routes (see lib/rate-limit.ts).
    const limited = await rateLimit(`usgs-forecast:${getClientIp(request)}`, 30, 60_000);
    if (limited) return limited;

    const dataset = await fetchMODataset();

    interface SiteMeta {
      nws_lid: string;
      river_id: string;
      river_slug: string;
      river_name: string;
    }
    const bySite = new Map<string, SiteMeta>();
    for (const r of dataset.rivers) {
      for (const g of r.gauges ?? []) {
        if (!g.is_primary || !g.nws_lid || bySite.has(g.site_id)) continue;
        bySite.set(g.site_id, {
          nws_lid: g.nws_lid,
          river_id: r.id,
          river_slug: r.slug,
          river_name: r.name,
        });
      }
    }

    const requestedSiteId = request.nextUrl.searchParams.get('siteId');
    const siteIds = requestedSiteId
      ? (bySite.has(requestedSiteId) ? [requestedSiteId] : [])
      : Array.from(bySite.keys());
    const results = await Promise.allSettled(
      siteIds.map(async (siteId) => {
        const meta = bySite.get(siteId)!;
        const stages = await fetchNwsForecastStages(meta.nws_lid);
        const peak = upcomingPeak(stages, Date.now());
        const entry: MoForecastEntry = {
          site_no: siteId,
          nws_lid: meta.nws_lid,
          river_id: meta.river_id,
          river_slug: meta.river_slug,
          river_name: meta.river_name,
          stages,
          peakFt: peak?.peakFt ?? null,
          peakAt: peak?.peakAt ?? null,
        };
        return entry;
      }),
    );

    const entries = results
      .filter((r): r is PromiseFulfilledResult<MoForecastEntry> => r.status === 'fulfilled')
      .map((r) => r.value);

    const body: MoForecastResponse = {
      generatedAt: new Date().toISOString(),
      entries,
    };

    return NextResponse.json(body, {
      headers: cdnCacheHeaders(3600, 7200),
    });
  } catch (e) {
    console.error('[usgs/mo-forecast] Error:', e);
    return NextResponse.json(
      { error: 'Failed to load forecast' },
      { status: 500 },
    );
  }
}
