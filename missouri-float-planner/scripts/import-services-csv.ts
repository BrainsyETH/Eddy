#!/usr/bin/env npx tsx
/**
 * Import Nearby Services (outfitters / campgrounds / cabins) from CSV
 *
 * Upserts rows into nearby_services and links them to rivers via service_rivers.
 * Idempotent: re-running with the same slug updates the existing record.
 * Dry-run by default — pass --import to actually write.
 *
 * Usage:
 *   npx tsx scripts/import-services-csv.ts <csv-file>            # Dry run (validate only)
 *   npx tsx scripts/import-services-csv.ts <csv-file> --import   # Write to DB
 *
 * CSV header (see scripts/services.template.csv):
 *   name,type,river_slugs,slug,status,phone,phone_toll_free,email,website,
 *   reservation_url,booking_platform,address_line1,city,state,zip,latitude,
 *   longitude,description,services_offered,seasonal_notes,nps_authorized,
 *   usfs_authorized,tent_sites,rv_sites,cabin_count,fee_range,
 *   season_open_month,season_close_month,display_order
 *
 * Notes:
 *   - Required columns: name, type, river_slugs.
 *   - type: outfitter | campground | cabin_lodge
 *   - river_slugs: pipe-separated (e.g. "niangua" or "current|jacks-fork").
 *     The first river listed is marked is_primary.
 *   - services_offered: pipe-separated keys (e.g. "canoe_rental|shuttle|showers").
 *     Unknown keys are warned about and dropped.
 *   - slug: optional; derived from name when omitted.
 */

import { loadEnvConfig } from '@next/env';
import * as fs from 'fs';
import * as path from 'path';
import { createAdminClient } from '../src/lib/supabase/admin';

loadEnvConfig(process.cwd());

// Valid offering keys — mirror of ServiceOffering in src/types/api.ts and the
// labels in src/lib/services/offerings.ts. Kept inline so this maintenance
// script doesn't depend on path-aliased src modules at runtime.
const VALID_OFFERINGS = new Set<string>([
  'canoe_rental', 'kayak_rental', 'raft_rental', 'tube_rental', 'jon_boat_rental',
  'shuttle', 'camping_primitive', 'camping_rv', 'cabins', 'lodge_rooms',
  'general_store', 'food_service', 'showers', 'fishing_supplies', 'horseback_riding',
  'swimming_pool', 'wifi', 'potable_water', 'fire_rings', 'picnic_tables',
  'boat_ramp', 'dump_station', 'flush_toilets', 'vault_toilets', 'laundry', 'playground',
]);

const VALID_TYPES = new Set(['outfitter', 'campground', 'cabin_lodge']);
const VALID_STATUSES = new Set([
  'active', 'seasonal', 'temporarily_closed', 'permanently_closed', 'unverified',
]);

// ─── RFC4180-ish CSV parser (handles quoted fields, embedded commas/newlines) ──
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field); field = '';
    } else if (c === '\r') {
      // ignore — handled by \n
    } else if (c === '\n') {
      row.push(field); rows.push(row); row = []; field = '';
    } else {
      field += c;
    }
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows;
}

function slugify(text: string): string {
  return text.toLowerCase().replace(/['']/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function str(v: string | undefined): string | null {
  const t = (v ?? '').trim();
  return t.length > 0 ? t : null;
}

function bool(v: string | undefined): boolean {
  return ['true', '1', 'yes', 'y'].includes((v ?? '').trim().toLowerCase());
}

function int(v: string | undefined): number | null {
  const t = (v ?? '').trim();
  if (!t) return null;
  const n = parseInt(t, 10);
  return Number.isNaN(n) ? null : n;
}

function num(v: string | undefined): number | null {
  const t = (v ?? '').trim();
  if (!t) return null;
  const n = parseFloat(t);
  return Number.isNaN(n) ? null : n;
}

function list(v: string | undefined): string[] {
  return (v ?? '').split('|').map((s) => s.trim()).filter(Boolean);
}

async function main() {
  const args = process.argv.slice(2);
  const shouldImport = args.includes('--import');
  const file = args.find((a) => !a.startsWith('--'));

  if (!file) {
    console.error('Usage: npx tsx scripts/import-services-csv.ts <csv-file> [--import]');
    process.exit(1);
  }
  const csvPath = path.resolve(process.cwd(), file);
  if (!fs.existsSync(csvPath)) {
    console.error(`File not found: ${csvPath}`);
    process.exit(1);
  }

  console.log('🏕️  Nearby Services CSV Import');
  console.log('='.repeat(50));
  console.log(`Mode: ${shouldImport ? 'IMPORT (writing to DB)' : 'DRY RUN (validate only)'}`);

  const matrix = parseCsv(fs.readFileSync(csvPath, 'utf-8'));
  if (matrix.length < 2) {
    console.error('CSV must have a header row and at least one data row.');
    process.exit(1);
  }
  const headers = matrix[0].map((h) => h.trim());
  for (const req of ['name', 'type', 'river_slugs']) {
    if (!headers.includes(req)) {
      console.error(`Missing required header: ${req}`);
      process.exit(1);
    }
  }

  const supabase = createAdminClient();
  const { data: rivers } = await supabase.from('rivers').select('id, slug');
  const riverMap = new Map<string, string>((rivers ?? []).map((r) => [r.slug, r.id]));

  const stats = { rows: 0, upserted: 0, links: 0, skipped: 0, warnings: 0 };

  for (let i = 1; i < matrix.length; i++) {
    const values = matrix[i];
    if (values.length === 1 && values[0].trim() === '') continue; // blank line
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => { row[h] = values[idx] ?? ''; });

    const name = str(row.name);
    const type = str(row.type);
    const riverSlugs = list(row.river_slugs);

    if (!name || !type) {
      console.warn(`  ⚠️  Row ${i + 1}: missing name/type — skipped`);
      stats.skipped++; continue;
    }
    if (!VALID_TYPES.has(type)) {
      console.warn(`  ⚠️  Row ${i + 1} (${name}): invalid type "${type}" — skipped`);
      stats.skipped++; continue;
    }
    if (riverSlugs.length === 0) {
      console.warn(`  ⚠️  Row ${i + 1} (${name}): no river_slugs — skipped`);
      stats.skipped++; continue;
    }
    const unknownRivers = riverSlugs.filter((s) => !riverMap.has(s));
    if (unknownRivers.length > 0) {
      console.warn(`  ⚠️  Row ${i + 1} (${name}): unknown river slug(s) ${unknownRivers.join(', ')} — skipped`);
      stats.skipped++; continue;
    }

    const status = str(row.status) ?? 'active';
    if (!VALID_STATUSES.has(status)) {
      console.warn(`  ⚠️  Row ${i + 1} (${name}): invalid status "${status}", defaulting to active`);
      stats.warnings++;
    }

    const offeringsRaw = list(row.services_offered);
    const offerings = offeringsRaw.filter((o) => VALID_OFFERINGS.has(o));
    const droppedOfferings = offeringsRaw.filter((o) => !VALID_OFFERINGS.has(o));
    if (droppedOfferings.length > 0) {
      console.warn(`  ⚠️  Row ${i + 1} (${name}): unknown offerings dropped: ${droppedOfferings.join(', ')}`);
      stats.warnings++;
    }

    const slug = str(row.slug) ?? slugify(name);
    const payload = {
      name,
      slug,
      type,
      status: VALID_STATUSES.has(status) ? status : 'active',
      phone: str(row.phone),
      phone_toll_free: str(row.phone_toll_free),
      email: str(row.email),
      website: str(row.website),
      reservation_url: str(row.reservation_url),
      booking_platform: str(row.booking_platform),
      address_line1: str(row.address_line1),
      city: str(row.city),
      state: str(row.state) ?? 'MO',
      zip: str(row.zip),
      latitude: num(row.latitude),
      longitude: num(row.longitude),
      description: str(row.description),
      services_offered: offerings,
      seasonal_notes: str(row.seasonal_notes),
      nps_authorized: bool(row.nps_authorized),
      usfs_authorized: bool(row.usfs_authorized),
      tent_sites: int(row.tent_sites),
      rv_sites: int(row.rv_sites),
      cabin_count: int(row.cabin_count),
      fee_range: str(row.fee_range),
      season_open_month: int(row.season_open_month),
      season_close_month: int(row.season_close_month),
      display_order: int(row.display_order) ?? 100,
      verified_source: str(row.verified_source) ?? 'csv_import',
    };

    stats.rows++;
    console.log(`  • ${name} [${type}] → ${riverSlugs.join(', ')}${shouldImport ? '' : ' (dry run)'}`);

    if (!shouldImport) {
      stats.upserted++;
      stats.links += riverSlugs.length;
      continue;
    }

    const { data: svc, error } = await supabase
      .from('nearby_services')
      .upsert(payload, { onConflict: 'slug' })
      .select('id')
      .single();

    if (error || !svc) {
      console.error(`    ❌ upsert failed for ${name}: ${error?.message}`);
      stats.skipped++; continue;
    }
    stats.upserted++;

    for (let r = 0; r < riverSlugs.length; r++) {
      const riverId = riverMap.get(riverSlugs[r])!;
      const { error: linkErr } = await supabase
        .from('service_rivers')
        .upsert(
          { service_id: svc.id, river_id: riverId, is_primary: r === 0 },
          { onConflict: 'service_id,river_id' },
        );
      if (linkErr) {
        console.error(`    ❌ link failed (${name} → ${riverSlugs[r]}): ${linkErr.message}`);
        stats.warnings++;
      } else {
        stats.links++;
      }
    }
  }

  console.log('\n' + '='.repeat(50));
  console.log('📋 Summary');
  console.log('='.repeat(50));
  console.log(`Valid rows:   ${stats.rows}`);
  console.log(`Upserted:     ${stats.upserted}`);
  console.log(`River links:  ${stats.links}`);
  console.log(`Skipped:      ${stats.skipped}`);
  console.log(`Warnings:     ${stats.warnings}`);
  if (!shouldImport) console.log('\n💡 Dry run only. Re-run with --import to write to the database.');
}

main().catch((e) => { console.error(e); process.exit(1); });
