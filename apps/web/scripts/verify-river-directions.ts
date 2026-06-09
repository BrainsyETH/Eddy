#!/usr/bin/env npx tsx
/**
 * Verify River Geometry Directions
 *
 * Checks each river's geometry to determine if it starts at headwaters or mouth.
 * Uses elevation data and coordinate patterns to make determination.
 *
 * Usage:
 *   npx tsx scripts/verify-river-directions.ts
 */

import { createAdminClient } from '../src/lib/supabase/admin';

interface RiverGeometry {
  id: string;
  name: string;
  slug: string;
  length_miles: number;
  geom: {
    type: 'LineString';
    coordinates: [number, number][];
  };
  geometry_starts_at_headwaters: boolean | null;
}

async function main() {
  console.log('🧭 River Direction Verification Tool');
  console.log('='.repeat(50));

  const supabase = createAdminClient();

  // Get all rivers with geometry
  const { data: rivers, error } = await supabase
    .from('rivers')
    .select('id, name, slug, length_miles, geom, geometry_starts_at_headwaters')
    .not('geom', 'is', null);

  if (error || !rivers) {
    console.error('Error fetching rivers:', error);
    process.exit(1);
  }

  console.log(`\nFound ${rivers.length} rivers with geometry\n`);

  // Known Missouri river flow patterns (west to east, or north to south generally)
  // Rivers flow DOWNSTREAM toward the Mississippi (east) or Missouri (north) rivers
  const results: Array<{
    name: string;
    slug: string;
    startCoord: [number, number];
    endCoord: [number, number];
    currentSetting: boolean | null;
    recommendation: 'headwaters_first' | 'mouth_first' | 'uncertain';
    reasoning: string;
  }> = [];

  for (const river of rivers as RiverGeometry[]) {
    if (!river.geom || !river.geom.coordinates || river.geom.coordinates.length < 2) {
      console.log(`⚠️  ${river.name}: No valid geometry`);
      continue;
    }

    const coords = river.geom.coordinates;
    const startCoord = coords[0] as [number, number];
    const endCoord = coords[coords.length - 1] as [number, number];

    // Missouri rivers generally flow:
    // - West to East (toward Mississippi)
    // - Headwaters are typically WEST (more negative longitude) and/or at higher elevations
    // - Mouth is typically EAST (less negative longitude)

    const startLng = startCoord[0];
    const endLng = endCoord[0];
    const startLat = startCoord[1];
    const endLat = endCoord[1];

    let recommendation: 'headwaters_first' | 'mouth_first' | 'uncertain';
    let reasoning: string;

    // Check longitude difference (primary indicator for Missouri)
    const lngDiff = endLng - startLng; // Positive = start is west of end

    if (Math.abs(lngDiff) > 0.1) {
      // Significant east-west difference
      if (lngDiff > 0) {
        // Start is WEST of end - start is likely headwaters
        recommendation = 'headwaters_first';
        reasoning = `Start is ${Math.abs(lngDiff).toFixed(2)}° WEST of end (typical flow pattern)`;
      } else {
        // Start is EAST of end - start is likely mouth
        recommendation = 'mouth_first';
        reasoning = `Start is ${Math.abs(lngDiff).toFixed(2)}° EAST of end (reversed from typical)`;
      }
    } else {
      // Minimal east-west difference, check north-south
      const latDiff = endLat - startLat;
      if (Math.abs(latDiff) > 0.1) {
        // For north-south rivers, headwaters are typically at higher latitude (more north) in Missouri
        if (latDiff < 0) {
          recommendation = 'headwaters_first';
          reasoning = `Start is ${Math.abs(latDiff).toFixed(2)}° NORTH of end`;
        } else {
          recommendation = 'mouth_first';
          reasoning = `Start is ${Math.abs(latDiff).toFixed(2)}° SOUTH of end`;
        }
      } else {
        recommendation = 'uncertain';
        reasoning = 'Minimal directional difference - manual verification needed';
      }
    }

    results.push({
      name: river.name,
      slug: river.slug,
      startCoord,
      endCoord,
      currentSetting: river.geometry_starts_at_headwaters,
      recommendation,
      reasoning,
    });

    // Display result
    const statusIcon = recommendation === 'headwaters_first' ? '✅' :
                       recommendation === 'mouth_first' ? '⚠️' : '❓';
    const currentIcon = river.geometry_starts_at_headwaters === true ? '✓' :
                        river.geometry_starts_at_headwaters === false ? '✗' : '?';

    console.log(`${statusIcon} ${river.name}`);
    console.log(`   Start: [${startLng.toFixed(4)}, ${startLat.toFixed(4)}]`);
    console.log(`   End:   [${endLng.toFixed(4)}, ${endLat.toFixed(4)}]`);
    console.log(`   ${reasoning}`);
    console.log(`   Current setting: geometry_starts_at_headwaters = ${currentIcon}`);
    console.log('');
  }

  // Summary
  console.log('='.repeat(50));
  console.log('📊 Summary');
  console.log('='.repeat(50));

  const needsUpdate = results.filter(r => {
    if (r.recommendation === 'uncertain') return false;
    const shouldBe = r.recommendation === 'headwaters_first';
    return r.currentSetting !== shouldBe;
  });

  if (needsUpdate.length === 0) {
    console.log('✅ All rivers appear to have correct direction settings');
  } else {
    console.log(`⚠️  ${needsUpdate.length} river(s) may need direction correction:\n`);

    for (const river of needsUpdate) {
      const shouldBe = river.recommendation === 'headwaters_first';
      console.log(`   ${river.name}:`);
      console.log(`     Current: ${river.currentSetting}`);
      console.log(`     Should be: ${shouldBe}`);
      console.log(`     Reason: ${river.reasoning}`);
      console.log('');
    }

    console.log('\nTo update, run:');
    for (const river of needsUpdate) {
      const shouldBe = river.recommendation === 'headwaters_first';
      console.log(`  UPDATE rivers SET geometry_starts_at_headwaters = ${shouldBe} WHERE slug = '${river.slug}';`);
    }
  }

  console.log('\n💡 After updating direction flags, run:');
  console.log('   npx tsx scripts/snap-access-points.ts');
  console.log('   This will recalculate all mile markers with correct direction.\n');
}

main().catch(console.error);
