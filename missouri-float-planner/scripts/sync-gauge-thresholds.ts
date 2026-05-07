#!/usr/bin/env npx tsx
/**
 * Sync flood / action stages onto river_gauges from authoritative sources.
 *
 * Pulls flood (minor) and action stages from NWS AHPS site XML for every
 * primary river_gauge that has a gauge_stations.nws_lid set. Stamps
 * threshold_source = 'nws_ahps' with the source URL and updated_at.
 *
 * Does NOT overwrite the curated level_optimal_min/max/high/dangerous —
 * those remain paddler-editorial knowledge. We layer flood/action stages
 * alongside so the UI can credit hydrologic levels separately and the
 * verdict classifier can flip to 'hazard' once water reaches flood stage.
 *
 * Usage:
 *   npx tsx scripts/sync-gauge-thresholds.ts
 *   npx tsx scripts/sync-gauge-thresholds.ts --dry-run   (no DB writes)
 *
 * NWS AHPS site IDs ("LIDs", e.g. 'VBNM7' for Current at Van Buren) are not
 * the same as USGS site numbers. The lid must be populated on each
 * gauge_stations row up-front (see migration 00114). For gauges without a
 * lid, this script logs a warning and skips them.
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { createAdminClient } from '../src/lib/supabase/admin';

const projectRoot = process.cwd();
const envPath = join(projectRoot, '.env.local');
if (existsSync(envPath)) {
  const envFile = readFileSync(envPath, 'utf-8');
  envFile.split('\n').forEach((line) => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const [key, ...valueParts] = trimmed.split('=');
      if (key && valueParts.length > 0) {
        const value = valueParts.join('=').trim().replace(/^["']|["']$/g, '');
        if (!process.env[key]) process.env[key] = value;
      }
    }
  });
}

interface AhpsStages {
  flood_stage_ft: number | null;
  action_stage_ft: number | null;
}

const AHPS_BASE = 'https://water.weather.gov/ahps2/hydrograph_to_xml.php';

function ahpsUrl(lid: string): string {
  return `${AHPS_BASE}?gage=${encodeURIComponent(lid)}&output=xml`;
}

function ahpsPageUrl(lid: string): string {
  return `https://water.weather.gov/ahps2/hydrograph.php?gage=${encodeURIComponent(lid)}`;
}

/**
 * Parse a single numeric value from an AHPS stage XML field. The schema
 * uses elements like <action>11.0</action> inside <sigstages>; missing or
 * "Not Available" stages render as empty / non-numeric strings.
 */
function pickStage(xml: string, tag: string): number | null {
  const re = new RegExp(`<${tag}>([^<]*)</${tag}>`, 'i');
  const m = xml.match(re);
  if (!m) return null;
  const raw = m[1].trim();
  if (!raw) return null;
  const n = parseFloat(raw);
  return Number.isFinite(n) ? n : null;
}

async function fetchAhpsStages(lid: string): Promise<AhpsStages | null> {
  const res = await fetch(ahpsUrl(lid));
  if (!res.ok) {
    console.warn(`   ⚠️  AHPS ${lid}: HTTP ${res.status}`);
    return null;
  }
  const xml = await res.text();
  // The AHPS schema uses <sigstages> with children <action>, <flood>
  // (= minor), <moderate>, <major>. We only persist action + flood.
  const sigstagesMatch = xml.match(/<sigstages>([\s\S]*?)<\/sigstages>/i);
  if (!sigstagesMatch) {
    console.warn(`   ⚠️  AHPS ${lid}: no <sigstages> in response`);
    return null;
  }
  const block = sigstagesMatch[1];
  return {
    flood_stage_ft: pickStage(block, 'flood'),
    action_stage_ft: pickStage(block, 'action'),
  };
}

interface PrimaryGaugeRow {
  river_gauge_id: string;
  river_id: string;
  river_slug: string;
  river_name: string;
  gauge_station_id: string;
  usgs_site_id: string;
  gauge_name: string;
  nws_lid: string | null;
}

async function loadPrimaryGauges(): Promise<PrimaryGaugeRow[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('river_gauges')
    .select(
      `
      id,
      river:rivers!inner(id, slug, name),
      gauge_station:gauge_stations!inner(id, usgs_site_id, name, nws_lid, active),
      is_primary
    `,
    )
    .eq('is_primary', true);

  if (error) throw new Error(`Supabase fetch failed: ${error.message}`);
  if (!data) return [];

  interface JoinedRow {
    id: string;
    river: { id: string; slug: string; name: string };
    gauge_station: {
      id: string;
      usgs_site_id: string;
      name: string;
      nws_lid: string | null;
      active: boolean;
    };
  }
  const rows = data as unknown as JoinedRow[];
  return rows
    .filter((row) => row.gauge_station?.active)
    .map((row) => ({
      river_gauge_id: row.id,
      river_id: row.river.id,
      river_slug: row.river.slug,
      river_name: row.river.name,
      gauge_station_id: row.gauge_station.id,
      usgs_site_id: row.gauge_station.usgs_site_id,
      gauge_name: row.gauge_station.name,
      nws_lid: row.gauge_station.nws_lid ?? null,
    }));
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  console.log(
    `🌊 Syncing AHPS stages → river_gauges${dryRun ? ' (DRY RUN)' : ''}`,
  );
  console.log('='.repeat(60));

  const primaryGauges = await loadPrimaryGauges();
  console.log(`   Loaded ${primaryGauges.length} primary gauges`);

  const withLid = primaryGauges.filter((g) => g.nws_lid);
  const withoutLid = primaryGauges.filter((g) => !g.nws_lid);
  console.log(`   ${withLid.length} have nws_lid · ${withoutLid.length} missing`);

  for (const g of withoutLid) {
    console.warn(
      `   ⚠️  ${g.river_name} (#${g.usgs_site_id}): no nws_lid — skipping. ` +
        `Add lid to gauge_stations.nws_lid to enable AHPS sync.`,
    );
  }

  const supabase = createAdminClient();
  let updated = 0;
  let failed = 0;

  for (const g of withLid) {
    process.stdout.write(`   ${g.river_name.padEnd(28)} ${g.nws_lid?.padEnd(8) ?? '—'} `);
    try {
      const stages = await fetchAhpsStages(g.nws_lid!);
      if (!stages || (stages.flood_stage_ft == null && stages.action_stage_ft == null)) {
        console.log('no stages published');
        continue;
      }
      console.log(
        `flood=${stages.flood_stage_ft ?? '—'}ft action=${stages.action_stage_ft ?? '—'}ft`,
      );
      if (dryRun) {
        updated++;
        continue;
      }
      const { error } = await supabase
        .from('river_gauges')
        .update({
          flood_stage_ft: stages.flood_stage_ft,
          action_stage_ft: stages.action_stage_ft,
          threshold_source: 'nws_ahps',
          threshold_source_url: ahpsPageUrl(g.nws_lid!),
          threshold_updated_at: new Date().toISOString(),
        })
        .eq('id', g.river_gauge_id);
      if (error) {
        console.warn(`     ⚠️  update failed: ${error.message}`);
        failed++;
      } else {
        updated++;
      }
    } catch (e) {
      console.warn(`     ⚠️  ${e instanceof Error ? e.message : String(e)}`);
      failed++;
    }
    // Be polite to AHPS — small delay between requests.
    await new Promise((r) => setTimeout(r, 300));
  }

  console.log('\n='.repeat(60));
  console.log(`✅ Updated ${updated} · ❌ Failed ${failed} · Skipped ${withoutLid.length}`);
}

main().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
