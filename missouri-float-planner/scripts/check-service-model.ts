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
 *   npm run db:check-services -- --update-baseline  (re-record known debt)
 */

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import {
  EVIDENCE_STALE_DAYS,
  evidencePhrasing,
  evidenceProblems,
  type EvidenceFile,
} from './negative-evidence';
import {
  baselineShapeProblem,
  baselineWriteProblem,
  buildBaseline,
  compareToBaseline,
  DEBT_CLASSES,
  measureDebt,
  projectRefFromUrl,
  scorable,
  type Baseline,
  type QualityRow,
} from './service-quality';
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
import { milesBetween, type Coords } from '@eddy/geo';

const TIERS: ServiceTier[] = ['rentals', 'camping', 'lodging'];

const METRES_PER_MILE = 1609.344;

/**
 * The map's own same-place box, in metres.
 *
 * SAME_PLACE_DEGREES is 0.002° of latitude — about 222 m — and is a square box
 * rather than a circle, so this is an approximation of it and deliberately so:
 * the audit's job is to surface pairs a human should look at, and a pair sitting
 * exactly on the boundary is worth a look either way. The resolver remains the
 * only thing that decides what draws.
 */
const SAME_PLACE_METRES = 222;

/**
 * How far apart a `same_place` pair may sit before one of them is simply wrong.
 *
 * NOT `SAME_PLACE_METRES`. That is the map's proximity box — the distance below
 * which two records are assumed to be one place with no evidence at all — and
 * measuring a VERIFIED link against it flags every link for the exact reason it
 * was written. Patrick Bridge is 281 m apart because one record was pinned at
 * the boat ramp and the other at the campsites, inside one MDC area somebody
 * checked; reporting that as drift is reporting the success.
 *
 * A kilometre is the bar for "these cannot both be at one arrival point". Beyond
 * it, either the link is wrong or a coordinate is, and a person should look
 * again — which is a warning rather than an error, because the link is evidence
 * from a human and the geometry is evidence from a geocoder, and this check is
 * not entitled to decide between them.
 */
const IDENTITY_DRIFT_METRES = 1000;

/** How close two access points have to be before their names are worth reading. */
const NEAR_DUPLICATE_METRES = 400;

interface AccessPointGeoRow {
  id: string;
  name: string;
  types: string[] | null;
  approved: boolean | null;
  river_id: string | null;
  location_orig: unknown;
  location_snap: unknown;
}

interface IdentityLinkRow {
  access_point_id: string;
  nearby_service_id: string;
  relationship: string;
  verified_at: string | null;
}

/** PostGIS geometry arrives from PostgREST as GeoJSON — same read as shapes.ts. */
function geomCoords(geom: unknown): number[] | undefined {
  return (geom as { coordinates?: number[] } | null)?.coordinates;
}

/**
 * A name reduced to the part that identifies the PLACE.
 *
 * "Alley Spring Campground" and "Alley Spring" are one place under two names,
 * and "Cedargrove" and "Cedar Grove" are one place under two spellings — the
 * same normalisation 00039_match_nps_campgrounds_to_access_points.sql already
 * does in SQL, restated here because this script reads through PostgREST.
 *
 * A blunt instrument on purpose. It is allowed false positives because every
 * one of them is printed for a person to reject; it must not MERGE on them.
 */
function placeCore(name: string): string {
  return name
    .replace(/\s+(Campground|Camping|Recreation Area|Access|Camp)$/i, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

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
  last_verified_at: string | null;
  google_place_id: string | null;
  slug: string;
  phone_toll_free: string | null;
  website: string | null;
  description: string | null;
  verified_source: string | null;
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
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
  if (!url || !serviceKey) {
    throw new Error(
      'Set NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_KEY).',
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
    geocodePrecision: row.geocode_precision as 'exact' | 'approximate' | null,
  };
}

async function main() {
  const strict = process.argv.includes('--strict');
  const updateBaseline = process.argv.includes('--update-baseline');
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from('nearby_services')
    .select(
      'id, slug, name, type, status, phone, phone_toll_free, website, description, ' +
        'latitude, longitude, geocode_precision, services_offered, last_verified_at, ' +
        'verified_source, google_place_id',
    );
  if (error) throw new Error(`Could not read nearby_services: ${error.message}`);
  const rows = (data ?? []) as unknown as ServiceRow[];

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

  /* ── 4b. Verification age — the work queue ─────────────────────────────
     `verified_source` has recorded HOW a row was confirmed since 00072, and
     until 20260810010000 nothing recorded WHEN. So a row confirmed against a
     2019 review and one confirmed last week were the same claim, and the only
     way to find the stale ones was to re-check all of them.

     Printed rather than raised as a finding: this is a backlog to work
     through, not a defect to fix, and a hundred identical low-severity
     findings is the list nobody reads. The count is the useful shape. */
  const openRows = rows.filter((r) => serviceEligible(asService(r)));
  const neverVerified = openRows.filter((r) => !r.last_verified_at);
  const withPlaceId = openRows.filter((r) => r.google_place_id);
  console.log('\nVerification');
  console.log(
    `  ${'dated'.padEnd(12)} ${String(openRows.length - neverVerified.length).padStart(3)} of ${String(openRows.length).padStart(3)} carry a last_verified_at`,
  );
  console.log(
    `  ${'never'.padEnd(12)} ${String(neverVerified.length).padStart(3)} have never been re-confirmed` +
      (neverVerified.length
        ? ` — e.g. ${neverVerified.slice(0, 3).map((r) => r.name).join(', ')}`
        : ''),
  );
  console.log(
    `  ${'place id'.padEnd(12)} ${String(withPlaceId.length).padStart(3)} can be refreshed automatically` +
      (withPlaceId.length === 0
        ? ' — none yet; run scripts/ingestion/propose-service-places.ts'
        : ''),
  );

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
  /**
   * The embedded copy claims a tier the directory does NOT — a real
   * disagreement about what a business is, and the only case worth an error.
   *
   * ── NOT "the two tier sets differ", WHICH IS WHAT THIS FIRST COUNTED ────
   *
   * That reported 19, and every one was benign. The embedded JSONB carries a
   * `type` and no `servicesOffered`, so `serviceTiers` falls to the kind floor
   * and returns one tier; the directory row for the same business has
   * capabilities and returns two or three. Different, yes — but the embedded
   * set is a strict SUBSET every time, which is a copy that knows less, not a
   * copy that contradicts.
   *
   * Measured across all 27 matched entries: 27 subsets, 0 contradictions. That
   * is the strongest argument for horizon 2 that this script can print — every
   * embedded entry is strictly poorer than the row it duplicates, so replacing
   * them with references loses nothing at all.
   */
  let contradictions = 0;
  /** Thinner than the directory: informational, and the migration's case. */
  let thinner = 0;
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
      // reconciled by serviceTiers, so comparing tiers rather than types is
      // what stops the alias reading as a disagreement.
      const embeddedTiers = serviceTiers({ type: entry.type ?? '' });
      const directoryTiers = new Set(serviceTiers(asService(match)));
      const claimsMore = embeddedTiers.filter((tier) => !directoryTiers.has(tier));
      if (claimsMore.length > 0) contradictions++;
      else if (embeddedTiers.length < directoryTiers.size) thinner++;
      if (!serviceEligible(asService(match))) pointsAtClosed++;
    }
  }
  console.log(`  ${'entries'.padEnd(16)} ${String(embedded).padStart(3)}`);
  console.log(`  ${'orphans'.padEnd(16)} ${String(orphans).padStart(3)}  no canonical row — must be promoted before any join`);
  console.log(`  ${'thinner'.padEnd(16)} ${String(thinner).padStart(3)}  the copy knows less than the row it duplicates`);
  if (contradictions === 0) {
    ok('no embedded entry claims a tier the directory denies');
  } else {
    fail(
      `${contradictions} embedded entries claim a tier their directory row does not — ` +
        `the two copies genuinely disagree about what the business is`,
    );
  }
  if (pointsAtClosed) {
    warn(
      `${pointsAtClosed} embedded entries point at a row the directory marks closed — ` +
        `the JSONB carries no status, so the Place tab shows them as open`,
    );
  } else {
    ok('no embedded entry points at a closed business');
  }

  /* ── 7. One place, two records ─────────────────────────────────────────
     The map draws one marker per place and decides "same place" with a ~222 m
     box, because for most rows that is the only evidence it has. This section
     reports where that is wrong in both directions: places the box cannot reach
     that are one place anyway, and links that exist but whose rows have drifted.

     PROPOSES, NEVER MERGES — and note what "confirm" costs here. Promoting a
     pair to `same_place` collapses two markers into one, which removes the
     losing record's location from the map. At Meramec's 2 956 m that would send
     somebody looking for a campground to a boat ramp 3 km away. So the bar is
     not "are these related" but "is this ONE ARRIVAL POINT", and only a person
     can answer it. */
  console.log('\nOne place, two records');

  const { data: apRows, error: apGeoError } = await supabase
    .from('access_points')
    .select('id, name, types, approved, river_id, location_orig, location_snap')
    .eq('approved', true);
  if (apGeoError) throw new Error(`Could not read access_points: ${apGeoError.message}`);

  /** The coordinate the MAP pins, so these distances describe the pins a reader sees. */
  const pinOf = (row: AccessPointGeoRow): Coords | null => {
    const c = geomCoords(row.location_orig) ?? geomCoords(row.location_snap);
    return c && c.length >= 2 ? { lat: c[1], lng: c[0] } : null;
  };
  const accessPoints = ((apRows as AccessPointGeoRow[] | null) ?? [])
    .map((row) => ({ row, pin: pinOf(row), core: placeCore(row.name) }))
    .filter((p): p is { row: AccessPointGeoRow; pin: Coords; core: string } => p.pin !== null);
  const apById = new Map(accessPoints.map((p) => [p.row.id, p]));

  // The links, if the table has landed. A missing table is the state before the
  // migration and is worth saying once, not throwing over.
  const identity = new Map<string, string>();
  const linkedPairs = new Set<string>();
  const locatedAt: IdentityLinkRow[] = [];
  const unverifiedIdentity: IdentityLinkRow[] = [];
  const { data: linkRows, error: linkError } = await supabase
    .from('access_point_services')
    .select('access_point_id, nearby_service_id, relationship, verified_at');
  if (linkError) {
    warn(`access_point_services is unreadable (${linkError.message}) — link checks skipped`);
  } else {
    for (const link of (linkRows ?? []) as IdentityLinkRow[]) {
      // Every recorded relationship, whatever it is, is a pair somebody has
      // already ruled on — so it must not come back as a candidate. Reporting a
      // decided `located_at` under "confirm each shares ONE arrival point" asks
      // for a decision that has been made, and buries the pairs that genuinely
      // have not.
      linkedPairs.add(`${link.access_point_id}:${link.nearby_service_id}`);
      if (link.relationship === 'same_place') {
        identity.set(link.nearby_service_id, link.access_point_id);
        if (!link.verified_at) unverifiedIdentity.push(link);
      } else if (link.relationship === 'located_at') {
        locatedAt.push(link);
      }
    }
    console.log(
      `  ${'same_place'.padEnd(22)} ${String(identity.size).padStart(3)}  collapses a marker`,
    );
    console.log(
      `  ${'located_at'.padEnd(22)} ${String(locatedAt.length).padStart(3)}  routes data, draws both`,
    );
  }

  // A same_place link nobody signed off on. The schema cannot forbid it, and it
  // is the one row in this table that can delete a place from the map.
  if (unverifiedIdentity.length > 0) {
    fail(
      `${unverifiedIdentity.length} same_place links have no verified_at — a marker is being ` +
        'collapsed on evidence nobody confirmed',
    );
  } else if (!linkError) {
    ok('every same_place link was confirmed by a person');
  }

  const drawnServices = rows.filter(
    (row) =>
      serviceEligible(asService(row)) &&
      mappableService(asService(row)) &&
      serviceTiers(asService(row)).includes('camping') &&
      row.latitude != null &&
      row.longitude != null,
  );
  const serviceById = new Map(drawnServices.map((r) => [r.id, r]));

  // (a) Same-name pairs the radius cannot reach and no link covers.
  // (b) Identity links whose two rows have drifted apart.
  const unlinkedCandidates: string[] = [];
  const driftedLinks: string[] = [];
  for (const svc of drawnServices) {
    const here: Coords = { lat: svc.latitude as number, lng: svc.longitude as number };
    const linkedTo = identity.get(svc.id);
    if (linkedTo) {
      const target = apById.get(linkedTo);
      if (!target) continue;
      const metres = Math.round(milesBetween(here, target.pin) * METRES_PER_MILE);
      // The link says one arrival point and the geometry disagrees. Not a
      // duplicate pin — the resolver absorbs it — but one of the two rows is
      // pinned somewhere its own place is not, and only a person can say which.
      if (metres > IDENTITY_DRIFT_METRES) {
        driftedLinks.push(`${svc.name} ←→ ${target.row.name} (${metres} m apart, same_place)`);
      }
      continue;
    }
    const core = placeCore(svc.name);
    for (const match of accessPoints.filter((p) => p.core === core)) {
      const metres = Math.round(milesBetween(here, match.pin) * METRES_PER_MILE);
      // Inside the box the map already draws one pin, so there is nothing to
      // report; outside it, the reader is looking at two pins for what the
      // names say is one place.
      if (metres <= SAME_PLACE_METRES) continue;
      if (linkedPairs.has(`${match.row.id}:${svc.id}`)) continue;
      const tagged = (match.row.types ?? []).includes('campground');
      unlinkedCandidates.push(
        `${svc.name} ←→ ${match.row.name} (${metres} m apart` +
          `${tagged ? '' : ', access point NOT tagged campground'})`,
      );
    }
  }

  if (unlinkedCandidates.length === 0) {
    ok('no same-name campground draws a second pin beside its access point');
  } else {
    warn(
      `${unlinkedCandidates.length} same-name pairs draw two pins — confirm each shares ONE ` +
        'arrival point before linking it same_place:',
    );
    for (const line of unlinkedCandidates) console.warn(`      ${line}`);
  }

  if (driftedLinks.length === 0) {
    ok('every same_place link has both rows in the same place');
  } else {
    warn(
      `${driftedLinks.length} same_place links whose rows sit more than ` +
        `${IDENTITY_DRIFT_METRES} m apart — one of the two coordinates is wrong:`,
    );
    for (const line of driftedLinks) console.warn(`      ${line}`);
  }

  // The verification queue. These route availability today and draw two markers,
  // which is the CORRECT behaviour until somebody says otherwise — printed with
  // the distance because that is the fact the decision turns on.
  // The register of decided `located_at` pairs, not a queue: two markers is the
  // right answer for these, and `verified` says whether a person said so or the
  // facility table implied it. A pair here is finished unless somebody decides
  // the two ends share one arrival point after all.
  if (locatedAt.length > 0) {
    console.log('  located_at — two markers by design:');
    for (const link of locatedAt) {
      const target = apById.get(link.access_point_id);
      const svc = serviceById.get(link.nearby_service_id);
      if (!target || !svc || svc.latitude == null || svc.longitude == null) continue;
      const metres = Math.round(
        milesBetween({ lat: svc.latitude, lng: svc.longitude }, target.pin) * METRES_PER_MILE,
      );
      const mark = link.verified_at ? 'verified' : 'derived, unconfirmed';
      console.log(`      ${svc.name} ←→ ${target.row.name} (${metres} m apart, ${mark})`);
    }
  }

  // (c) Two ACCESS POINTS for one place. Deliberately not fixable by the
  // resolver: deduping access points on proximity is the record merge ADR 0008
  // forbids, and several of these pairs are genuinely two places (Wilderness
  // Ridge Resort and Peck's Last Resort are 74 m apart and are two businesses).
  //
  // ── AND A CONFLUENCE IS NOT A DUPLICATE ────────────────────────────────
  //
  // Two Rivers is the one place where the Jacks Fork meets the Current, and Eddy
  // holds it twice — mile 52.5 of the Current and mile 44.3 of the Jacks Fork,
  // 150 m apart. That is not a record to retire. `access_points` carries ONE
  // river_id and ONE river mile, and the float planner needs a put-in on each
  // river's mile system, so a confluence destination genuinely requires a row
  // per river. Naming the rivers is what stops the next reader "fixing" it by
  // deleting one and breaking three float segments.
  const sameRiver: string[] = [];
  const acrossRivers: string[] = [];
  for (let i = 0; i < accessPoints.length; i += 1) {
    for (let j = i + 1; j < accessPoints.length; j += 1) {
      const a = accessPoints[i];
      const b = accessPoints[j];
      if (a.core !== b.core) continue;
      const metres = Math.round(milesBetween(a.pin, b.pin) * METRES_PER_MILE);
      if (metres > NEAR_DUPLICATE_METRES) continue;
      const line = `${a.row.name} ←→ ${b.row.name} (${metres} m apart)`;
      if (a.row.river_id && b.row.river_id && a.row.river_id !== b.row.river_id) {
        acrossRivers.push(line);
      } else {
        sameRiver.push(line);
      }
    }
  }
  if (sameRiver.length === 0) {
    ok('no two access points on one river share a name within a few hundred metres');
  } else {
    warn(`${sameRiver.length} access-point pairs on ONE river may be one place recorded twice:`);
    for (const line of sameRiver) console.warn(`      ${line}`);
  }
  if (acrossRivers.length > 0) {
    console.log(
      `  ${'confluences'.padEnd(22)} ${String(acrossRivers.length).padStart(3)}  ` +
        'one destination, one row per river — expected, not a duplicate',
    );
    for (const line of acrossRivers) console.log(`      ${line}`);
  }

  // (d) A facility that knows its service but not its access point. Half a link:
  // enough to find availability from a service row, not enough for the sheet to
  // reach it from the access point the reader tapped.
  const { data: facilities, error: facilityError } = await supabase
    .from('campsite_facilities')
    .select('display_name, access_point_id, nearby_service_id')
    .not('nearby_service_id', 'is', null)
    .is('access_point_id', null);
  if (facilityError) {
    warn(`Could not read campsite_facilities: ${facilityError.message}`);
  } else if ((facilities ?? []).length === 0) {
    ok('every facility that names a service also names its access point');
  } else {
    const names = (facilities ?? []).map((f) => (f as { display_name: string }).display_name);
    warn(
      `${names.length} facilities name a service but no access point — ` +
        `their availability cannot reach an access-point sheet: ${names.join(', ')}`,
    );
  }

  /* ── The quality ratchet ───────────────────────────────────────────────
     Existing debt is named and tolerated; NEW debt fails. See the header of
     service-quality.ts for why this is a derivative and not a threshold. */
  console.log('\nQuality ratchet');

  const qualityRows = rows as unknown as QualityRow[];
  const perRiver: Record<string, string[]> = {};
  const { data: riverSlugRows, error: riverErr } = await supabase.from('rivers').select('id, slug');
  const { data: serviceRiverRows, error: linkErr } = await supabase
    .from('service_rivers')
    .select('service_id, river_id, is_primary');
  // A warning here used to be enough, and it was not. perRiver stayed empty,
  // and --update-baseline then wrote an empty riverMembers — silently
  // disabling the coverage gate on the strength of one transient read error.
  // The one command that rewrites the baseline is the one that must not guess.
  const linkReadError = (riverErr ?? linkErr)?.message ?? null;
  if (linkReadError) {
    if (updateBaseline) {
      throw new Error(
        `Refusing to rewrite the baseline: ${baselineWriteProblem({}, linkReadError)}`,
      );
    }
    warn(`Could not read river links: ${linkReadError}`);
  } else {
    const riverSlugById = new Map(
      (riverSlugRows ?? []).map((r) => [(r as { id: string }).id, (r as { slug: string }).slug]),
    );
    const live = new Set(scorable(qualityRows).map((r) => r.slug));
    const idToSlug = new Map(rows.map((r) => [r.id, (r as unknown as QualityRow).slug]));
    for (const slug of riverSlugById.values()) perRiver[slug] = [];
    const links = (serviceRiverRows ?? []) as unknown as
      Array<{ service_id: string; river_id: string; is_primary: boolean }>;
    for (const link of links) {
      const riverSlug = riverSlugById.get(link.river_id);
      const serviceSlug = idToSlug.get(link.service_id);
      if (!riverSlug || !serviceSlug || !live.has(serviceSlug)) continue;
      (perRiver[riverSlug] ??= []).push(serviceSlug);
    }
    for (const slug of Object.keys(perRiver)) perRiver[slug].sort();

    // How many rivers each row is linked to, and how many of those links call
    // themselves primary. Counted over every link, not only the ones that
    // survived the filters above: a row whose sole link points at a river that
    // is not curated still has to say which river it is on.
    const linkCounts = new Map<string, { links: number; primaries: number }>();
    for (const link of links) {
      const at = linkCounts.get(link.service_id) ?? { links: 0, primaries: 0 };
      at.links += 1;
      if (link.is_primary) at.primaries += 1;
      linkCounts.set(link.service_id, at);
    }
    for (const raw of rows) {
      const counted = linkCounts.get(raw.id) ?? { links: 0, primaries: 0 };
      const row = raw as unknown as QualityRow;
      row.river_links = counted.links;
      row.primary_rivers = counted.primaries;
    }
  }

  /* ── Negative evidence ─────────────────────────────────────────────────
     A river showing zero services is either a finding or a gap, and the two
     look identical in a coverage table. Anything claimed absent has to have a
     record saying where somebody looked and when, and a claim of completeness
     against a published roster has to cite the roster — that citation is the
     whole difference between "complete" and "none found". */
  console.log('\nNegative evidence');
  const evidencePath = path.join(__dirname, 'ingestion', 'negative-evidence.json');
  const evidence: EvidenceFile = fs.existsSync(evidencePath)
    ? (JSON.parse(fs.readFileSync(evidencePath, 'utf-8')) as EvidenceFile)
    : {};
  const evidenceIssues: string[] = [];
  for (const [slug, record] of Object.entries(evidence)) {
    evidenceIssues.push(...evidenceProblems(slug, record, new Date()));
  }
  for (const issue of evidenceIssues) fail(issue);
  if (evidenceIssues.length === 0 && Object.keys(evidence).length > 0) {
    ok(`${Object.keys(evidence).length} negative-evidence record(s) intact ` +
      `(re-look after ${EVIDENCE_STALE_DAYS} days)`);
  }
  for (const [slug, record] of Object.entries(evidence)) {
    console.log(`  · ${slug.padEnd(18)} ${evidencePhrasing(record)}`);
  }

  // Which project the numbers came from. A baseline recorded against a branch
  // or a staging copy and compared against production would report every
  // difference between the two as a regression.
  const projectRef = projectRefFromUrl(
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  );

  const baselinePath = path.join(__dirname, 'service-quality-baseline.json');
  const now = new Date();
  const today = now.toISOString().slice(0, 10);

  if (updateBaseline) {
    const problem = baselineWriteProblem(perRiver, linkReadError);
    if (problem) throw new Error(`Refusing to rewrite the baseline: ${problem}`);
    const next = { ...buildBaseline(qualityRows, perRiver, today, now), projectRef };
    fs.writeFileSync(baselinePath, `${JSON.stringify(next, null, 2)}\n`, 'utf-8');
    for (const cls of DEBT_CLASSES) {
      const n = next.classes[cls.key].length;
      console.log(`  · ${String(n).padStart(3)}  ${cls.key}`);
    }
    ok(`baseline rewritten — ${path.relative(process.cwd(), baselinePath)}`);
  } else if (!fs.existsSync(baselinePath)) {
    warn('no baseline recorded yet — run with --update-baseline to record one');
  } else {
    const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf-8')) as Baseline;
    if (baseline.projectRef && baseline.projectRef !== projectRef) {
      fail(
        `the baseline was recorded against project ${baseline.projectRef} but this ` +
        `run read ${projectRef} — every difference between the two would read as a regression`,
      );
      console.log(`\n${errors ? '✗' : '✓'} ${errors} error(s), ${warnings} warning(s)\n`);
      process.exit(1);
    }
    const shape = baselineShapeProblem(baseline);
    if (shape) {
      fail(`the recorded baseline ${shape}`);
      console.log(`\n${errors ? '✗' : '✓'} ${errors} error(s), ${warnings} warning(s)\n`);
      process.exit(1);
    }
    const result = compareToBaseline(measureDebt(qualityRows, now), perRiver, baseline);

    for (const r of result.regressions) {
      const say = r.severity === 'error' ? fail : warn;
      say(`${r.slugs.length} NEW row(s) with ${r.label}: ${r.slugs.join(', ')}`);
    }
    for (const d of result.riverDrops) {
      fail(`${d.river} lost ${d.lost.length} service(s): ${d.lost.join(', ')}`);
    }
    if (result.unknownRivers.length > 0) {
      warn(
        `${result.unknownRivers.length} river(s) absent from the baseline: ` +
          `${result.unknownRivers.join(', ')} — re-record it`,
      );
    }
    for (const i of result.improvements) {
      ok(`${i.slugs.length} row(s) no longer have ${i.label}`);
    }
    if (result.regressions.length === 0 && result.riverDrops.length === 0) {
      const carried = DEBT_CLASSES.reduce((n, c) => n + (baseline.classes[c.key] ?? []).length, 0);
      ok(`no new defects (${carried} known, recorded ${baseline.generatedAt})`);
    }
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
