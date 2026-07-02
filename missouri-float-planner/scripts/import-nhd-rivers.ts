#!/usr/bin/env npx tsx
/**
 * NHD River Import Script
 *
 * Downloads and processes river geometry from the National Hydrography Dataset (NHD)
 * via the USGS Web Feature Service (WFS) and imports it into Supabase.
 *
 * Usage:
 *   npx tsx scripts/import-nhd-rivers.ts [path/to/config.json]
 *
 * River configs live in scripts/config/nhd-rivers.json (default) — adding a
 * river means adding a JSON entry, not editing this script. Each entry may
 * carry state/timezone/riverType for the multi-region columns (00145).
 *
 * Prerequisites:
 *   - Environment variables set in .env.local
 *   - Supabase database with PostGIS enabled and tables created
 */

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

interface RiverConfig {
  name: string;
  slug: string;
  nhdFeatureId: string;
  description: string;
  difficultyRating: string;
  region: string;
  state?: string;
  timezone?: string;
  riverType?: string;
}

function loadRiverConfigs(): RiverConfig[] {
  const configPath = process.argv[2]
    ? path.resolve(process.argv[2])
    : path.join(__dirname, 'config', 'nhd-rivers.json');
  const raw = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  if (!Array.isArray(raw.rivers)) {
    throw new Error(`Config ${configPath} has no "rivers" array`);
  }
  console.log(`Loaded ${raw.rivers.length} river configs from ${configPath}`);
  return raw.rivers as RiverConfig[];
}

interface NHDFeature {
  type: 'Feature';
  geometry: {
    type: 'LineString' | 'MultiLineString';
    coordinates: number[][] | number[][][];
  };
  properties: {
    permanent_identifier: string;
    gnis_name: string;
    lengthkm: number;
  };
}

interface NHDResponse {
  type: 'FeatureCollection';
  features: NHDFeature[];
}

// Create Supabase admin client
function getSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error(
      'Missing environment variables. Make sure NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set.'
    );
  }

  return createClient(url, serviceKey);
}

/**
 * Fetches river geometry from NHD WFS service
 * 
 * Note: The NHD WFS service can be unreliable. If this fails,
 * we fall back to using pre-defined geometry from the seed files.
 */
async function fetchRiverFromNHD(nhdId: string): Promise<NHDFeature | null> {
  const wfsUrl = new URL('https://hydro.nationalmap.gov/arcgis/rest/services/NHDPlus_HR/MapServer/2/query');
  
  wfsUrl.searchParams.set('where', `permanent_identifier='${nhdId}'`);
  wfsUrl.searchParams.set('outFields', '*');
  wfsUrl.searchParams.set('geometryType', 'esriGeometryPolyline');
  wfsUrl.searchParams.set('outSR', '4326');
  wfsUrl.searchParams.set('f', 'geojson');

  try {
    console.log(`  Fetching from NHD: ${nhdId}`);
    const response = await fetch(wfsUrl.toString(), {
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      console.warn(`  NHD request failed: ${response.status}`);
      return null;
    }

    const data = await response.json() as NHDResponse;
    
    if (data.features && data.features.length > 0) {
      return data.features[0];
    }

    console.warn(`  No features found for NHD ID: ${nhdId}`);
    return null;
  } catch (error) {
    console.warn(`  Error fetching from NHD:`, error);
    return null;
  }
}

/**
 * Converts MultiLineString to LineString by merging segments
 */
function normalizeGeometry(geometry: NHDFeature['geometry']): { type: 'LineString'; coordinates: number[][] } {
  if (geometry.type === 'LineString') {
    return geometry as { type: 'LineString'; coordinates: number[][] };
  }

  // For MultiLineString, merge all segments
  const coords = geometry.coordinates as number[][][];
  const merged: number[][] = [];
  
  for (const segment of coords) {
    merged.push(...segment);
  }

  return {
    type: 'LineString',
    coordinates: merged,
  };
}

/**
 * Calculates line length in miles from coordinates
 */
function calculateLengthMiles(coordinates: number[][]): number {
  let totalMeters = 0;

  for (let i = 1; i < coordinates.length; i++) {
    const [lon1, lat1] = coordinates[i - 1];
    const [lon2, lat2] = coordinates[i];
    
    // Haversine formula
    const R = 6371000; // Earth's radius in meters
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    totalMeters += R * c;
  }

  return totalMeters / 1609.34; // Convert to miles
}

/**
 * Main import function
 */
async function importRivers() {
  console.log('🌊 Missouri River Float Planner - NHD River Import');
  console.log('='.repeat(50));
  console.log('');

  const supabase = getSupabaseClient();
  const results: { name: string; status: 'success' | 'skipped' | 'error'; message: string }[] = [];

  for (const river of loadRiverConfigs()) {
    console.log(`\n📍 Processing: ${river.name}`);

    // Check if river already exists
    const { data: existing } = await supabase
      .from('rivers')
      .select('id')
      .eq('slug', river.slug)
      .single();

    if (existing) {
      console.log(`  ⏭️  Already exists, skipping`);
      results.push({ name: river.name, status: 'skipped', message: 'Already in database' });
      continue;
    }

    // Try to fetch from NHD
    const nhdFeature = await fetchRiverFromNHD(river.nhdFeatureId);

    if (!nhdFeature) {
      console.log(`  ⚠️  Could not fetch from NHD - will need manual import`);
      results.push({ name: river.name, status: 'error', message: 'NHD fetch failed' });
      continue;
    }

    // Process geometry
    const geometry = normalizeGeometry(nhdFeature.geometry);
    const lengthMiles = calculateLengthMiles(geometry.coordinates);

    // Get downstream point (end of line - assuming river flows downstream)
    const downstreamCoords = geometry.coordinates[geometry.coordinates.length - 1];
    const downstreamPoint = {
      type: 'Point' as const,
      coordinates: downstreamCoords,
    };

    // Insert into database
    const { error } = await supabase.from('rivers').insert({
      name: river.name,
      slug: river.slug,
      geom: geometry,
      length_miles: Math.round(lengthMiles * 100) / 100,
      downstream_point: downstreamPoint,
      direction_verified: false,
      description: river.description,
      difficulty_rating: river.difficultyRating,
      region: river.region,
      nhd_feature_id: river.nhdFeatureId,
      ...(river.state ? { state: river.state } : {}),
      ...(river.timezone ? { timezone: river.timezone } : {}),
      ...(river.riverType ? { river_type: river.riverType } : {}),
    });

    if (error) {
      console.log(`  ❌ Database insert failed: ${error.message}`);
      results.push({ name: river.name, status: 'error', message: error.message });
    } else {
      console.log(`  ✅ Imported successfully (${lengthMiles.toFixed(1)} miles)`);
      results.push({ name: river.name, status: 'success', message: `${lengthMiles.toFixed(1)} miles` });
    }
  }

  // Print summary
  console.log('\n' + '='.repeat(50));
  console.log('📊 Import Summary');
  console.log('='.repeat(50));

  const successful = results.filter(r => r.status === 'success').length;
  const skipped = results.filter(r => r.status === 'skipped').length;
  const failed = results.filter(r => r.status === 'error').length;

  console.log(`  ✅ Imported: ${successful}`);
  console.log(`  ⏭️  Skipped:  ${skipped}`);
  console.log(`  ❌ Failed:   ${failed}`);
  console.log('');

  if (failed > 0) {
    console.log('Failed rivers will need manual import from seed files.');
    console.log('Run: npx tsx scripts/seed-rivers.ts');
  }
}

// Run the import
importRivers().catch(console.error);
