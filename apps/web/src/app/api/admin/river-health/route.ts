// src/app/api/admin/river-health/route.ts
// GET /api/admin/river-health — Validate river geometry data quality
// Returns per-river diagnostics: coordinate density, length, gauge proximity, etc.

import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/admin-auth';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

interface RiverHealth {
  id: string;
  name: string;
  slug: string;
  active: boolean;
  lengthMiles: number | null;
  geometryStartsAtHeadwaters: boolean | null;
  directionVerified: boolean;
  coordinateCount: number;
  coordsPerMile: number | null;
  boundingBox: {
    minLat: number;
    maxLat: number;
    minLng: number;
    maxLng: number;
  } | null;
  gaugeCount: number;
  gaugesOnRiver: number; // gauges within 1km of river geometry
  accessPointCount: number;
  poiCount: number;
  issues: string[];
}

export async function GET(request: NextRequest) {
  const authError = requireAdminAuth(request);
  if (authError) return authError;

  try {
    const supabase = createAdminClient();

    // Fetch rivers with geometry as GeoJSON + metadata
    const { data: rivers, error: riversError } = await supabase
      .from('rivers')
      .select('id, name, slug, active, length_miles, direction_verified, geometry_starts_at_headwaters, nhd_feature_id')
      .order('name');

    if (riversError || !rivers) {
      return NextResponse.json({ error: 'Failed to fetch rivers' }, { status: 500 });
    }

    const results: RiverHealth[] = [];

    for (const river of rivers) {
      const issues: string[] = [];

      // Get geometry as GeoJSON to analyze coordinates
      let coordinateCount = 0;
      let boundingBox: RiverHealth['boundingBox'] = null;

      try {
        const { data: geoData } = await supabase.rpc('get_river_geometry_json', {
          p_slug: river.slug,
        });

        if (geoData && geoData.coordinates) {
          const coords: number[][] = geoData.coordinates;
          coordinateCount = coords.length;

          if (coords.length > 0) {
            const lats = coords.map((c: number[]) => c[1]);
            const lngs = coords.map((c: number[]) => c[0]);
            boundingBox = {
              minLat: Math.min(...lats),
              maxLat: Math.max(...lats),
              minLng: Math.min(...lngs),
              maxLng: Math.max(...lngs),
            };
          }

          if (coordinateCount < 10) {
            issues.push(`Very low coordinate density (${coordinateCount} points)`);
          }
        } else {
          issues.push('No geometry data found');
        }
      } catch {
        issues.push('Failed to read geometry');
      }

      const coordsPerMile = river.length_miles && coordinateCount > 0
        ? Math.round((coordinateCount / river.length_miles) * 10) / 10
        : null;

      if (coordsPerMile !== null && coordsPerMile < 5) {
        issues.push(`Low coordinate density: ${coordsPerMile} pts/mile (recommend 10+)`);
      }

      if (!river.length_miles) {
        issues.push('Missing length_miles');
      }

      if (!river.direction_verified) {
        issues.push('Flow direction not verified');
      }

      if (river.geometry_starts_at_headwaters === null) {
        issues.push('geometry_starts_at_headwaters not set');
      }

      // Count gauge stations linked to this river
      const { count: gaugeCount } = await supabase
        .from('river_gauges')
        .select('id', { count: 'exact', head: true })
        .eq('river_id', river.id);

      if ((gaugeCount || 0) === 0) {
        issues.push('No gauge stations linked');
      }

      // Check how many gauges are within 1km of river geometry
      // Uses find_nearest_river RPC for each gauge station
      let gaugesOnRiver = 0;
      const { data: gaugeStations } = await supabase
        .from('river_gauges')
        .select('gauge_stations!inner(location)')
        .eq('river_id', river.id);

      if (gaugeStations) {
        for (const gs of gaugeStations) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const station = gs.gauge_stations as any;
          if (!station?.location) continue;

          // Extract coords from the gauge station location
          let lat: number | null = null;
          let lng: number | null = null;

          if (typeof station.location === 'object' && station.location.type === 'Point') {
            lng = station.location.coordinates[0];
            lat = station.location.coordinates[1];
          }

          if (lat !== null && lng !== null) {
            const { data: nearResult } = await supabase.rpc('find_nearest_river', {
              p_lat: lat,
              p_lng: lng,
              p_max_distance_meters: 1000,
            });
            if (nearResult && nearResult.length > 0 && nearResult[0].river_id === river.id) {
              gaugesOnRiver++;
            }
          }
        }
      }

      if ((gaugeCount || 0) > 0 && gaugesOnRiver === 0) {
        issues.push('No gauge stations are within 1km of river geometry — geometry may be incomplete');
      }

      // Count access points
      const { count: apCount } = await supabase
        .from('access_points')
        .select('id', { count: 'exact', head: true })
        .eq('river_id', river.id)
        .eq('approved', true);

      // Count POIs
      const { count: poiCount } = await supabase
        .from('points_of_interest')
        .select('id', { count: 'exact', head: true })
        .eq('river_id', river.id);

      // Check bounding box is in Missouri (roughly 36-40°N, 89-96°W)
      if (boundingBox) {
        if (boundingBox.minLat < 35 || boundingBox.maxLat > 41 ||
            boundingBox.minLng < -97 || boundingBox.maxLng > -88) {
          issues.push('Bounding box extends outside Missouri — geometry may be incorrect');
        }
      }

      results.push({
        id: river.id,
        name: river.name,
        slug: river.slug,
        active: river.active,
        lengthMiles: river.length_miles,
        geometryStartsAtHeadwaters: river.geometry_starts_at_headwaters,
        directionVerified: river.direction_verified,
        coordinateCount,
        coordsPerMile,
        boundingBox,
        gaugeCount: gaugeCount || 0,
        gaugesOnRiver,
        accessPointCount: apCount || 0,
        poiCount: poiCount || 0,
        issues,
      });
    }

    const summary = {
      totalRivers: results.length,
      activeRivers: results.filter(r => r.active).length,
      riversWithIssues: results.filter(r => r.issues.length > 0).length,
      totalIssues: results.reduce((sum, r) => sum + r.issues.length, 0),
    };

    return NextResponse.json({ summary, rivers: results });
  } catch (error) {
    console.error('Error in river health check:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
