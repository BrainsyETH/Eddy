import { NextResponse } from 'next/server';
import {
  fetchGaugeReadings,
  fetchDailyStatistics,
  calculateDischargePercentile,
  type DailyStatistics,
} from '@/lib/usgs/gauges';
import { fetchMODataset } from '@/lib/usgs/mo-statewide-data';

export const dynamic = 'force-dynamic';
export const revalidate = 900;

export interface MoStatewideGauge {
  site_no: string;
  river_id: string;
  river_slug: string;
  river_name: string;
  is_primary: boolean;
  dischargeCfs: number | null;
  gaugeHeightFt: number | null;
  readingTimestamp: string | null;
  percentile: number | null;
  stats: DailyStatistics | null;
}

export interface MoStatewideResponse {
  generatedAt: string;
  cadenceSeconds: number;
  gauges: MoStatewideGauge[];
}

export async function GET() {
  try {
    const dataset = await fetchMODataset();

    // Build a per-site → river map.
    const siteToRiver = new Map<
      string,
      { river_id: string; river_slug: string; river_name: string; is_primary: boolean }
    >();
    for (const r of dataset.rivers) {
      for (const g of r.gauges ?? []) {
        if (!siteToRiver.has(g.site_id)) {
          siteToRiver.set(g.site_id, {
            river_id: r.id,
            river_slug: r.slug,
            river_name: r.name,
            is_primary: g.is_primary,
          });
        }
      }
    }
    const siteIds = Array.from(siteToRiver.keys());
    if (!siteIds.length) {
      return NextResponse.json(
        { generatedAt: new Date().toISOString(), cadenceSeconds: 900, gauges: [] },
      );
    }

    const readings = await fetchGaugeReadings(siteIds);
    const readingMap = new Map(readings.map((r) => [r.siteId, r]));

    const statsResults = await Promise.allSettled(
      siteIds.map((id) => fetchDailyStatistics(id)),
    );

    const gauges: MoStatewideGauge[] = siteIds.map((siteId, i) => {
      const meta = siteToRiver.get(siteId)!;
      const reading = readingMap.get(siteId) ?? null;
      const statsRes = statsResults[i];
      const stats =
        statsRes.status === 'fulfilled' && statsRes.value ? statsRes.value : null;

      let percentile: number | null = null;
      if (reading?.dischargeCfs != null && stats) {
        percentile = calculateDischargePercentile(reading.dischargeCfs, stats);
      }

      return {
        site_no: siteId,
        river_id: meta.river_id,
        river_slug: meta.river_slug,
        river_name: meta.river_name,
        is_primary: meta.is_primary,
        dischargeCfs: reading?.dischargeCfs ?? null,
        gaugeHeightFt: reading?.gaugeHeightFt ?? null,
        readingTimestamp: reading?.readingTimestamp ?? null,
        percentile,
        stats,
      };
    });

    const body: MoStatewideResponse = {
      generatedAt: new Date().toISOString(),
      cadenceSeconds: 900,
      gauges,
    };

    return NextResponse.json(body, {
      headers: { 'Cache-Control': 's-maxage=900, stale-while-revalidate=3600' },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
