#!/usr/bin/env npx tsx
/**
 * USGS Missouri Gauge Import Script
 * 
 * Fetches all active stream gauges in Missouri from the official USGS Water Services API
 * and imports them into the database.
 * 
 * This uses the official USGS site inventory feed (not scraping):
 * https://waterservices.usgs.gov/nwis/site/?format=rdb&stateCd=MO&siteType=ST&siteStatus=active
 * 
 * Usage:
 *   npx tsx scripts/import-missouri-gauges.ts
 * 
 * Optional: Link all gauges to a specific river
 *   npx tsx scripts/import-missouri-gauges.ts --river-slug meramec
 * 
 * Note: For very large datasets, you may want to use raw SQL for better performance:
 * 
 *   INSERT INTO gauge_stations (usgs_site_id, name, location, active)
 *   VALUES 
 *     ('07064440', 'Current River at Montauk State Park, MO', 
 *      ST_SetSRID(ST_Point(-91.689, 37.456), 4326), true),
 *     ...
 *   ON CONFLICT (usgs_site_id) DO UPDATE
 *   SET name = excluded.name,
 *       location = excluded.location,
 *       active = excluded.active;
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { createAdminClient } from '../src/lib/supabase/admin';

// Load environment variables from .env.local if it exists
// Use process.cwd() to get the project root directory
const projectRoot = process.cwd();
const envPath = join(projectRoot, '.env.local');

if (existsSync(envPath)) {
  try {
    const envFile = readFileSync(envPath, 'utf-8');
    envFile.split('\n').forEach(line => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const [key, ...valueParts] = trimmed.split('=');
        if (key && valueParts.length > 0) {
          const value = valueParts.join('=').trim().replace(/^["']|["']$/g, '');
          if (!process.env[key]) {
            process.env[key] = value;
          }
        }
      }
    });
  } catch (error) {
    console.warn('Warning: Could not load .env.local file');
  }
}

interface USGSRDBRow {
  site_no: string;
  station_nm: string;
  dec_lat_va: string;
  dec_long_va: string;
}

/**
 * Fetches all active stream gauges in Missouri from USGS
 */
async function fetchMissouriGauges(): Promise<USGSRDBRow[]> {
  const url = new URL('https://waterservices.usgs.gov/nwis/site/');
  url.searchParams.set('format', 'rdb');
  url.searchParams.set('stateCd', 'MO');
  url.searchParams.set('siteType', 'ST'); // Stream gauges
  url.searchParams.set('siteStatus', 'active');

  console.log('📡 Fetching Missouri gauges from USGS...');
  console.log(`   URL: ${url.toString()}`);

  const response = await fetch(url.toString());

  if (!response.ok) {
    throw new Error(`USGS API error: ${response.status} ${response.statusText}`);
  }

  const text = await response.text();
  const lines = text.split('\n');

  // RDB format: First few lines are comments (start with #)
  // Then column headers (tab-separated)
  // Then data rows (tab-separated)
  
  let headerLineIndex = -1;
  let headerColumns: string[] = [];

  // Find the header line (first non-comment line that's not empty)
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line && !line.startsWith('#')) {
      headerLineIndex = i;
      headerColumns = line.split('\t');
      break;
    }
  }

  if (headerLineIndex === -1 || headerColumns.length === 0) {
    throw new Error('Could not find header line in RDB response');
  }

  console.log(`   Found ${headerColumns.length} columns`);
  console.log(`   Columns: ${headerColumns.join(', ')}`);

  // Find indices of columns we need
  const siteNoIndex = headerColumns.indexOf('site_no');
  const stationNmIndex = headerColumns.indexOf('station_nm');
  const latIndex = headerColumns.indexOf('dec_lat_va');
  const lonIndex = headerColumns.indexOf('dec_long_va');

  if (siteNoIndex === -1 || stationNmIndex === -1 || latIndex === -1 || lonIndex === -1) {
    throw new Error('Missing required columns in RDB response');
  }

  // Parse data rows
  // Skip the header line and the next line (column width specification like "5s", "15s")
  const gauges: USGSRDBRow[] = [];
  let dataStartIndex = headerLineIndex + 1;

  // Skip the column width line if it exists (contains patterns like "5s", "15s")
  if (dataStartIndex < lines.length) {
    const widthLine = lines[dataStartIndex].trim();
    if (widthLine && widthLine.match(/\d+s/)) {
      // This is the column width line, skip it
      dataStartIndex++;
    }
  }

  for (let i = dataStartIndex; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line.startsWith('#')) continue;

    const values = line.split('\t');
    if (values.length < headerColumns.length) continue;

    const siteNo = values[siteNoIndex]?.trim();
    const stationNm = values[stationNmIndex]?.trim();
    const lat = values[latIndex]?.trim();
    const lon = values[lonIndex]?.trim();

    // Skip rows with missing required data
    if (!siteNo || !stationNm || !lat || !lon) continue;

    // Validate coordinates
    const latNum = parseFloat(lat);
    const lonNum = parseFloat(lon);

    if (isNaN(latNum) || isNaN(lonNum)) {
      console.warn(`   ⚠️ Skipping ${siteNo}: invalid coordinates (${lat}, ${lon})`);
      continue;
    }

    gauges.push({
      site_no: siteNo,
      station_nm: stationNm,
      dec_lat_va: lat,
      dec_long_va: lon,
    });
  }

  console.log(`   ✅ Parsed ${gauges.length} gauge stations`);
  return gauges;
}

/**
 * Imports gauges into the database with upsert logic
 */
async function importGauges(gauges: USGSRDBRow[], linkToRiverSlug?: string) {
  const supabase = createAdminClient();

  console.log('\n💾 Importing gauges into database...');
  console.log('='.repeat(50));

  let inserted = 0;
  let updated = 0;
  let skipped = 0;
  let errors = 0;

  // Process in batches for better performance and progress tracking
  const BATCH_SIZE = 50;
  const totalBatches = Math.ceil(gauges.length / BATCH_SIZE);

  for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
    const batch = gauges.slice(batchIndex * BATCH_SIZE, (batchIndex + 1) * BATCH_SIZE);
    
    process.stdout.write(`   Batch ${batchIndex + 1}/${totalBatches}... `);

    for (const gauge of batch) {
      const lat = parseFloat(gauge.dec_lat_va);
      const lon = parseFloat(gauge.dec_long_va);

      try {
        const locationGeoJSON = {
          type: 'Point',
          coordinates: [lon, lat], // GeoJSON format: [longitude, latitude]
        };

        // Check if gauge already exists
        const { data: existing } = await supabase
          .from('gauge_stations')
          .select('id')
          .eq('usgs_site_id', gauge.site_no)
          .single();

        if (existing) {
          // Update existing gauge
          const { error } = await supabase
            .from('gauge_stations')
            .update({
              name: gauge.station_nm,
              location: locationGeoJSON,
              active: true,
            })
            .eq('usgs_site_id', gauge.site_no);

          if (error) {
            console.error(`\n   ❌ Error updating ${gauge.site_no}: ${error.message}`);
            errors++;
          } else {
            updated++;
          }
        } else {
          // Insert new gauge
          const { error } = await supabase
            .from('gauge_stations')
            .insert({
              usgs_site_id: gauge.site_no,
              name: gauge.station_nm,
              location: locationGeoJSON,
              active: true,
            });

          if (error) {
            console.error(`\n   ❌ Error inserting ${gauge.site_no}: ${error.message}`);
            errors++;
          } else {
            inserted++;
          }
        }
      } catch (error) {
        console.error(`\n   ❌ Error processing ${gauge.site_no}: ${error}`);
        errors++;
      }
    }

    // Progress indicator after each batch
    const totalProcessed = inserted + updated + errors;
    console.log(`(${totalProcessed}/${gauges.length} processed)`);
  }

  console.log('\n');
  console.log(`   ✅ Inserted: ${inserted}`);
  console.log(`   🔄 Updated: ${updated}`);
  console.log(`   ⏭️ Skipped: ${skipped}`);
  if (errors > 0) {
    console.log(`   ❌ Errors: ${errors}`);
  }

  // Optionally link all gauges to a specific river
  if (linkToRiverSlug) {
    console.log(`\n🔗 Linking all gauges to river: ${linkToRiverSlug}...`);
    
    const { data: river } = await supabase
      .from('rivers')
      .select('id')
      .eq('slug', linkToRiverSlug)
      .single();

    if (!river) {
      console.log(`   ⚠️ River '${linkToRiverSlug}' not found - skipping link step`);
    } else {
      // Link all gauges to this river (only if not already linked)
      const { data: allGauges } = await supabase
        .from('gauge_stations')
        .select('id');

      if (allGauges) {
        let linked = 0;
        let alreadyLinked = 0;

        for (const gauge of allGauges) {
          // Check if already linked
          const { data: existingLink } = await supabase
            .from('river_gauges')
            .select('id')
            .eq('river_id', river.id)
            .eq('gauge_station_id', gauge.id)
            .single();

          if (!existingLink) {
            const { error } = await supabase
              .from('river_gauges')
              .insert({
                river_id: river.id,
                gauge_station_id: gauge.id,
                is_primary: false, // Set to false by default
              });

            if (!error) {
              linked++;
            }
          } else {
            alreadyLinked++;
          }
        }

        console.log(`   ✅ Linked ${linked} new gauges`);
        console.log(`   ⏭️ ${alreadyLinked} already linked`);
      }
    }
  }
}

/**
 * Main function
 */
async function main() {
  const args = process.argv.slice(2);
  const riverSlugArg = args.find(arg => arg.startsWith('--river-slug='));
  const linkToRiverSlug = riverSlugArg?.split('=')[1];

  console.log('🌊 USGS Missouri Gauge Import');
  console.log('='.repeat(50));
  console.log('');

  try {
    // Fetch all Missouri gauges from USGS
    const gauges = await fetchMissouriGauges();

    if (gauges.length === 0) {
      console.log('⚠️ No gauges found');
      return;
    }

    // Import into database
    await importGauges(gauges, linkToRiverSlug);

    console.log('\n' + '='.repeat(50));
    console.log('✅ Import complete!');
    console.log('');
    console.log(`📊 Total gauges processed: ${gauges.length}`);
    
    if (linkToRiverSlug) {
      console.log(`🔗 All gauges linked to river: ${linkToRiverSlug}`);
    } else {
      console.log('💡 Tip: Use --river-slug=<slug> to link all gauges to a specific river');
    }
  } catch (error) {
    console.error('\n❌ Error:', error);
    process.exit(1);
  }
}

// Run the import
main().catch(console.error);
