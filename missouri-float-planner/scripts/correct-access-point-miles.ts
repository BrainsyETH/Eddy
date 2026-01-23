#!/usr/bin/env npx tsx
/**
 * Correct Access Point Miles Script
 * 
 * Uses the authoritative mile_markers reference table to correct access point
 * mile assignments. Matches each access point to the nearest mile marker and
 * updates if within tolerance.
 * 
 * Usage:
 *   npx tsx scripts/correct-access-point-miles.ts
 *   npx tsx scripts/correct-access-point-miles.ts --river-slug current-river
 *   npx tsx scripts/correct-access-point-miles.ts --tolerance 0.3
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { createAdminClient } from '../src/lib/supabase/admin';

// Load environment variables from .env.local if it exists
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
    console.warn('Could not load .env.local:', error);
  }
}

const supabase = createAdminClient();

async function main() {
  const args = process.argv.slice(2);
  const riverSlug = args.find(arg => arg.startsWith('--river-slug='))?.split('=')[1];
  const toleranceArg = args.find(arg => arg.startsWith('--tolerance='))?.split('=')[1];
  const tolerance = toleranceArg ? parseFloat(toleranceArg) : 0.5;

  let riverId: string | null = null;

  if (riverSlug) {
    const { data: river, error } = await supabase
      .from('rivers')
      .select('id, name')
      .eq('slug', riverSlug)
      .single();

    if (error || !river) {
      console.error(`River not found: ${riverSlug}`);
      process.exit(1);
    }

    riverId = river.id;
    console.log(`Correcting miles for: ${river.name}`);
  } else {
    console.log('Correcting miles for all rivers');
  }

  console.log(`Tolerance: ${tolerance} miles\n`);

  // Check if migrations have been applied by checking if the function exists
  // We can do this by trying to call it and checking the error
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: results, error } = await (supabase.rpc as any)(
    'correct_all_access_point_miles',
    {
      p_river_id: riverId,
      p_tolerance_miles: tolerance,
    }
  );

  if (error) {
    // Check if it's a "function not found" error
    if (error.code === 'PGRST202' || error.message?.includes('Could not find the function')) {
      console.error('❌ Error: Database migrations have not been applied yet.\n');
      console.error('The function `correct_all_access_point_miles` is defined in migration:');
      console.error('   supabase/migrations/00010_update_mile_calculations.sql\n');
      console.error('Please run the migrations first:');
      console.error('   1. Open Supabase Dashboard → SQL Editor');
      console.error('   2. Run these migrations in order:');
      console.error('      - 00008_river_mile_markers.sql');
      console.error('      - 00009_mile_marker_corrections.sql');
      console.error('      - 00010_update_mile_calculations.sql');
      console.error('\n   Or use: npm run db:migrate (for instructions)');
      process.exit(1);
    }
    
    console.error('Error correcting miles:', error);
    process.exit(1);
  }

  if (!results || results.length === 0) {
    console.log('No access points found to correct');
    return;
  }

  const corrected = results.filter((r: any) => r.corrected).length;
  const unchanged = results.length - corrected;

  console.log(`\n✅ Correction complete:`);
  console.log(`   Corrected: ${corrected}`);
  console.log(`   Unchanged: ${unchanged}`);
  console.log(`   Total: ${results.length}\n`);

  if (corrected > 0) {
    console.log('Corrected access points:');
    results
      .filter((r: any) => r.corrected)
      .slice(0, 10)
      .forEach((r: any) => {
        console.log(`  ${r.access_point_name}: ${r.old_mile} → ${r.new_mile}`);
      });
    if (corrected > 10) {
      console.log(`  ... and ${corrected - 10} more`);
    }
  }

  // Check for duplicate mile markers (same river, same mile)
  await checkDuplicateMiles(riverId);
}

async function checkDuplicateMiles(riverId: string | null) {
  console.log('\n🔍 Checking for duplicate mile markers...');

  // Query access points grouped by river and mile
  const query = supabase
    .from('access_points')
    .select('id, name, river_id, river_mile_downstream, rivers(name)')
    .eq('approved', true)
    .order('river_id')
    .order('river_mile_downstream');

  if (riverId) {
    query.eq('river_id', riverId);
  }

  const { data: accessPoints, error } = await query;

  if (error) {
    console.error('Error checking duplicates:', error);
    return;
  }

  // Group by river_id + river_mile_downstream
  const duplicates = new Map<string, Array<{ id: string; name: string; riverName: string }>>();

  for (const ap of accessPoints || []) {
    const key = `${ap.river_id}:${ap.river_mile_downstream}`;
    if (!duplicates.has(key)) {
      duplicates.set(key, []);
    }
    const riverName = Array.isArray(ap.rivers) 
      ? (ap.rivers[0] as { name: string })?.name 
      : (ap.rivers as { name: string })?.name;
    duplicates.get(key)!.push({ 
      id: ap.id, 
      name: ap.name, 
      riverName: riverName || 'Unknown River' 
    });
  }

  // Filter to only duplicates
  const actualDuplicates = Array.from(duplicates.entries())
    .filter(([_, points]) => points.length > 1);

  if (actualDuplicates.length === 0) {
    console.log('✅ No duplicate mile markers found');
    return;
  }

  console.log(`\n⚠️  Found ${actualDuplicates.length} duplicate mile marker(s):\n`);

  for (const [key, points] of actualDuplicates) {
    const [_, mile] = key.split(':');
    console.log(`Mile ${mile} on ${points[0].riverName}:`);
    for (const point of points) {
      console.log(`  - ${point.name} (${point.id})`);
    }
    console.log('');
  }

  console.log('To fix duplicates:');
  console.log('1. Verify the correct mile marker values for these access points');
  console.log('2. Update the mile_markers reference table if needed');
  console.log('3. Re-run this script with: npx tsx scripts/correct-access-point-miles.ts');
  console.log('4. Or manually update access_points.river_mile_downstream in the database');
}

main().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});
