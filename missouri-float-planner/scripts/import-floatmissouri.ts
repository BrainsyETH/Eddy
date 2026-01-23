#!/usr/bin/env npx tsx
/**
 * Import FloatMissouri Data
 *
 * Imports river data, access points, hazards, and features from
 * the scraped floatmissouri.com JSON files.
 *
 * Usage:
 *   npx tsx scripts/import-floatmissouri.ts                    # Dry run
 *   npx tsx scripts/import-floatmissouri.ts --import           # Import data
 *   npx tsx scripts/import-floatmissouri.ts --import --update  # Update existing
 */

import { loadEnvConfig } from '@next/env';
import * as fs from 'fs';
import * as path from 'path';
import { createClient } from '@supabase/supabase-js';

// Load environment variables from .env.local
loadEnvConfig(process.cwd());

interface RiverData {
  id: string;
  name: string;
  url: string;
  difficulty: string | null;
  gradient_general: string | null;
  gradient_details: string | null;
  counties: string[];
  description: string;
}

interface MileMarker {
  river_id: string;
  mile: number;
  description: string;
  raw_text: string;
  feature_type: string;
  is_access_point: boolean;
  is_campground: boolean;
  has_spring: boolean;
  has_bridge: boolean;
  is_hazard: boolean;
  side: string | null;
  highway: string | null;
  notes: string | null;
}

interface CombinedData {
  [riverId: string]: {
    metadata: RiverData;
    mile_markers: MileMarker[];
  };
}

// Map floatmissouri IDs to our slugs
const RIVER_SLUG_MAP: Record<string, string> = {
  'current-river': 'current',
  'eleven-point-river': 'eleven-point',
  'jacks-fork-river': 'jacks-fork',
  'meramec-river': 'meramec',
  'huzzah-river': 'huzzah',
  'courtois-river': 'courtois',
  'big-piney-river': 'big-piney',
  'niangua-river': 'niangua',
  'gasconade-river': 'gasconade',
  'north-fork': 'north-fork',
  'black-river': 'black',
  'st-francis-river': 'st-francis',
  'james-river': 'james',
  'elk-river': 'elk',
  'big-sugar-creek': 'big-sugar',
  'bourbeuse-river': 'bourbeuse',
  'sac-river': 'sac',
  'osage-fork': 'osage-fork',
  'bryant-creek': 'bryant',
  'beaver-creek': 'beaver',
};

function getSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    throw new Error('Missing Supabase credentials in environment');
  }

  return createClient(supabaseUrl, serviceKey);
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/['']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function extractAccessPointName(marker: MileMarker): string {
  const desc = marker.description;

  // Try to extract a meaningful name
  // Pattern: "Hwy. XX Bridge at Location" -> "Location"
  const atMatch = desc.match(/at\s+([A-Z][a-zA-Z\s]+?)(?:\.|,|$)/);
  if (atMatch) return atMatch[1].trim();

  // Pattern: "Location access" or "Location. Access"
  const accessMatch = desc.match(/^([A-Z][a-zA-Z\s]+?)(?:\s+[Aa]ccess|\.\s*[Aa]ccess)/);
  if (accessMatch) return accessMatch[1].trim();

  // Pattern: "Hwy. XX Bridge" -> "Hwy XX Bridge"
  const hwyMatch = desc.match(/(Hwy\.?\s*[\d-]+\s*Bridge)/i);
  if (hwyMatch) return hwyMatch[1].replace('.', '');

  // Use first part of description
  const firstPart = desc.split(/[.,]/)[0];
  return firstPart.length > 50 ? firstPart.substring(0, 50) : firstPart;
}

function determineAccessType(marker: MileMarker): string {
  const desc = marker.description.toLowerCase();

  if (desc.includes('boat ramp') || desc.includes('launch')) return 'boat_ramp';
  if (desc.includes('gravel bar') || desc.includes('gravel access')) return 'gravel_bar';
  if (desc.includes('campground') || desc.includes('camping')) return 'campground';
  if (desc.includes('bridge')) return 'bridge';
  if (desc.includes('park')) return 'park';
  return 'access';
}

function determineHazardType(marker: MileMarker): string {
  const desc = marker.description.toLowerCase();

  if (desc.includes('dam') || desc.includes('low-water dam') || desc.includes('lowhead dam')) return 'low_water_dam';
  if (desc.includes('portage')) return 'portage';
  if (desc.includes('strainer') || desc.includes('logjam')) return 'strainer';
  if (desc.includes('rapid') || desc.includes('shoal') || desc.includes('riffle')) return 'rapid';
  if (desc.includes('waterfall') || desc.includes('falls')) return 'waterfall';
  if (desc.includes('private')) return 'private_property';
  if (desc.includes('bridge piling')) return 'bridge_piling';
  return 'other';
}

function determineHazardSeverity(marker: MileMarker): string {
  const desc = marker.description.toLowerCase();

  if (desc.includes('danger') || desc.includes('deadly') || desc.includes('avoid')) return 'danger';
  if (desc.includes('warning') || desc.includes('caution') || desc.includes('portage')) return 'warning';
  if (desc.includes('be careful') || desc.includes('watch')) return 'caution';
  return 'info';
}

function isPublicAccess(marker: MileMarker): boolean {
  const desc = marker.description.toLowerCase();
  return !desc.includes('private') && !desc.includes('no access');
}

async function main() {
  const args = process.argv.slice(2);
  const shouldImport = args.includes('--import');
  const shouldUpdate = args.includes('--update');

  console.log('📊 FloatMissouri Data Import');
  console.log('='.repeat(50));
  console.log(`Mode: ${shouldImport ? (shouldUpdate ? 'IMPORT + UPDATE' : 'IMPORT') : 'DRY RUN'}`);
  console.log('');

  // Load JSON data
  const dataPath = path.join(process.cwd(), 'floatmissouri_combined.json');
  if (!fs.existsSync(dataPath)) {
    console.error(`File not found: ${dataPath}`);
    process.exit(1);
  }

  const rawData = fs.readFileSync(dataPath, 'utf-8');
  const data: CombinedData = JSON.parse(rawData);

  const supabase = getSupabaseClient();

  // Get existing rivers with geometry info
  const { data: existingRivers } = await supabase
    .from('rivers')
    .select('id, slug, name, length_miles');

  const riverIdMap = new Map<string, string>();
  const riverLengthMap = new Map<string, number>();
  existingRivers?.forEach(r => {
    riverIdMap.set(r.slug, r.id);
    if (r.length_miles) riverLengthMap.set(r.id, parseFloat(r.length_miles));
  });

  // Stats
  const stats = {
    riversFound: 0,
    riversMatched: 0,
    accessPointsFound: 0,
    accessPointsImported: 0,
    hazardsFound: 0,
    hazardsImported: 0,
    errors: 0,
  };

  // Process each river
  for (const [riverId, riverData] of Object.entries(data)) {
    stats.riversFound++;

    const ourSlug = RIVER_SLUG_MAP[riverId] || slugify(riverData.metadata.name);
    const dbRiverId = riverIdMap.get(ourSlug);

    console.log(`\n📍 ${riverData.metadata.name} (${riverId} → ${ourSlug})`);

    if (!dbRiverId) {
      console.log(`   ⚠️ River not in database, skipping markers`);
      continue;
    }

    stats.riversMatched++;
    console.log(`   ✅ Matched to database ID: ${dbRiverId.slice(0, 8)}...`);

    // Process mile markers
    const accessPoints = riverData.mile_markers.filter(m => m.is_access_point && m.feature_type !== 'other');
    const hazards = riverData.mile_markers.filter(m => m.is_hazard);

    console.log(`   Found ${accessPoints.length} access points, ${hazards.length} hazards`);
    stats.accessPointsFound += accessPoints.length;
    stats.hazardsFound += hazards.length;

    if (!shouldImport) continue;

    // Import access points
    for (const marker of accessPoints) {
      const name = extractAccessPointName(marker);
      const slug = slugify(name);
      const type = determineAccessType(marker);
      const isPublic = isPublicAccess(marker);

      // Check if exists
      const { data: existing } = await supabase
        .from('access_points')
        .select('id')
        .eq('river_id', dbRiverId)
        .eq('slug', slug)
        .single();

      if (existing && !shouldUpdate) {
        continue;
      }

      // Get coordinates from mile marker using database function
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: pointData, error: pointError } = await (supabase.rpc as any)(
        'get_point_at_mile',
        {
          p_river_id: dbRiverId,
          p_mile: marker.mile,
        }
      );

      if (pointError || !pointData || pointData.length === 0) {
        console.log(`   ⚠️ Could not calculate coordinates for ${name} at mile ${marker.mile}`);
        stats.errors++;
        continue;
      }

      const coords = pointData[0];
      const locationOrig = `SRID=4326;POINT(${coords.lng} ${coords.lat})`;

      const accessPointData = {
        river_id: dbRiverId,
        name,
        slug,
        type,
        is_public: isPublic,
        description: marker.description,
        river_mile_downstream: marker.mile,
        location_orig: locationOrig,
        approved: false, // Requires manual review
      };

      if (existing && shouldUpdate) {
        await supabase
          .from('access_points')
          .update(accessPointData)
          .eq('id', existing.id);
      } else if (!existing) {
        const { error } = await supabase
          .from('access_points')
          .insert(accessPointData);

        if (error) {
          console.log(`   ❌ Error: ${name}: ${error.message}`);
          stats.errors++;
        } else {
          stats.accessPointsImported++;
        }
      }
    }

    // Import hazards
    for (const marker of hazards) {
      const name = marker.description.split(/[.,]/)[0];
      const type = determineHazardType(marker);
      const severity = determineHazardSeverity(marker);

      // Check if exists
      const { data: existing } = await supabase
        .from('river_hazards')
        .select('id')
        .eq('river_id', dbRiverId)
        .eq('river_mile_downstream', marker.mile)
        .single();

      if (existing && !shouldUpdate) {
        continue;
      }

      // Get coordinates from mile marker using database function
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: pointData, error: pointError } = await (supabase.rpc as any)(
        'get_point_at_mile',
        {
          p_river_id: dbRiverId,
          p_mile: marker.mile,
        }
      );

      let location = null;
      if (!pointError && pointData && pointData.length > 0) {
        const coords = pointData[0];
        location = `SRID=4326;POINT(${coords.lng} ${coords.lat})`;
      }

      const hazardData = {
        river_id: dbRiverId,
        name,
        type,
        severity,
        description: marker.description,
        river_mile_downstream: marker.mile,
        portage_required: marker.description.toLowerCase().includes('portage'),
        portage_side: marker.side as 'left' | 'right' | null,
        active: true,
        ...(location ? { location } : {}),
      };

      if (existing && shouldUpdate) {
        await supabase
          .from('river_hazards')
          .update(hazardData)
          .eq('id', existing.id);
      } else if (!existing) {
        const { error } = await supabase
          .from('river_hazards')
          .insert(hazardData);

        if (error) {
          console.log(`   ❌ Hazard error: ${name}: ${error.message}`);
          stats.errors++;
        } else {
          stats.hazardsImported++;
        }
      }
    }
  }

  // Summary
  console.log('\n' + '='.repeat(50));
  console.log('📋 Import Summary');
  console.log('='.repeat(50));
  console.log(`Rivers found:      ${stats.riversFound}`);
  console.log(`Rivers matched:    ${stats.riversMatched}`);
  console.log(`Access points:     ${stats.accessPointsFound} found, ${stats.accessPointsImported} imported`);
  console.log(`Hazards:           ${stats.hazardsFound} found, ${stats.hazardsImported} imported`);
  console.log(`Errors:            ${stats.errors}`);

  if (!shouldImport) {
    console.log('\n💡 Run with --import to import data');
    console.log('💡 Run with --import --update to also update existing records');
  } else {
    console.log('\n⚠️ Imported access points are NOT approved.');
    console.log('   Review them in the Geo Admin page before they appear in the app.');
  }
}

main().catch(console.error);
