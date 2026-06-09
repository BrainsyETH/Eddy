#!/usr/bin/env npx tsx
/**
 * Snap Access Points Script
 * 
 * Re-snaps all access points to their river lines using the PostGIS
 * snap_to_river function. This ensures river_mile_downstream values
 * are accurate.
 * 
 * Usage:
 *   npx tsx scripts/snap-access-points.ts
 */

import { createClient } from '@supabase/supabase-js';

function getSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error('Missing Supabase credentials in environment');
  }

  return createClient(url, serviceKey);
}

async function snapAccessPoints() {
  console.log('📍 Snapping Access Points to Rivers');
  console.log('='.repeat(50));
  console.log('');

  const supabase = getSupabaseClient();

  // Get all access points that need snapping
  const { data: accessPoints, error: fetchError } = await supabase
    .from('access_points')
    .select(`
      id,
      name,
      river_id,
      location_orig,
      location_snap,
      river_mile_downstream
    `);

  if (fetchError) {
    console.error('Error fetching access points:', fetchError);
    return;
  }

  if (!accessPoints || accessPoints.length === 0) {
    console.log('No access points found.');
    return;
  }

  console.log(`Found ${accessPoints.length} access points to process.\n`);

  let snapped = 0;
  let failed = 0;

  for (const point of accessPoints) {
    console.log(`📍 ${point.name}`);

    // The snap_to_river trigger should handle this automatically,
    // but we can manually call it to verify/update

    // Force re-snap by updating location_orig (triggers auto_snap_access_point)
    const { error: updateError } = await supabase
      .from('access_points')
      .update({ 
        location_orig: point.location_orig,
        updated_at: new Date().toISOString()
      })
      .eq('id', point.id);

    if (updateError) {
      console.log(`   ❌ Error: ${updateError.message}`);
      failed++;
    } else {
      // Fetch the updated point to see results
      const { data: updated } = await supabase
        .from('access_points')
        .select('river_mile_downstream')
        .eq('id', point.id)
        .single();

      if (updated?.river_mile_downstream) {
        console.log(`   ✅ Snapped at river mile ${updated.river_mile_downstream}`);
        snapped++;
      } else {
        console.log(`   ⚠️ No river mile calculated`);
        failed++;
      }
    }
  }

  console.log('\n' + '='.repeat(50));
  console.log('📊 Summary');
  console.log(`   ✅ Snapped: ${snapped}`);
  console.log(`   ❌ Failed:  ${failed}`);
}

snapAccessPoints().catch(console.error);
