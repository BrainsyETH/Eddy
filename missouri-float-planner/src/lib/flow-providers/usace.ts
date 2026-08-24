// src/lib/flow-providers/usace.ts
// USACE flow provider — reads total dam RELEASE from the CWMS Data API and
// normalizes it to the same shape a USGS gauge produces, so a tailwater reach
// rides the existing ingestion -> ladder -> badge -> alert pipeline with no
// cron changes. Site ids are Eddy slugs ('swl-clearwater-dam'), stored in
// gauge_stations.site_id_external; usace-registry.ts maps them to the
// district's literal timeseries strings.
//
// Why a slug and not the CWMS id: 'Wappapello Lk-St Francis.Flow-Out.Ave.
// ~1Day.1Day.lakerep-rev' contains spaces, and the %-Flood Pool series
// contains a percent sign. Neither survives as a URL path segment
// (/api/gauges/[siteId]/history) or a stable database key.
//
// DELIBERATELY NARROW. This provider fetches ONE series per site — the
// release. Pool elevation, % flood pool, inflow, generation, tailwater
// temperature and the forecasts are reservoir state, not a river discharge;
// they are read through per-request in the dam routes. Fanning all of them out
// from here would put ~48 sequential HTTP calls inside update-gauges, which
// runs with maxDuration=60 and already budgets 30s for enrichment.
//
// gaugeHeightFt is ALWAYS NULL, on purpose. Tailwater elevation sits on a
// district vertical datum (NGVD29/NAVD88), not the river-stage datum any Eddy
// threshold uses — and pool elevation is worse: Table Rock's pool reads 916 ft,
// which in gauge_height_ft would trip the flood-stage override in
// shared/condition-ladder.ts (it runs BEFORE the null guard) and paint the
// river red. Keeping height null forces threshold_unit='cfs' and makes the
// alert gate's no-cross-unit-fallback do the right thing.

import { fetchTimeseries, fetchLatestValue } from '@/lib/usace/cda';
import { getUsaceDam, USACE_RELEASE_SITE_IDS } from './usace-registry';
import type {
  DailyStatistics,
  FlowProvider,
  GaugeReading,
  HistoricalData,
  HistoricalReading,
  HistoryCapabilities,
  HistoryFetchOptions,
} from './types';

/** Parallel in-flight requests. CDA is public and unauthenticated — stay polite. */
const FETCH_CONCURRENCY = 4;

/**
 * Hard wall for a whole fetchLatest fan-out. Partial results beat a killed
 * cron: 11 sites at concurrency 4 is three waves, comfortably inside this
 * when the district is healthy — and when it isn't, partials are the point.
 *
 * That 11 is USACE_RELEASE_SITE_IDS, not the registry size, and the
 * difference matters — only the dams declaring a release series can back a
 * gauge_stations row. The ten SWPA projects added for the Tulsa district
 * resolve their release at request time for display and are deliberately
 * absent here; the three Nashville dams declare theirs explicitly and count.
 */
const LATEST_BUDGET_MS = 15_000;

/**
 * Default lookback for "the latest value" — an hourly series plus publication
 * lag. Series carrying their own `lookbackHours` override it; MVS does,
 * because its observed release is a daily mean published a day in arrears.
 */
const DEFAULT_LOOKBACK_HOURS = 8;

/** Run `fn` over `items`, at most `limit` at a time, stopping at `deadline`. */
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  deadline: number,
  fn: (item: T) => Promise<R>
): Promise<Array<R | null>> {
  const out: Array<R | null> = new Array(items.length).fill(null);
  let cursor = 0;

  async function worker(): Promise<void> {
    for (;;) {
      const i = cursor;
      cursor += 1;
      if (i >= items.length) return;
      if (Date.now() > deadline) {
        console.warn('[USACE] budget exhausted; remaining sites skipped this run');
        return;
      }
      try {
        out[i] = await fn(items[i]);
      } catch (e) {
        console.error('[USACE] site fetch threw', e);
        out[i] = null;
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

export class UsaceProvider implements FlowProvider {
  readonly id = 'usace';

  async fetchLatest(
    siteIds: string[],
    options?: { skipCache?: boolean }
  ): Promise<GaugeReading[]> {
    const known = siteIds.filter((id) => {
      const dam = getUsaceDam(id);
      if (!dam) {
        console.error(`[USACE] unknown site "${id}" — is it in usace-registry.ts?`);
        return false;
      }
      if (!dam.series.release) {
        // Stockton and Truman are schedule-only: SWPA lists them, CWMS does
        // not. They legitimately have no reading to ingest.
        return false;
      }
      return true;
    });
    if (known.length === 0) return [];

    const deadline = Date.now() + LATEST_BUDGET_MS;
    const results = await mapWithConcurrency(
      known,
      FETCH_CONCURRENCY,
      deadline,
      async (siteId): Promise<GaugeReading | null> => {
        const dam = getUsaceDam(siteId)!;
        const series = dam.series.release!;
        const point = await fetchLatestValue(
          dam.office!,
          series.tsId,
          series.unit,
          series.lookbackHours ?? DEFAULT_LOOKBACK_HOURS,
          options
        );
        if (!point) return null;
        return {
          siteId,
          siteName: dam.name,
          gaugeHeightFt: null,
          dischargeCfs: point.value,
          readingTimestamp: new Date(point.timestamp).toISOString(),
          // 'P' (provisional) and nothing else, ever. CWMS quality-code bit
          // semantics are unverified, and emitting a code in SUSPECT_QUALIFIERS
          // would silently gate off every USACE alert — see lib/alerts/gate.ts.
          qualifiers: ['P'],
        };
      }
    );

    return results.filter((r): r is GaugeReading => r !== null);
  }

  // CWMS takes begin/end and could in principle serve custom ranges, but a
  // release schedule read a year back answers an operations question this
  // product does not ask — declare the minimum that is true and used.
  readonly historyCapabilities: HistoryCapabilities = {
    maxInstantDays: 30,
    supportsDaily: false,
    supportsCustomRange: false,
  };

  async fetchHistory(
    siteId: string,
    days = 7,
    options?: HistoryFetchOptions
  ): Promise<HistoricalData | null> {
    if (options?.from || options?.to || options?.resolution === 'daily') return null;
    const dam = getUsaceDam(siteId);
    const series = dam?.series.release;
    if (!dam || !series) return null;

    const end = new Date();
    const begin = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);
    const result = await fetchTimeseries(dam.office!, series.tsId, series.unit, begin, end);
    if (!result || result.points.length === 0) return null;

    const readings: HistoricalReading[] = result.points.map((p) => ({
      timestamp: new Date(p.timestamp).toISOString(),
      gaugeHeightFt: null,
      dischargeCfs: p.value,
    }));
    const discharge = result.points.map((p) => p.value);

    return {
      siteId,
      siteName: dam.name,
      readings,
      minDischarge: Math.min(...discharge),
      maxDischarge: Math.max(...discharge),
      minHeight: null,
      maxHeight: null,
    };
  }

  async fetchDailyStatistics(): Promise<DailyStatistics | null> {
    // A regulated release has no meaningful day-of-year percentile — the
    // number reflects an operator's decision, not the watershed. Framing it as
    // "% of normal" would actively mislead. Same stance as NwsProvider.
    return null;
  }

  publicUrl(siteId: string): string | null {
    // The district water-control pages were unreachable when this was written,
    // so no URL is claimed rather than shipping a guessed link. The interface
    // permits null and RiverGaugeDetail hides the link when it gets one.
    return getUsaceDam(siteId) ? null : null;
  }
}

export { USACE_RELEASE_SITE_IDS };
