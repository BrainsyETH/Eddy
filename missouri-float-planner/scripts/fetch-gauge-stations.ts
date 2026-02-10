#!/usr/bin/env npx tsx
/**
 * USGS Gauge Station Fetch Script
 * 
 * Fetches active gauge stations from USGS Water Services API
 * for Missouri rivers and outputs seed data.
 * 
 * Usage:
 *   npx tsx scripts/fetch-gauge-stations.ts
 */

import { createClient } from '@supabase/supabase-js';

// Known USGS gauge stations for Missouri float rivers
// Researched from: https://waterdata.usgs.gov/mo/nwis/rt
const GAUGE_STATIONS = [
  // Meramec River
  {
    usgs_site_id: '07019000',
    name: 'Meramec River near Eureka, MO',
    river_slug: 'meramec',
    latitude: 38.4975,
    longitude: -90.5697,
    is_primary: true,
    thresholds: {
      too_low: 1.5,
      low: 2.5,
      optimal_min: 3.5,
      optimal_max: 6.0,
      high: 8.0,
      dangerous: 12.0,
    },
  },
  {
    usgs_site_id: '07018500',
    name: 'Meramec River near Sullivan, MO',
    river_slug: 'meramec',
    latitude: 38.2172,
    longitude: -91.1508,
    is_primary: false,
    thresholds: {
      too_low: 1.2,
      low: 2.0,
      optimal_min: 2.8,
      optimal_max: 5.0,
      high: 7.0,
      dangerous: 10.0,
    },
  },
  // Current River
  {
    usgs_site_id: '07067000',
    name: 'Current River at Van Buren, MO',
    river_slug: 'current',
    latitude: 36.9936,
    longitude: -91.0150,
    is_primary: true,
    thresholds: {
      too_low: 2.0,
      low: 2.8,
      optimal_min: 3.5,
      optimal_max: 6.0,
      high: 8.0,
      dangerous: 12.0,
    },
  },
  {
    usgs_site_id: '07068000',
    name: 'Current River at Doniphan, MO',
    river_slug: 'current',
    latitude: 36.6206,
    longitude: -90.8239,
    is_primary: false,
    thresholds: {
      too_low: 2.5,
      low: 3.5,
      optimal_min: 4.5,
      optimal_max: 8.0,
      high: 10.0,
      dangerous: 15.0,
    },
  },
  // Eleven Point River
  {
    usgs_site_id: '07071500',
    name: 'Eleven Point River near Bardley, MO',
    river_slug: 'eleven-point',
    latitude: 36.5875,
    longitude: -91.2153,
    is_primary: true,
    thresholds: {
      too_low: 1.8,
      low: 2.5,
      optimal_min: 3.2,
      optimal_max: 5.5,
      high: 7.5,
      dangerous: 11.0,
    },
  },
  // Jacks Fork River (07065200 = Mountain View, 07065495 = Alley Spring, 07066000 = Eminence)
  {
    usgs_site_id: '07065200',
    name: 'Jacks Fork near Mountain View, MO',
    river_slug: 'jacks-fork',
    latitude: 37.1444,
    longitude: -91.4461,
    is_primary: true,
    thresholds: {
      too_low: 1.5,
      low: 2.2,
      optimal_min: 3.0,
      optimal_max: 5.0,
      high: 7.0,
      dangerous: 10.0,
    },
  },
  // Niangua River
  {
    usgs_site_id: '06923500',
    name: 'Niangua River near Hartville, MO',
    river_slug: 'niangua',
    latitude: 37.3178,
    longitude: -92.5017,
    is_primary: true,
    thresholds: {
      too_low: 1.2,
      low: 2.0,
      optimal_min: 2.8,
      optimal_max: 5.0,
      high: 7.0,
      dangerous: 10.0,
    },
  },
  // Big Piney River
  {
    usgs_site_id: '06930000',
    name: 'Big Piney River near Big Piney, MO',
    river_slug: 'big-piney',
    latitude: 37.6789,
    longitude: -92.0347,
    is_primary: true,
    thresholds: {
      too_low: 1.5,
      low: 2.3,
      optimal_min: 3.0,
      optimal_max: 5.5,
      high: 7.5,
      dangerous: 11.0,
    },
  },
  // Huzzah Creek (uses nearby Meramec gauge or Courtois)
  {
    usgs_site_id: '07017200',
    name: 'Huzzah Creek near Steelville, MO',
    river_slug: 'huzzah',
    latitude: 37.9519,
    longitude: -91.3219,
    is_primary: true,
    thresholds: {
      too_low: 1.0,
      low: 1.5,
      optimal_min: 2.0,
      optimal_max: 4.0,
      high: 6.0,
      dangerous: 9.0,
    },
  },
  // Courtois Creek
  {
    usgs_site_id: '07017610',
    name: 'Courtois Creek at Berryman, MO',
    river_slug: 'courtois',
    latitude: 37.9047,
    longitude: -91.0986,
    is_primary: true,
    thresholds: {
      too_low: 1.0,
      low: 1.5,
      optimal_min: 2.0,
      optimal_max: 4.0,
      high: 6.0,
      dangerous: 9.0,
    },
  },
];

interface USGSSite {
  sourceInfo: {
    siteName: string;
    siteCode: { value: string }[];
    geoLocation: {
      geogLocation: {
        latitude: number;
        longitude: number;
      };
    };
  };
}

interface USGSResponse {
  value: {
    timeSeries: USGSSite[];
  };
}

/**
 * Validates gauge stations are active on USGS
 */
async function validateGaugeStation(siteId: string): Promise<boolean> {
  const url = new URL('https://waterservices.usgs.gov/nwis/iv/');
  url.searchParams.set('format', 'json');
  url.searchParams.set('sites', siteId);
  url.searchParams.set('parameterCd', '00065'); // Gauge height
  url.searchParams.set('siteStatus', 'active');

  try {
    const response = await fetch(url.toString());
    if (!response.ok) return false;

    const data = await response.json() as USGSResponse;
    return data.value?.timeSeries?.length > 0;
  } catch {
    return false;
  }
}

/**
 * Creates Supabase admin client
 */
function getSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    throw new Error('Missing Supabase credentials in environment');
  }

  return createClient(supabaseUrl, serviceKey);
}

/**
 * Main function to import gauge stations
 */
async function importGaugeStations() {
  console.log('📊 USGS Gauge Station Import');
  console.log('='.repeat(50));
  console.log('');

  const supabase = getSupabaseClient();

  // First, get all rivers to map slugs to IDs
  const { data: rivers, error: riversError } = await supabase
    .from('rivers')
    .select('id, slug');

  if (riversError) {
    console.error('Error fetching rivers:', riversError);
    return;
  }

  const riverMap = new Map(rivers?.map(r => [r.slug, r.id]) || []);

  for (const gauge of GAUGE_STATIONS) {
    console.log(`\n📍 ${gauge.name}`);
    console.log(`   Site ID: ${gauge.usgs_site_id}`);

    // Validate on USGS
    const isActive = await validateGaugeStation(gauge.usgs_site_id);
    console.log(`   Status: ${isActive ? '✅ Active' : '⚠️ Inactive/Not Found'}`);

    // Check if already exists
    const { data: existing } = await supabase
      .from('gauge_stations')
      .select('id')
      .eq('usgs_site_id', gauge.usgs_site_id)
      .single();

    if (existing) {
      console.log(`   ⏭️ Already in database`);
      continue;
    }

    // Insert gauge station
    const { data: newStation, error: stationError } = await supabase
      .from('gauge_stations')
      .insert({
        usgs_site_id: gauge.usgs_site_id,
        name: gauge.name,
        location: {
          type: 'Point',
          coordinates: [gauge.longitude, gauge.latitude],
        },
        active: isActive,
      })
      .select('id')
      .single();

    if (stationError) {
      console.log(`   ❌ Error inserting station: ${stationError.message}`);
      continue;
    }

    console.log(`   ✅ Station inserted`);

    // Link to river if we have the river in DB
    const riverId = riverMap.get(gauge.river_slug);
    if (riverId && newStation) {
      const { error: linkError } = await supabase.from('river_gauges').insert({
        river_id: riverId,
        gauge_station_id: newStation.id,
        is_primary: gauge.is_primary,
        threshold_unit: 'ft',
        level_too_low: gauge.thresholds.too_low,
        level_low: gauge.thresholds.low,
        level_optimal_min: gauge.thresholds.optimal_min,
        level_optimal_max: gauge.thresholds.optimal_max,
        level_high: gauge.thresholds.high,
        level_dangerous: gauge.thresholds.dangerous,
      });

      if (linkError) {
        console.log(`   ⚠️ Error linking to river: ${linkError.message}`);
      } else {
        console.log(`   🔗 Linked to ${gauge.river_slug}`);
      }
    } else if (!riverId) {
      console.log(`   ⚠️ River ${gauge.river_slug} not found - run river import first`);
    }
  }

  console.log('\n' + '='.repeat(50));
  console.log('✅ Gauge station import complete');
}

// Run the import
importGaugeStations().catch(console.error);
