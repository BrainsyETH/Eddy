#!/usr/bin/env npx tsx
/**
 * The service model, audited against the live directory.
 *
 * ── WHY THIS EXISTS ────────────────────────────────────────────────────────
 *
 * A map layer once declared its membership as a list of type strings, three of
 * which the directory has never held, and one of which — `cabin_lodge`, 41 of
 * its 156 rows — it held and the list omitted. Nothing failed. No test broke, no
 * error was logged; the layer simply drew nothing for every cabin and lodge Eddy
 * has, under a row whose own description promised lodging.
 *
 * That class of bug is invisible from inside the app, because the app's own
 * types were satisfied. It is only visible by comparing what the DATABASE holds
 * against what the CLASSIFIER says about it, which is what this does.
 *
 * The second reason is documentation rot. `docs/MAPS_SHEET_SERVICE_MODEL_PLAN.md`
 * was written with a table of counts read on one afternoon. Every one of those
 * numbers is now a claim nobody re-checks. A command that prints them is worth
 * more than a document that remembers them.
 *
 * ── READ ONLY ──────────────────────────────────────────────────────────────
 * No writes, ever. This is a check, and it runs against production data.
 *
 * Usage:
 *   npm run db:check-services              (exit 1 on an error)
 *   npm run db:check-services -- --strict  (exit 1 on warnings too)
 */

import { createClient } from '@supabase/supabase-js';
import {
  isKnownServiceType,
  serviceEligible,
  serviceTiers,
  type ServiceTier,
} from '@eddy/types';
import {
  LAYER_SERVICE_TIER,
  serviceTypeLabel,
} from '../../eddy-ios/src/map/serviceLayers';
import { mappableService } from '../../eddy-ios/src/map/mappable';

const TIERS: ServiceTier[] = ['rentals', 'camping', 'lodging'];

interface ServiceRow {
  id: string;
  name: string;
  type: string;
  status: string | null;
  phone: string | null;
  latitude: number | null;
  longitude: number | null;
  geocode_precision: string | null;
  services_offered: string[] | null;
}

let errors = 0;
let warnings = 0;

function fail(message: string) {
  console.error(`  ✗ ${message}`);
  errors++;
}

function warn(message: string) {
  console.warn(`  ! ${message}`);
  warnings++;
}

function ok(message: string) {
  console.log(`  ✓ ${message}`);
}

function getSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error(
      'Missing environment variables. Make sure NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set.',
    );
  }
  return createClient(url, serviceKey);
}

/** The shape `serviceTiers` and friends want, out of a database row. */
function asService(row: ServiceRow) {
  return {
    type: row.type,
    servicesOffered: row.services_offered ?? [],
    status: row.status,
    latitude: row.latitude,
    longitude: row.longitude,
    geocodePrecision: row.geocode_precision as
      | 'exact'
      | 'approximate'
      | 'centroid'
      | null,
  };
}

async function main() {
  const strict = process.argv.includes('--strict');
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from('nearby_services')
    .select('id, name, type, status, phone, latitude, longitude, geocode_precision, services_offered');
  if (error) throw new Error(`Could not read nearby_services: ${error.message}`);
  const rows = (data ?? []) as ServiceRow[];

  console.log(`\nService model — ${rows.length} directory rows\n`);

  /* ── 1. Every declared value classifies ────────────────────────────────
     The check that would have caught cabin_lodge. A type in the database that
     the app has never heard of still DRAWS — serviceTiers falls back rather
     than dropping it — but it draws under a generic heading, and somebody
     should know. */
  console.log('Vocabulary');
  const unknownTypes = new Set<string>();
  for (const row of rows) if (!isKnownServiceType(row.type)) unknownTypes.add(row.type);
  if (unknownTypes.size === 0) {
    ok('every type in the directory is one the app has declared');
  } else {
    for (const type of unknownTypes) {
      fail(
        `type '${type}' is not in KnownServiceType — it draws as ` +
          `"${serviceTypeLabel({ type })}". Add it to SERVICE_TIERS in @eddy/types.`,
      );
    }
  }

  // Offerings are open-ended by design, so an unrecognised one is a warning:
  // it means the app cannot label it, not that anything is mis-drawn.
  const knownOfferings = new Set<string>(KNOWN_OFFERINGS);
  const unknownOfferings = new Set<string>();
  for (const row of rows) {
    for (const offering of row.services_offered ?? []) {
      if (!knownOfferings.has(offering)) unknownOfferings.add(offering);
    }
  }
  if (unknownOfferings.size === 0) {
    ok('every offering in the directory has a label');
  } else {
    warn(`offerings with no label: ${[...unknownOfferings].join(', ')}`);
  }

  /* ── 2. Tier population ────────────────────────────────────────────────── */
  console.log('\nTiers');
  const tierRows = new Map<ServiceTier, ServiceRow[]>(TIERS.map((t) => [t, []]));
  let multiTier = 0;
  const noTier: ServiceRow[] = [];
  for (const row of rows) {
    const tiers = serviceTiers(asService(row));
    for (const tier of tiers) tierRows.get(tier)!.push(row);
    if (tiers.length >= 2) multiTier++;
    if (tiers.length === 0) noTier.push(row);
  }
  for (const tier of TIERS) {
    console.log(`  ${tier.padEnd(8)} ${String(tierRows.get(tier)!.length).padStart(4)}`);
  }
  console.log(`  ${'multi'.padEnd(8)} ${String(multiTier).padStart(4)}  (in 2+ tiers)`);

  /* ── 3. THE INVARIANT ──────────────────────────────────────────────────
     Nothing may fall out of every tier. The kind is the floor precisely so a
     row without capabilities keeps its home — ten campgrounds record showers
     and a boat ramp and no camping_* offering at all. A non-zero here means the
     floor has stopped working, and rows are leaving the map silently. */
  if (noTier.length === 0) {
    ok('no row falls outside every tier — the kind floor is holding');
  } else {
    fail(
      `${noTier.length} rows are in NO tier and therefore on no layer: ` +
        noTier.slice(0, 5).map((r) => `${r.name} (${r.type})`).join(', '),
    );
  }

  /* ── 4. Coverage — what each layer can actually draw ───────────────────
     mapped = eligible && mappable && inTier
     total  = eligible &&              inTier
     Both sides over the same population, so the figure describes LOCATION
     coverage and never smuggles closure policy into it. This is the number the
     layers sheet prints. */
  console.log('\nCoverage (what the layers sheet says)');
  for (const [layer, tier] of Object.entries(LAYER_SERVICE_TIER)) {
    const inTier = tierRows.get(tier as ServiceTier)!;
    const eligible = inTier.filter((r) => serviceEligible(asService(r)));
    const mapped = eligible.filter((r) => mappableService(asService(r)));
    const pct = eligible.length ? Math.round((mapped.length / eligible.length) * 100) : 0;
    console.log(
      `  ${layer.padEnd(12)} ${String(mapped.length).padStart(3)} of ` +
        `${String(eligible.length).padStart(3)} mapped  (${pct}%)`,
    );
  }

  const ineligible = rows.filter((r) => !serviceEligible(asService(r)));
  if (ineligible.length) {
    console.log(
      `  ${'excluded'.padEnd(12)} ${String(ineligible.length).padStart(3)} closed — not drawn, not counted, not geocoded`,
    );
  }

  // A centroid is a town, never a place. Zero today; the moment a geocoding
  // backfill records one honestly, this line starts reporting it.
  const centroids = rows.filter((r) => r.geocode_precision === 'centroid');
  console.log(`  ${'centroid'.padEnd(12)} ${String(centroids.length).padStart(3)} refused as too coarse to pin`);

  /* ── 5. THE API AGREES WITH THE TABLE ──────────────────────────────────
     The gap this script was blind to, and it cost a release.

     Everything above reads the DATABASE. The app reads /api/services. For one
     release those two disagreed badly — the route filtered to `active` and
     already-geocoded rows and selected neither `status` nor
     `geocode_precision`, so 28 of 156 reached the phone, `serviceEligible`
     became a no-op and `mappableService` was defeated outright. Every check
     above passed the whole time, because none of them had ever looked at what
     the app is actually served.

     A route-contract test now pins the SHAPE. This pins the POPULATION, which
     is the half a source-level test cannot reach.

     Skipped rather than failed when there is no base URL: this must stay
     runnable against the database alone, and a check that cannot run is not a
     check that failed. Set SERVICES_API_URL, or NEXT_PUBLIC_SITE_URL, to
     include it. */
  console.log('\nAPI agrees with the table');
  const baseUrl = process.env.SERVICES_API_URL || process.env.NEXT_PUBLIC_SITE_URL;
  if (!baseUrl) {
    console.log('  – skipped (set SERVICES_API_URL or NEXT_PUBLIC_SITE_URL to include it)');
  } else {
    try {
      const res = await fetch(`${baseUrl.replace(/\/$/, '')}/api/services`);
      if (!res.ok) {
        fail(`GET /api/services returned ${res.status}`);
      } else {
        const body = (await res.json()) as { services?: unknown[] };
        const served = body.services ?? [];
        // The route applies no policy of its own now, so this is the whole
        // table. Anything less means a filter has crept back in, which is
        // exactly how the coverage note became unrenderable last time.
        if (served.length !== rows.length) {
          fail(
            `/api/services returned ${served.length} rows, the table holds ${rows.length}. ` +
              `The route must not filter — eligibility and mappability are the app's decisions.`,
          );
        } else {
          ok(`all ${served.length} rows reach the app`);
        }
        // And the two columns every client policy reads. A row that arrives
        // without them is a row the app cannot judge, silently.
        const first = served[0] as Record<string, unknown> | undefined;
        for (const field of ['status', 'geocodePrecision'] as const) {
          if (first && !(field in first)) {
            fail(`/api/services omits '${field}' — the client policy that reads it becomes a no-op`);
          }
        }
      }
    } catch (err) {
      warn(`could not reach ${baseUrl}/api/services: ${err instanceof Error ? err.message : err}`);
    }
  }

  /* ── 6. Drift between the directory and the embedded copies ────────────
     access_points.nearby_services is a second, hand-curated service list with
     its own vocabulary. Every number here should trend to zero as those entries
     become references to canonical rows. */
  console.log('\nEmbedded-vs-directory drift');
  const { data: apData, error: apError } = await supabase
    .from('access_points')
    .select('id, name, nearby_services')
    .not('nearby_services', 'is', null);
  if (apError) throw new Error(`Could not read access_points: ${apError.message}`);

  // Name OR phone, because the embedded entries were curated separately and
  // "Akers Ferry" and "Akers Ferry Canoe Rental" are one business. Digits only:
  // the two tables punctuate numbers differently.
  const digits = (v: string | null | undefined) => v?.replace(/[^0-9]/g, '') || null;
  const byName = new Map<string, ServiceRow>();
  const byPhone = new Map<string, ServiceRow>();
  for (const row of rows) {
    byName.set(row.name.trim().toLowerCase(), row);
    const phone = digits(row.phone);
    if (phone) byPhone.set(phone, row);
  }

  let embedded = 0;
  let orphans = 0;
  let typeConflicts = 0;
  let pointsAtClosed = 0;
  for (const ap of apData ?? []) {
    const list = (ap.nearby_services ?? []) as { name?: string; type?: string; phone?: string }[];
    if (!Array.isArray(list)) continue;
    for (const entry of list) {
      if (!entry?.name) continue;
      embedded++;
      const phone = digits(entry.phone);
      const match =
        byName.get(entry.name.trim().toLowerCase()) ?? (phone ? byPhone.get(phone) : undefined);
      if (!match) {
        orphans++;
        continue;
      }
      // 'lodging' and 'cabin_lodge' are the same claim in two vocabularies —
      // reconciled by serviceTiers, so agreeing tiers is agreement enough.
      const embeddedTiers = serviceTiers({ type: entry.type ?? '' }).join(',');
      const directoryTiers = serviceTiers(asService(match)).join(',');
      if (embeddedTiers !== directoryTiers) typeConflicts++;
      if (!serviceEligible(asService(match))) pointsAtClosed++;
    }
  }
  console.log(`  ${'entries'.padEnd(16)} ${String(embedded).padStart(3)}`);
  console.log(`  ${'orphans'.padEnd(16)} ${String(orphans).padStart(3)}  no canonical row — must be promoted before any join`);
  console.log(`  ${'tier conflicts'.padEnd(16)} ${String(typeConflicts).padStart(3)}  the two copies disagree about what it is`);
  if (pointsAtClosed) {
    warn(
      `${pointsAtClosed} embedded entries point at a row the directory marks closed — ` +
        `the JSONB carries no status, so the Place tab shows them as open`,
    );
  } else {
    ok('no embedded entry points at a closed business');
  }

  console.log(
    `\n${errors ? '✗' : '✓'} ${errors} error(s), ${warnings} warning(s)\n`,
  );
  if (errors > 0 || (strict && warnings > 0)) process.exit(1);
}

/**
 * Every offering the app can label, flattened.
 *
 * Mirrors `OFFERING_LABELS` in serviceLayers.ts rather than importing it —
 * that table is not exported, and exporting a label map so a script can count
 * its keys would be a worse trade than this list plus the warning above, which
 * fires the moment the two drift.
 */
const KNOWN_OFFERINGS = [
  'canoe_rental', 'kayak_rental', 'raft_rental', 'tube_rental', 'jon_boat_rental',
  'shuttle', 'camping_primitive', 'camping_rv', 'cabins', 'lodge_rooms',
  'general_store', 'food_service', 'showers', 'fishing_supplies', 'horseback_riding',
  'swimming_pool', 'wifi', 'potable_water', 'fire_rings', 'picnic_tables',
  'boat_ramp', 'dump_station', 'flush_toilets', 'vault_toilets', 'laundry', 'playground',
];

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
