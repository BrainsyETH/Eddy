#!/usr/bin/env npx tsx
/**
 * Manual (human-gated) access-point importer for the dossier pipeline.
 *
 * `ingest-dossier.ts` deliberately NEVER writes access points ([manual] gate) —
 * accesses ship only after a human verifies coordinates. This script is that
 * deliberate step. It reads a per-river JSON of verified access points and
 * upserts them, letting the DB `auto_snap_access_point` trigger compute
 * river_mile_downstream + snap_distance_m so we can validate placement.
 *
 * Data files: scripts/ingestion/access-points/<slug>.json
 *   [{ name, kind, expected_mile, lat, lon, is_public, ownership,
 *      managing_agency, official_site_url, facilities, description,
 *      confidence, source_urls }]
 *   kind ∈ access | bridge | boat_ramp | park | campground | gravel_bar
 *
 * Usage:
 *   npx tsx scripts/ingestion/import-dossier-access-points.ts <slug> [--write] [--approve]
 *     (no flag)  dry-run: show what WOULD import + current DB state
 *     --write    upsert rows (approved=false, is_float_endpoint from kind);
 *                trigger snaps; prints validation
 *     --approve  flip approved=true for rows that PASS validation
 *                (river_mile_downstream not null, monotonic ordering vs
 *                 expected_mile, and — for LAUNCH kinds only —
 *                 snap_distance_m <= MAX_SNAP_M)
 *
 *                Distance from the channel does not disqualify a park or a
 *                campground: those are places on the river, not put-ins, and a
 *                headwaters park legitimately sits kilometres from where Eddy's
 *                river geometry starts. FAR is still printed for every row.
 *
 * Env: NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
 */
import * as fs from 'fs';
import * as path from 'path';
import { getScriptClient } from '../lib/db';
// One definition of "you can put a boat in here", shared with the trust check
// that reports on this column and the admin route that offers a default for it.
import { isLaunchRole } from '../../src/lib/access-points/launch-roles';

const MAX_SNAP_M = 250; // a verified put-in should snap within ~250 m of the channel

type Kind = 'access' | 'bridge' | 'boat_ramp' | 'park' | 'campground' | 'gravel_bar';
interface APRow {
  name: string;
  kind: Kind;
  expected_mile: number | null;
  lat: number | null;
  lon: number | null;
  is_public?: boolean;
  ownership?: string | null;
  managing_agency?: string | null;
  official_site_url?: string | null;
  facilities?: string | null;
  description?: string | null;
  confidence?: string;
  source_urls?: string[];
}

function slugify(t: string): string {
  return t.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

// access_points_managing_agency_check (00034) allows only this set (or NULL).
// AGFC / USGS / MoDOT are NOT in it — map known synonyms, else null the column
// (ownership still records the true operator as free text, matching the 00158
// Buffalo precedent: "managing_agency left null because AGFC is not in the enum").
const ALLOWED_AGENCY = new Set(['MDC', 'NPS', 'USFS', 'COE', 'State Park', 'County', 'Municipal', 'Private']);
const AGENCY_SYNONYM: Record<string, string> = { City: 'Municipal', 'State Parks': 'State Park', Federal: 'USFS' };
function normalizeAgency(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const mapped = AGENCY_SYNONYM[raw] ?? raw;
  return ALLOWED_AGENCY.has(mapped) ? mapped : null;
}

async function main() {
  const [slug, ...flags] = process.argv.slice(2);
  if (!slug) {
    console.error('Usage: import-dossier-access-points.ts <slug> [--write] [--approve]');
    process.exit(1);
  }
  const write = flags.includes('--write');
  const approve = flags.includes('--approve');

  const dataPath = path.join(__dirname, 'access-points', `${slug}.json`);
  if (!fs.existsSync(dataPath)) {
    console.error(`No data file: ${dataPath}`);
    process.exit(1);
  }
  const all: APRow[] = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
  // Only rows with real coordinates are importable; the rest are held.
  const placeable = all.filter((r) => r.lat != null && r.lon != null);
  const held = all.filter((r) => r.lat == null || r.lon == null);

  const db = getScriptClient({ script: 'import-dossier-access-points', write: write });
  const { data: river, error: rErr } = await db.from('rivers').select('id, name').eq('slug', slug).single();
  if (rErr || !river) throw new Error(`river ${slug} not found: ${rErr?.message}`);

  console.log(`\n${river.name} (${slug}) — ${placeable.length} placeable, ${held.length} held (no coord)`);
  if (held.length) console.log('  held:', held.map((h) => h.name).join(', '));

  if (write) {
    for (const r of placeable) {
      const row = {
        river_id: river.id,
        name: r.name,
        slug: slugify(r.name),
        type: r.kind,
        is_public: r.is_public ?? true,
        ownership: r.ownership ?? null,
        managing_agency: normalizeAgency(r.managing_agency ?? r.ownership),
        official_site_url: r.official_site_url ?? null,
        facilities: r.facilities ?? null,
        description: r.description ?? null,
        approved: false,
        // Set here, not left to the column default. 20260823190713 made
        // is_float_endpoint opt-in precisely so nothing becomes a launch by
        // accident — but a launch that nobody opts in is a put-in Eddy silently
        // never offers, which is the failure nobody reports. The importer knows
        // the kind, so it answers rather than deferring.
        is_float_endpoint: isLaunchRole(r.kind),
        location_orig: { type: 'Point', coordinates: [r.lon, r.lat] },
      };
      const { error } = await db
        .from('access_points')
        .upsert(row, { onConflict: 'river_id,slug' });
      if (error) throw new Error(`upsert ${r.name}: ${error.message}`);
    }
    console.log(`  ✅ upserted ${placeable.length} rows (approved=false)`);

    // Since 00121 the auto-snap trigger sets only location_snap + snap_distance_m;
    // river_mile_downstream is populated here from the geometry (00165 helper).
    const { data: nSet, error: mileErr } = await db.rpc('set_access_point_miles_from_geometry', {
      p_river_id: river.id,
      p_force: false,
    });
    if (mileErr) throw new Error(`set miles: ${mileErr.message}`);
    console.log(`  ✅ set river_mile_downstream on ${nSet} point(s) from geometry`);
  }

  // Read back current DB state (post-trigger snap)
  const { data: dbPts, error: qErr } = await db
    .from('access_points')
    .select('id, name, slug, type, river_mile_downstream, snap_distance_m, approved, is_float_endpoint, managing_agency, official_site_url')
    .eq('river_id', river.id)
    .order('river_mile_downstream', { ascending: true, nullsFirst: false });
  if (qErr) throw qErr;

  const expBySlug = new Map(placeable.map((r) => [slugify(r.name), r.expected_mile]));
  console.log(`\n  DB access points (${dbPts?.length ?? 0}):`);
  const validated: string[] = [];
  const problems: string[] = [];
  let prevMile = -Infinity;
  for (const p of dbPts ?? []) {
    const exp = expBySlug.get(p.slug);
    const snap = p.snap_distance_m == null ? null : Math.round(p.snap_distance_m);
    // ── FAR still reports; it no longer BLOCKS a place that is not a launch ──
    //
    // Distance from the channel is the right test for a put-in and the wrong one
    // for a park. Montauk State Park sits 2 236 m from the Current's line, and
    // that number is not a bad coordinate: the nearest point on Eddy's geometry
    // to Montauk IS the geometry's first vertex, because the line begins 2.2 km
    // below the park. Any correctly-pinned headwaters record measures the same.
    // Blocking on it meant a whole class of honest record could never be
    // approved, and the only lever anyone had left was `approved` — which is how
    // Montauk lost its page as well as its put-in.
    //
    // So the flag is still printed for every row, because it is also the signal
    // that catches a genuinely wrong park coordinate. It just stops being
    // disqualifying for a record that was never claiming to be a launch.
    const isLaunch = p.is_float_endpoint === true;
    const flags: string[] = [];
    const blocking: string[] = [];
    if (p.river_mile_downstream == null) blocking.push('NO-MILE');
    if (snap != null && snap > MAX_SNAP_M) {
      const far = `FAR(${snap}m)`;
      flags.push(far);
      if (isLaunch) blocking.push(far);
    }
    if (p.river_mile_downstream != null) {
      if (p.river_mile_downstream < prevMile - 0.5) blocking.push('ORDER?');
      prevMile = p.river_mile_downstream;
    }
    // Union for display, so the printed line still shows everything observed.
    const shown = [...new Set([...blocking, ...flags])];
    const ok = blocking.length === 0;
    const line =
      `    ${ok ? '✅' : '⚠️ '} ${p.name.padEnd(34)} type=${(p.type as string).padEnd(10)} ` +
      `mile=${p.river_mile_downstream ?? '—'}${exp != null ? ` (exp~${exp})` : ''} ` +
      `snap=${snap ?? '—'}m agency=${p.managing_agency ?? '—'} approved=${p.approved}` +
      `${isLaunch ? '' : ' not-a-launch'}` +
      (shown.length ? `  [${shown.join(', ')}]` : '');
    console.log(line);
    if (ok) validated.push(p.id);
    else problems.push(`${p.name}: ${blocking.join(', ')}`);
  }

  if (problems.length) {
    console.log(`\n  ⚠️  ${problems.length} need review:`);
    problems.forEach((p) => console.log(`     - ${p}`));
  }

  if (approve) {
    if (validated.length) {
      const { error } = await db
        .from('access_points')
        .update({ approved: true, approved_at: new Date().toISOString() })
        .in('id', validated);
      if (error) throw error;
    }
    console.log(`\n  ✅ approved ${validated.length} validated points; left ${problems.length} unapproved for review.`);
  } else {
    console.log(`\n  (dry validation — pass --approve to approve the ${validated.length} ✅ points.)`);
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
