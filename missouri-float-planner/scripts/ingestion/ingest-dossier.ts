#!/usr/bin/env npx tsx
/**
 * ingest-dossier.ts — layer 2 of the two-layer design (see dossier.ts).
 *
 * Reads a VERIFIED research dossier and emits DB rows:
 *   rivers (multi-region fields), gauge_stations, river_gauges (thresholds +
 *   is_primary from primaryGaugeSiteId), river_sections, river_characteristics.
 *
 * Usage:
 *   npx tsx scripts/ingestion/ingest-dossier.ts dossiers/buffalo.json           # dry run (default)
 *   npx tsx scripts/ingestion/ingest-dossier.ts dossiers/buffalo.json --apply   # write to DB
 *
 * THE GATES ARE ENFORCED HERE, mechanically — nothing crosses from "found" to
 * "committed" without passing (dossier.ts documents the gate taxonomy):
 *   [signoff] `_status` must contain the literal token `SIGNED-OFF`. The owner
 *             edits the dossier to add it after reviewing thresholds. A dossier
 *             still marked STUB / AWAITING SIGNOFF is refused.
 *   [verify]  every gauges[].siteId must appear in
 *             dossiers/verified-identifiers-<slug>.md — the file the
 *             independent primary-source pass writes. No file, no ingest.
 *   [auto]    threshold sanity: referenceGaugeIsPolled, referenceGauge is one
 *             of gauges[], one unit per gauge, strict level ordering
 *             too_low ≤ low ≤ optimal_min ≤ optimal_max ≤ high ≤ dangerous.
 *   [safety]  every high/dangerous anchor needs confidence 'high' or a
 *             non-empty corroboratingSources — low-confidence danger numbers
 *             do NOT ship (research-prompt rule 4).
 *   [manual]  access points are NEVER written — humans place them in admin.
 *
 * The rivers row must already exist (geometry via import-nhd-rivers.ts or the
 * seed path); this script updates its multi-region fields but will not invent
 * geometry. `active` is never flipped here — activation stays a human call
 * after validate_river_data() runs clean.
 */

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

type Level = 'too_low' | 'low' | 'optimal_min' | 'optimal_max' | 'high' | 'dangerous';

// river_gauges.threshold_source is a provenance ENUM (check constraint:
// usgs | nws_ahps | outfitter | editorial), not free text. The dossier's
// prose citation stays in the dossier (the committed provenance record);
// the DB gets the category plus the first URL in threshold_source_url.
type SourceCategory = 'usgs' | 'nws_ahps' | 'outfitter' | 'editorial';
function classifySource(raw: string): SourceCategory {
  const s = raw.toLowerCase();
  if (/\b(noaa|nws|ahps|nwps)\b/.test(s)) return 'nws_ahps';
  if (/\busgs\b/.test(s) && /percentile|statistic|flow.duration/.test(s)) return 'usgs';
  if (/outfitter|livery|canoe rental|rental/.test(s)) return 'outfitter';
  return 'editorial';
}
const LEVEL_ORDER: Level[] = ['too_low', 'low', 'optimal_min', 'optimal_max', 'high', 'dangerous'];
const LEVEL_COL: Record<Level, string> = {
  too_low: 'level_too_low', low: 'level_low',
  optimal_min: 'level_optimal_min', optimal_max: 'level_optimal_max',
  high: 'level_high', dangerous: 'level_dangerous',
};

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const dossierArg = args.find((a) => !a.startsWith('--'));
if (!dossierArg) {
  console.error('Usage: npx tsx scripts/ingestion/ingest-dossier.ts <dossier.json> [--apply]');
  process.exit(1);
}
const dossierPath = path.resolve(__dirname, dossierArg.startsWith('/') ? '' : '.', dossierArg);
const dossier = JSON.parse(fs.readFileSync(dossierPath, 'utf-8'));

const problems: string[] = [];
const warnings: string[] = [];

// ---------- [signoff] gate ----------
// _status must BEGIN with the token SIGNED-OFF — not merely contain it, so the
// word appearing in instructional prose (e.g. "flip _status to SIGNED-OFF")
// can't false-pass the gate.
const status: string = dossier._status ?? '';
if (!/^\s*SIGNED-OFF\b/.test(status)) {
  problems.push(
    `[signoff] _status does not BEGIN with the token SIGNED-OFF (current: "${status.slice(0, 80)}…"). ` +
    'The owner sets _status to start with SIGNED-OFF after reviewing thresholds; STUB/AWAITING SIGNOFF dossiers are refused.'
  );
}

// ---------- [verify] gate: identifiers checked against the independent pass ----------
const verifiedFile = path.join(__dirname, 'dossiers', `verified-identifiers-${dossier.slug}.md`);
let verifiedText = '';
if (!fs.existsSync(verifiedFile)) {
  problems.push(`[verify] missing ${path.basename(verifiedFile)} — run the primary-source id pass first.`);
} else {
  verifiedText = fs.readFileSync(verifiedFile, 'utf-8');
}
const gauges: any[] = dossier.gauges ?? [];
if (gauges.length === 0) problems.push('[verify] dossier has no gauges — nothing to calibrate against.');
for (const g of gauges) {
  if (verifiedText && !verifiedText.includes(g.siteId)) {
    problems.push(`[verify] gauge ${g.siteId} (${g.name}) not found in ${path.basename(verifiedFile)}.`);
  }
  if (g.lat == null || g.lon == null) {
    warnings.push(`gauge ${g.siteId}: no lat/lon — gauge_stations row will be SKIPPED (station creation needs coordinates; backfill from the provider API and re-run).`);
  }
}
const gaugeIds = new Set(gauges.map((g) => g.siteId));

// ---------- [auto] + [safety] threshold gates, grouped per polled gauge ----------
interface GaugeThresholds { unit: string; values: Partial<Record<Level, number>>; sources: Set<string>; urls: Set<string>; sections: string[] }
const perGauge = new Map<string, GaugeThresholds>();
for (const s of dossier.sections ?? []) {
  for (const t of s.thresholds ?? []) {
    if (!t.referenceGaugeIsPolled) {
      warnings.push(`section ${s.slug}: anchor ${t.level}=${t.value}${t.unit} @ ${t.referenceGauge} is NOT against a polled gauge — recorded but not ingested.`);
      continue;
    }
    if (!gaugeIds.has(t.referenceGauge)) {
      problems.push(`[auto] section ${s.slug}: anchor references gauge ${t.referenceGauge} which is not in gauges[].`);
      continue;
    }
    if ((t.level === 'high' || t.level === 'dangerous') &&
        t.confidence !== 'high' && !(t.corroboratingSources?.length)) {
      problems.push(`[safety] section ${s.slug}: ${t.level} anchor @ ${t.referenceGauge} has confidence '${t.confidence}' and no corroboratingSources — danger numbers need two sources or high confidence.`);
    }
    let bucket = perGauge.get(t.referenceGauge);
    if (!bucket) { bucket = { unit: t.unit, values: {}, sources: new Set(), urls: new Set(), sections: [] }; perGauge.set(t.referenceGauge, bucket); }
    if (bucket.unit !== t.unit) problems.push(`[auto] gauge ${t.referenceGauge}: mixed units (${bucket.unit} vs ${t.unit}).`);
    const existing = bucket.values[t.level as Level];
    if (existing !== undefined && existing !== t.value) {
      problems.push(`[auto] gauge ${t.referenceGauge}: conflicting ${t.level} values ${existing} vs ${t.value} from different sections — resolve in the dossier, do not average.`);
    }
    bucket.values[t.level as Level] = t.value;
    bucket.sources.add(t.source);
    for (const u of [t.source, ...(t.corroboratingSources ?? [])]) {
      const m = typeof u === 'string' && u.match(/https?:\/\/\S+/);
      if (m) bucket.urls.add(m[0].replace(/[).,]+$/, ''));
    }
    if (!bucket.sections.includes(s.slug)) bucket.sections.push(s.slug);
  }
}
for (const [siteId, b] of perGauge) {
  // Published band tables often share edges (Agnew: '10-30 low / 30-60 easily
  // floatable' → low == optimal_min). A shared edge means the source defines
  // no 'good' (between-low-and-optimal) zone; drop the redundant low anchor —
  // condition logic reads [too_low, optimal_min) as 'low' either way, and
  // validate_river_data() requires strictly increasing levels.
  if (b.values.low !== undefined && b.values.low === b.values.optimal_min) {
    delete b.values.low;
    warnings.push(`gauge ${siteId}: low == optimal_min (adjacent published bands) — 'low' anchor dropped; [too_low, optimal_min) reads as 'low'.`);
  }
  const present = LEVEL_ORDER.filter((l) => b.values[l] !== undefined);
  for (let i = 1; i < present.length; i++) {
    const a = b.values[present[i - 1]]!, c = b.values[present[i]]!;
    if (a > c) problems.push(`[auto] gauge ${siteId}: ${present[i - 1]}=${a} > ${present[i]}=${c} — levels out of order.`);
  }
  if (b.values.dangerous === undefined) warnings.push(`gauge ${siteId}: no dangerous anchor — badge will never show 'dangerous' from this gauge.`);
}

// ---------- [signoff] primary-gauge gate ----------
// is_primary lives on the river_gauges row, so the primary must be a calibrated
// (thresholded) gauge. Explicit-only: we never guess a primary — it's a
// safety-relevant, river-level choice — so an unset dossier just warns and
// leaves is_primary untouched (validate_river_data() will still flag
// no_primary_gauge, which is the intended launch block).
const primarySiteId: string | undefined = dossier.primaryGaugeSiteId;
if (primarySiteId && !perGauge.has(primarySiteId)) {
  problems.push(
    `[auto] primaryGaugeSiteId '${primarySiteId}' is not a calibrated gauge ` +
    `(no thresholds → no river_gauges row to flag). Calibrated gauges: ${[...perGauge.keys()].join(', ') || 'none'}.`
  );
} else if (!primarySiteId) {
  warnings.push(
    'no primaryGaugeSiteId set — is_primary will NOT be written, so validate_river_data() ' +
    'will report no_primary_gauge until a primary is designated. Add primaryGaugeSiteId ' +
    '(one of the calibrated gauges) to the dossier before launch.'
  );
}

// ---------- report gate results ----------
console.log(`\nIngest ${dossier.slug} (${dossier.name}) — ${apply ? 'APPLY' : 'dry run'}`);
console.log('='.repeat(60));
for (const w of warnings) console.log(`  ⚠️  ${w}`);
if (problems.length) {
  console.error(`\n❌ ${problems.length} gate failure(s):`);
  for (const p of problems) console.error(`  - ${p}`);
  console.error('\nNothing written. Fix the dossier (or complete the verify/signoff passes) and re-run.');
  process.exit(1);
}
console.log(`  ✓ gates passed: signoff, ${gauges.length} verified gauge ids, ${perGauge.size} calibrated gauges`);

// ---------- build the write plan ----------
const riverUpdate: Record<string, unknown> = {
  state: dossier.state, country: dossier.country, timezone: dossier.timezone,
  river_type: dossier.riverType, region: dossier.region,
  description: dossier.description, difficulty_rating: dossier.difficultyRating,
  alert_search_terms: dossier.alertSearchTerms ?? [],
  ...(dossier.parkCode ? { park_code: dossier.parkCode } : {}),
  ...(dossier.weatherPoint?.city ? { weather_city: dossier.weatherPoint.city } : {}),
  ...(dossier.weatherPoint?.lat != null ? { weather_lat: dossier.weatherPoint.lat, weather_lon: dossier.weatherPoint.lon } : {}),
};
const sectionsRows = (dossier.sections ?? []).map((s: any, i: number) => ({
  section_slug: s.slug, name: s.name, description: s.description, sort_order: i,
}));
// river_characteristics is per-river; merge the per-section captures.
const secs: any[] = dossier.sections ?? [];
const characteristics = secs.length ? {
  is_spring_fed: secs.every((s) => s.characteristics?.isSpringFed === true),
  primary_hazards: [...new Set(secs.flatMap((s) => s.characteristics?.primaryHazards ?? []))],
  low_water_meaning: secs.map((s) => `${s.slug}: ${s.characteristics?.lowWaterMeaning ?? 'n/a'}`).join(' | '),
  rising_water_hazards: secs.map((s) => `${s.slug}: ${s.characteristics?.risingWaterHazards ?? 'n/a'}`).join(' | '),
  river_note: `Per-section hydro types: ${secs.map((s) => `${s.slug}=${s.characteristics?.hydroType}`).join(', ')}. River-level default: ${dossier.riverType}.`,
} : null;

console.log(`\nPlan: update rivers.${dossier.slug}; upsert ${gauges.filter((g: any) => g.lat != null).length}/${gauges.length} gauge_stations; ` +
  `${perGauge.size} river_gauges threshold sets; ${sectionsRows.length} river_sections; characteristics=${!!characteristics}.`);
console.log(`Primary gauge (is_primary): ${primarySiteId ?? '(none — is_primary will not be set)'}.`);
console.log(`Never written by this script: access points [manual], rivers.active (flip after validate_river_data()).`);
for (const [siteId, b] of perGauge) {
  const v = b.values;
  console.log(`  ${siteId} [${b.unit}] too_low=${v.too_low ?? '—'} low=${v.low ?? '—'} opt=${v.optimal_min ?? '—'}–${v.optimal_max ?? '—'} high=${v.high ?? '—'} danger=${v.dangerous ?? '—'}  (sections: ${b.sections.join(', ')})`);
}
if (!apply) { console.log('\nDry run complete — re-run with --apply to write.'); process.exit(0); }

// ---------- apply ----------
(async () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
  if (!url || !key) throw new Error('Set NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_KEY = service_role key).');

  // Guardrail (added after the 2026-07 prod/legacy project mixup, where rivers
  // were written to one Supabase project while the app read another): surface
  // the target project and refuse to --apply to an unexpected one. Set
  // EXPECTED_SUPABASE_REF=<ref> to enforce — prod is `ilefwfpvphadsbptiaur`.
  const ref = (url.match(/https?:\/\/([a-z0-9]+)\.supabase\./) || [])[1] || '(unknown)';
  const expectedRef = process.env.EXPECTED_SUPABASE_REF;
  console.log(`  → target Supabase project: ${ref}`);
  if (expectedRef && ref !== expectedRef) {
    throw new Error(`ABORT: connected project '${ref}' != EXPECTED_SUPABASE_REF '${expectedRef}'. Point NEXT_PUBLIC_SUPABASE_URL/SUPABASE_URL at the intended project before --apply.`);
  }

  const db = createClient(url, key);

  const { data: river, error: riverErr } = await db.from('rivers').select('id').eq('slug', dossier.slug).single();
  if (riverErr || !river) throw new Error(`rivers row for slug '${dossier.slug}' not found — import geometry first (import-nhd-rivers.ts or seed path).`);

  const { error: upErr } = await db.from('rivers').update(riverUpdate).eq('id', river.id);
  if (upErr) throw new Error(`rivers update failed: ${upErr.message}`);
  console.log('  ✅ rivers updated');

  const stationIdBySite = new Map<string, string>();
  for (const g of gauges) {
    const { data: existing } = await db.from('gauge_stations').select('id').eq('usgs_site_id', g.siteId).maybeSingle();
    if (existing) { stationIdBySite.set(g.siteId, existing.id); continue; }
    if (g.lat == null || g.lon == null) continue; // warned above
    const { data: created, error } = await db.from('gauge_stations').insert({
      usgs_site_id: g.siteId, provider: g.provider ?? 'usgs', site_id_external: g.siteId,
      name: g.name, location: { type: 'Point', coordinates: [g.lon, g.lat] },
      active: true, drainage_area_sqmi: g.drainageAreaSqMi ?? null,
      notes: g.knownBias ?? null,
    }).select('id').single();
    if (error) throw new Error(`gauge_stations insert ${g.siteId}: ${error.message}`);
    stationIdBySite.set(g.siteId, created.id);
    console.log(`  ✅ gauge_stations ${g.siteId}`);
  }

  for (const [siteId, b] of perGauge) {
    const stationId = stationIdBySite.get(siteId);
    if (!stationId) { console.log(`  ⚠️  ${siteId}: no gauge_stations row (missing coords) — thresholds NOT written; backfill coords and re-run.`); continue; }
    const gauge = gauges.find((g: any) => g.siteId === siteId);
    const row: Record<string, unknown> = {
      river_id: river.id, gauge_station_id: stationId,
      threshold_unit: b.unit,
      threshold_source: classifySource([...b.sources].join(' ')),
      threshold_source_url: [...b.urls][0] ?? null,
      threshold_updated_at: new Date().toISOString(),
      ...(gauge?.positionRiverMile != null ? { river_mile: gauge.positionRiverMile } : {}),
    };
    // Always set every level column (null when the dossier has no anchor) so
    // re-ingests are idempotent — an anchor dropped from the dossier must not
    // survive in the DB from an earlier run.
    for (const l of LEVEL_ORDER) row[LEVEL_COL[l]] = b.values[l] ?? null;
    const { data: existing } = await db.from('river_gauges').select('id').eq('river_id', river.id).eq('gauge_station_id', stationId).maybeSingle();
    const { error } = existing
      ? await db.from('river_gauges').update(row).eq('id', existing.id)
      : await db.from('river_gauges').insert(row);
    if (error) throw new Error(`river_gauges ${siteId}: ${error.message}`);
    console.log(`  ✅ river_gauges ${siteId} (${existing ? 'updated' : 'inserted'})`);
  }

  // Designate the primary gauge (clear-then-set, mirroring migration 00070) now
  // that the river_gauges rows exist. Without this a freshly ingested river has
  // no is_primary and fails validate_river_data()'s no_primary_gauge gate,
  // blocking activation until someone runs manual SQL.
  if (primarySiteId) {
    const primaryStationId = stationIdBySite.get(primarySiteId);
    if (!primaryStationId) {
      console.log(`  ⚠️  primary ${primarySiteId}: no gauge_stations row — is_primary NOT set.`);
    } else {
      const { error: clearErr } = await db.from('river_gauges').update({ is_primary: false }).eq('river_id', river.id);
      if (clearErr) throw new Error(`clear is_primary: ${clearErr.message}`);
      const { error: setErr } = await db.from('river_gauges').update({ is_primary: true })
        .eq('river_id', river.id).eq('gauge_station_id', primaryStationId);
      if (setErr) throw new Error(`set is_primary ${primarySiteId}: ${setErr.message}`);
      console.log(`  ✅ is_primary → ${primarySiteId}`);
    }
  } else {
    console.log('  ⚠️  no primary gauge designated (primaryGaugeSiteId unset) — is_primary untouched.');
  }

  for (const s of sectionsRows) {
    const { error } = await db.from('river_sections').upsert({ river_id: river.id, ...s }, { onConflict: 'river_id,section_slug' });
    if (error) throw new Error(`river_sections ${s.section_slug}: ${error.message}`);
  }
  if (sectionsRows.length) console.log(`  ✅ ${sectionsRows.length} river_sections`);

  if (characteristics) {
    const { error } = await db.from('river_characteristics').upsert({ river_id: river.id, ...characteristics }, { onConflict: 'river_id' });
    if (error) throw new Error(`river_characteristics: ${error.message}`);
    console.log('  ✅ river_characteristics');
  }

  console.log(`\nDone. Next: place access points in admin [manual], run validate_river_data('${dossier.slug}'), then flip rivers.active.`);
})().catch((e) => { console.error(`\n❌ ${e.message}`); process.exit(1); });
