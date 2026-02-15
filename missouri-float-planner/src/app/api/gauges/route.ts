// src/app/api/gauges/route.ts
// API endpoint to fetch all gauge stations with their readings and thresholds

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { fetchGaugeReadings } from '@/lib/usgs/gauges';

export const dynamic = 'force-dynamic';

/**
 * Parse PostGIS WKB hex string to extract coordinates
 * WKB format for Point with SRID (EWKB):
 * - 1 byte: byte order (01 = little-endian)
 * - 4 bytes: type (Point with SRID = 0x20000001 in LE = 01000020)
 * - 4 bytes: SRID (4326 = E6100000 in LE)
 * - 8 bytes: X (longitude) as double
 * - 8 bytes: Y (latitude) as double
 */
function parseWKBHex(hex: string): { lng: number; lat: number } | null {
  try {
    // Remove any whitespace
    hex = hex.replace(/\s/g, '');

    // Check minimum length for point with SRID (1 + 4 + 4 + 8 + 8 = 25 bytes = 50 hex chars)
    if (hex.length < 50) return null;

    // Check byte order (01 = little-endian, 00 = big-endian)
    const byteOrder = hex.substring(0, 2);
    const isLittleEndian = byteOrder === '01';

    if (!isLittleEndian) {
      // Big-endian not commonly used, skip for now
      return null;
    }

    // Check type - for Point with SRID it's 0x20000001 (LE: 01000020)
    const typeHex = hex.substring(2, 10);
    const hasSSRID = typeHex === '01000020' || typeHex === '21000020';

    // Skip SRID bytes if present
    const coordStart = hasSSRID ? 18 : 10; // 18 = 2 + 8 + 8, 10 = 2 + 8

    // Extract X (longitude) - 8 bytes = 16 hex chars
    const xHex = hex.substring(coordStart, coordStart + 16);
    const x = hexToDouble(xHex, isLittleEndian);

    // Extract Y (latitude) - 8 bytes = 16 hex chars
    const yHex = hex.substring(coordStart + 16, coordStart + 32);
    const y = hexToDouble(yHex, isLittleEndian);

    // Validate coordinates are reasonable
    if (isNaN(x) || isNaN(y) || Math.abs(x) > 180 || Math.abs(y) > 90) {
      return null;
    }

    return { lng: x, lat: y };
  } catch {
    return null;
  }
}

/**
 * Convert hex string to double (IEEE 754)
 */
function hexToDouble(hex: string, littleEndian: boolean): number {
  // Convert hex to bytes
  const bytes = [];
  for (let i = 0; i < hex.length; i += 2) {
    bytes.push(parseInt(hex.substring(i, i + 2), 16));
  }

  // Reverse bytes if little-endian
  if (littleEndian) {
    bytes.reverse();
  }

  // Create buffer and read as float64
  const buffer = new ArrayBuffer(8);
  const view = new DataView(buffer);
  bytes.forEach((b, i) => view.setUint8(i, b));

  return view.getFloat64(0, false); // false = big-endian (we already reversed)
}

export interface ThresholdDescriptions {
  tooLow?: string;
  low?: string;
  okay?: string;
  optimal?: string;
  high?: string;
  flood?: string;
}

export interface GaugeStation {
  id: string;
  usgsSiteId: string;
  name: string;
  coordinates: {
    lng: number;
    lat: number;
  };
  active: boolean;
  // Current reading
  gaugeHeightFt: number | null;
  dischargeCfs: number | null;
  readingTimestamp: string | null;
  readingAgeHours: number | null;
  // Threshold descriptions (from gauge_stations table)
  thresholdDescriptions: ThresholdDescriptions | null;
  // Thresholds (from primary river association if exists)
  thresholds: {
    riverId: string;
    riverName: string;
    isPrimary: boolean;
    thresholdUnit: 'ft' | 'cfs';
    levelTooLow: number | null;
    levelLow: number | null;
    levelOptimalMin: number | null;
    levelOptimalMax: number | null;
    levelHigh: number | null;
    levelDangerous: number | null;
    // Alternate unit thresholds (opposite of thresholdUnit)
    altLevelTooLow: number | null;
    altLevelLow: number | null;
    altLevelOptimalMin: number | null;
    altLevelOptimalMax: number | null;
    altLevelHigh: number | null;
    altLevelDangerous: number | null;
  }[] | null;
}

export interface GaugesResponse {
  gauges: GaugeStation[];
}

export async function GET() {
  try {
    const supabase = await createClient();

    // Fetch all active gauge stations
    // Note: The RPC get_gauge_stations_with_geojson() is missing newer columns
    // (threshold_descriptions, notes), so we query directly and parse WKB locations
    const { data: stations, error: stationsError } = await supabase
      .from('gauge_stations')
      .select(`
        id,
        usgs_site_id,
        name,
        location,
        active,
        threshold_descriptions
      `)
      .eq('active', true);

    if (stationsError) {
      console.error('Error fetching gauge stations:', stationsError);
      return NextResponse.json(
        { error: 'Failed to fetch gauge stations' },
        { status: 500 }
      );
    }

    if (!stations || stations.length === 0) {
      return NextResponse.json({ gauges: [] });
    }

    // Get latest readings for all gauges
    const gaugeIds = stations.map((g: { id: string }) => g.id);

    const { data: readings, error: readingsError } = await supabase
      .from('gauge_readings')
      .select('gauge_station_id, gauge_height_ft, discharge_cfs, reading_timestamp')
      .in('gauge_station_id', gaugeIds)
      .order('reading_timestamp', { ascending: false });

    if (readingsError) {
      console.error('Error fetching gauge readings:', readingsError);
    }

    // Get the latest reading per gauge
    const latestReadings = new Map<string, {
      gaugeHeightFt: number | null;
      dischargeCfs: number | null;
      readingTimestamp: string | null;
    }>();

    if (readings && readings.length > 0) {
      for (const reading of readings) {
        if (!latestReadings.has(reading.gauge_station_id)) {
          latestReadings.set(reading.gauge_station_id, {
            gaugeHeightFt: reading.gauge_height_ft,
            dischargeCfs: reading.discharge_cfs,
            readingTimestamp: reading.reading_timestamp,
          });
        }
      }
    }

    // Determine if we need to fetch live from USGS:
    // - No readings in database at all
    // - Most gauges have null values (both height and discharge are null)
    // - Readings are very stale (> 6 hours old)
    const hasNoReadings = latestReadings.size === 0;
    const gaugesWithValues = Array.from(latestReadings.values()).filter(
      r => r.gaugeHeightFt !== null || r.dischargeCfs !== null
    ).length;
    const mostGaugesMissing = latestReadings.size > 0 &&
      gaugesWithValues < latestReadings.size / 2;
    const newestTimestamp = Array.from(latestReadings.values())
      .reduce((newest, r) => {
        if (!r.readingTimestamp) return newest;
        const t = new Date(r.readingTimestamp).getTime();
        return t > newest ? t : newest;
      }, 0);
    const readingsStale = newestTimestamp > 0 &&
      (Date.now() - newestTimestamp) > 6 * 60 * 60 * 1000; // > 6 hours

    if (hasNoReadings || mostGaugesMissing || readingsStale) {
      const reason = hasNoReadings ? 'no readings in DB'
        : mostGaugesMissing ? `only ${gaugesWithValues}/${latestReadings.size} gauges have values`
        : 'readings are stale';
      console.log(`Fetching live from USGS (${reason})...`);
      try {
        const siteIds = stations
          .map((s: { usgs_site_id: string }) => s.usgs_site_id)
          .filter((id: string) => id);

        if (siteIds.length > 0) {
          const usgsReadings = await fetchGaugeReadings(siteIds);

          // Create a map from USGS site ID to station ID
          const siteToStationMap = new Map<string, string>();
          for (const station of stations) {
            if (station.usgs_site_id) {
              siteToStationMap.set(station.usgs_site_id, station.id);
            }
          }

          // Map USGS readings to station IDs, overwriting stale/null DB data
          for (const usgsReading of usgsReadings) {
            const stationId = siteToStationMap.get(usgsReading.siteId);
            if (stationId && (usgsReading.gaugeHeightFt !== null || usgsReading.dischargeCfs !== null)) {
              latestReadings.set(stationId, {
                gaugeHeightFt: usgsReading.gaugeHeightFt,
                dischargeCfs: usgsReading.dischargeCfs,
                readingTimestamp: usgsReading.readingTimestamp,
              });
            }
          }
          console.log(`Fetched ${usgsReadings.length} readings from USGS`);
        }
      } catch (usgsError) {
        console.error('Error fetching live USGS data:', usgsError);
        // Continue with whatever DB data we have (may show N/A)
      }
    }

    // Get river-gauge associations with thresholds
    // Try with alt columns first; fall back without them if they don't exist yet
    let riverGauges: Record<string, unknown>[] | null = null;
    let riverGaugesError: { message: string } | null = null;

    const altColumns = `
        alt_level_too_low,
        alt_level_low,
        alt_level_optimal_min,
        alt_level_optimal_max,
        alt_level_high,
        alt_level_dangerous,`;

    const baseSelect = (includeAlt: boolean) => `
        gauge_station_id,
        river_id,
        is_primary,
        threshold_unit,
        level_too_low,
        level_low,
        level_optimal_min,
        level_optimal_max,
        level_high,
        level_dangerous,${includeAlt ? altColumns : ''}
        rivers!inner (
          id,
          name,
          active
        )`;

    const { data: rgData, error: rgError } = await supabase
      .from('river_gauges')
      .select(baseSelect(true))
      .in('gauge_station_id', gaugeIds);

    if (rgError) {
      // Alt columns may not exist yet — retry without them
      console.warn('river_gauges query failed (alt columns may not exist), retrying without:', rgError.message);
      const { data: rgFallback, error: rgFallbackError } = await supabase
        .from('river_gauges')
        .select(baseSelect(false))
        .in('gauge_station_id', gaugeIds);

      riverGauges = rgFallback as unknown as Record<string, unknown>[] | null;
      riverGaugesError = rgFallbackError;
    } else {
      riverGauges = rgData as unknown as Record<string, unknown>[] | null;
    }

    if (riverGaugesError) {
      console.error('Error fetching river gauges:', riverGaugesError);
    }

    // Group thresholds by gauge, skipping inactive rivers
    const thresholdsByGauge = new Map<string, GaugeStation['thresholds']>();
    if (riverGauges) {
      for (const rg of riverGauges) {
        const river = rg.rivers as unknown as { id: string; name: string; active?: boolean };
        // Skip gauge-river associations for inactive rivers
        if (river.active === false) continue;
        const threshold = {
          riverId: river.id,
          riverName: river.name,
          isPrimary: rg.is_primary as boolean,
          thresholdUnit: ((rg.threshold_unit as string) || 'ft') as 'ft' | 'cfs',
          levelTooLow: (rg.level_too_low as number) ?? null,
          levelLow: (rg.level_low as number) ?? null,
          levelOptimalMin: (rg.level_optimal_min as number) ?? null,
          levelOptimalMax: (rg.level_optimal_max as number) ?? null,
          levelHigh: (rg.level_high as number) ?? null,
          levelDangerous: (rg.level_dangerous as number) ?? null,
          altLevelTooLow: (rg.alt_level_too_low as number) ?? null,
          altLevelLow: (rg.alt_level_low as number) ?? null,
          altLevelOptimalMin: (rg.alt_level_optimal_min as number) ?? null,
          altLevelOptimalMax: (rg.alt_level_optimal_max as number) ?? null,
          altLevelHigh: (rg.alt_level_high as number) ?? null,
          altLevelDangerous: (rg.alt_level_dangerous as number) ?? null,
        };

        const gaugeStationId = rg.gauge_station_id as string;
        const existing = thresholdsByGauge.get(gaugeStationId);
        if (existing) {
          existing.push(threshold);
        } else {
          thresholdsByGauge.set(gaugeStationId, [threshold]);
        }
      }
    }

    // Build response
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const gauges: GaugeStation[] = stations.map((station: any) => {
      const reading = latestReadings.get(station.id);
      const thresholds = thresholdsByGauge.get(station.id) || null;

      // Parse location (PostGIS point) - handle different formats
      let coordinates = { lng: 0, lat: 0 };
      if (station.location) {
        // Handle GeoJSON format from RPC or Supabase
        if (typeof station.location === 'object' && 'coordinates' in station.location) {
          const coords = station.location.coordinates as [number, number];
          coordinates = { lng: coords[0], lat: coords[1] };
        }
        // Handle string formats
        else if (typeof station.location === 'string') {
          // Try WKT format like "POINT(-91.5 37.5)"
          const wktMatch = station.location.match(/POINT\s*\(\s*([-\d.]+)\s+([-\d.]+)\s*\)/i);
          if (wktMatch) {
            coordinates = { lng: parseFloat(wktMatch[1]), lat: parseFloat(wktMatch[2]) };
          }
          // Try PostGIS WKB hex format (starts with 01 for little-endian point)
          else if (station.location.match(/^[0-9A-Fa-f]+$/)) {
            const parsed = parseWKBHex(station.location);
            if (parsed) {
              coordinates = parsed;
            }
          }
        }
        // Handle object with type and coordinates
        else if (typeof station.location === 'object') {
          const loc = station.location as Record<string, unknown>;
          if (Array.isArray(loc.coordinates)) {
            coordinates = {
              lng: loc.coordinates[0] as number,
              lat: loc.coordinates[1] as number
            };
          }
        }
      }

      // Calculate reading age
      let readingAgeHours: number | null = null;
      if (reading?.readingTimestamp) {
        const readingTime = new Date(reading.readingTimestamp).getTime();
        const now = Date.now();
        readingAgeHours = (now - readingTime) / (1000 * 60 * 60);
      }

      return {
        id: station.id,
        usgsSiteId: station.usgs_site_id,
        name: station.name,
        coordinates,
        active: station.active,
        gaugeHeightFt: reading?.gaugeHeightFt ?? null,
        dischargeCfs: reading?.dischargeCfs ?? null,
        readingTimestamp: reading?.readingTimestamp ?? null,
        readingAgeHours,
        thresholdDescriptions: station.threshold_descriptions ?? null,
        thresholds,
      };
    });

    // Only include gauges that have at least one active river association
    const activeGauges = gauges.filter(g => g.thresholds && g.thresholds.length > 0);

    return NextResponse.json({ gauges: activeGauges });
  } catch (error) {
    console.error('Error in gauges API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
