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

// Search radius in miles from each gauge station
const SEARCH_RADIUS_MILES = 15;

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
  outcome?: string;
}

export interface USFSSyncResult {
  facilitiesFetched: number;
  facilitiesFiltered: number;
  campgroundsSynced: number;
  campgroundsMatched: number;
  accessPointsCreated: number;
  accessPointsUpdated: number;
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
// Main sync function
// ─────────────────────────────────────────────────────────────

/**
 * Full USFS data sync: fetch RIDB facilities near all rivers,
 * filter to USFS-managed campgrounds, and sync to database.
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
    campgroundsSynced: 0,
    campgroundsMatched: 0,
    accessPointsCreated: 0,
    accessPointsUpdated: 0,
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

  // 4. Process each USFS facility
  for (const [, { facility, riverSlug }] of Array.from(allFacilities)) {
    const river = riverMap.get(riverSlug);
    if (!river) continue;

    const facilityInfo: USFSSyncFacility = {
      facilityId: facility.FacilityID,
      name: facility.FacilityName,
      type: facility.FacilityTypeDescription || 'Unknown',
      lat: facility.FacilityLatitude,
      lng: facility.FacilityLongitude,
      isCampground: isCampground(facility),
      isUSFS: true,
      reservable: facility.Reservable,
      feeDescription: facility.FacilityUseFeeDescription || '',
      description: stripHtml(facility.FacilityDescription || '').substring(0, 200),
      reservationUrl: getReservationURL(facility),
      activities: (facility.ACTIVITY || []).map((a) => a.ActivityName),
      nearestRiver: river.name,
    };

    if (!isCampground(facility)) {
      facilityInfo.outcome = 'skipped (not campground)';
      result.facilities.push(facilityInfo);
      continue;
    }

    if (dryRun) {
      facilityInfo.outcome = 'dry run — would sync';
      result.campgroundsSynced++;
      result.facilities.push(facilityInfo);
      continue;
    }

    try {
      const syncOutcome = await syncCampground(supabase, facility, river.id);
      result.campgroundsSynced++;
      facilityInfo.outcome = syncOutcome;
      if (syncOutcome === 'created') result.accessPointsCreated++;
      if (syncOutcome === 'updated') result.accessPointsUpdated++;
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
// Campground sync
// ─────────────────────────────────────────────────────────────

type SyncOutcome = 'created' | 'updated' | 'matched' | 'skipped';

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
    await updateAccessPointFromRIDB(supabase, nearbyMatch[0].id, facility);
    return 'matched';
  }

  await createAccessPointFromRIDB(supabase, facility, riverId);
  return 'created';
}

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
    approved: false,
  });

  if (error) throw new Error(`Insert failed for ${facility.FacilityName}: ${error.message}`);

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.rpc as any)('snap_access_point_by_slug', { p_slug: slug });
  } catch {
    // snap RPC may not exist — non-fatal
  }
}

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

  if (reservationUrl) {
    updates.official_site_url = reservationUrl;
  }

  if (facility.FacilityUseFeeDescription?.trim()) {
    updates.fee_required = true;
    updates.fee_notes = facility.FacilityUseFeeDescription;
  }

  if (facility.FacilityDescription?.trim()) {
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
