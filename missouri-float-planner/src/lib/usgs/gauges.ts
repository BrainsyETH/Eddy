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
