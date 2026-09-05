// src/lib/offline/bundle.ts
//
// The whole offline dataset for every river, assembled in one pass.
//
// ── What this is for ──────────────────────────────────────────────────────
//
// The iOS app seeds its on-disk cache from this once per launch, so that a
// phone in a canyon can still draw a river, list its put-ins and — the one
// that matters — show its hazards. Before it existed, opening a river with no
// signal rendered the "River not found" otter.
//
// It is deliberately NOT /api/export/rivers.json, which assembles nearly the
// same rows. That route's stated audience is "RAG pipelines and data
// consumers", so its shape may change for reasons that have nothing to do with
// the app, and it is force-dynamic with no s-maxage, so it is uncacheable at
// the edge. This one is shaped for the app and cached by the CDN.
//
// ── What is deliberately NOT in here ──────────────────────────────────────
//
// The rule is: cache the SHAPE of the river, never the STATE of the water.
// Geometry, put-ins and hazards change monthly. Readings, forecasts, high
// water and dam schedules describe a moment, and a cached moment read three
// days later is not stale data, it is wrong data — dangerously so for high
// water. Those are fetched live or not at all.
//
// Services (outfitters, campgrounds) are also absent, for a different reason:
// they are a commercial listing rather than something you navigate or avoid,
// and including them would mean a second shape-mapper to keep in sync for no
// safety benefit. They still reach the cache via the per-river write-through
// when someone actually opens the river.
//
// ── The ETag is the entire economics of this route ────────────────────────
//
// Every install re-fetches this on every launch. If the body carried a
// generated-at timestamp the ETag would change on every call, each launch
// would pull the full payload instead of a 304, and NOTHING WOULD LOOK BROKEN
// — the app would work perfectly while burning ~1 MB per install per day. So
// this function must be a pure projection of database state, with no clock in
// it anywhere, and bundle.test.ts asserts exactly that.

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getServiceAreaBounds } from '@/lib/geo/region-bounds';
import { fetchRiverReaches, type RiverReach } from '@/lib/data/river-reaches';
import type { RiverType } from '@/lib/rivers/context';
import type { MapSpring, NPSCampgroundInfo } from '@/types/api';
import { loadLiveAvailabilityIndex } from '@/lib/camping/live-index';
import {
  toAccessPoint,
  toHazard,
  toNpsCampground,
  toRiverDetail,
  toRiverIndexEntry,
  toSpring,
  type AccessPointRow,
  type HazardRow,
  type RiverRow,
  type SpringRow,
} from '@/lib/offline/shapes';

export interface OfflineBundleRiver {
  slug: string;
  river: ReturnType<typeof toRiverDetail>;
  accessPoints: NonNullable<ReturnType<typeof toAccessPoint>>[];
  hazards: ReturnType<typeof toHazard>[];
  reaches: RiverReach[];
  /**
   * Named springs on this river.
   *
   * ── Why springs are in the bundle when services are not ────────────────
   *
   * The header's rule for what belongs here is "the SHAPE of the river, never
   * the STATE of the water", and the exclusion of services is that they are a
   * commercial listing rather than something you navigate or avoid. A spring
   * is neither: it is a fixed feature of the channel that changes on the same
   * geological schedule as the put-ins already in this payload, and on these
   * rivers it is frequently the REASON for the trip. Big Spring, Alley Spring
   * and Greer are destinations, and a phone with no signal at the put-in
   * should still know they are downstream.
   *
   * Empty for most rivers, and empty is the honest answer: only a handful are
   * curated or derived so far.
   */
  springs: MapSpring[];
}

export interface OfflineBundle {
  /**
   * Bumped only for a change the app cannot read with its current parser.
   *
   * The cache treats a version it does not recognise as ABSENT rather than
   * migrating it, on the reasoning that the whole dataset is one request away
   * — repair is cheaper than migration. So bumping this is a deliberate act of
   * invalidating every phone's copy, not a routine version stamp.
   *
   * NOT bumped for `index` below. A field a shipped binary does not read is
   * invisible to it, and bumping would have blanked the offline cache of every
   * install in the field to deliver an optimisation.
   */
  v: 1;
  rivers: OfflineBundleRiver[];
  /**
   * The rivers list, without any river's condition.
   *
   * ── Why this rides along ───────────────────────────────────────────────
   *
   * The app's river screen needs an id, a slug and a name before it can ask
   * for anything else, and /api/rivers was the only place carrying all three.
   * A fresh install therefore held a full-screen spinner in front of the river
   * screen while a 25-river condition endpoint assembled — for three strings
   * that change no more often than the put-ins already in this payload.
   *
   * ── Why it is not folded into rivers[].river ───────────────────────────
   *
   * That field is a RiverDetail and carries geometry and bounds; the index is
   * a RiverListItem and carries state, path and a count. They are two shapes
   * for two consumers, and widening one into the other would put a LineString
   * behind every row of a list screen.
   *
   * The duplication of id/name/slug between them is ~150 bytes a river against
   * a payload whose geometry is measured in hundreds of kilobytes.
   */
  index: ReturnType<typeof toRiverIndexEntry>[];
}

/** Geometry for every river, keyed by slug, from the statewide dataset RPC. */
async function geometryBySlug(): Promise<Map<string, GeoJSON.LineString>> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc('get_mo_surface_water_dataset');
  if (error) throw new Error(`Statewide dataset RPC failed: ${error.message}`);

  const rivers = (data as { rivers?: { slug?: string; geometry?: unknown }[] } | null)?.rivers ?? [];
  const out = new Map<string, GeoJSON.LineString>();
  for (const r of rivers) {
    // Only the geometry is taken. The RPC also carries gauge thresholds and
    // display coordinates, and copying whole objects through is how a field
    // nobody meant to publish ends up in the ETag.
    if (r.slug && r.geometry) out.set(r.slug, r.geometry as GeoJSON.LineString);
  }
  return out;
}

const EMPTY_LINE: GeoJSON.LineString = { type: 'LineString', coordinates: [] };

export async function buildOfflineBundle(): Promise<OfflineBundle> {
  const supabase = await createClient();

  const { data: rivers, error: riversError } = await supabase
    .from('rivers')
    // `state` is read only by toRiverIndexEntry, and only to build the
    // canonical /rivers/[state]/[slug] path — which the app carries so that a
    // share sheet on a seeded river produces the same URL as one on a loaded
    // river.
    .select(
      'id, name, slug, state, length_miles, description, difficulty_rating, region, river_type',
    )
    // Sorted by slug, not by name. The ETag is a hash of this body, so row
    // order has to be a function of the data and nothing else — `name` is
    // editable and would reshuffle the payload on a copy edit.
    .eq('active', true)
    .order('slug');

  if (riversError || !rivers) {
    throw new Error(`Could not load rivers: ${riversError?.message ?? 'no rows'}`);
  }

  const [{ data: accessPoints }, { data: hazards }, { data: springs }, geometry, serviceBounds] =
    await Promise.all([
    supabase
      .from('access_points')
      .select('*')
      .eq('approved', true)
      .order('river_mile_downstream', { ascending: true }),
    supabase
      .from('river_hazards')
      .select('*')
      .eq('active', true)
      .order('river_mile_downstream', { ascending: false }),
    // Springs only. `points_of_interest` also holds caves, float camps,
    // outfitters and historical sites; each would need its own layer and its
    // own answer about what a pin there promises, and shipping them under a
    // springs field to save a query is how a payload starts lying about itself.
    supabase
      .from('points_of_interest')
      // `select('*')`, like the two queries above, rather than naming columns:
      // `position_source` arrives with migration 20260905125455 and
      // src/types/database.ts is regenerated separately, so a named select
      // fails to compile in the window between the two. `toSpring` reads the
      // column structurally and treats it as absent when it is.
      .select('*')
      .eq('type', 'spring')
      .eq('active', true)
      .order('river_mile', { ascending: true, nullsFirst: false }),
    geometryBySlug(),
    getServiceAreaBounds(),
  ]);

  // NPS campgrounds for whichever access points link to one.
  const npsIds = [
    ...new Set(
      (accessPoints ?? [])
        .map((ap) => ap.nps_campground_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  // Which of these places Eddy can read live campsite availability for. The map
  // sheet decides what to reserve room for from this, before it asks for
  // anything — see LiveAvailabilityIndex.
  const liveAvailability = await loadLiveAvailabilityIndex(supabase);

  const npsById = new Map<string, NPSCampgroundInfo>();
  if (npsIds.length > 0) {
    const { data: campgrounds } = await supabase
      .from('nps_campgrounds')
      .select('*')
      .in('id', npsIds);
    for (const cg of campgrounds ?? []) {
      npsById.set(cg.id, toNpsCampground(cg as unknown as Record<string, unknown>));
    }
  }

  // Reaches are per-river by construction — fetchRiverReaches decides whether a
  // river has any hydrologically distinct stretches worth showing at all, and
  // returns null when it does not. Fanned out rather than sequential: this
  // route is hit once an hour per edge region, but a serial loop over 25 rivers
  // would still be the slowest thing in it.
  const reachesBySlug = new Map<string, RiverReach[]>();
  await Promise.all(
    rivers.map(async (river) => {
      const riverType = ((river as { river_type?: string }).river_type ||
        'spring_fed_float') as RiverType;
      const reaches = await fetchRiverReaches(river.id, river.slug, riverType);
      if (reaches) reachesBySlug.set(river.slug, reaches);
    }),
  );

  const byRiver = <T extends { river_id: string | null }>(rows: T[] | null, riverId: string) =>
    (rows ?? []).filter((row) => row.river_id === riverId);

  return {
    v: 1,
    index: rivers.map((river) =>
      toRiverIndexEntry(
        river as unknown as RiverRow,
        // The APPROVED row count, not the length of the mapped array below:
        // toAccessPoint drops a point it cannot place, and a seeded count that
        // disagreed with /api/rivers would visibly tick up on the row the
        // moment the live list landed.
        byRiver(accessPoints, river.id).length,
      ),
    ),
    rivers: rivers.map((river) => ({
      slug: river.slug,
      river: toRiverDetail(
        river as unknown as RiverRow,
        // A river with no geometry still belongs in the bundle: its hazards and
        // put-ins are the point, and an empty LineString is what the per-river
        // route already falls back to, so the app needs no new branch.
        geometry.get(river.slug) ?? EMPTY_LINE,
      ),
      accessPoints: byRiver(accessPoints, river.id)
        .map((ap) =>
          toAccessPoint(ap as unknown as AccessPointRow, npsById, serviceBounds, liveAvailability),
        )
        .filter((ap): ap is NonNullable<typeof ap> => ap !== null),
      hazards: byRiver(hazards, river.id).map((h) => toHazard(h as unknown as HazardRow)),
      reaches: reachesBySlug.get(river.slug) ?? [],
      springs: byRiver(springs, river.id)
        .map((s) => toSpring(s as unknown as SpringRow))
        .filter((s): s is MapSpring => s !== null),
    })),
  };
}
