import { NextResponse } from 'next/server';
import {
  fetchHistoricalReadings,
  fetchDailyStatistics,
  calculateDischargePercentile,
} from '@/lib/usgs/gauges';
import { fetchMODataset } from '@/lib/usgs/mo-statewide-data';

export const dynamic = 'force-dynamic';
export const revalidate = 3600;

export interface MoHistoryBundleEntry {
  river_id: string;
  river_slug: string;
  site_no: string;
  is_primary: boolean;
  /** One sample per day for the past 30 days, oldest first. */
  daily: Array<{
    date: string; // YYYY-MM-DD
    dischargeCfs: number | null;
    gaugeHeightFt: number | null;
    percentile: number | null;
  }>;
  band: { p25: number | null; p50: number | null; p75: number | null } | null;
}

export interface MoHistoryBundleResponse {
  generatedAt: string;
  days: number;
  entries: MoHistoryBundleEntry[];
}

const DAYS = 30;

/**
 * Down-samples raw 15-minute IV readings into one row per calendar day,
 * UTC. Uses median value when a day has multiple samples.
 */
function dailyAggregate(
  readings: Array<{ timestamp: string; dischargeCfs: number | null; gaugeHeightFt: number | null }>,
) {
  const byDay = new Map<
    string,
    { cfs: number[]; ft: number[] }
  >();
  for (const r of readings) {
    const day = r.timestamp.slice(0, 10); // YYYY-MM-DD
    const bucket = byDay.get(day) ?? { cfs: [], ft: [] };
    if (r.dischargeCfs != null) bucket.cfs.push(r.dischargeCfs);
    if (r.gaugeHeightFt != null) bucket.ft.push(r.gaugeHeightFt);
    byDay.set(day, bucket);
  }
  const median = (arr: number[]): number | null => {
    if (!arr.length) return null;
    const s = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(s.length / 2);
    return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
  };
  return Array.from(byDay.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, b]) => ({
      date,
      dischargeCfs: median(b.cfs),
      gaugeHeightFt: median(b.ft),
    }));
}

export async function GET() {
  try {
    const dataset = await fetchMODataset();
    const targets: Array<{
      river_id: string;
      river_slug: string;
      site_no: string;
      is_primary: boolean;
    }> = [];
    for (const r of dataset.rivers) {
      for (const g of r.gauges ?? []) {
        if (g.is_primary) {
          targets.push({
            river_id: r.id,
            river_slug: r.slug,
            site_no: g.site_id,
            is_primary: true,
          });
        }
      }
    }

    const results = await Promise.all(
      targets.map(async (t) => {
        const [history, stats] = await Promise.all([
          fetchHistoricalReadings(t.site_no, DAYS),
          fetchDailyStatistics(t.site_no),
        ]);
        const dailyRaw = history ? dailyAggregate(history.readings) : [];
        const daily = dailyRaw.map((d) => ({
          ...d,
          percentile:
            d.dischargeCfs != null && stats
              ? calculateDischargePercentile(d.dischargeCfs, stats)
              : null,
        }));
        const entry: MoHistoryBundleEntry = {
          river_id: t.river_id,
          river_slug: t.river_slug,
          site_no: t.site_no,
          is_primary: t.is_primary,
          daily,
          band: stats
            ? { p25: stats.p25 ?? null, p50: stats.p50 ?? null, p75: stats.p75 ?? null }
            : null,
        };
        return entry;
      }),
    );

    const body: MoHistoryBundleResponse = {
      generatedAt: new Date().toISOString(),
      days: DAYS,
      entries: results,
    };

    return NextResponse.json(body, {
      headers: { 'Cache-Control': 's-maxage=3600, stale-while-revalidate=86400' },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
