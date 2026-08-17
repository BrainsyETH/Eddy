// src/app/api/gauges/route.ts
// API endpoint to fetch all gauge stations with their readings and thresholds

import { NextRequest, NextResponse } from 'next/server';
import { cdnCacheHeaders } from '@/lib/api-utils';
import { createAdminClient } from '@/lib/supabase/admin';
import { loadCurrentReadings } from '@/lib/gauges/latest-readings';
import { classifyQualifiers, fetchGaugeReadings } from '@/lib/usgs/gauges';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { withX402Route } from '@/lib/x402-config';

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
  good?: string;
  flowing?: string;
  high?: string;
  flood?: string;
}

/**
 * Maps legacy DB threshold_descriptions JSON keys to new frontend keys.
 * DB may store "okay" and "optimal" — frontend expects "good" and "flowing".
 */
function mapThresholdDescriptionKeys(
  raw: Record<string, string> | null | undefined
): ThresholdDescriptions | null {
  if (!raw) return null;
  const mapped: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (key === 'okay') mapped['good'] = value;
    else if (key === 'optimal') mapped['flowing'] = value;
    else mapped[key] = value;
  }
  return mapped as ThresholdDescriptions;
}

export interface GaugeStation {
  id: string;
  /**
   * The station's provider-native site id — a USGS site number, an NWS LID, or
   * a USACE dam slug. Named `usgsSiteId` for history: it predates
   * multi-provider support and has ~105 call sites, so renaming it to `siteId`
   * is a separate refactor. Pair it with `provider` before building any
   * provider-specific URL.
   *
   * Filled from `usgs_site_id` OR `site_id_external` below, both nullable, so
   * a station carrying neither sends null despite this type — which is what
   * took down the phone's Search tab on a `.toLowerCase()`. The phone's mirror
   * (MapGauge in packages/eddy-types) types it `string | null` for that
   * reason; web consumers must not assume a string either.
   */
  usgsSiteId: string;
  /** Registry id from src/lib/flow-providers. Absent means 'usgs'. */
  provider?: string;
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
  /** True when USGS qualifier codes flag the reading as suspect (ice, estimated, sensor issues). */
  readingSuspect: boolean;
  /** Human-readable qualifier note ("Ice-affected reading — may be inaccurate"), or null when clean. */
  qualifierNote: string | null;
  // Threshold descriptions (from gauge_stations table)
  thresholdDescriptions: ThresholdDescriptions | null;
  // Thresholds (from primary river association if exists)
  thresholds: {
    riverId: string;
    riverName: string;
    riverSlug: string | null;
    /**
     * Two-letter code for the river this threshold rates.
     *
     * Carried because the gauge detail page printed "Gauge near {river},
     * Missouri" as a literal, which has been wrong for every Arkansas gauge
     * since the catalog stopped being Missouri-only. Nullable for the reason
     * every added wire field is.
     */
    riverState: string | null;
    isPrimary: boolean;
    /**
     * Miles from the rated section. The tiebreak when one gauge is primary for
     * more than one river — Courtois borrows Huzzah's gauge, and this is what
     * says the gauge physically sits on the Huzzah. See
     * shared/primary-river-link.ts.
     */
    distanceFromSectionMiles: number | null;
    thresholdUnit: 'ft' | 'cfs';
    levelTooLow: number | null;
    levelLow: number | null;
    levelOptimalMin: number | null;
    levelOptimalMax: number | null;
    levelHigh: number | null;
    levelDangerous: number | null;
    /** NWS flood stage in feet — outranks the ladder above when reached. */
    floodStageFt: number | null;
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

/**
 * Every river ladder rating one of these stations.
 *
 * Lifted out of the handler so it can be awaited ALONGSIDE the readings rather
 * than after them. It never depended on a reading — it was simply written
 * second — and on a cache miss that ordering cost a whole round trip to
 * Supabase for nothing.
 *
 * The alt-column retry is unchanged: those six columns arrive in a migration,
 * and a database without them answers with an error rather than nulls.
 */
async function fetchRiverGauges(
  supabase: ReturnType<typeof createAdminClient>,
  gaugeIds: string[],
): Promise<Record<string, unknown>[] | null> {
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
        distance_from_section_miles,
        threshold_unit,
        level_too_low,
        level_low,
        level_optimal_min,
        level_optimal_max,
        level_high,
        level_dangerous,
        flood_stage_ft,${includeAlt ? altColumns : ''}
        rivers!inner (
          id,
          name,
          slug,
          state,
          active
        )`;

  const { data, error } = await supabase
    .from('river_gauges')
    .select(baseSelect(true))
    .in('gauge_station_id', gaugeIds);

  if (!error) return data as unknown as Record<string, unknown>[] | null;

  // Alt columns may not exist yet — retry without them
  console.warn(
    'river_gauges query failed (alt columns may not exist), retrying without:',
    error.message,
  );
  const { data: fallback, error: fallbackError } = await supabase
    .from('river_gauges')
    .select(baseSelect(false))
    .in('gauge_station_id', gaugeIds);

  if (fallbackError) {
    console.error('Error fetching river gauges:', fallbackError);
  }
  return fallback as unknown as Record<string, unknown>[] | null;
}

async function _GET(request: NextRequest) {
  try {
    // Rate limit: 60 requests per IP per minute
    const rateLimitResult = await rateLimit(`gauges:${getClientIp(request)}`, 60, 60 * 1000);
    if (rateLimitResult) return rateLimitResult;

    const supabase = createAdminClient();

    // Fetch all active gauge stations
    // Note: The RPC get_gauge_stations_with_geojson() is missing newer columns
    // (threshold_descriptions, notes), so we query directly and parse WKB locations
    const { data: stations, error: stationsError } = await supabase
      .from('gauge_stations')
      .select(`
        id,
        usgs_site_id,
        site_id_external,
        provider,
        name,
        location,
        active,
        threshold_descriptions
      `)
      .eq('active', true)
      // CURATED ONLY, and this is now load-bearing rather than tidy.
      //
      // This route has always ended by dropping gauges with no active-river
      // association (see activeGauges below), so the result is unchanged — but
      // it used to do that AFTER fetching readings for every active station.
      // Since 00196 that is ~14,300 stations, and the consequences were not
      // subtle: the readings lookup exceeded PostgREST's header limit, the
      // route decided it had no readings, and the "fetch live from USGS"
      // fallback then built a comma-joined URL of 14,000 site ids and took a
      // 414. /api/gauges returned an empty list.
      //
      // The national tier has its own endpoint, /api/gauges/map, which is
      // bounded by a viewport and reads gauge_latest.
      .eq('curated', true);

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

    const gaugeIds = stations.map((g: { id: string }) => g.id);

    // ── The newest reading per station, and the ladders, at the same time ───
    //
    // This route used to select EVERY gauge_readings row for all 45 curated
    // stations ordered newest-first and keep the first one it saw per station.
    // That is 118,307 rows fetched, sorted on disk, and thrown away to arrive
    // at 45 — 5.2 seconds of database time, and the reason "Show rivers near
    // me" and every river screen's gauge picker took as long as they did.
    //
    // loadCurrentReadings seeks instead of scanning, and it is also the
    // CORRECT answer rather than merely the fast one: it merges gauge_latest
    // with gauge_readings and takes the newer. That module's header names this
    // endpoint as the one read path still picking a single tier, which is how
    // a station could read 87 cfs on a search row and 80 on this response in
    // the same minute. Both problems had the same one-line cause.
    const [currentReadings, riverGauges] = await Promise.all([
      loadCurrentReadings(supabase, gaugeIds),
      fetchRiverGauges(supabase, gaugeIds),
    ]);

    const latestReadings = new Map<string, {
      gaugeHeightFt: number | null;
      dischargeCfs: number | null;
      readingTimestamp: string | null;
      qualifiers: string[] | null;
    }>();

    // loadCurrentReadings has already coerced numeric(10,2) out of the strings
    // PostgREST sends, so there is no toNum() left to do here.
    for (const [stationId, reading] of currentReadings) {
      latestReadings.set(stationId, {
        gaugeHeightFt: reading.gauge_height_ft,
        dischargeCfs: reading.discharge_cfs,
        readingTimestamp: reading.reading_at,
        qualifiers: reading.qualifiers,
      });
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
        // USGS-provided stations only. Non-USGS providers (nws LIDs, usace dam
        // slugs) keep their own site id in site_id_external, and posting one of
        // those to waterservices.usgs.gov returns nothing for every site in the
        // batch — which also means the stale-readings heuristic above would
        // fire on every request once a single non-USGS station exists.
        const usgsStations = stations.filter(
          (s: { provider: string | null; usgs_site_id: string | null }) =>
            (s.provider ?? 'usgs') === 'usgs' && s.usgs_site_id
        );
        const siteIds = usgsStations.map((s: { usgs_site_id: string }) => s.usgs_site_id);

        if (siteIds.length > 0) {
          const usgsReadings = await fetchGaugeReadings(siteIds);

          // Create a map from USGS site ID to station ID
          const siteToStationMap = new Map<string, string>();
          for (const station of usgsStations) {
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
                qualifiers: usgsReading.qualifiers ?? null,
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

    // Group thresholds by gauge, skipping inactive rivers
    const thresholdsByGauge = new Map<string, GaugeStation['thresholds']>();
    if (riverGauges) {
      for (const rg of riverGauges) {
        const river = rg.rivers as unknown as {
          id: string;
          name: string;
          slug?: string;
          state?: string;
          active?: boolean;
        };
        // Skip gauge-river associations for inactive rivers
        if (river.active === false) continue;
        const threshold = {
          riverId: river.id,
          riverName: river.name,
          riverSlug: river.slug || null,
          riverState: river.state || null,
          isPrimary: rg.is_primary as boolean,
          distanceFromSectionMiles: (rg.distance_from_section_miles as number) ?? null,
          thresholdUnit: ((rg.threshold_unit as string) || 'ft') as 'ft' | 'cfs',
          levelTooLow: (rg.level_too_low as number) ?? null,
          levelLow: (rg.level_low as number) ?? null,
          levelOptimalMin: (rg.level_optimal_min as number) ?? null,
          levelOptimalMax: (rg.level_optimal_max as number) ?? null,
          levelHigh: (rg.level_high as number) ?? null,
          levelDangerous: (rg.level_dangerous as number) ?? null,
          floodStageFt: (rg.flood_stage_ft as number) ?? null,
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

      const qual = classifyQualifiers(reading?.qualifiers, station.provider ?? 'usgs');

      return {
        id: station.id,
        // Field name kept despite now carrying non-USGS ids too: `usgsSiteId`
        // has ~105 call sites across 29 files, so renaming it to `siteId` is a
        // separate refactor rather than a prerequisite for a new provider.
        usgsSiteId: station.usgs_site_id ?? station.site_id_external,
        provider: station.provider ?? 'usgs',
        name: station.name,
        coordinates,
        active: station.active,
        gaugeHeightFt: reading?.gaugeHeightFt ?? null,
        dischargeCfs: reading?.dischargeCfs ?? null,
        readingTimestamp: reading?.readingTimestamp ?? null,
        readingAgeHours,
        readingSuspect: qual.suspect,
        qualifierNote: qual.suspect ? qual.note : null,
        thresholdDescriptions: mapThresholdDescriptionKeys(station.threshold_descriptions),
        thresholds,
      };
    });

    // Only include gauges that have at least one active river association
    const activeGauges = gauges.filter(g => g.thresholds && g.thresholds.length > 0);

    return NextResponse.json({ gauges: activeGauges }, { headers: cdnCacheHeaders(300, 600) });
  } catch (error) {
    console.error('Error in gauges API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export const GET = withX402Route(_GET, '/api/gauges');
