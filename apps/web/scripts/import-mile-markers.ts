#!/usr/bin/env npx tsx
/**
 * Mile-by-Mile Marker Import Script
 * 
 * Imports authoritative mile-by-mile reference data from CSV for Current River,
 * Eleven Point River, and Jacks Fork River. This establishes the source of truth
 * for river mile markers (mile 0.0 = headwaters, increasing downstream).
 * 
 * Usage:
 *   npx tsx scripts/import-mile-markers.ts
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { createAdminClient } from '../src/lib/supabase/admin';

interface MileMarkerRow {
  river: string;
  mile: string;
  name: string;
  description: string;
}

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
  // Read CSV file - try multiple possible paths
  const possiblePaths = [
    '/Users/evangardner/Documents/ozark_rivers_mile_markers.csv',
    join(process.cwd(), '..', 'ozark_rivers_mile_markers.csv'),
    join(process.cwd(), 'ozark_rivers_mile_markers.csv'),
  ];

  let csvContent: string | null = null;
  let csvPath: string | null = null;

  for (const path of possiblePaths) {
    if (existsSync(path)) {
      csvPath = path;
      csvContent = readFileSync(path, 'utf-8');
      break;
    }
  }

  if (!csvContent || !csvPath) {
    console.error('CSV file not found. Tried:');
    possiblePaths.forEach(p => console.error(`  - ${p}`));
    process.exit(1);
  }

  console.log(`Reading CSV from: ${csvPath}`);

  // Parse CSV manually (simple CSV parser)
  const lines = csvContent.split('\n').filter(line => line.trim());
  const headers = lines[0].split(',').map(h => h.trim());
  const records: MileMarkerRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    // Simple CSV parsing (handles quoted fields)
    const line = lines[i];
    const values: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let j = 0; j < line.length; j++) {
      const char = line[j];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        values.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    values.push(current.trim()); // Last value

    if (values.length >= 4) {
      records.push({
        river: values[0] || '',
        mile: values[1] || '',
        name: values[2] || '',
        description: values[3] || '',
      });
    }
  }

  console.log(`Found ${records.length} mile marker records`);

  // Get river slugs mapping
  const riverSlugMap: Record<string, string> = {
    'Current River': 'current-river',
    'Eleven Point River': 'eleven-point-river',
    'Jacks Fork River': 'jacks-fork-river',
  };

  // Get river IDs
  const { data: rivers, error: riversError } = await supabase
    .from('rivers')
    .select('id, slug, name');

  if (riversError || !rivers) {
    console.error('Error fetching rivers:', riversError);
    process.exit(1);
  }

  const riverIdMap: Record<string, string> = {};
  for (const river of rivers) {
    const csvRiverName = Object.keys(riverSlugMap).find(
      (name) => riverSlugMap[name] === river.slug
    );
    if (csvRiverName) {
      riverIdMap[csvRiverName] = river.id;
    }
  }

  console.log('River ID mapping:', riverIdMap);

  // Create or update mile marker reference table
  // First, check if table exists, if not we'll create it via migration
  const mileMarkers = records.map((row) => {
    const riverId = riverIdMap[row.river];
    if (!riverId) {
      console.warn(`River not found: ${row.river}`);
      return null;
    }

    return {
      river_id: riverId,
      mile: parseFloat(row.mile),
      name: row.name || null,
      description: row.description || null,
      river_name: row.river, // Keep original name for reference
    };
  }).filter((m): m is NonNullable<typeof m> => m !== null);

  console.log(`Processing ${mileMarkers.length} mile markers`);

  // Upsert mile markers into reference table
  let imported = 0;
  let errors = 0;

  for (const marker of mileMarkers) {
    const { error } = await supabase
      .from('river_mile_markers')
      .upsert(
        {
          river_id: marker.river_id,
          mile: marker.mile,
          name: marker.name,
          description: marker.description,
        },
        {
          onConflict: 'river_id,mile',
        }
      );

    if (error) {
      console.error(`Error importing ${marker.river_name} mile ${marker.mile}:`, error);
      errors++;
    } else {
      imported++;
    }
  }

  console.log(`\n✅ Import complete:`);
  console.log(`   Imported: ${imported}`);
  console.log(`   Errors: ${errors}`);
  console.log(`   Total: ${mileMarkers.length}`);
}

main().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});
