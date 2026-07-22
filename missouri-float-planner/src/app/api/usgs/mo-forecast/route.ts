import { NextRequest, NextResponse } from 'next/server';
import { fetchMODataset } from '@/lib/usgs/mo-statewide-data';

export const dynamic = 'force-dynamic';

/**
 * NWS AHPS forecast peaks for every primary gauge that carries an
 * `nws_lid`. Returns the next-72h hydrograph (forecast block) plus the
 * single peak stage and timestamp, keyed by USGS site number to match the
 * rest of the /river-map data shape.
 *
 * AHPS XML schema (relevant parts):
 *   <site>
 *     <forecast>
 *       <datum>
 *         <valid timezone="UTC">2026-05-08T12:00:00-00:00</valid>
 *         <primary name="Stage" units="ft">5.42</primary>
 *       </datum>
 *       …
 *     </forecast>
 *   </site>
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

const AHPS_BASE = 'https://water.weather.gov/ahps2/hydrograph_to_xml.php';

function ahpsUrl(lid: string): string {
  return `${AHPS_BASE}?gage=${encodeURIComponent(lid)}&output=xml`;
}

function parseForecastDatums(xml: string): MoForecastDatum[] {
  const block = xml.match(/<forecast[^>]*>([\s\S]*?)<\/forecast>/i)?.[1];
  if (!block) return [];
  const out: MoForecastDatum[] = [];
  const datumRegex = /<datum>([\s\S]*?)<\/datum>/gi;
  let m: RegExpExecArray | null;
  while ((m = datumRegex.exec(block)) !== null) {
    const inner = m[1];
    const valid = inner.match(/<valid[^>]*>([^<]+)<\/valid>/i)?.[1]?.trim();
    const primary = inner.match(/<primary[^>]*>([^<]+)<\/primary>/i)?.[1]?.trim();
    if (!valid || !primary) continue;
    const valueFt = parseFloat(primary);
    if (!Number.isFinite(valueFt)) continue;
    out.push({ dateTime: valid, valueFt });
  }
  return out;
}

async function fetchForecast(lid: string): Promise<MoForecastDatum[]> {
  const res = await fetch(ahpsUrl(lid), { signal: AbortSignal.timeout(10_000), next: { revalidate: 3600 } });
  if (!res.ok) return [];
  const xml = await res.text();
  return parseForecastDatums(xml);
}

export async function GET(request: NextRequest) {
  try {
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
        const stages = await fetchForecast(meta.nws_lid);
        let peakFt: number | null = null;
        let peakAt: string | null = null;
        for (const d of stages) {
          if (peakFt == null || d.valueFt > peakFt) {
            peakFt = d.valueFt;
            peakAt = d.dateTime;
          }
        }
        const entry: MoForecastEntry = {
          site_no: siteId,
          nws_lid: meta.nws_lid,
          river_id: meta.river_id,
          river_slug: meta.river_slug,
          river_name: meta.river_name,
          stages,
          peakFt,
          peakAt,
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
      headers: { 'Cache-Control': 's-maxage=3600, stale-while-revalidate=7200' },
    });
  } catch (e) {
    console.error('[usgs/mo-forecast] Error:', e);
    return NextResponse.json(
      { error: 'Failed to load forecast' },
      { status: 500 },
    );
  }
}
