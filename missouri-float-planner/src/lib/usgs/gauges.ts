// src/lib/usgs/gauges.ts
// USGS Water Services API integration for gauge readings

interface USGSValue {
  value: string;
  qualifiers: string[];
  dateTime: string;
}

interface USGSTimeSeries {
  sourceInfo: {
    siteName: string;
    siteCode: Array<{ value: string; network: string; agencyCode: string }>;
    geoLocation: {
      geogLocation: {
        latitude: number;
        longitude: number;
      };
    };
  };
  variable: {
    variableCode: Array<{ value: string; network: string }>;
    variableName: string;
    unit: { unitCode: string };
  };
  values: Array<{
    value: Array<USGSValue>;
  }>;
}

interface USGSResponse {
  name: string;
  declaredType: string;
  scope: string;
  value: {
    queryInfo: {
      queryURL: string;
      criteria: {
        locationParam: string;
        variableParam: string;
        timeParam: {
          beginDateTime: string;
          endDateTime: string;
        };
      };
    };
    timeSeries: USGSTimeSeries[];
  };
  globalScope: boolean;
  null: boolean;
}

export interface GaugeReading {
  siteId: string;
  siteName: string;
  gaugeHeightFt: number | null;
  dischargeCfs: number | null;
  readingTimestamp: string | null;
}

/**
 * Fetches current gauge readings from USGS Water Services API
 * 
 * @param siteIds Array of USGS site IDs (e.g., ['07019000', '07018500'])
 * @param options Optional configuration
 * @param options.skipCache If true, bypasses Next.js cache (for cron jobs)
 * @returns Array of gauge readings
 */
export async function fetchGaugeReadings(
  siteIds: string[],
  options?: { skipCache?: boolean }
): Promise<GaugeReading[]> {
  if (siteIds.length === 0) {
    return [];
  }

  const url = new URL('https://waterservices.usgs.gov/nwis/iv/');
  url.searchParams.set('format', 'json');
  url.searchParams.set('sites', siteIds.join(','));
  url.searchParams.set('parameterCd', '00065,00060'); // 00065 = gauge height (ft), 00060 = discharge (cfs)
  url.searchParams.set('siteStatus', 'all');

  try {
    const fetchOptions: RequestInit = options?.skipCache
      ? { cache: 'no-store' } // No caching for cron jobs
      : { next: { revalidate: 3600 } }; // Cache for 1 hour for regular API calls

    const response = await fetch(url.toString(), fetchOptions);

    if (!response.ok) {
      throw new Error(`USGS API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json() as USGSResponse;

    if (!data.value?.timeSeries) {
      return [];
    }

    // Parse time series data
    const readings = new Map<string, Partial<GaugeReading>>();

    for (const series of data.value.timeSeries) {
      const siteId = series.sourceInfo.siteCode[0]?.value;
      if (!siteId) continue;

      if (!readings.has(siteId)) {
        readings.set(siteId, {
          siteId,
          siteName: series.sourceInfo.siteName,
          gaugeHeightFt: null,
          dischargeCfs: null,
          readingTimestamp: null,
        });
      }

      const reading = readings.get(siteId)!;
      const variableCode = series.variable.variableCode[0]?.value;
      const latestValue = series.values[0]?.value?.[0];

      if (!latestValue) continue;

      if (variableCode === '00065') {
        // Gauge height in feet
        const height = parseFloat(latestValue.value);
        // Validate: filter out USGS error values (e.g., -999999) and unreasonable values
        // Valid gauge heights are typically between -10 and 100 feet
        if (!isNaN(height) && height > -100 && height < 500) {
          reading.gaugeHeightFt = height;
          reading.readingTimestamp = latestValue.dateTime;
        } else if (!isNaN(height)) {
          console.warn(`Invalid gauge height ${height} for site ${siteId}, treating as unavailable`);
        }
      } else if (variableCode === '00060') {
        // Discharge in cubic feet per second
        const discharge = parseFloat(latestValue.value);
        // Validate: filter out USGS error values and unreasonable values
        // Valid discharge is typically between 0 and 1,000,000 cfs
        if (!isNaN(discharge) && discharge >= 0 && discharge < 1000000) {
          reading.dischargeCfs = discharge;
          // Use discharge timestamp if gauge height timestamp not available
          if (!reading.readingTimestamp) {
            reading.readingTimestamp = latestValue.dateTime;
          }
        } else if (!isNaN(discharge)) {
          console.warn(`Invalid discharge ${discharge} for site ${siteId}, treating as unavailable`);
        }
      }
    }

    return Array.from(readings.values()) as GaugeReading[];
  } catch (error) {
    console.error('Error fetching USGS gauge readings:', error);
    throw error;
  }
}

/**
 * Fetches a single gauge reading by site ID
 */
export async function fetchGaugeReading(siteId: string): Promise<GaugeReading | null> {
  const readings = await fetchGaugeReadings([siteId]);
  return readings[0] || null;
}

// ============================================
// DAILY STATISTICS (PERCENTILES)
// ============================================

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

interface USGSStatValue {
  month_nu: string;
  day_nu: string;
  p10_va?: string;
  p25_va?: string;
  p50_va?: string;
  p75_va?: string;
  p90_va?: string;
  mean_va?: string;
  count_nu?: string;
}

/**
 * Fetches daily discharge statistics (percentiles) from USGS Statistics Service
 *
 * These statistics represent historical percentiles for each day of the year,
 * allowing comparison of current discharge to typical conditions for that date.
 *
 * @param siteId USGS site ID
 * @param date Optional date to get statistics for (defaults to today)
 * @returns Daily statistics including percentiles, or null if unavailable
 */
export async function fetchDailyStatistics(
  siteId: string,
  date?: Date
): Promise<DailyStatistics | null> {
  const targetDate = date || new Date();
  const month = targetDate.getMonth() + 1; // 1-12
  const day = targetDate.getDate(); // 1-31

  const url = new URL('https://waterservices.usgs.gov/nwis/stat/');
  url.searchParams.set('format', 'json');
  url.searchParams.set('sites', siteId);
  url.searchParams.set('statReportType', 'daily');
  url.searchParams.set('statTypeCd', 'p10,p25,p50,p75,p90,mean');
  url.searchParams.set('parameterCd', '00060'); // Discharge only

  try {
    const response = await fetch(url.toString(), {
      next: { revalidate: 86400 }, // Cache for 24 hours (stats don't change often)
    });

    if (!response.ok) {
      console.error(`USGS Statistics API error: ${response.status} ${response.statusText}`);
      return null;
    }

    const data = await response.json();

    // Parse the RDB-style JSON response
    // The structure is: { value: { timeSeries: [...] } }
    const timeSeries = data?.value?.timeSeries;
    if (!timeSeries || timeSeries.length === 0) {
      console.warn(`No statistics available for site ${siteId}`);
      return null;
    }

    // Find the statistics for discharge (parameter code 00060)
    const dischargeSeries = timeSeries.find(
      (ts: { variable?: { variableCode?: Array<{ value: string }> } }) =>
        ts.variable?.variableCode?.[0]?.value === '00060'
    );

    if (!dischargeSeries?.values?.[0]?.value) {
      console.warn(`No discharge statistics for site ${siteId}`);
      return null;
    }

    // Find the statistic for the target day
    const allStats = dischargeSeries.values[0].value as USGSStatValue[];
    const dayStats = allStats.find(
      (stat) => parseInt(stat.month_nu) === month && parseInt(stat.day_nu) === day
    );

    if (!dayStats) {
      console.warn(`No statistics for ${month}/${day} at site ${siteId}`);
      return null;
    }

    const parseVal = (val?: string): number | null => {
      if (!val || val === '' || val === '-999999') return null;
      const num = parseFloat(val);
      return isNaN(num) ? null : num;
    };

    return {
      siteId,
      month,
      day,
      p10: parseVal(dayStats.p10_va),
      p25: parseVal(dayStats.p25_va),
      p50: parseVal(dayStats.p50_va),
      p75: parseVal(dayStats.p75_va),
      p90: parseVal(dayStats.p90_va),
      mean: parseVal(dayStats.mean_va),
      yearsOfRecord: parseVal(dayStats.count_nu),
    };
  } catch (error) {
    console.error(`Error fetching USGS statistics for site ${siteId}:`, error);
    return null;
  }
}

/**
 * Calculates what percentile a given discharge value falls into
 * based on historical daily statistics
 *
 * @param dischargeCfs Current discharge in cfs
 * @param stats Daily statistics for comparison
 * @returns Estimated percentile (0-100) or null if can't be calculated
 */
export function calculateDischargePercentile(
  dischargeCfs: number,
  stats: DailyStatistics
): number | null {
  if (stats.p10 === null || stats.p50 === null || stats.p90 === null) {
    return null;
  }

  // Interpolate between known percentiles
  if (dischargeCfs <= stats.p10) {
    // Below 10th percentile - estimate 0-10 range
    return Math.max(0, Math.round((dischargeCfs / stats.p10) * 10));
  }
  if (stats.p25 !== null && dischargeCfs <= stats.p25) {
    // Between p10 and p25
    return Math.round(10 + ((dischargeCfs - stats.p10) / (stats.p25 - stats.p10)) * 15);
  }
  if (stats.p25 !== null && dischargeCfs <= stats.p50) {
    // Between p25 and p50
    return Math.round(25 + ((dischargeCfs - stats.p25) / (stats.p50 - stats.p25)) * 25);
  }
  if (stats.p75 !== null && dischargeCfs <= stats.p75) {
    // Between p50 and p75
    return Math.round(50 + ((dischargeCfs - stats.p50) / (stats.p75 - stats.p50)) * 25);
  }
  if (stats.p75 !== null && dischargeCfs <= stats.p90) {
    // Between p75 and p90
    return Math.round(75 + ((dischargeCfs - stats.p75) / (stats.p90 - stats.p75)) * 15);
  }
  // Above 90th percentile
  return Math.min(100, Math.round(90 + ((dischargeCfs - stats.p90) / stats.p90) * 10));
}

export type FlowRating = 'flood' | 'high' | 'good' | 'low' | 'poor' | 'unknown';

export interface FlowCondition {
  rating: FlowRating;
  label: string;
  description: string;
  percentile: number | null;
  dischargeCfs: number | null;
  gaugeHeightFt: number | null;
}

/**
 * Rating thresholds based on percentile
 * These align with MOHERP's methodology and Missouri Scenic Rivers guidance
 */
const PERCENTILE_RATINGS: Array<{ max: number; rating: FlowRating; label: string; description: string }> = [
  { max: 10, rating: 'poor', label: 'Poor', description: 'Too low - frequent dragging and portages likely' },
  { max: 25, rating: 'low', label: 'Low', description: 'Floatable with some dragging in riffles' },
  { max: 75, rating: 'good', label: 'Good', description: 'Ideal conditions - minimal dragging' },
  { max: 90, rating: 'high', label: 'High', description: 'Fast current - experienced paddlers only' },
  { max: 100, rating: 'flood', label: 'Flood', description: 'Dangerous flooding - do not float' },
];

/**
 * Determines flow condition rating based on current discharge and historical statistics
 *
 * @param reading Current gauge reading
 * @param stats Daily statistics for the gauge
 * @returns Flow condition with rating, description, and context
 */
export function calculateFlowCondition(
  reading: GaugeReading,
  stats: DailyStatistics | null
): FlowCondition {
  // If no discharge data, return unknown
  if (reading.dischargeCfs === null) {
    return {
      rating: 'unknown',
      label: 'Unknown',
      description: 'Current conditions unavailable',
      percentile: null,
      dischargeCfs: null,
      gaugeHeightFt: reading.gaugeHeightFt,
    };
  }

  // If no statistics, we can still show the reading but can't rate it
  if (!stats || stats.p50 === null) {
    return {
      rating: 'unknown',
      label: 'Unknown',
      description: 'Historical data unavailable for comparison',
      percentile: null,
      dischargeCfs: reading.dischargeCfs,
      gaugeHeightFt: reading.gaugeHeightFt,
    };
  }

  const percentile = calculateDischargePercentile(reading.dischargeCfs, stats);

  if (percentile === null) {
    return {
      rating: 'unknown',
      label: 'Unknown',
      description: 'Unable to calculate percentile',
      percentile: null,
      dischargeCfs: reading.dischargeCfs,
      gaugeHeightFt: reading.gaugeHeightFt,
    };
  }

  // Find the appropriate rating based on percentile
  const ratingInfo = PERCENTILE_RATINGS.find((r) => percentile <= r.max) || PERCENTILE_RATINGS[PERCENTILE_RATINGS.length - 1];

  return {
    rating: ratingInfo.rating,
    label: ratingInfo.label,
    description: ratingInfo.description,
    percentile,
    dischargeCfs: reading.dischargeCfs,
    gaugeHeightFt: reading.gaugeHeightFt,
  };
}

// ============================================
// 7-DAY HISTORICAL DATA
// ============================================

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
 * Fetches historical gauge readings from USGS Water Services API
 *
 * @param siteId USGS site ID
 * @param days Number of days of history to fetch (default: 7)
 * @returns Historical data with readings array
 */
export async function fetchHistoricalReadings(
  siteId: string,
  days: number = 7
): Promise<HistoricalData | null> {
  const url = new URL('https://waterservices.usgs.gov/nwis/iv/');
  url.searchParams.set('format', 'json');
  url.searchParams.set('sites', siteId);
  url.searchParams.set('parameterCd', '00065,00060');
  url.searchParams.set('period', `P${days}D`);
  url.searchParams.set('siteStatus', 'all');

  try {
    const response = await fetch(url.toString(), {
      next: { revalidate: 3600 }, // Cache for 1 hour
    });

    if (!response.ok) {
      console.error(`USGS Historical API error: ${response.status} ${response.statusText}`);
      return null;
    }

    const data = await response.json() as USGSResponse;

    if (!data.value?.timeSeries || data.value.timeSeries.length === 0) {
      return null;
    }

    // Parse time series data - combine height and discharge by timestamp
    const readingsMap = new Map<string, HistoricalReading>();
    let siteName = '';

    for (const series of data.value.timeSeries) {
      siteName = series.sourceInfo.siteName;
      const variableCode = series.variable.variableCode[0]?.value;
      const values = series.values[0]?.value || [];

      for (const val of values) {
        const timestamp = val.dateTime;
        const numValue = parseFloat(val.value);

        if (!readingsMap.has(timestamp)) {
          readingsMap.set(timestamp, {
            timestamp,
            gaugeHeightFt: null,
            dischargeCfs: null,
          });
        }

        const reading = readingsMap.get(timestamp)!;

        if (variableCode === '00065' && !isNaN(numValue) && numValue > -100 && numValue < 500) {
          reading.gaugeHeightFt = numValue;
        } else if (variableCode === '00060' && !isNaN(numValue) && numValue >= 0 && numValue < 1000000) {
          reading.dischargeCfs = numValue;
        }
      }
    }

    // Convert to array and sort by timestamp
    const readings = Array.from(readingsMap.values())
      .filter(r => r.gaugeHeightFt !== null || r.dischargeCfs !== null)
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    // Calculate min/max values for chart scaling
    const dischargeValues = readings.map(r => r.dischargeCfs).filter((v): v is number => v !== null);
    const heightValues = readings.map(r => r.gaugeHeightFt).filter((v): v is number => v !== null);

    return {
      siteId,
      siteName,
      readings,
      minDischarge: dischargeValues.length > 0 ? Math.min(...dischargeValues) : null,
      maxDischarge: dischargeValues.length > 0 ? Math.max(...dischargeValues) : null,
      minHeight: heightValues.length > 0 ? Math.min(...heightValues) : null,
      maxHeight: heightValues.length > 0 ? Math.max(...heightValues) : null,
    };
  } catch (error) {
    console.error(`Error fetching USGS historical data for site ${siteId}:`, error);
    return null;
  }
}
