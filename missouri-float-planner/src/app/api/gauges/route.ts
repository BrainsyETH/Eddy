// src/app/api/gauges/route.ts
// API endpoint to fetch all gauge stations with their readings and thresholds

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

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
  // Thresholds (from primary river association if exists)
  thresholds: {
    riverId: string;
    riverName: string;
    isPrimary: boolean;
    levelTooLow: number | null;
    levelLow: number | null;
    levelOptimalMin: number | null;
    levelOptimalMax: number | null;
    levelHigh: number | null;
    levelDangerous: number | null;
  }[] | null;
}

export interface GaugesResponse {
  gauges: GaugeStation[];
}

export async function GET() {
  try {
    const supabase = await createClient();

    // Fetch all active gauge stations with their latest readings
    const { data: gaugeStations, error: gaugesError } = await supabase
      .from('gauge_stations')
      .select(`
        id,
        usgs_site_id,
        name,
        location,
        active
      `)
      .eq('active', true);

    if (gaugesError) {
      console.error('Error fetching gauge stations:', gaugesError);
      return NextResponse.json(
        { error: 'Failed to fetch gauge stations' },
        { status: 500 }
      );
    }

    if (!gaugeStations || gaugeStations.length === 0) {
      return NextResponse.json({ gauges: [] });
    }

    // Get latest readings for all gauges
    const gaugeIds = gaugeStations.map(g => g.id);

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

    if (readings) {
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

    // Get river-gauge associations with thresholds
    const { data: riverGauges, error: riverGaugesError } = await supabase
      .from('river_gauges')
      .select(`
        gauge_station_id,
        river_id,
        is_primary,
        level_too_low,
        level_low,
        level_optimal_min,
        level_optimal_max,
        level_high,
        level_dangerous,
        rivers!inner (
          id,
          name
        )
      `)
      .in('gauge_station_id', gaugeIds);

    if (riverGaugesError) {
      console.error('Error fetching river gauges:', riverGaugesError);
    }

    // Group thresholds by gauge
    const thresholdsByGauge = new Map<string, GaugeStation['thresholds']>();
    if (riverGauges) {
      for (const rg of riverGauges) {
        const river = rg.rivers as unknown as { id: string; name: string };
        const threshold = {
          riverId: river.id,
          riverName: river.name,
          isPrimary: rg.is_primary,
          levelTooLow: rg.level_too_low,
          levelLow: rg.level_low,
          levelOptimalMin: rg.level_optimal_min,
          levelOptimalMax: rg.level_optimal_max,
          levelHigh: rg.level_high,
          levelDangerous: rg.level_dangerous,
        };

        const existing = thresholdsByGauge.get(rg.gauge_station_id);
        if (existing) {
          existing.push(threshold);
        } else {
          thresholdsByGauge.set(rg.gauge_station_id, [threshold]);
        }
      }
    }

    // Build response
    const gauges: GaugeStation[] = gaugeStations.map(station => {
      const reading = latestReadings.get(station.id);
      const thresholds = thresholdsByGauge.get(station.id) || null;

      // Parse location (PostGIS point)
      let coordinates = { lng: 0, lat: 0 };
      if (station.location) {
        // Handle GeoJSON format
        if (typeof station.location === 'object' && 'coordinates' in station.location) {
          const coords = station.location.coordinates as [number, number];
          coordinates = { lng: coords[0], lat: coords[1] };
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
        thresholds,
      };
    });

    return NextResponse.json({ gauges });
  } catch (error) {
    console.error('Error in gauges API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
