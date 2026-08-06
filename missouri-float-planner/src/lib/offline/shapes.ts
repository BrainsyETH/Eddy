// src/lib/offline/shapes.ts
//
// Row → wire-shape mappers shared by the per-river routes and the offline
// bundle.
//
// ── Why these are extracted rather than written twice ──────────────────────
//
// /api/offline/bundle seeds the iOS cache for all 25 rivers at once; the
// per-river routes then write through to the SAME cache key as the user opens
// rivers. So the two paths are not merely similar, they are two producers of
// one stored value. If the bundle's access point had `riverMile: null` where
// the route has `0`, a river would render one way on a cold install and
// another way after a visit, and nothing would report it — the cache holds
// whichever wrote last.
//
// Extraction makes that class of drift unrepresentable: there is one mapper,
// both callers use it, and bundle-parity.test.ts asserts they still do.
//
// Everything here is PURE — rows in, wire shape out, no Supabase client and no
// I/O — which is the whole reason it can be tested without a database.

import { calculateBounds, type GeoBounds } from '@/lib/utils/geo';
import { inBounds } from '@/lib/geo/region-bounds';
import type {
  AccessPointType,
  HazardSeverity,
  HazardType,
  NearbyService,
  NPSCampgroundInfo,
} from '@/types/api';

/** A PostGIS point as PostgREST hands it back. */
type PointGeom = { coordinates?: number[] } | null;

function coords(geom: unknown): number[] | undefined {
  return (geom as PointGeom)?.coordinates;
}

/**
 * Rows are typed structurally rather than with the generated Database types.
 *
 * The generated types carry every column plus nullability the mappers do not
 * care about, and depending on them would mean a test could not build a row
 * without importing the whole schema. These interfaces name exactly the columns
 * each mapper reads, which is also the honest documentation of what a bundle
 * query has to SELECT.
 */
export interface RiverRow {
  id: string;
  name: string;
  slug: string;
  length_miles: number | string | null;
  description: string | null;
  difficulty_rating: string | null;
  region: string | null;
}

export interface HazardRow {
  id: string;
  river_id: string | null;
  name: string;
  type: string | null;
  river_mile_downstream: number | string | null;
  description: string | null;
  severity: string | null;
  portage_required: boolean | null;
  portage_side: string | null;
  seasonal_notes: string | null;
  location: unknown;
}

export interface AccessPointRow {
  id: string;
  river_id: string | null;
  name: string;
  slug: string;
  river_mile_downstream: number | string | null;
  type: string | null;
  types: string[] | null;
  is_public: boolean | null;
  ownership: string | null;
  description: string | null;
  amenities: string[] | null;
  parking_info: string | null;
  road_access: string | null;
  facilities: string | null;
  fee_required: boolean | null;
  fee_notes: string | null;
  directions_override: string | null;
  image_urls: string[] | null;
  google_maps_url: string | null;
  location_orig: unknown;
  location_snap: unknown;
  road_surface: string[] | null;
  parking_capacity: string | null;
  managing_agency: string | null;
  official_site_url: string | null;
  local_tips: string | null;
  nearby_services: unknown;
  nps_campground_id: string | null;
}

/**
 * The river's own row plus its geometry, which arrives by a different route
 * (an RPC per river, or the bulk `geom` column) and so is passed separately.
 */
export function toRiverDetail(row: RiverRow, geometry: GeoJSON.LineString) {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    lengthMiles: row.length_miles != null ? parseFloat(String(row.length_miles)) : 0,
    description: row.description,
    difficultyRating: row.difficulty_rating,
    region: row.region,
    geometry,
    bounds: calculateBounds(geometry),
  };
}

/**
 * Note `|| 0` on the coordinates rather than dropping the hazard.
 *
 * Preserved from the route this was lifted from, deliberately: a hazard with no
 * recorded position is still a hazard, and the river screen lists it by mile
 * whether or not it can be pinned. Dropping it would be the failure-as-absence
 * bug on the surface that can least afford it.
 */
export function toHazard(row: HazardRow) {
  return {
    id: row.id,
    riverId: row.river_id ?? '',
    name: row.name,
    type: row.type as HazardType,
    riverMile:
      row.river_mile_downstream != null ? parseFloat(String(row.river_mile_downstream)) : 0,
    description: row.description,
    severity: row.severity as HazardSeverity,
    portageRequired: row.portage_required ?? false,
    portageSide: row.portage_side as 'left' | 'right' | 'either' | null,
    seasonalNotes: row.seasonal_notes,
    coordinates: {
      lng: coords(row.location)?.[0] || 0,
      lat: coords(row.location)?.[1] || 0,
    },
  };
}

/**
 * Returns null for a point that must not be drawn, which the caller filters.
 *
 * Unlike a hazard, an access point with no usable position is worse than
 * useless — it is a put-in someone would drive to. The two out-of-band cases
 * are missing coordinates and coordinates outside the service area; the second
 * exists because a hardcoded Missouri box once silently dropped every Buffalo
 * River point in Arkansas.
 */
/**
 * Which places Eddy can read live campsite availability for.
 *
 * ── Why a MAP payload carries a booking fact ─────────────────────────────
 *
 * The iOS sheet reserves room in its collapsed glance for exactly one decision
 * fact, and it has to choose which before any detail request — otherwise the
 * sheet resizes under the reader's thumb when the answer lands. For a campground
 * the fact worth reserving is availability, and for everything else it is the
 * water. So "does this place have availability at all" must be knowable from the
 * pin, which means it has to ride along with the pin.
 *
 * It matters because the answer is usually no: 42 of 166 campground pins are
 * linked to a booking system Eddy can read. Without this flag the other 124
 * spent the largest block in the peek saying they had nothing to say.
 *
 * A BOOLEAN, not the availability itself. The nights, the counts and the window
 * are a per-facility read that the detail endpoint already does well; all the
 * glance needs up front is which shape to hold.
 */
export interface LiveAvailabilityIndex {
  accessPointIds: ReadonlySet<string>;
  npsCampgroundIds: ReadonlySet<string>;
}

/** An index that claims nothing, for callers with no reason to ask. */
export const NO_LIVE_AVAILABILITY: LiveAvailabilityIndex = {
  accessPointIds: new Set(),
  npsCampgroundIds: new Set(),
};

/**
 * The enabled facilities, indexed by both of the keys they hang off.
 *
 * campsite_facilities reaches an access point two ways and needs both: directly
 * through `access_point_id`, and through `nps_campground_id` for the federal
 * sites, which is how a Missouri State Park with no NPS record still resolves.
 * See the three-legged check in the app's tabs.ts for the same reason stated
 * from the other end.
 *
 * Takes ROWS rather than a client, so this module stays what it is — pure
 * shaping, no data access, testable without a database. Each caller runs the
 * one-line query itself; it is the same select in both, and both are already
 * doing their own fetching around it.
 */
export function buildLiveAvailabilityIndex(
  rows: readonly LiveAvailabilityRow[] | null | undefined,
): LiveAvailabilityIndex {
  const accessPointIds = new Set<string>();
  const npsCampgroundIds = new Set<string>();
  for (const row of rows ?? []) {
    if (row.access_point_id) accessPointIds.add(row.access_point_id);
    if (row.nps_campground_id) npsCampgroundIds.add(row.nps_campground_id);
  }
  return { accessPointIds, npsCampgroundIds };
}

export interface LiveAvailabilityRow {
  access_point_id: string | null;
  nps_campground_id: string | null;
}

/** The select both callers run. One string, so they cannot drift. */
export const LIVE_AVAILABILITY_SELECT = 'access_point_id, nps_campground_id';

export function toAccessPoint(
  row: AccessPointRow,
  npsById: ReadonlyMap<string, NPSCampgroundInfo>,
  serviceBounds: GeoBounds,
  /**
   * Required rather than defaulted, deliberately. A caller that forgot it would
   * report "no availability anywhere", which is indistinguishable from the truth
   * for three quarters of campgrounds and would put the peek back exactly where
   * this flag was added to move it from. Pass NO_LIVE_AVAILABILITY to opt out.
   */
  liveAvailability: LiveAvailabilityIndex,
) {
  // location_orig before location_snap: the snapped coordinates are snapped to
  // simplified seed geometry and are wrong until NHD import lands.
  //
  // `||` not `??`, preserved verbatim from the route this was lifted from. The
  // two differ only for a coordinate of exactly 0, which is broken data either
  // way — but a refactor that also changes behaviour is not a refactor, and
  // this one has to be provably shape-identical.
  const lng = coords(row.location_orig)?.[0] || coords(row.location_snap)?.[0];
  const lat = coords(row.location_orig)?.[1] || coords(row.location_snap)?.[1];

  if (lng == null || lat == null) return null;
  if (!inBounds(lat, lng, serviceBounds)) return null;

  return {
    id: row.id,
    riverId: row.river_id ?? '',
    name: row.name,
    slug: row.slug,
    riverMile:
      row.river_mile_downstream != null ? parseFloat(String(row.river_mile_downstream)) : 0,
    type: row.type as AccessPointType,
    types: (row.types || (row.type ? [row.type] : [])) as AccessPointType[],
    isPublic: row.is_public ?? false,
    ownership: row.ownership,
    description: row.description,
    amenities: row.amenities || [],
    parkingInfo: row.parking_info,
    roadAccess: row.road_access,
    facilities: row.facilities,
    feeRequired: row.fee_required ?? false,
    feeNotes: row.fee_notes,
    directionsOverride: row.directions_override,
    imageUrls: row.image_urls || [],
    googleMapsUrl: row.google_maps_url,
    coordinates: { lng, lat },
    roadSurface: row.road_surface || [],
    parkingCapacity: row.parking_capacity || null,
    managingAgency: row.managing_agency || null,
    officialSiteUrl: row.official_site_url || null,
    localTips: row.local_tips || null,
    nearbyServices: (row.nearby_services as NearbyService[] | null) || [],
    npsCampground: row.nps_campground_id ? npsById.get(row.nps_campground_id) || null : null,
    // See LiveAvailabilityIndex: the map sheet needs this before it asks for
    // anything, so it travels with the pin rather than with the detail.
    hasLiveAvailability:
      liveAvailability.accessPointIds.has(row.id) ||
      (row.nps_campground_id != null &&
        liveAvailability.npsCampgroundIds.has(row.nps_campground_id)),
  };
}

/** The NPS campground row as the access point embeds it. */
export function toNpsCampground(row: Record<string, unknown>): NPSCampgroundInfo {
  const parse = (value: unknown, fallback: unknown) =>
    typeof value === 'string' ? JSON.parse(value) : value || fallback;

  const amenities = parse(row.amenities, {}) as Record<string, unknown>;
  const fees = parse(row.fees, []) as { cost?: string; description?: string; title?: string }[];
  const images = parse(row.images, []) as NPSCampgroundInfo['images'];
  const operatingHours = parse(row.operating_hours, []) as {
    description?: string;
    name?: string;
  }[];

  const count = (value: unknown) => (value as number) || 0;

  return {
    npsId: row.nps_id as string,
    name: row.name as string,
    npsUrl: row.nps_url as string,
    reservationInfo: row.reservation_info as string,
    reservationUrl: row.reservation_url as string,
    fees: fees.map((f) => ({
      cost: f.cost || '0.00',
      description: f.description || '',
      title: f.title || 'Camping Fee',
    })),
    totalSites: count(row.total_sites),
    sitesReservable: count(row.sites_reservable),
    sitesFirstCome: count(row.sites_first_come),
    sitesGroup: count(row.sites_group),
    sitesTentOnly: count(row.sites_tent_only),
    sitesElectrical: count(row.sites_electrical),
    sitesRvOnly: count(row.sites_rv_only),
    sitesWalkBoatTo: count(row.sites_walk_boat_to),
    amenities: {
      toilets: (amenities.toilets as string[]) || [],
      showers: (amenities.showers as string[]) || [],
      cellPhoneReception: (amenities.cellPhoneReception as string) || 'Unknown',
      potableWater: (amenities.potableWater as string[]) || [],
      campStore: (amenities.campStore as string) || 'No',
      firewoodForSale: (amenities.firewoodForSale as string) || 'No',
      dumpStation: (amenities.dumpStation as string) || 'No',
      trashCollection: (amenities.trashRecyclingCollection as string) || 'Unknown',
    },
    operatingHours: operatingHours.map((oh) => ({
      description: oh.description || '',
      name: oh.name || '',
    })),
    classification: row.classification as string,
    weatherOverview: row.weather_overview as string,
    images,
  } as NPSCampgroundInfo;
}
