// src/lib/usfs/sync.ts
// USFS data sync logic — fetches RIDB facilities near Missouri rivers
// and upserts campgrounds as pending POIs in Supabase.
// Admins can then review and optionally promote to access points.
//
// Key improvement: Uses PostGIS river geometry (find_nearest_river RPC)
// to post-filter RIDB results, ensuring only facilities actually near
// a river are synced. Search radius tightened to 5 miles, then verified
// against river geometry within 1.5km.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { RIDBFacility } from '@/types/ridb';
import {
  fetchFacilitiesByProximity,
  isCampground,
  isUSFS,
  getReservationURL,
} from './ridb';

// Search radius in miles from each gauge station (tightened from 15)
const SEARCH_RADIUS_MILES = 5;

// Max distance from river geometry (meters) to accept a facility.
// 1500m ≈ ~1 mile — generous enough for campgrounds with river access
// but filters out facilities that happen to be in the same county.
const RIVER_PROXIMITY_METERS = 1500;

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export interface USFSSyncFacility {
  facilityId: string;
  name: string;
  type: string;
  lat: number;
  lng: number;
  isCampground: boolean;
  isUSFS: boolean;
  reservable: boolean;
  feeDescription: string;
  description: string;
  reservationUrl: string | null;
  activities: string[];
  nearestRiver: string;
  distanceFromRiverMeters: number | null;
  outcome?: string;
}

export interface USFSSyncResult {
  facilitiesFetched: number;
  facilitiesFiltered: number;
  facilitiesNearRiver: number;
  campgroundsSynced: number;
  campgroundsMatched: number;
  poisCreated: number;
  poisUpdated: number;
  errors: number;
  errorDetails: string[];
  facilities: USFSSyncFacility[];
}

// ─────────────────────────────────────────────────────────────
// Search point resolution (from database, not hardcoded)
// ─────────────────────────────────────────────────────────────

interface SearchPoint {
  lat: number;
  lng: number;
  riverSlug: string;
  source: string;
}

/**
 * Build search points from actual gauge station locations in the database.
 * No hardcoded coordinates — everything comes from the DB.
 */
async function getSearchPointsFromDB(supabase: SupabaseClient): Promise<SearchPoint[]> {
  const points: SearchPoint[] = [];

  // Fetch gauge stations joined to rivers via river_gauges
  const { data: gauges, error } = await supabase
    .from('river_gauges')
    .select(`
      gauge_station_id,
      rivers!inner ( slug, name, active ),
      gauge_stations!inner ( usgs_site_id, name, location )
    `);

  if (error || !gauges) {
    throw new Error(`Failed to fetch gauge stations: ${error?.message}`);
  }

  for (const row of gauges) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const river = row.rivers as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const station = row.gauge_stations as any;

    if (!river?.active) continue;

    // Extract coordinates from PostGIS geography point
    const coords = extractCoords(station?.location);
    if (!coords) continue;

    points.push({
      lat: coords.lat,
      lng: coords.lng,
      riverSlug: river.slug,
      source: station.name || station.usgs_site_id,
    });
  }

  return points;
}

/**
 * Extract lat/lng from a PostGIS geography column.
 * Supabase can return this as GeoJSON object or WKT string.
 */
function extractCoords(location: unknown): { lat: number; lng: number } | null {
  if (!location) return null;

  // GeoJSON format: { type: "Point", coordinates: [lng, lat] }
  if (typeof location === 'object' && location !== null) {
    const geo = location as { type?: string; coordinates?: number[] };
    if (geo.type === 'Point' && Array.isArray(geo.coordinates) && geo.coordinates.length >= 2) {
      return { lng: geo.coordinates[0], lat: geo.coordinates[1] };
    }
  }

  // WKT/EWKT format: "SRID=4326;POINT(-91.0150 36.9936)" or "POINT(-91.0150 36.9936)"
  if (typeof location === 'string') {
    const match = location.match(/POINT\s*\(\s*([-\d.]+)\s+([-\d.]+)\s*\)/i);
    if (match) {
      return { lng: parseFloat(match[1]), lat: parseFloat(match[2]) };
    }
  }

  return null;
}

// ─────────────────────────────────────────────────────────────
// River proximity check via PostGIS
// ─────────────────────────────────────────────────────────────

interface RiverProximityResult {
  nearRiver: boolean;
  riverId?: string;
  riverName?: string;
  distanceMeters?: number;
}

/**
 * Check if a point is near any active river's geometry using PostGIS.
 * Uses the find_nearest_river() RPC (migration 00038) which does
 * ST_DWithin on river geometries.
 */
async function checkRiverProximity(
  supabase: SupabaseClient,
  lat: number,
  lng: number,
  maxDistanceMeters: number = RIVER_PROXIMITY_METERS
): Promise<RiverProximityResult> {
  try {
    const { data, error } = await supabase.rpc('find_nearest_river', {
      p_lat: lat,
      p_lng: lng,
      p_max_distance_meters: maxDistanceMeters,
    });

    if (error || !data || data.length === 0) {
      return { nearRiver: false };
    }

    return {
      nearRiver: true,
      riverId: data[0].river_id,
      riverName: data[0].river_name,
      distanceMeters: data[0].distance_meters,
    };
  } catch {
    // RPC not available — skip proximity check
    return { nearRiver: false };
  }
}

// ─────────────────────────────────────────────────────────────
// Main sync function
// ─────────────────────────────────────────────────────────────

/**
 * Full USFS data sync: fetch RIDB facilities near all rivers,
 * filter to USFS-managed campgrounds that are within 1.5km of
 * actual river geometry, and sync as pending POIs.
 * Items are created with active=false so admins can review them.
 *
 * @param dryRun If true, fetches and filters but does not write to DB
 */
export async function syncUSFSData(
  supabase: SupabaseClient,
  options?: { dryRun?: boolean }
): Promise<USFSSyncResult> {
  const dryRun = options?.dryRun ?? false;

  const result: USFSSyncResult = {
    facilitiesFetched: 0,
    facilitiesFiltered: 0,
    facilitiesNearRiver: 0,
    campgroundsSynced: 0,
    campgroundsMatched: 0,
    poisCreated: 0,
    poisUpdated: 0,
    errors: 0,
    errorDetails: [],
    facilities: [],
  };

  // 1. Get rivers
  const { data: rivers, error: riversError } = await supabase
    .from('rivers')
    .select('id, slug, name')
    .eq('active', true);

  if (riversError || !rivers) {
    result.errors++;
    result.errorDetails.push(`Failed to fetch rivers: ${riversError?.message}`);
    return result;
  }

  const riverMap = new Map<string, { id: string; name: string }>(
    rivers.map((r: { slug: string; id: string; name: string }) => [r.slug, { id: r.id, name: r.name }])
  );

  // Build river ID to name map for proximity results
  const riverIdMap = new Map<string, string>(
    rivers.map((r: { id: string; name: string }) => [r.id, r.name])
  );

  // 2. Get search points from actual gauge station locations
  let searchPoints: SearchPoint[];
  try {
    searchPoints = await getSearchPointsFromDB(supabase);
  } catch (err) {
    result.errors++;
    result.errorDetails.push(err instanceof Error ? err.message : String(err));
    return result;
  }

  if (searchPoints.length === 0) {
    result.errors++;
    result.errorDetails.push('No gauge stations found in database — nothing to search');
    return result;
  }

  // 3. Collect unique facilities across all search points (dedupe by FacilityID)
  const allFacilities = new Map<string, { facility: RIDBFacility; riverSlug: string }>();

  for (const point of searchPoints) {
    if (!riverMap.has(point.riverSlug)) continue;

    try {
      const facilities = await fetchFacilitiesByProximity(
        point.lat,
        point.lng,
        SEARCH_RADIUS_MILES,
        { limit: 50 }
      );

      result.facilitiesFetched += facilities.length;

      for (const facility of facilities) {
        if (!isUSFS(facility)) continue;

        if (!allFacilities.has(facility.FacilityID)) {
          allFacilities.set(facility.FacilityID, { facility, riverSlug: point.riverSlug });
          result.facilitiesFiltered++;
        }
      }
    } catch (err) {
      result.errors++;
      result.errorDetails.push(
        `Fetch near ${point.source} (${point.lat.toFixed(4)},${point.lng.toFixed(4)}): ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  // 4. Post-filter: check each facility against actual river geometry
  for (const [, { facility, riverSlug }] of Array.from(allFacilities)) {
    const fallbackRiver = riverMap.get(riverSlug);
    if (!fallbackRiver) continue;

    const lat = facility.FacilityLatitude;
    const lng = facility.FacilityLongitude;

    // Check proximity to actual river geometry via PostGIS
    const proximity = await checkRiverProximity(supabase, lat, lng, RIVER_PROXIMITY_METERS);

    // Use the actual nearest river from PostGIS if available, otherwise fall back
    const actualRiverId = proximity.nearRiver ? proximity.riverId! : fallbackRiver.id;
    const actualRiverName = proximity.nearRiver
      ? (riverIdMap.get(proximity.riverId!) || proximity.riverName || fallbackRiver.name)
      : fallbackRiver.name;

    const facilityInfo: USFSSyncFacility = {
      facilityId: facility.FacilityID,
      name: facility.FacilityName,
      type: facility.FacilityTypeDescription || 'Unknown',
      lat,
      lng,
      isCampground: isCampground(facility),
      isUSFS: true,
      reservable: facility.Reservable,
      feeDescription: facility.FacilityUseFeeDescription || '',
      description: stripHtml(facility.FacilityDescription || '').substring(0, 200),
      reservationUrl: getReservationURL(facility),
      activities: (facility.ACTIVITY || []).map((a) => a.ActivityName),
      nearestRiver: actualRiverName,
      distanceFromRiverMeters: proximity.distanceMeters ?? null,
    };

    // Skip facilities not near any river geometry
    if (!proximity.nearRiver) {
      facilityInfo.outcome = `skipped (${RIVER_PROXIMITY_METERS}m+ from river geometry)`;
      result.facilities.push(facilityInfo);
      continue;
    }

    result.facilitiesNearRiver++;

    if (!isCampground(facility)) {
      facilityInfo.outcome = `skipped (not campground, ${Math.round(proximity.distanceMeters!)}m from ${actualRiverName})`;
      result.facilities.push(facilityInfo);
      continue;
    }

    if (dryRun) {
      facilityInfo.outcome = `dry run — would sync (${Math.round(proximity.distanceMeters!)}m from ${actualRiverName})`;
      result.campgroundsSynced++;
      result.facilities.push(facilityInfo);
      continue;
    }

    try {
      const syncOutcome = await syncCampgroundAsPOI(supabase, facility, actualRiverId);
      result.campgroundsSynced++;
      facilityInfo.outcome = syncOutcome;
      if (syncOutcome === 'created') result.poisCreated++;
      if (syncOutcome === 'updated') result.poisUpdated++;
      if (syncOutcome === 'matched') result.campgroundsMatched++;
    } catch (err) {
      result.errors++;
      facilityInfo.outcome = `error: ${err instanceof Error ? err.message : String(err)}`;
      result.errorDetails.push(`Sync ${facility.FacilityName}: ${err instanceof Error ? err.message : String(err)}`);
    }

    result.facilities.push(facilityInfo);
  }

  return result;
}

// ─────────────────────────────────────────────────────────────
// Campground → POI sync (pending review)
// ─────────────────────────────────────────────────────────────

type SyncOutcome = 'created' | 'updated' | 'matched' | 'skipped';

async function syncCampgroundAsPOI(
  supabase: SupabaseClient,
  facility: RIDBFacility,
  riverId: string
): Promise<SyncOutcome> {
  const lat = facility.FacilityLatitude;
  const lng = facility.FacilityLongitude;

  if (!lat || !lng) return 'skipped';

  // Check if already synced — try ridb_facility_id first, fall back to slug match
  let existing: { id: string } | null = null;

  // Try ridb_facility_id column (requires migration 00047)
  const { data: ridbMatch, error: ridbError } = await supabase
    .from('points_of_interest')
    .select('id, name')
    .eq('ridb_facility_id', facility.FacilityID)
    .maybeSingle();

  if (!ridbError) {
    existing = ridbMatch;
  }
  // If ridbError, column probably doesn't exist — fall through to slug match

  // Fallback: match by slug + source
  if (!existing) {
    const slug = slugify(facility.FacilityName);
    const { data } = await supabase
      .from('points_of_interest')
      .select('id, name')
      .eq('slug', slug)
      .eq('source', 'ridb')
      .maybeSingle();
    existing = data;
  }

  if (existing) {
    await updatePOIFromRIDB(supabase, existing.id, facility);
    return 'updated';
  }

  // Check for nearby POI to match (within 2km, prefer name match)
  // Uses find_nearby_poi RPC from migration 00047, falls back to find_nearest_river
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: nearbyMatch } = await (supabase.rpc as any)('find_nearby_poi', {
      p_lat: lat,
      p_lng: lng,
      p_name: facility.FacilityName.replace(/\s+(Campground|Recreation Area|Camp)$/i, ''),
      p_river_id: riverId,
      p_max_distance_meters: 2000,
    });

    if (nearbyMatch?.[0]?.id) {
      await updatePOIFromRIDB(supabase, nearbyMatch[0].id, facility);
      return 'matched';
    }
  } catch {
    // find_nearby_poi RPC not available (migration 00047 not applied) — skip proximity match
  }

  await createPOIFromRIDB(supabase, facility, riverId);
  return 'created';
}

async function createPOIFromRIDB(
  supabase: SupabaseClient,
  facility: RIDBFacility,
  riverId: string
): Promise<void> {
  const slug = slugify(facility.FacilityName);
  const reservationUrl = getReservationURL(facility);

  const ridbMetadata = {
    facilityId: facility.FacilityID,
    facilityType: facility.FacilityTypeDescription,
    activities: (facility.ACTIVITY || []).map((a) => a.ActivityName),
    addresses: facility.FACILITYADDRESS || [],
    media: (facility.MEDIA || []).map((m) => ({ url: m.URL, title: m.Title, credits: m.Credits })),
    links: (facility.LINK || []).map((l) => ({ url: l.URL, title: l.Title })),
    stayLimit: facility.StayLimit,
    reservable: facility.Reservable,
    adaAccess: facility.FacilityAdaAccess,
    feeDescription: facility.FacilityUseFeeDescription || null,
    reservationUrl,
    managingAgency: 'USFS',
    lastUpdated: facility.LastUpdatedDate,
  };

  // Try with migration 00047 columns first, fall back to base columns
  const fullInsert = {
    river_id: riverId,
    name: facility.FacilityName,
    slug,
    description: stripHtml(facility.FacilityDescription || ''),
    type: 'campground',
    source: 'ridb',
    latitude: facility.FacilityLatitude,
    longitude: facility.FacilityLongitude,
    location: `SRID=4326;POINT(${facility.FacilityLongitude} ${facility.FacilityLatitude})`,
    managing_agency: 'USFS',
    reservation_url: reservationUrl,
    fee_description: facility.FacilityUseFeeDescription || null,
    ridb_facility_id: facility.FacilityID,
    ridb_data: JSON.stringify(ridbMetadata),
    is_on_water: true,
    active: false,
  };

  const { error } = await supabase.from('points_of_interest').insert(fullInsert);

  if (error && error.message?.includes('Could not find')) {
    // Migration 00047 not applied yet — use base POI columns only
    const baseInsert = {
      river_id: riverId,
      name: facility.FacilityName,
      slug,
      description: stripHtml(facility.FacilityDescription || ''),
      type: 'campground',
      source: 'ridb',
      latitude: facility.FacilityLatitude,
      longitude: facility.FacilityLongitude,
      location: `SRID=4326;POINT(${facility.FacilityLongitude} ${facility.FacilityLatitude})`,
      nps_url: reservationUrl, // Repurpose nps_url for reservation link
      raw_data: JSON.stringify(ridbMetadata), // Store RIDB data in existing raw_data column
      is_on_water: true,
      active: false,
    };

    const { error: fallbackError } = await supabase.from('points_of_interest').insert(baseInsert);
    if (fallbackError) throw new Error(`Insert POI failed for ${facility.FacilityName}: ${fallbackError.message}`);
    return;
  }

  if (error) throw new Error(`Insert POI failed for ${facility.FacilityName}: ${error.message}`);
}

async function updatePOIFromRIDB(
  supabase: SupabaseClient,
  poiId: string,
  facility: RIDBFacility
): Promise<void> {
  const reservationUrl = getReservationURL(facility);

  const ridbMetadata = {
    facilityId: facility.FacilityID,
    facilityType: facility.FacilityTypeDescription,
    activities: (facility.ACTIVITY || []).map((a) => a.ActivityName),
    addresses: facility.FACILITYADDRESS || [],
    media: (facility.MEDIA || []).map((m) => ({ url: m.URL, title: m.Title, credits: m.Credits })),
    links: (facility.LINK || []).map((l) => ({ url: l.URL, title: l.Title })),
    stayLimit: facility.StayLimit,
    reservable: facility.Reservable,
    adaAccess: facility.FacilityAdaAccess,
    feeDescription: facility.FacilityUseFeeDescription || null,
    reservationUrl,
    managingAgency: 'USFS',
    lastUpdated: facility.LastUpdatedDate,
  };

  // Try full update with migration 00047 columns
  const fullUpdates: Record<string, unknown> = {
    ridb_facility_id: facility.FacilityID,
    managing_agency: 'USFS',
    ridb_data: JSON.stringify(ridbMetadata),
    last_synced_at: new Date().toISOString(),
  };

  if (reservationUrl) fullUpdates.reservation_url = reservationUrl;
  if (facility.FacilityUseFeeDescription?.trim()) {
    fullUpdates.fee_description = facility.FacilityUseFeeDescription;
  }

  if (facility.FacilityDescription?.trim()) {
    const { data: current } = await supabase
      .from('points_of_interest')
      .select('description')
      .eq('id', poiId)
      .single();

    if (!current?.description) {
      fullUpdates.description = stripHtml(facility.FacilityDescription);
    }
  }

  const { error } = await supabase
    .from('points_of_interest')
    .update(fullUpdates)
    .eq('id', poiId);

  if (error && error.message?.includes('Could not find')) {
    // Migration 00047 not applied — use base columns only
    const baseUpdates: Record<string, unknown> = {
      raw_data: JSON.stringify(ridbMetadata),
      last_synced_at: new Date().toISOString(),
    };
    if (reservationUrl) baseUpdates.nps_url = reservationUrl;
    if (fullUpdates.description) baseUpdates.description = fullUpdates.description;

    const { error: fallbackError } = await supabase
      .from('points_of_interest')
      .update(baseUpdates)
      .eq('id', poiId);

    if (fallbackError) throw new Error(`Update POI failed: ${fallbackError.message}`);
    return;
  }

  if (error) throw new Error(`Update POI failed: ${error.message}`);
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
