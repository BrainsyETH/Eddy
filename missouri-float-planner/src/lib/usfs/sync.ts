// src/lib/usfs/sync.ts
// USFS data sync logic — fetches RIDB facilities near Missouri rivers
// and upserts campgrounds/recreation sites into Supabase

import type { SupabaseClient } from '@supabase/supabase-js';
import type { RIDBFacility } from '@/types/ridb';
import {
  fetchFacilitiesByProximity,
  isCampground,
  isUSFS,
  getReservationURL,
} from './ridb';

// ─────────────────────────────────────────────────────────────
// Configuration: Search points along each Missouri river
// ─────────────────────────────────────────────────────────────

// For each river we define 1-3 search points along its length.
// RIDB proximity search uses these as center points with a radius.
// Points are chosen near gauge stations or midpoints of floatable sections.
const RIVER_SEARCH_POINTS: Record<string, { lat: number; lng: number }[]> = {
  'meramec': [
    { lat: 38.2172, lng: -91.1508 },  // near Sullivan
    { lat: 38.4975, lng: -90.5697 },  // near Eureka
  ],
  'current': [
    { lat: 37.2767, lng: -91.4075 },  // near Montauk / headwaters
    { lat: 36.9936, lng: -91.0150 },  // Van Buren
    { lat: 36.6206, lng: -90.8239 },  // Doniphan
  ],
  'eleven-point': [
    { lat: 36.6528, lng: -91.3972 },  // Thomasville area
    { lat: 36.5875, lng: -91.2153 },  // near Bardley gauge
  ],
  'jacks-fork': [
    { lat: 37.1444, lng: -91.4461 },  // Mountain View area
    { lat: 37.0847, lng: -91.3569 },  // Eminence area
  ],
  'niangua': [
    { lat: 37.3178, lng: -92.5017 },  // near Hartville
  ],
  'big-piney': [
    { lat: 37.6789, lng: -92.0347 },  // near Big Piney
  ],
  'huzzah': [
    { lat: 37.9519, lng: -91.3219 },  // near Steelville
  ],
  'courtois': [
    { lat: 37.9047, lng: -91.0986 },  // near Berryman
  ],
};

// Search radius in miles from each point
const SEARCH_RADIUS_MILES = 15;

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export interface USFSSyncResult {
  facilitiesFetched: number;
  facilitiesFiltered: number;
  campgroundsSynced: number;
  campgroundsMatched: number;
  accessPointsCreated: number;
  accessPointsUpdated: number;
  errors: number;
  errorDetails: string[];
}

// ─────────────────────────────────────────────────────────────
// Main sync function
// ─────────────────────────────────────────────────────────────

/**
 * Full USFS data sync: fetch RIDB facilities near all rivers,
 * filter to USFS-managed campgrounds, and sync to database.
 */
export async function syncUSFSData(supabase: SupabaseClient): Promise<USFSSyncResult> {
  const result: USFSSyncResult = {
    facilitiesFetched: 0,
    facilitiesFiltered: 0,
    campgroundsSynced: 0,
    campgroundsMatched: 0,
    accessPointsCreated: 0,
    accessPointsUpdated: 0,
    errors: 0,
    errorDetails: [],
  };

  // 1. Build a map of river slugs to river IDs
  const { data: rivers, error: riversError } = await supabase
    .from('rivers')
    .select('id, slug, name')
    .eq('active', true);

  if (riversError || !rivers) {
    result.errors++;
    result.errorDetails.push(`Failed to fetch rivers: ${riversError?.message}`);
    return result;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const riverMap = new Map<string, { id: string; name: string }>(
    rivers.map((r: any) => [r.slug, { id: r.id, name: r.name }])
  );

  // 2. Collect unique facilities across all rivers (dedupe by FacilityID)
  const allFacilities = new Map<string, { facility: RIDBFacility; riverSlug: string }>();

  for (const [riverSlug, searchPoints] of Object.entries(RIVER_SEARCH_POINTS)) {
    if (!riverMap.has(riverSlug)) continue;

    for (const point of searchPoints) {
      try {
        const facilities = await fetchFacilitiesByProximity(
          point.lat,
          point.lng,
          SEARCH_RADIUS_MILES,
          { limit: 50 }
        );

        result.facilitiesFetched += facilities.length;

        for (const facility of facilities) {
          // Only keep USFS-managed facilities
          if (!isUSFS(facility)) continue;

          // Dedupe: keep the first river association if already seen
          if (!allFacilities.has(facility.FacilityID)) {
            allFacilities.set(facility.FacilityID, { facility, riverSlug });
            result.facilitiesFiltered++;
          }
        }
      } catch (err) {
        result.errors++;
        result.errorDetails.push(
          `Fetch ${riverSlug} (${point.lat},${point.lng}): ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }
  }

  // 3. Sync each USFS facility
  for (const [, { facility, riverSlug }] of Array.from(allFacilities)) {
    const river = riverMap.get(riverSlug);
    if (!river) continue;

    try {
      if (isCampground(facility)) {
        const syncResult = await syncCampground(supabase, facility, river.id);
        result.campgroundsSynced++;
        if (syncResult === 'created') result.accessPointsCreated++;
        if (syncResult === 'updated') result.accessPointsUpdated++;
        if (syncResult === 'matched') result.campgroundsMatched++;
      }
      // Non-campground facilities (trailheads, day use, etc.) can be
      // added here in a future phase as POIs
    } catch (err) {
      result.errors++;
      result.errorDetails.push(
        `Sync ${facility.FacilityName}: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  return result;
}

// ─────────────────────────────────────────────────────────────
// Campground sync
// ─────────────────────────────────────────────────────────────

type SyncOutcome = 'created' | 'updated' | 'matched' | 'skipped';

/**
 * Sync a single USFS campground into the database.
 *
 * Strategy:
 * 1. Check if we already have this facility (by ridb_facility_id)
 * 2. If not, check for a nearby existing access point to enrich
 * 3. If no match, create a new access point
 */
async function syncCampground(
  supabase: SupabaseClient,
  facility: RIDBFacility,
  riverId: string
): Promise<SyncOutcome> {
  const lat = facility.FacilityLatitude;
  const lng = facility.FacilityLongitude;

  if (!lat || !lng) return 'skipped';

  // Check if already synced (by ridb_facility_id)
  const { data: existing } = await supabase
    .from('access_points')
    .select('id, name, ridb_facility_id')
    .eq('ridb_facility_id', facility.FacilityID)
    .maybeSingle();

  if (existing) {
    // Update existing record with latest RIDB data
    await updateAccessPointFromRIDB(supabase, existing.id, facility);
    return 'updated';
  }

  // Check for nearby access point to match (within 2km, prefer name match)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: nearbyMatch } = await (supabase.rpc as any)('find_nearby_access_point', {
    p_lat: lat,
    p_lng: lng,
    p_name: facility.FacilityName.replace(/\s+(Campground|Recreation Area|Camp)$/i, ''),
    p_river_id: riverId,
    p_max_distance_meters: 2000,
  });

  if (nearbyMatch?.[0]?.id) {
    // Enrich existing access point with RIDB data
    await updateAccessPointFromRIDB(supabase, nearbyMatch[0].id, facility);
    return 'matched';
  }

  // Create new access point
  await createAccessPointFromRIDB(supabase, facility, riverId);
  return 'created';
}

/**
 * Create a new access point from RIDB facility data
 */
async function createAccessPointFromRIDB(
  supabase: SupabaseClient,
  facility: RIDBFacility,
  riverId: string
): Promise<void> {
  const slug = slugify(facility.FacilityName);
  const reservationUrl = getReservationURL(facility);

  const { error } = await supabase.from('access_points').insert({
    river_id: riverId,
    name: facility.FacilityName,
    slug,
    location_orig: `SRID=4326;POINT(${facility.FacilityLongitude} ${facility.FacilityLatitude})`,
    type: 'campground',
    types: ['campground'],
    is_public: true,
    ownership: 'public',
    managing_agency: 'USFS',
    description: stripHtml(facility.FacilityDescription || ''),
    fee_required: !!(facility.FacilityUseFeeDescription && facility.FacilityUseFeeDescription.trim()),
    fee_notes: facility.FacilityUseFeeDescription || null,
    official_site_url: reservationUrl,
    ridb_facility_id: facility.FacilityID,
    ridb_data: JSON.stringify({
      facilityType: facility.FacilityTypeDescription,
      activities: (facility.ACTIVITY || []).map((a) => a.ActivityName),
      addresses: facility.FACILITYADDRESS || [],
      media: (facility.MEDIA || []).map((m) => ({ url: m.URL, title: m.Title, credits: m.Credits })),
      links: (facility.LINK || []).map((l) => ({ url: l.URL, title: l.Title })),
      stayLimit: facility.StayLimit,
      reservable: facility.Reservable,
      adaAccess: facility.FacilityAdaAccess,
      lastUpdated: facility.LastUpdatedDate,
    }),
    approved: false, // New RIDB entries start unapproved for review
  });

  if (error) throw new Error(`Insert failed for ${facility.FacilityName}: ${error.message}`);

  // Snap to river centerline
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.rpc as any)('snap_access_point_by_slug', { p_slug: slug });
  } catch {
    // snap RPC may not exist — non-fatal
  }
}

/**
 * Update an existing access point with RIDB data (enrichment)
 */
async function updateAccessPointFromRIDB(
  supabase: SupabaseClient,
  accessPointId: string,
  facility: RIDBFacility
): Promise<void> {
  const reservationUrl = getReservationURL(facility);

  const updates: Record<string, unknown> = {
    ridb_facility_id: facility.FacilityID,
    managing_agency: 'USFS',
    ridb_data: JSON.stringify({
      facilityType: facility.FacilityTypeDescription,
      activities: (facility.ACTIVITY || []).map((a) => a.ActivityName),
      addresses: facility.FACILITYADDRESS || [],
      media: (facility.MEDIA || []).map((m) => ({ url: m.URL, title: m.Title, credits: m.Credits })),
      links: (facility.LINK || []).map((l) => ({ url: l.URL, title: l.Title })),
      stayLimit: facility.StayLimit,
      reservable: facility.Reservable,
      adaAccess: facility.FacilityAdaAccess,
      lastUpdated: facility.LastUpdatedDate,
    }),
  };

  // Only set these if not already populated (don't overwrite curated data)
  if (reservationUrl) {
    updates.official_site_url = reservationUrl;
  }

  if (facility.FacilityUseFeeDescription?.trim()) {
    updates.fee_required = true;
    updates.fee_notes = facility.FacilityUseFeeDescription;
  }

  if (facility.FacilityDescription?.trim()) {
    // Only update description if current one is empty
    const { data: current } = await supabase
      .from('access_points')
      .select('description')
      .eq('id', accessPointId)
      .single();

    if (!current?.description) {
      updates.description = stripHtml(facility.FacilityDescription);
    }
  }

  const { error } = await supabase
    .from('access_points')
    .update(updates)
    .eq('id', accessPointId);

  if (error) throw new Error(`Update failed: ${error.message}`);
}

// ─────────────────────────────────────────────────────────────
// Utilities
// ─────────────────────────────────────────────────────────────

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '').trim();
}
