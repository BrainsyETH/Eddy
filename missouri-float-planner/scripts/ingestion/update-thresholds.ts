#!/usr/bin/env npx tsx
/**
 * Update the curated level_* threshold ladder on a river's primary river_gauges row.
 *
 * The ingest-dossier pipeline sets thresholds at onboarding; this is the targeted
 * editor for an already-active river when an authoritative calibration key arrives
 * (outfitter/agency/AHPS/AW). It ONLY touches the level_* bands the owner names —
 * everything else is left alone. Validates the 6-tier ordering before writing.
 *
 * Ladder (must be non-decreasing across the non-null values):
 *   too_low <= low <= optimal_min <= optimal_max <= high <= dangerous
 *
 * Usage:
 *   npx tsx scripts/ingestion/update-thresholds.ts <slug> high=1051 dangerous=1932           # dry run
 *   npx tsx scripts/ingestion/update-thresholds.ts <slug> dangerous=4.0 --write               # apply
 *   npx tsx scripts/ingestion/update-thresholds.ts <slug> high=null --write                   # clear an anchor
 *   npx tsx scripts/ingestion/update-thresholds.ts <slug> ... --gauge 07058000                # pin a gauge
 *
 * Keys: too_low low optimal_min optimal_max high dangerous  (value = number, or "null" to clear)
 * DRY-RUN by default. Source/sign-off is documented in the dossier md + commit, not the DB.
 */
import { createAdminClient } from '../../src/lib/supabase/admin';

const TIERS = ['too_low', 'low', 'optimal_min', 'optimal_max', 'high', 'dangerous'] as const;
type Tier = (typeof TIERS)[number];
const COL: Record<Tier, string> = {
  too_low: 'level_too_low', low: 'level_low', optimal_min: 'level_optimal_min',
  optimal_max: 'level_optimal_max', high: 'level_high', dangerous: 'level_dangerous',
};

async function main() {
  const argv = process.argv.slice(2);
  const write = argv.includes('--write');
  const gaugeIdx = argv.indexOf('--gauge');
  const pinGauge = gaugeIdx >= 0 ? argv[gaugeIdx + 1] : null;
  const slug = argv.find((a) => !a.startsWith('--') && !a.includes('=') && a !== pinGauge);
  if (!slug) { console.error('Usage: update-thresholds.ts <slug> key=val ... [--gauge SITE] [--write]'); process.exit(1); }

  const overrides: Partial<Record<Tier, number | null>> = {};
  for (const a of argv) {
    const m = a.match(/^([a-z_]+)=(.+)$/);
    if (!m) continue;
    const key = m[1] as Tier;
    if (!TIERS.includes(key)) { console.error(`Unknown tier "${key}" (valid: ${TIERS.join(', ')})`); process.exit(1); }
    overrides[key] = m[2] === 'null' ? null : Number(m[2]);
    if (m[2] !== 'null' && Number.isNaN(Number(m[2]))) { console.error(`Bad number for ${key}: ${m[2]}`); process.exit(1); }
  }
  if (Object.keys(overrides).length === 0) { console.error('No key=val overrides given.'); process.exit(1); }

  const db = createAdminClient();
  const { data: river, error: re } = await db.from('rivers').select('id, name, slug').eq('slug', slug).single();
  if (re || !river) { console.error(`River "${slug}" not found: ${re?.message}`); process.exit(1); }

  const { data: rgs, error: ge } = await db
    .from('river_gauges')
    .select('id, is_primary, threshold_unit, level_too_low, level_low, level_optimal_min, level_optimal_max, level_high, level_dangerous, gauge_stations(usgs_site_id, name)')
    .eq('river_id', river.id);
  if (ge) { console.error(ge.message); process.exit(1); }
  if (!rgs?.length) { console.error(`No river_gauges rows for ${slug}.`); process.exit(1); }

  const row = pinGauge
    ? rgs.find((r) => (r.gauge_stations as any)?.usgs_site_id === pinGauge)
    : (rgs.find((r) => r.is_primary) ?? (rgs.length === 1 ? rgs[0] : null));
  if (!row) { console.error(pinGauge ? `Gauge ${pinGauge} not linked to ${slug}.` : `No primary gauge (${rgs.length} linked) — pass --gauge.`); process.exit(1); }

  const site = (row.gauge_stations as any)?.usgs_site_id ?? '?';
  const cur: Record<Tier, number | null> = {
    too_low: row.level_too_low, low: row.level_low, optimal_min: row.level_optimal_min,
    optimal_max: row.level_optimal_max, high: row.level_high, dangerous: row.level_dangerous,
  };
  const next = { ...cur, ...overrides };

  // Validate non-decreasing across non-null values.
  let prev: number | null = null; let prevName = '';
  for (const t of TIERS) {
    const v = next[t];
    if (v == null) continue;
    if (prev != null && v < prev) { console.error(`❌ Ordering violation: ${t}=${v} < ${prevName}=${prev}`); process.exit(1); }
    prev = v; prevName = t;
  }

  const fmt = (o: Record<Tier, number | null>) => TIERS.map((t) => `${t}=${o[t] == null ? '·' : o[t]}`).join('  ');
  console.log(`\n${river.name} (${slug})  primary gauge ${site}  unit=${row.threshold_unit}`);
  console.log(`  before: ${fmt(cur)}`);
  console.log(`  after:  ${fmt(next)}`);
  const changed = TIERS.filter((t) => cur[t] !== next[t]);
  console.log(`  change: ${changed.map((t) => `${t} ${cur[t] ?? '·'}→${next[t] ?? '·'}`).join(', ') || '(none)'}`);

  if (!write) { console.log('\n💡 Dry run. Re-run with --write to persist.'); return; }

  const patch: Record<string, number | null> = { updated_at: new Date().toISOString() as any };
  for (const t of changed) patch[COL[t]] = next[t];
  const { error: ue } = await db.from('river_gauges').update(patch).eq('id', row.id);
  if (ue) { console.error(`❌ update failed: ${ue.message}`); process.exit(1); }
  console.log(`\n✅ Wrote ${changed.length} anchor(s) to ${slug} / ${site}.`);
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
