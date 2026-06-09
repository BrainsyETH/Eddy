// src/lib/nps/sync.ts
// NPS data sync logic — transforms NPS API data and upserts into Supabase

import type { SupabaseClient } from '@supabase/supabase-js';
import type { NPSCampgroundRaw, NPSPlaceRaw, POIType } from '@/types/nps';
import { fetchNPSCampgrounds, fetchNPSPlaces } from './client';

interface SyncResult {
  campgroundsSynced: number;
  campgroundsMatched: number;
  placesSynced: number;
  poisCreated: number;
  errors: number;
  errorDetails: string[];
}

/**
 * Full NPS data sync: campgrounds + places
 */
export async function syncNPSData(supabase: SupabaseClient): Promise<SyncResult> {
  const result: SyncResult = {
    campgroundsSynced: 0,
    campgroundsMatched: 0,
    placesSynced: 0,
    poisCreated: 0,
    errors: 0,
    errorDetails: [],
  };

  // 1. Sync campgrounds
  try {
    const campgrounds = await fetchNPSCampgrounds();
    for (const cg of campgrounds) {
      try {
        await upsertCampground(supabase, cg);
        result.campgroundsSynced++;
      } catch (err) {
        result.errors++;
        result.errorDetails.push(`Campground ${cg.name}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  } catch (err) {
    result.errors++;
    result.errorDetails.push(`Campground fetch: ${err instanceof Error ? err.message : String(err)}`);
  }

  // 2. Match campgrounds to access points using geographic proximity + name
  try {
    result.campgroundsMatched = await matchCampgroundsToAccessPoints(supabase);
  } catch (err) {
    result.errors++;
    result.errorDetails.push(`Campground matching: ${err instanceof Error ? err.message : String(err)}`);
  }

  // 3. Sync places as POIs
  try {
    const places = await fetchNPSPlaces();
    for (const place of places) {
      try {
        const created = await upsertPlace(supabase, place);
        result.placesSynced++;
        if (created) result.poisCreated++;
      } catch (err) {
        result.errors++;
        result.errorDetails.push(`Place ${place.title}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    // 4. Assign rivers to POIs that don't have one
    await assignRiversToPOIs(supabase);
  } catch (err) {
    result.errors++;
    result.errorDetails.push(`Places fetch: ${err instanceof Error ? err.message : String(err)}`);
  }

  return result;
}

/**
 * Upsert a single NPS campground into nps_campgrounds table
 */
async function upsertCampground(supabase: SupabaseClient, cg: NPSCampgroundRaw): Promise<void> {
  const lat = parseFloat(cg.latitude);
  const lng = parseFloat(cg.longitude);
  const classification = cg.accessibility?.classifications?.[0] || null;

  const { error } = await supabase
    .from('nps_campgrounds')
    .upsert(
      {
        nps_id: cg.id,
        name: cg.name,
        park_code: cg.parkCode,
        description: cg.description || null,
        latitude: isNaN(lat) ? null : lat,
        longitude: isNaN(lng) ? null : lng,
        // PostGIS point via raw SQL isn't available in upsert,
        // so we'll update location separately
        reservation_info: cg.reservationInfo || null,
        reservation_url: cg.reservationUrl || null,
        nps_url: cg.url || null,
        fees: JSON.stringify(cg.fees || []),
        total_sites: parseInt(cg.campsites?.totalSites) || 0,
        sites_reservable: parseInt(cg.numberOfSitesReservable) || 0,
        sites_first_come: parseInt(cg.numberOfSitesFirstComeFirstServe) || 0,
        sites_group: parseInt(cg.campsites?.group) || 0,
        sites_tent_only: parseInt(cg.campsites?.tentOnly) || 0,
        sites_electrical: parseInt(cg.campsites?.electricalHookups) || 0,
        sites_rv_only: parseInt(cg.campsites?.rvOnly) || 0,
        sites_walk_boat_to: parseInt(cg.campsites?.walkBoatTo) || 0,
        sites_horse: parseInt(cg.campsites?.horse) || 0,
        amenities: JSON.stringify(cg.amenities || {}),
        accessibility: JSON.stringify(cg.accessibility || {}),
        operating_hours: JSON.stringify(cg.operatingHours || []),
        directions_overview: cg.directionsOverview || null,
        directions_url: cg.directionsUrl || null,
        contacts: JSON.stringify(cg.contacts || {}),
        addresses: JSON.stringify(cg.addresses || []),
        images: JSON.stringify(
          (cg.images || []).map(img => ({
            url: img.url,
            title: img.title,
            altText: img.altText,
            caption: img.caption,
            credit: img.credit,
          }))
        ),
        weather_overview: cg.weatherOverview || null,
        classification,
        regulations_overview: cg.regulationsOverview || null,
        regulations_url: cg.regulationsurl || null,
        last_synced_at: new Date().toISOString(),
        raw_data: JSON.stringify(cg),
      },
      { onConflict: 'nps_id' }
    );

  if (error) throw new Error(`Upsert failed: ${error.message}`);

  // Update PostGIS location column via RPC
  if (!isNaN(lat) && !isNaN(lng)) {
    const { error: locError } = await supabase.rpc('update_nps_campground_location', {
      p_nps_id: cg.id,
      p_lat: lat,
      p_lng: lng,
    }).single();

    // If the RPC doesn't exist yet, fall back to raw update
    if (locError) {
      await supabase
        .from('nps_campgrounds')
        .update({
          location: `SRID=4326;POINT(${lng} ${lat})`,
        })
        .eq('nps_id', cg.id);
    }
  }
}

// Places that are informational pages, not physical locations
const EXCLUDED_PLACE_TITLES = [
  'Park Videos',
  'River Levels',
  "Superintendent's Compendium",
];

/**
 * Categorize an NPS place into a POI type based on title/description
 */
function categorizePOI(title: string, bodyText: string): POIType {
  const lower = `${title} ${bodyText}`.toLowerCase();

  if (lower.includes('spring') && !lower.includes('campground')) return 'spring';
  if (lower.includes('cave')) return 'cave';
  if (lower.includes('mill') || lower.includes('hospital') || lower.includes('historic')) return 'historical_site';
  if (lower.includes('falls') || lower.includes('waterfall')) return 'waterfall';
  if (lower.includes('junction') || lower.includes('confluence') || lower.includes('view')) return 'scenic_viewpoint';
  if (lower.includes('well') || lower.includes('shut in') || lower.includes('rhyolite')) return 'geological';

  return 'other';
}

/**
 * Generate a URL-friendly slug from a title
 */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Upsert a single NPS place as a point_of_interest
 * Returns true if newly created (vs. updated)
 */
async function upsertPlace(supabase: SupabaseClient, place: NPSPlaceRaw): Promise<boolean> {
  // Skip non-physical informational pages
  if (EXCLUDED_PLACE_TITLES.includes(place.title)) return false;

  const lat = parseFloat(place.latitude);
  const lng = parseFloat(place.longitude);

  if (isNaN(lat) || isNaN(lng)) return false;

  const type = categorizePOI(place.title, place.bodyText || '');

  // Check if this is on the water (strict filter)
  // We'll initially set all physical POIs with real coords as potentially on water,
  // then refine with the river proximity check
  const isOnWater = true; // Will be refined by assignRiversToPOIs

  const images = (place.images || []).map(img => ({
    url: img.url,
    title: img.title,
    altText: img.altText,
    caption: img.caption,
    credit: img.credit,
  }));

  // Check if exists
  const { data: existing } = await supabase
    .from('points_of_interest')
    .select('id')
    .eq('nps_id', place.id)
    .maybeSingle();

  const isNew = !existing;

  const { error } = await supabase
    .from('points_of_interest')
    .upsert(
      {
        nps_id: place.id,
        name: place.title,
        slug: slugify(place.title),
        description: place.listingDescription || place.title,
        body_text: place.bodyText || null,
        type,
        source: 'nps',
        nps_url: place.url || null,
        latitude: lat,
        longitude: lng,
        images: JSON.stringify(images),
        amenities: place.amenities || [],
        tags: place.tags || [],
        active: true,
        is_on_water: isOnWater,
        last_synced_at: new Date().toISOString(),
        raw_data: JSON.stringify(place),
      },
      { onConflict: 'nps_id' }
    );

  if (error) throw new Error(`Place upsert failed: ${error.message}`);

  // Update PostGIS location
  await supabase
    .from('points_of_interest')
    .update({
      location: `SRID=4326;POINT(${lng} ${lat})`,
    })
    .eq('nps_id', place.id);

  return isNew;
}

/**
 * Match NPS campgrounds to access points by name.
 * Uses the batch_match_campgrounds_to_access_points RPC (migration 00044)
 * which strips "Campground" suffix and does ILIKE contains matching.
 * No geo filtering — coordinates on some access points are unreliable.
 *
 * Falls back to the per-campground RPC (migration 00038) if the batch
 * function doesn't exist yet.
 */
async function matchCampgroundsToAccessPoints(supabase: SupabaseClient): Promise<number> {
  // Try the batch function first (migration 00044)
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase.rpc as any)('batch_match_campgrounds_to_access_points', {
      p_max_distance_meters: 5000,
    });

    if (!error && data) {
      const matches = Array.isArray(data) ? data : [data];
      console.log(`Batch campground matching: ${matches.length} matches found`);
      for (const m of matches) {
        const dist = m.distance_meters != null ? `${Math.round(m.distance_meters)}m` : 'no coords';
        console.log(`  ${m.campground_name} → ${m.access_point_name} (${dist}, ${m.match_type})`);
      }
      return matches.length;
    }

    if (error) {
      console.warn('Batch matching RPC error, falling back to per-campground matching:', error.message);
    }
  } catch {
    // Batch function may not exist yet — fall back
  }

  // Fallback: per-campground matching via match_nps_campground_to_access_point
  const { data: campgrounds, error: fetchError } = await supabase
    .from('nps_campgrounds')
    .select('id, name, latitude, longitude')
    .not('latitude', 'is', null)
    .not('longitude', 'is', null);

  if (fetchError || !campgrounds) return 0;

  let matched = 0;

  for (const cg of campgrounds) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.rpc as any)('match_nps_campground_to_access_point', {
        p_nps_campground_id: cg.id,
        p_lat: cg.latitude,
        p_lng: cg.longitude,
        p_name: cg.name.replace(/\s+(Group\s+)?Campground$/i, ''),
        p_max_distance_meters: 5000,
      });

      if (error) {
        console.warn(`  Match failed for "${cg.name}": ${error.message}`);
      } else if (data) {
        console.log(`  Matched "${cg.name}" → access point ${data}`);
        matched++;
      }
    } catch (err) {
      console.warn(`  Match exception for "${cg.name}":`, err instanceof Error ? err.message : String(err));
    }
  }

  return matched;
}

/**
 * Assign river_id and river_mile to POIs based on geographic proximity.
 * POIs that are too far from any river get is_on_water = false.
 */
async function assignRiversToPOIs(supabase: SupabaseClient): Promise<void> {
  // Get all POIs that need river assignment
  const { data: pois, error } = await supabase
    .from('points_of_interest')
    .select('id, latitude, longitude, nps_id')
    .is('river_id', null)
    .not('latitude', 'is', null)
    .not('longitude', 'is', null);

  if (error || !pois) return;

  for (const poi of pois) {
    // Use PostGIS to find nearest river within 500m (strict "on the water" filter)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: riverMatch } = await (supabase.rpc as any)('find_nearest_river', {
      p_lat: poi.latitude,
      p_lng: poi.longitude,
      p_max_distance_meters: 500,
    });

    const nearest = riverMatch?.[0];

    if (nearest) {
      // Assign river and mark as on water
      await supabase
        .from('points_of_interest')
        .update({
          river_id: nearest.river_id,
          is_on_water: true,
          active: true,
        })
        .eq('id', poi.id);

      // Compute river_mile by projecting POI onto river line
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: mileData } = await (supabase.rpc as any)('compute_poi_river_mile', {
          p_poi_id: poi.id,
          p_river_id: nearest.river_id,
          p_lat: poi.latitude,
          p_lng: poi.longitude,
        });
        if (mileData?.[0]?.river_mile != null) {
          await supabase
            .from('points_of_interest')
            .update({ river_mile: mileData[0].river_mile })
            .eq('id', poi.id);
        }
      } catch {
        // RPC may not exist — river_mile can be computed via SQL migration instead
      }
    } else {
      // Too far from river — mark as not on water
      await supabase
        .from('points_of_interest')
        .update({
          is_on_water: false,
          active: false,
        })
        .eq('id', poi.id);
    }
  }
}
