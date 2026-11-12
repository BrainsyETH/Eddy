import { NextResponse } from 'next/server';
import { cdnCacheHeaders } from '@/lib/api-utils';
import {
  fetchHistoricalReadings,
  fetchDailyStatistics,
  calculateDischargePercentile,
} from '@/lib/usgs/gauges';
import { fetchMODataset } from '@/lib/usgs/mo-statewide-data';
import { getClientIp, rateLimit } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

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
 * Sites fetched from USGS at once. One request used to start a history call
 * for every gauge in the state together; in waves a slow upstream costs this
 * route time instead of costing USGS (and the key the crons share) a burst.
 * Ten keeps a cold load of the ~50 curated gauges to about five waves.
 */
const SITE_CONCURRENCY = 10;

// Waves are slower than one burst on a cold cache, so say how long is allowed
// rather than inherit the platform default.
export const maxDuration = 60;

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

export async function GET(request: Request) {
  try {
    // Reaches USGS on a CDN miss, and any query string is a miss. Per-IP, and
    // fail-open like the other public read routes (see lib/rate-limit.ts).
    const limited = await rateLimit(`usgs-history-bundle:${getClientIp(request)}`, 20, 60_000);
    if (limited) return limited;

    const dataset = await fetchMODataset();
    // Every river/gauge binding — primary AND secondary. The scrubber colors
    // each reach from its nearest gauge's condition, so the history for
    // secondary gauges has to be present too; without it, scrubbing back in
    // time dropped the secondary gauges to "unknown" and greyed the reaches.
    const targets: Array<{
      river_id: string;
      river_slug: string;
      site_no: string;
      is_primary: boolean;
    }> = [];
    for (const r of dataset.rivers) {
      for (const g of r.gauges ?? []) {
        targets.push({
          river_id: r.id,
          river_slug: r.slug,
          site_no: g.site_id,
          is_primary: g.is_primary,
        });
      }
    }

    // Fetch history + daily stats once per unique site. A single gauge can be
    // the primary for more than one river (e.g. 07017200 covers both Courtois
    // and Huzzah Creek), so de-dupe the USGS round-trips by site number.
    type SiteHistory = {
      daily: MoHistoryBundleEntry['daily'];
      band: MoHistoryBundleEntry['band'];
    };
    const uniqueSites = Array.from(new Set(targets.map((t) => t.site_no)));
    const perSite = new Map<string, SiteHistory>();
    const loadSite = async (siteNo: string) => {
      const [history, stats] = await Promise.all([
        fetchHistoricalReadings(siteNo, DAYS),
        fetchDailyStatistics(siteNo),
      ]);
      const dailyRaw = history ? dailyAggregate(history.readings) : [];
      const daily = dailyRaw.map((d) => ({
        ...d,
        percentile:
          d.dischargeCfs != null && stats
            ? calculateDischargePercentile(d.dischargeCfs, stats)
            : null,
      }));
      perSite.set(siteNo, {
        daily,
        band: stats
          ? { p25: stats.p25 ?? null, p50: stats.p50 ?? null, p75: stats.p75 ?? null }
          : null,
      });
    };
    for (let i = 0; i < uniqueSites.length; i += SITE_CONCURRENCY) {
      await Promise.all(uniqueSites.slice(i, i + SITE_CONCURRENCY).map(loadSite));
    }

    const results: MoHistoryBundleEntry[] = targets.map((t) => {
      const site = perSite.get(t.site_no);
      return {
        river_id: t.river_id,
        river_slug: t.river_slug,
        site_no: t.site_no,
        is_primary: t.is_primary,
        daily: site?.daily ?? [],
        band: site?.band ?? null,
      };
    });

    const body: MoHistoryBundleResponse = {
      generatedAt: new Date().toISOString(),
      days: DAYS,
      entries: results,
    };

    return NextResponse.json(body, {
      headers: cdnCacheHeaders(3600, 86400),
    });
  } catch (e) {
    console.error('[usgs/mo-history-bundle] Error:', e);
    return NextResponse.json(
      { error: 'Failed to load history' },
      { status: 500 },
    );
  }
}
