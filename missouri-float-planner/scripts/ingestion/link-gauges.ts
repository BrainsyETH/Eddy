#!/usr/bin/env npx tsx
/**
 * Link USGS gauges to a river from scripts/ingestion/gauges/<slug>.json.
 *
 * Upserts gauge_stations (keyed on usgs_site_id) and river_gauges (river+gauge),
 * setting is_primary and threshold_unit but leaving the curated level_* ladder NULL.
 * This is the "stage a held river" step: it wires up the gauge so the river is ready
 * to activate once an authoritative threshold key exists (set later via
 * update-thresholds.ts). It never invents thresholds.
 *
 * gauges/<slug>.json: [{ siteId, name, lat, lon, isPrimary, unit, drainageSqMi?, note? }]
 * Exactly one gauge should have isPrimary:true.
 *
 * DRY-RUN by default. Pass --write to persist.
 *   npx tsx scripts/ingestion/link-gauges.ts spring-river-mo
 *   npx tsx scripts/ingestion/link-gauges.ts spring-river-mo --write
 */
import * as fs from 'fs';
import * as path from 'path';
import { createAdminClient } from '../../src/lib/supabase/admin';

async function main() {
  const argv = process.argv.slice(2);
  const write = argv.includes('--write');
  const slug = argv.find((a) => !a.startsWith('--'));
  if (!slug) { console.error('Usage: link-gauges.ts <slug> [--write]'); process.exit(1); }

  const file = path.join(__dirname, 'gauges', `${slug}.json`);
  if (!fs.existsSync(file)) { console.error(`No gauge file: ${file}`); process.exit(1); }
  const gauges = JSON.parse(fs.readFileSync(file, 'utf-8')) as Array<{
    siteId: string; name: string; lat: number; lon: number; isPrimary: boolean;
    unit: 'cfs' | 'ft'; drainageSqMi?: number; note?: string;
  }>;
  const primaries = gauges.filter((g) => g.isPrimary).length;
  if (primaries !== 1) { console.error(`Expected exactly 1 primary gauge, got ${primaries}.`); process.exit(1); }

  const db = createAdminClient();
  const { data: river, error: re } = await db.from('rivers').select('id, name').eq('slug', slug).single();
  if (re || !river) { console.error(`River "${slug}" not found: ${re?.message}`); process.exit(1); }

  console.log(`\n${river.name} (${slug}) — linking ${gauges.length} gauge(s)  ${write ? '[WRITE]' : '[dry run]'}`);
  for (const g of gauges) {
    console.log(`  ${g.isPrimary ? '★' : '·'} ${g.siteId}  ${g.name}  unit=${g.unit}  @ ${g.lat},${g.lon}`);
    if (!write) continue;

    const { data: gs, error: ge } = await db.from('gauge_stations')
      .upsert({ usgs_site_id: g.siteId, name: g.name, location: { type: 'Point', coordinates: [g.lon, g.lat] }, active: true },
              { onConflict: 'usgs_site_id' })
      .select('id').single();
    if (ge || !gs) { console.error(`    ❌ gauge_stations upsert ${g.siteId}: ${ge?.message}`); process.exit(1); }

    const { error: le } = await db.from('river_gauges')
      .upsert({ river_id: river.id, gauge_station_id: gs.id, is_primary: g.isPrimary, threshold_unit: g.unit },
              { onConflict: 'river_id,gauge_station_id' });
    if (le) { console.error(`    ❌ river_gauges link ${g.siteId}: ${le.message}`); process.exit(1); }
    console.log(`    ✅ linked (thresholds left NULL — held until an authoritative key exists)`);
  }
  if (!write) console.log('\n💡 Dry run. Re-run with --write to persist.');
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
