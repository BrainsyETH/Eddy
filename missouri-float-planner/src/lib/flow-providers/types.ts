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
  /** 90th percentile discharge (cfs) - high */
  p90: number | null;
  /** Mean discharge (cfs) */
  mean: number | null;
  /** Number of years of data used */
  yearsOfRecord: number | null;
}

export interface HistoricalReading {
  timestamp: string;
  gaugeHeightFt: number | null;
  dischargeCfs: number | null;
}

export interface HistoricalData {
  siteId: string;
  siteName: string;
  readings: HistoricalReading[];
  minDischarge: number | null;
  maxDischarge: number | null;
  minHeight: number | null;
  maxHeight: number | null;
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

  /** Recent observation history for one site (default 7 days). */
  fetchHistory(siteId: string, days?: number): Promise<HistoricalData | null>;

  /**
   * Day-of-year discharge percentiles, or null when the provider has no
   * statistics product for this site.
   */
  fetchDailyStatistics(siteId: string, date?: Date): Promise<DailyStatistics | null>;

  /** Public monitoring page for a site, or null if the provider has none. */
  publicUrl(siteId: string): string | null;
}
