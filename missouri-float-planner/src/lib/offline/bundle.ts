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
import type { NPSCampgroundInfo } from '@/types/api';
import {
  toAccessPoint,
  toHazard,
  toNpsCampground,
  toRiverDetail,
  type AccessPointRow,
  type HazardRow,
  type RiverRow,
} from '@/lib/offline/shapes';

export interface OfflineBundleRiver {
  slug: string;
  river: ReturnType<typeof toRiverDetail>;
  accessPoints: NonNullable<ReturnType<typeof toAccessPoint>>[];
  hazards: ReturnType<typeof toHazard>[];
  reaches: RiverReach[];
}

export interface OfflineBundle {
  /**
   * Bumped only for a change the app cannot read with its current parser.
   *
   * The cache treats a version it does not recognise as ABSENT rather than
   * migrating it, on the reasoning that the whole dataset is one request away
   * — repair is cheaper than migration. So bumping this is a deliberate act of
   * invalidating every phone's copy, not a routine version stamp.
   */
  v: 1;
  rivers: OfflineBundleRiver[];
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
    .select('id, name, slug, length_miles, description, difficulty_rating, region, river_type')
    // Sorted by slug, not by name. The ETag is a hash of this body, so row
    // order has to be a function of the data and nothing else — `name` is
    // editable and would reshuffle the payload on a copy edit.
    .eq('active', true)
    .order('slug');

  if (riversError || !rivers) {
    throw new Error(`Could not load rivers: ${riversError?.message ?? 'no rows'}`);
  }

  const [{ data: accessPoints }, { data: hazards }, geometry, serviceBounds] = await Promise.all([
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
        .map((ap) => toAccessPoint(ap as unknown as AccessPointRow, npsById, serviceBounds))
        .filter((ap): ap is NonNullable<typeof ap> => ap !== null),
      hazards: byRiver(hazards, river.id).map((h) => toHazard(h as unknown as HazardRow)),
      reaches: reachesBySlug.get(river.slug) ?? [],
    })),
  };
}
