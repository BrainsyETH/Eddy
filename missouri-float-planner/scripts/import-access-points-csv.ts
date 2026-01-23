#!/usr/bin/env npx tsx
/**
 * Import Access Points from CSV
 *
 * Imports access points from a CSV file into the database.
 * New points are created as unapproved by default.
 *
 * Usage:
 *   npx tsx scripts/import-access-points-csv.ts <csv-file>
 *
 * CSV Format:
 *   river_slug,name,type,latitude,longitude,is_public,ownership,description,fee_required,fee_notes
 *
 * Types: public_ramp, private_ramp, carry_in, bridge, other
 */

import * as fs from 'fs';
import * as path from 'path';
import { createAdminClient } from '../src/lib/supabase/admin';

interface CSVRow {
  river_slug: string;
  name: string;
  type: string;
  latitude: string;
  longitude: string;
  is_public: string;
  ownership: string;
  description: string;
  fee_required: string;
  fee_notes: string;
}

function parseCSV(content: string): CSVRow[] {
  const lines = content.trim().split('\n');
  if (lines.length < 2) {
    throw new Error('CSV must have a header row and at least one data row');
  }

  const headers = lines[0].split(',').map(h => h.trim());
  const requiredHeaders = ['river_slug', 'name', 'type', 'latitude', 'longitude'];

  for (const required of requiredHeaders) {
    if (!headers.includes(required)) {
      throw new Error(`Missing required header: ${required}`);
    }
  }

  const rows: CSVRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map(v => v.trim());
    if (values.length < headers.length) {
      console.warn(`Skipping row ${i + 1}: insufficient columns`);
      continue;
    }

    const row: Record<string, string> = {};
    headers.forEach((header, index) => {
      row[header] = values[index] || '';
    });
    rows.push(row as unknown as CSVRow);
  }

  return rows;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length < 1) {
    console.log('Usage: npx tsx scripts/import-access-points-csv.ts <csv-file>');
    console.log('');
    console.log('See scripts/templates/access-points-template.csv for the expected format.');
    process.exit(1);
  }

  const csvPath = path.resolve(args[0]);
  if (!fs.existsSync(csvPath)) {
    console.error(`File not found: ${csvPath}`);
    process.exit(1);
  }

  console.log('📥 Access Points CSV Import');
  console.log('='.repeat(50));

  const content = fs.readFileSync(csvPath, 'utf-8');
  const rows = parseCSV(content);
  console.log(`Found ${rows.length} rows to import\n`);

  const supabase = createAdminClient();

  // Get all rivers for slug lookup
  const { data: rivers, error: riverError } = await supabase
    .from('rivers')
    .select('id, slug, name');

  if (riverError || !rivers) {
    console.error('Error fetching rivers:', riverError);
    process.exit(1);
  }

  const riverMap = new Map(rivers.map(r => [r.slug, r]));

  let imported = 0;
  let skipped = 0;
  let errors = 0;

  for (const row of rows) {
    const river = riverMap.get(row.river_slug);
    if (!river) {
      console.error(`❌ River not found: ${row.river_slug} (for: ${row.name})`);
      errors++;
      continue;
    }

    const lat = parseFloat(row.latitude);
    const lng = parseFloat(row.longitude);

    if (isNaN(lat) || isNaN(lng)) {
      console.error(`❌ Invalid coordinates for: ${row.name}`);
      errors++;
      continue;
    }

    // Validate coordinates are in Missouri area
    if (lat < 35.9 || lat > 40.7 || lng < -96.5 || lng > -88.9) {
      console.error(`❌ Coordinates out of bounds for: ${row.name} (${lat}, ${lng})`);
      errors++;
      continue;
    }

    const slug = slugify(row.name);
    const isPublic = row.is_public?.toLowerCase() === 'true';
    const feeRequired = row.fee_required?.toLowerCase() === 'true';

    // Check if access point already exists
    const { data: existing } = await supabase
      .from('access_points')
      .select('id')
      .eq('river_id', river.id)
      .eq('slug', slug)
      .single();

    if (existing) {
      console.log(`⏭️  Skipped (exists): ${row.name} on ${river.name}`);
      skipped++;
      continue;
    }

    // Insert new access point
    const { error: insertError } = await supabase
      .from('access_points')
      .insert({
        river_id: river.id,
        name: row.name,
        slug,
        type: row.type || 'other',
        is_public: isPublic,
        ownership: row.ownership || null,
        description: row.description || null,
        fee_required: feeRequired,
        fee_notes: row.fee_notes || null,
        approved: false, // New imports are unapproved by default
        location_orig: {
          type: 'Point',
          coordinates: [lng, lat],
        },
      });

    if (insertError) {
      console.error(`❌ Error inserting ${row.name}:`, insertError.message);
      errors++;
      continue;
    }

    console.log(`✅ Imported: ${row.name} on ${river.name}`);
    imported++;
  }

  console.log('\n' + '='.repeat(50));
  console.log('📊 Import Summary');
  console.log('='.repeat(50));
  console.log(`✅ Imported: ${imported}`);
  console.log(`⏭️  Skipped:  ${skipped}`);
  console.log(`❌ Errors:   ${errors}`);
  console.log('');
  console.log('💡 New access points are unapproved by default.');
  console.log('   Use the Geo Admin page to review and approve them.');
  console.log('');
  console.log('💡 After import, run the following to snap points to rivers:');
  console.log('   npx tsx scripts/snap-access-points.ts');
}

main().catch(console.error);
