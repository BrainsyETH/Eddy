import type { GaugeDetail } from '@/app/api/gauges/[siteId]/route';
import { centralDayKey } from '@shared/dam-schedule-copy';
import { gaugeFreshness } from '@shared/gauge-freshness';
import { flowBand } from '@shared/flow-band';
import { calculateDischargePercentile } from '@/lib/usgs/gauges';
import {
  PARAM_DISCHARGE, readSnapshotStatisticsForSites, seasonalBandEligible,
} from '@/lib/usgs/percentile-snapshot';
import type { DailyStatistics } from '@/lib/flow-providers/types';

/** One indexed batch for the catalog, with the same Ozarks date as the copy. */
export async function loadGaugeSeasonalStats(
  client: Parameters<typeof readSnapshotStatisticsForSites>[0],
  stations: readonly { provider: string | null; usgs_site_id: string | null }[],
  asOf = new Date(),
): Promise<Map<string, DailyStatistics>> {
  const sites = stations.filter(s => (s.provider ?? 'usgs') === 'usgs' && s.usgs_site_id)
    .map(s => s.usgs_site_id!);
  const [year, month, day] = centralDayKey(asOf.getTime()).split('-').map(Number);
  try {
    const result = await readSnapshotStatisticsForSites(client, sites, new Date(year, month - 1, day));
    if (result.failedChunks) console.warn('[gauges] seasonal context unavailable for some stations');
    return result.stats;
  } catch (error) {
    // Optional enrichment must never take the readings and ladders down with it.
    console.warn('[gauges] seasonal context lookup failed', error);
    return new Map();
  }
}

/** Compare the actual returned discharge, including a newer live fallback. */
export function gaugeSeasonalContext(
  reading: { provider?: string | null; dischargeCfs: number | null; readingTimestamp: string | null; readingSuspect: boolean },
  stats: DailyStatistics | null | undefined,
  asOf = new Date(),
): GaugeDetail['seasonalContext'] {
  if ((reading.provider ?? 'usgs') !== 'usgs' || reading.readingSuspect ||
    reading.dischargeCfs == null || !Number.isFinite(reading.dischargeCfs) ||
    gaugeFreshness(reading.readingTimestamp, asOf.getTime()) !== 'live' || !stats ||
    !seasonalBandEligible({ parameterCode: stats.parameterCode ?? PARAM_DISCHARGE, yearsOfRecord: stats.yearsOfRecord })) return null;
  const percentile = calculateDischargePercentile(reading.dischargeCfs, stats);
  const band = flowBand(percentile);
  if (percentile == null || !band) return null;
  return { unit: 'cfs', parameterCode: PARAM_DISCHARGE, percentile, band,
    yearsOfRecord: stats.yearsOfRecord ?? null, asOf: asOf.toISOString() };
}
