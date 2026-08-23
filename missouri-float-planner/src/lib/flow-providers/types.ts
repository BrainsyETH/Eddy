// src/lib/flow-providers/types.ts
// Provider-agnostic flow data model + the FlowProvider interface.
// Every flow source (USGS, USACE, state agencies, ...) normalizes to these
// shapes; nothing downstream of the provider layer should know which agency
// a reading came from.

/** A single normalized gauge reading (latest observation per site). */
export interface GaugeReading {
  /** Provider-native site id (for USGS, the 8-digit site number). */
  siteId: string;
  /**
   * Human-readable site name. Providers that don't return one fall back to
   * the site id; display code should prefer gauge_stations.name from the DB.
   */
  siteName: string;
  gaugeHeightFt: number | null;
  dischargeCfs: number | null;
  readingTimestamp: string | null;
  /**
   * Provider qualifier codes on the reading, normalized to USGS conventions
   * ('P' provisional, 'e' estimated, 'Ice', 'Eqp', ...). The modern USGS API's
   * approval_status of "Provisional" maps to 'P'.
   */
  qualifiers: string[];
}

/** Historical day-of-year discharge percentiles for a site. */
export interface DailyStatistics {
  siteId: string;
  month: number;
  day: number;
  /** 10th percentile discharge (cfs) - very low */
  p10: number | null;
  /** 25th percentile discharge (cfs) - low */
  p25: number | null;
  /** 50th percentile discharge (cfs) - median/typical */
  p50: number | null;
  /** 75th percentile discharge (cfs) - above average */
  p75: number | null;
  /**
   * 90th percentile discharge (cfs) - high.
   *
   * NOTE: as of 2026 the USGS daily-statistics service returns this column
   * EMPTY for every site/day we've checked, while still publishing p80 and
   * p95. Treat null as expected, not exceptional — percentile math must fall
   * back to another upper anchor rather than giving up (see
   * calculateDischargePercentile).
   */
  p90: number | null;
  /** 5th percentile discharge (cfs). Optional — not all sources publish it. */
  p05?: number | null;
  /** 20th percentile discharge (cfs). Optional. */
  p20?: number | null;
  /** 80th percentile discharge (cfs). Optional — the usual p90 stand-in. */
  p80?: number | null;
  /** 95th percentile discharge (cfs). Optional. */
  p95?: number | null;
  /** Mean discharge (cfs) */
  mean: number | null;
  /**
   * Number of years of data used.
   *
   * PER PARAMETER, never assumed across parameters: the same site can hold
   * 105 years of discharge and 31 of stage, so a ladder's sample depth must
   * come from the row actually read.
   */
  yearsOfRecord: number | null;
  /**
   * Which USGS parameter this ladder describes ('00060' discharge, '00065'
   * gage height). Optional — readers that predate stage statistics only ever
   * produced discharge, and absent means discharge.
   */
  parameterCode?: string;
}

/**
 * One day-of-year row of statistics, before it is keyed to a calendar date.
 *
 * Lives here rather than beside a fetcher because two of them now produce it:
 * the modern USGS Statistics API (src/lib/flow-providers/usgs-statistics.ts)
 * and, until it is decommissioned, the legacy RDB statistics service.
 * `DailyStatistics` above is what the app consumes; this is the row shape the
 * snapshot table is written from.
 */
export interface DailyStatisticsRow {
  month: number;
  day: number;
  p05: number | null;
  p10: number | null;
  p20: number | null;
  p25: number | null;
  p50: number | null;
  p75: number | null;
  p80: number | null;
  p90: number | null;
  p95: number | null;
  mean: number | null;
  countYears: number | null;
  beginYear: number | null;
  endYear: number | null;
}

export interface HistoricalReading {
  timestamp: string;
  gaugeHeightFt: number | null;
  dischargeCfs: number | null;
  /**
   * Provider qualifier codes on this observation, same vocabulary as
   * GaugeReading.qualifiers ('P' provisional, 'e' estimated, 'Ice', ...).
   *
   * Optional rather than required because only USGS publishes them per
   * historical point — NWPS and USACE series carry none, and a provider that
   * omits the field is saying "unqualified", not "unknown".
   */
  qualifiers?: string[];
}

/**
 * What produced each value in a history series. `instantaneous` is the
 * sensor's own cadence (USGS IV, NWPS stageflow); the daily pair are USGS
 * daily-values statistics — `daily_mean` is statistic 00003 (discharge's
 * daily product) and `daily_selected` is 30800 ("selected value", stage's).
 */
export type HistoryStatistic = 'instantaneous' | 'daily_mean' | 'daily_selected';

export interface HistoryFetchOptions {
  /** Explicit window. When both are present they win over `days`. */
  from?: Date;
  to?: Date;
  /**
   * 'auto' (default): instantaneous within the provider's supported recent
   * window, daily beyond it where the provider has daily values. 'instant'
   * and 'daily' force one, and a provider that cannot serve the forced
   * resolution for the window returns null rather than substituting.
   */
  resolution?: 'auto' | 'instant' | 'daily';
}

/**
 * What a provider's history endpoint can actually serve — declared per
 * provider instead of assumed-USGS-everywhere, which is how a 90-day request
 * used to be clamped to 30 globally while an NWS station silently topped out
 * near 30 and a USGS one could have gone further. Shipped on the wire
 * (GaugeDetail.historyCapabilities): there is no client-side provider
 * registry, so a client-side table would be a second copy waiting to drift.
 */
export interface HistoryCapabilities {
  /** Longest window (days ending now) servable at instantaneous resolution. */
  maxInstantDays: number;
  /** Whether longer windows can be served from daily values. */
  supportsDaily: boolean;
  /** Whether explicit from/to windows are supported at all. */
  supportsCustomRange: boolean;
}

export interface HistoricalData {
  siteId: string;
  siteName: string;
  readings: HistoricalReading[];
  minDischarge: number | null;
  maxDischarge: number | null;
  minHeight: number | null;
  maxHeight: number | null;
  /**
   * How the series was sampled. Optional — absent means instantaneous, which
   * is what every provider produced before daily values existed. A 1-year
   * plot built from daily means must be able to say so.
   */
  statistic?: HistoryStatistic;
}

/**
 * A pluggable flow-data source. Implementations own endpoint URLs, parameter
 * codes, response parsing, and unit normalization (internal canonical units
 * are ft / cfs).
 */
export interface FlowProvider {
  /** Registry id — matches gauge_stations.provider. */
  readonly id: string;

  /** Latest observation for each site. Missing/failed sites are omitted. */
  fetchLatest(
    siteIds: string[],
    options?: { skipCache?: boolean }
  ): Promise<GaugeReading[]>;

  /** What fetchHistory can serve for this provider's stations. */
  readonly historyCapabilities: HistoryCapabilities;

  /**
   * Observation history for one site (default: last 7 days, instantaneous).
   * `options` widens the old single-scalar contract — an explicit window
   * and/or a resolution — and every implementation must honor its
   * declared capabilities: an unsupported window returns null, never a
   * silently different window than asked for.
   */
  fetchHistory(
    siteId: string,
    days?: number,
    options?: HistoryFetchOptions
  ): Promise<HistoricalData | null>;

  /**
   * Day-of-year discharge percentiles, or null when the provider has no
   * statistics product for this site.
   */
  fetchDailyStatistics(siteId: string, date?: Date): Promise<DailyStatistics | null>;

  /** Public monitoring page for a site, or null if the provider has none. */
  publicUrl(siteId: string): string | null;
}
