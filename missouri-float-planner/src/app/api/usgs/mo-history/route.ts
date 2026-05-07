import { NextResponse } from 'next/server';
import {
  fetchHistoricalReadings,
  fetchDailyStatistics,
  calculateDischargePercentile,
} from '@/lib/usgs/gauges';

export const revalidate = 3600;
export const dynamic = 'force-dynamic';

export interface MoHistoryPoint {
  timestamp: string;
  dischargeCfs: number | null;
  gaugeHeightFt: number | null;
  /** Percentile against this calendar date's period of record. */
  percentile: number | null;
}

export interface MoHistoryResponse {
  siteId: string;
  siteName: string;
  days: number;
  points: MoHistoryPoint[];
  /** Period-of-record percentile band for the most recent calendar date. */
  band: { p25: number | null; p50: number | null; p75: number | null } | null;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const siteId = url.searchParams.get('siteId');
  const days = Math.min(parseInt(url.searchParams.get('days') ?? '30', 10) || 30, 90);

  if (!siteId || !/^\d{8,15}$/.test(siteId)) {
    return NextResponse.json({ error: 'Missing or invalid siteId' }, { status: 400 });
  }

  const [history, stats] = await Promise.all([
    fetchHistoricalReadings(siteId, days),
    fetchDailyStatistics(siteId),
  ]);

  if (!history) {
    return NextResponse.json(
      { error: 'No history available for this gauge' },
      { status: 404 },
    );
  }

  // Down-sample to one point per ~3 hours so the client gets a tidy curve.
  const STRIDE_MS = 3 * 3600 * 1000;
  const downsampled: typeof history.readings = [];
  let lastTs = -Infinity;
  for (const r of history.readings) {
    const t = new Date(r.timestamp).getTime();
    if (t - lastTs >= STRIDE_MS) {
      downsampled.push(r);
      lastTs = t;
    }
  }

  const points: MoHistoryPoint[] = downsampled.map((r) => {
    let percentile: number | null = null;
    if (r.dischargeCfs != null && stats) {
      percentile = calculateDischargePercentile(r.dischargeCfs, stats);
    }
    return {
      timestamp: r.timestamp,
      dischargeCfs: r.dischargeCfs,
      gaugeHeightFt: r.gaugeHeightFt,
      percentile,
    };
  });

  const body: MoHistoryResponse = {
    siteId,
    siteName: history.siteName,
    days,
    points,
    band: stats
      ? { p25: stats.p25 ?? null, p50: stats.p50 ?? null, p75: stats.p75 ?? null }
      : null,
  };

  return NextResponse.json(body, {
    headers: {
      'Cache-Control': 's-maxage=3600, stale-while-revalidate=86400',
    },
  });
}
