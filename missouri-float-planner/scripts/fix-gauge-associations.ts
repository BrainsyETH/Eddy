#!/usr/bin/env npx tsx
/**
 * Fix Gauge Associations Script
 *
 * Diagnoses and fixes gauge station associations to rivers.
 * Checks for incorrect linkages (e.g., Black River gauges linked to Current River)
 *
 * Usage:
 *   npx tsx scripts/fix-gauge-associations.ts           # Dry run - show issues only
 *   npx tsx scripts/fix-gauge-associations.ts --fix     # Fix issues
 */

import { loadEnvConfig } from '@next/env';
import { createClient } from '@supabase/supabase-js';

// Load environment variables from .env.local
loadEnvConfig(process.cwd());

// Correct gauge-to-river mappings based on gauge names
const GAUGE_RIVER_MAPPINGS: Record<string, string> = {
  // Current River gauges
  'Current River at Van Buren': 'current',
  'Current River at Doniphan': 'current',
  'Current River near Eminence': 'current',

  // Black River gauges - should NOT be on Current River
  'Black River at Poplar Bluff': 'black',
  'Black River near Annapolis': 'black',
  'Black River at Lesterville': 'black',

  // Meramec River gauges
  'Meramec River near Eureka': 'meramec',
  'Meramec River near Sullivan': 'meramec',
  'Meramec River at Steelville': 'meramec',

  // Eleven Point River
  'Eleven Point River near Bardley': 'eleven-point',

  // Jacks Fork
  'Jacks Fork at Alley Spring': 'jacks-fork',
  'Jacks Fork at Eminence': 'jacks-fork',

  // Niangua
  'Niangua River near Hartville': 'niangua',

  // Big Piney
  'Big Piney River near Big Piney': 'big-piney',

  // Huzzah
  'Huzzah Creek near Steelville': 'huzzah',

  // Courtois
  'Courtois Creek at Berryman': 'courtois',
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
  const args = process.argv.slice(2);
  const shouldFix = args.includes('--fix');

  console.log('🔍 Gauge Association Diagnostic');
  console.log('='.repeat(50));
  console.log(`Mode: ${shouldFix ? 'FIX (will modify database)' : 'DRY RUN (read-only)'}`);
  console.log('');

  const supabase = getSupabaseClient();

  // Get all rivers
  const { data: rivers, error: riverError } = await supabase
    .from('rivers')
    .select('id, name, slug');

  if (riverError || !rivers) {
    console.error('Error fetching rivers:', riverError);
    process.exit(1);
  }

  const riverBySlug = new Map(rivers.map(r => [r.slug, r]));
  const riverById = new Map(rivers.map(r => [r.id, r]));

  // Get all gauge stations
  const { data: gauges, error: gaugeError } = await supabase
    .from('gauge_stations')
    .select('id, name, usgs_site_id');

  if (gaugeError || !gauges) {
    console.error('Error fetching gauge stations:', gaugeError);
    process.exit(1);
  }

  // Get all gauge-river associations
  const { data: associations, error: assocError } = await supabase
    .from('river_gauges')
    .select('id, river_id, gauge_station_id, is_primary');

  if (assocError) {
    console.error('Error fetching associations:', assocError);
    process.exit(1);
  }

  console.log(`Found ${rivers.length} rivers, ${gauges.length} gauge stations, ${associations?.length || 0} associations\n`);

  // Check each association
  const issues: Array<{
    assocId: string;
    gaugeName: string;
    currentRiver: string;
    correctRiver: string | null;
  }> = [];

  console.log('📊 Current Associations:');
  console.log('-'.repeat(50));

  for (const assoc of associations || []) {
    const gauge = gauges.find(g => g.id === assoc.gauge_station_id);
    const river = riverById.get(assoc.river_id);

    if (!gauge || !river) continue;

    // Find correct river based on gauge name
    let correctSlug: string | null = null;
    for (const [namePattern, slug] of Object.entries(GAUGE_RIVER_MAPPINGS)) {
      if (gauge.name.toLowerCase().includes(namePattern.toLowerCase())) {
        correctSlug = slug;
        break;
      }
    }

    const isCorrect = !correctSlug || correctSlug === river.slug;
    const status = isCorrect ? '✅' : '❌';

    console.log(`${status} ${gauge.name}`);
    console.log(`   Linked to: ${river.name} (${river.slug})`);
    if (!isCorrect && correctSlug) {
      const correctRiver = riverBySlug.get(correctSlug);
      console.log(`   Should be: ${correctRiver?.name || correctSlug} (${correctSlug})`);
      issues.push({
        assocId: assoc.id,
        gaugeName: gauge.name,
        currentRiver: river.slug,
        correctRiver: correctSlug,
      });
    }
    console.log('');
  }

  // Summary
  console.log('='.repeat(50));
  console.log(`📋 Summary: ${issues.length} issue(s) found`);

  if (issues.length === 0) {
    console.log('✅ All gauge associations look correct!');
    return;
  }

  // Show issues
  console.log('\n❌ Issues to fix:');
  for (const issue of issues) {
    console.log(`   - ${issue.gaugeName}: ${issue.currentRiver} → ${issue.correctRiver}`);
  }

  if (!shouldFix) {
    console.log('\n💡 Run with --fix to correct these associations');
    return;
  }

  // Fix issues
  console.log('\n🔧 Fixing issues...');

  for (const issue of issues) {
    const correctRiver = riverBySlug.get(issue.correctRiver!);
    if (!correctRiver) {
      console.log(`   ⚠️ River ${issue.correctRiver} not found, skipping ${issue.gaugeName}`);
      continue;
    }

    const { error: updateError } = await supabase
      .from('river_gauges')
      .update({ river_id: correctRiver.id })
      .eq('id', issue.assocId);

    if (updateError) {
      console.log(`   ❌ Error fixing ${issue.gaugeName}: ${updateError.message}`);
    } else {
      console.log(`   ✅ Fixed ${issue.gaugeName} → ${correctRiver.name}`);
    }
  }

  console.log('\n✅ Gauge association fixes complete');
}

main().catch(console.error);
