#!/usr/bin/env npx tsx
/**
 * Fix Niangua River Gauge Station
 *
 * The Niangua was incorrectly using USGS 06923500 (Bennett Spring — a spring
 * gauge, not the river gauge). This script switches it to 06923250 (Niangua
 * River at Windyville, MO) which reports both gauge height and discharge for
 * the actual river.
 *
 * Usage:
 *   npx tsx scripts/fix-niangua-gauge.ts           # Dry run
 *   npx tsx scripts/fix-niangua-gauge.ts --fix      # Apply changes
 */

import { loadEnvConfig } from '@next/env';
import { createClient } from '@supabase/supabase-js';

loadEnvConfig(process.cwd());

const OLD_SITE_ID = '06923500'; // Bennett Spring (wrong — spring gauge)
const NEW_SITE_ID = '06923250'; // Niangua River at Windyville (correct — river gauge)

const NEW_STATION = {
  name: 'Niangua River at Windyville, MO',
  usgs_site_id: NEW_SITE_ID,
  location: {
    type: 'Point',
    coordinates: [-92.8753, 37.4928],
  },
  active: true,
};

// Thresholds calibrated for the Windyville gauge
const NEW_THRESHOLDS = {
  level_too_low: 0.8,
  level_low: 1.0,
  level_optimal_min: 1.5,
  level_optimal_max: 3.5,
  level_high: 5.0,
  level_dangerous: 8.0,
  threshold_unit: 'ft',
};

function getSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    throw new Error('Missing Supabase credentials in environment');
  }
  return createClient(supabaseUrl, serviceKey);
}

async function main() {
  const shouldFix = process.argv.includes('--fix');
  console.log('🔧 Niangua Gauge Fix');
  console.log('='.repeat(50));
  console.log(`Mode: ${shouldFix ? 'FIX (will modify database)' : 'DRY RUN (read-only)'}`);
  console.log('');

  const supabase = getSupabaseClient();

  // 1. Find the old station
  const { data: oldStation } = await supabase
    .from('gauge_stations')
    .select('id, name, usgs_site_id')
    .eq('usgs_site_id', OLD_SITE_ID)
    .maybeSingle();

  if (!oldStation) {
    console.log(`⚠️  Old station ${OLD_SITE_ID} not found in gauge_stations — may already be fixed`);
  } else {
    console.log(`📍 Found old station: ${oldStation.name} (${oldStation.usgs_site_id})`);
  }

  // 2. Check if new station already exists
  const { data: existingNew } = await supabase
    .from('gauge_stations')
    .select('id, name')
    .eq('usgs_site_id', NEW_SITE_ID)
    .maybeSingle();

  if (existingNew) {
    console.log(`✅ New station ${NEW_SITE_ID} already exists: ${existingNew.name}`);
  } else {
    console.log(`📋 Will create new station: ${NEW_STATION.name} (${NEW_SITE_ID})`);
  }

  // 3. Find the Niangua river
  const { data: river } = await supabase
    .from('rivers')
    .select('id, slug')
    .eq('slug', 'niangua')
    .single();

  if (!river) {
    console.error('❌ Niangua river not found in rivers table');
    process.exit(1);
  }
  console.log(`🏞️  Niangua river found (id: ${river.id})`);

  // 4. Find existing river_gauges link (primary)
  const { data: existingPrimaryLink } = await supabase
    .from('river_gauges')
    .select('id, gauge_station_id, is_primary')
    .eq('river_id', river.id)
    .eq('is_primary', true)
    .maybeSingle();

  if (existingPrimaryLink) {
    console.log(`🔗 Existing primary gauge link: river_gauges.id=${existingPrimaryLink.id} → station ${existingPrimaryLink.gauge_station_id}`);
  }

  // 5. Check if there's already a river_gauges row for the NEW station
  const { data: existingNewLink } = await supabase
    .from('river_gauges')
    .select('id, is_primary')
    .eq('river_id', river.id)
    .eq('gauge_station_id', existingNew?.id || '__none__')
    .maybeSingle();

  if (existingNewLink) {
    console.log(`🔗 Existing link to Windyville station: river_gauges.id=${existingNewLink.id} (primary: ${existingNewLink.is_primary})`);
  }

  console.log('');
  console.log('Plan:');
  if (!existingNew) {
    console.log(`  1. Insert gauge_station for ${NEW_SITE_ID}`);
  }
  if (existingNewLink) {
    console.log(`  2. Update existing Windyville link: set as primary + update thresholds`);
    if (existingPrimaryLink && existingPrimaryLink.id !== existingNewLink.id) {
      console.log(`  3. Demote old primary link (river_gauges.id=${existingPrimaryLink.id})`);
    }
  } else if (existingPrimaryLink) {
    console.log(`  2. Update primary link to point to new station + update thresholds`);
  } else {
    console.log(`  2. Create river_gauges link to new station`);
  }
  if (oldStation) {
    console.log(`  4. Deactivate old station ${OLD_SITE_ID}`);
  }

  if (!shouldFix) {
    console.log('\n💡 Run with --fix to apply changes');
    return;
  }

  console.log('\n🔧 Applying fixes...\n');

  // Step 1: Create new station if needed
  let newStationId: string;
  if (existingNew) {
    newStationId = existingNew.id;
  } else {
    const { data: inserted, error: insertErr } = await supabase
      .from('gauge_stations')
      .insert(NEW_STATION)
      .select('id')
      .single();

    if (insertErr || !inserted) {
      console.error('❌ Failed to insert new station:', insertErr?.message);
      process.exit(1);
    }
    newStationId = inserted.id;
    console.log(`✅ Inserted gauge_station ${NEW_SITE_ID} (id: ${newStationId})`);
  }

  // Step 2: Ensure the Windyville station is linked as primary with correct thresholds
  if (existingNewLink) {
    // A river_gauges row for Windyville already exists — update it to primary + thresholds
    const { error: updateErr } = await supabase
      .from('river_gauges')
      .update({
        is_primary: true,
        ...NEW_THRESHOLDS,
      })
      .eq('id', existingNewLink.id);

    if (updateErr) {
      console.error('❌ Failed to update Windyville link:', updateErr.message);
      process.exit(1);
    }
    console.log(`✅ Updated Windyville link to primary with new thresholds`);

    // Demote old primary if it's a different row
    if (existingPrimaryLink && existingPrimaryLink.id !== existingNewLink.id) {
      const { error: demoteErr } = await supabase
        .from('river_gauges')
        .update({ is_primary: false })
        .eq('id', existingPrimaryLink.id);

      if (demoteErr) {
        console.error('⚠️  Failed to demote old primary:', demoteErr.message);
      } else {
        console.log(`✅ Demoted old primary link (river_gauges.id=${existingPrimaryLink.id})`);
      }
    }
  } else if (existingPrimaryLink) {
    // No existing Windyville link — repoint the old primary link
    const { error: updateErr } = await supabase
      .from('river_gauges')
      .update({
        gauge_station_id: newStationId,
        ...NEW_THRESHOLDS,
      })
      .eq('id', existingPrimaryLink.id);

    if (updateErr) {
      console.error('❌ Failed to update river_gauges:', updateErr.message);
      process.exit(1);
    }
    console.log(`✅ Updated river_gauges link to ${NEW_SITE_ID}`);
  } else {
    // No links at all — create a new one
    const { error: linkErr } = await supabase
      .from('river_gauges')
      .insert({
        river_id: river.id,
        gauge_station_id: newStationId,
        is_primary: true,
        ...NEW_THRESHOLDS,
      });

    if (linkErr) {
      console.error('❌ Failed to create river_gauges link:', linkErr.message);
      process.exit(1);
    }
    console.log(`✅ Created river_gauges link to ${NEW_SITE_ID}`);
  }

  // Step 3: Deactivate old station
  if (oldStation) {
    const { error: deactivateErr } = await supabase
      .from('gauge_stations')
      .update({ active: false })
      .eq('id', oldStation.id);

    if (deactivateErr) {
      console.error('⚠️  Failed to deactivate old station:', deactivateErr.message);
    } else {
      console.log(`✅ Deactivated old station ${OLD_SITE_ID}`);
    }
  }

  console.log('\n' + '='.repeat(50));
  console.log('✅ Niangua gauge fix complete!');
  console.log('   Next: trigger gauge cron to fetch initial readings for the new station');
}

main().catch(console.error);
