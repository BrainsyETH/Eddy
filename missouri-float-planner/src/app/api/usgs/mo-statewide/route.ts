import { NextResponse } from 'next/server';
import {
  fetchGaugeReadings,
  fetchDailyStatistics,
  calculateDischargePercentile,
  type DailyStatistics,
} from '@/lib/usgs/gauges';
import { ALL_MO_GAUGE_IDS, MO_RIVERS } from '@/lib/usgs/mo-statewide-data';

export const revalidate = 900; // 15-minute cadence matches USGS IV updates.
// Don't try to prerender at build time — this endpoint always needs USGS network.
export const dynamic = 'force-dynamic';

export interface MoStatewideGauge {
  site_no: string;
  river_id: string;
  river_name: string;
  basin: string;
  order: number;
  /** Live discharge in cfs, or null when missing. */
  dischargeCfs: number | null;
  /** Live gauge height in feet, or null when missing. */
  gaugeHeightFt: number | null;
  /** ISO timestamp of the latest reading. */
  readingTimestamp: string | null;
  /** Percentile rank (0-100) against this calendar date's period of record. */
  percentile: number | null;
  /** Stat record from USGS — null if site has insufficient history. */
  stats: DailyStatistics | null;
}

export interface MoStatewideResponse {
  generatedAt: string;
  cadenceSeconds: number;
  gauges: MoStatewideGauge[];
}

const RIVER_LOOKUP = new Map(
  MO_RIVERS.flatMap((r) => r.gauges.map((g) => [g.site_no, r])),
);

export async function GET() {
  // Single batched IV call for all sites.
  const readings = await fetchGaugeReadings(ALL_MO_GAUGE_IDS);
  const readingMap = new Map(readings.map((r) => [r.siteId, r]));

  // Stats are per-site; fan out in parallel and tolerate per-site failures.
  // The DV/STAT endpoints accept a single site at a time in practice; cache is
  // 24h, so this only hits USGS once per day per site.
  const statsResults = await Promise.allSettled(
    ALL_MO_GAUGE_IDS.map((id) => fetchDailyStatistics(id)),
  );

  const gauges: MoStatewideGauge[] = ALL_MO_GAUGE_IDS.map((siteId, i) => {
    const river = RIVER_LOOKUP.get(siteId);
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
      river_id: river?.id ?? 'unknown',
      river_name: river?.name ?? 'Unknown',
      basin: river?.basin ?? 'Unknown',
      order: river?.order ?? 0,
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
    headers: {
      // Edge / browser caching: short revalidation, longer SWR.
      'Cache-Control': 's-maxage=900, stale-while-revalidate=3600',
    },
  });
}
