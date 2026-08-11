// src/lib/access-points/detail.ts
// Shared access-point-detail data loader. Extracted from the API route so both
// the /api/rivers/[slug]/access/[accessSlug] handler and the server-rendered
// access-point page can build the same payload from one code path — the page
// renders its content on the server (crawlable, no client fetch waterfall).

import type { createClient } from '@/lib/supabase/server';
import { computeCondition, getConditionShortLabel, type ConditionThresholds } from '@/lib/conditions';
import { riverAccessPath } from '@/lib/navigation/river-path';
import type {
  AccessPointDetail,
  AccessPointType,
  AccessPointDetailResponse,
  NearbyAccessPoint,
  AccessPointGaugeStatus,
  NPSCampgroundInfo,
  CampsiteAvailabilityInfo,
  RoadSurface,
  ManagingAgency,
  ParkingCapacity,
  NearbyService,
  BookingLinkInfo,
} from '@/types/api';
import { loadAvailability } from '@/lib/camping/read';
import { bookingUrlFor, loadBookingLink } from '@/lib/camping/booking';

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type AccessPointDetailResult =
  | { ok: true; data: AccessPointDetailResponse }
  | { ok: false; reason: 'river-not-found' | 'not-found' | 'invalid-coords' };

/**
 * Load full access-point detail (access point + nearby points + gauge status)
 * for a given river/access slug. Returns a discriminated result so callers can
 * map failures to a 404 (API) or notFound() (page) as appropriate.
 */
export async function getAccessPointDetail(
  supabase: SupabaseServerClient,
  riverSlug: string,
  accessSlug: string,
): Promise<AccessPointDetailResult> {
  // Get river info
  // `state` is selected only to build the canonical path below — the /rivers
  // hierarchy is state-segmented and nothing else in this payload carries it.
  const { data: river, error: riverError } = await supabase
    .from('rivers')
    .select('id, name, slug, state')
    .eq('slug', riverSlug)
    .single();

  if (riverError || !river) {
    return { ok: false, reason: 'river-not-found' };
  }

  // Get access point with all detail fields
  const { data: ap, error: apError } = await supabase
    .from('access_points')
    .select('*')
    .eq('river_id', river.id)
    .eq('slug', accessSlug)
    .eq('approved', true)
    .single();

  if (apError || !ap) {
    return { ok: false, reason: 'not-found' };
  }

  // Extract coordinates
  const lng =
    (ap.location_orig as { coordinates?: number[] } | null)?.coordinates?.[0] ||
    (ap.location_snap as { coordinates?: number[] } | null)?.coordinates?.[0];
  const lat =
    (ap.location_orig as { coordinates?: number[] } | null)?.coordinates?.[1] ||
    (ap.location_snap as { coordinates?: number[] } | null)?.coordinates?.[1];

  if (!lng || !lat) {
    return { ok: false, reason: 'invalid-coords' };
  }

  // Get nearby access points (upstream and downstream)
  const { data: allAccessPoints } = await supabase
    .from('access_points')
    .select('id, name, slug, river_mile_downstream')
    .eq('river_id', river.id)
    .eq('approved', true)
    .order('river_mile_downstream', { ascending: true });

  const currentMile = ap.river_mile_downstream != null ? parseFloat(String(ap.river_mile_downstream)) : 0;

  const nearbyAccessPoints: NearbyAccessPoint[] = [];

  if (allAccessPoints) {
    // Find upstream (lower river mile = closer to headwaters)
    const upstream = allAccessPoints
      .filter(
        (p) =>
          p.id !== ap.id &&
          p.river_mile_downstream != null &&
          parseFloat(String(p.river_mile_downstream)) < currentMile
      )
      .sort(
        (a, b) =>
          (b.river_mile_downstream != null ? parseFloat(String(b.river_mile_downstream)) : 0) -
          (a.river_mile_downstream != null ? parseFloat(String(a.river_mile_downstream)) : 0)
      )[0];

    // Find downstream (higher river mile = further from headwaters)
    const downstream = allAccessPoints
      .filter(
        (p) =>
          p.id !== ap.id &&
          p.river_mile_downstream != null &&
          parseFloat(String(p.river_mile_downstream)) > currentMile
      )
      .sort(
        (a, b) =>
          (a.river_mile_downstream != null ? parseFloat(String(a.river_mile_downstream)) : 0) -
          (b.river_mile_downstream != null ? parseFloat(String(b.river_mile_downstream)) : 0)
      )[0];

    if (upstream) {
      const distance = currentMile - (upstream.river_mile_downstream != null ? parseFloat(String(upstream.river_mile_downstream)) : 0);
      nearbyAccessPoints.push({
        id: upstream.id,
        name: upstream.name,
        slug: upstream.slug,
        direction: 'upstream',
        distanceMiles: Math.round(distance * 10) / 10,
        estimatedFloatTime: estimateFloatTime(distance),
        riverMile: upstream.river_mile_downstream != null ? parseFloat(String(upstream.river_mile_downstream)) : 0,
      });
    }

    if (downstream) {
      const distance = (downstream.river_mile_downstream != null ? parseFloat(String(downstream.river_mile_downstream)) : 0) - currentMile;
      nearbyAccessPoints.push({
        id: downstream.id,
        name: downstream.name,
        slug: downstream.slug,
        direction: 'downstream',
        distanceMiles: Math.round(distance * 10) / 10,
        estimatedFloatTime: estimateFloatTime(distance),
        riverMile: downstream.river_mile_downstream != null ? parseFloat(String(downstream.river_mile_downstream)) : 0,
      });
    }
  }

  // Get gauge status for this river (using access point's river mile for segment-aware selection)
  const gaugeStatus = await getGaugeStatus(supabase, river.id, currentMile);

  // ── Availability, by whichever name this place goes under ────────────────
  //
  // Read once and shared by the nested copy and the sibling below.
  //
  // Two lookups because Eddy stores the same campground twice. Alley Spring is
  // an access point with an nps_campgrounds row; Meramec is an access point
  // whose campsite_facilities row hangs off nearby_services instead, and for
  // want of this first lookup its Camping tab rendered static rows while the
  // database held 68 of its 197 sites open.
  //
  // The access-point id wins where both resolve: it is the row the map pin came
  // from, so it is the place the reader actually tapped.
  //
  // Gated on being a campground at all — `types` carries the tag and an
  // nps_campground_id is the other way in — so a plain put-in still costs
  // nothing, which is the condition that used to be spelled `nps_campground_id`
  // alone.
  const campgroundish =
    ap.nps_campground_id != null ||
    (Array.isArray(ap.types) && (ap.types as string[]).includes('campground'));

  let npsCampground: NPSCampgroundInfo | null = null;
  let availability: CampsiteAvailabilityInfo | null = null;
  // ── The booking link is read on its own clock ────────────────────────────
  //
  // Same facility row as availability, deliberately not the same read: see the
  // header of camping/booking.ts. Availability going null because a sync ran
  // late is not a reason to stop telling somebody where to book, and folding
  // the two would have tied the button to the freshness of scraped nights.
  //
  // Concurrent because neither answer depends on the other, and gated on the
  // same `campgroundish` test, so an ordinary put-in still costs nothing.
  let booking: BookingLinkInfo | null = null;

  if (campgroundish) {
    const [index, bookingLink] = await Promise.all([
      loadAvailability(supabase),
      loadBookingLink(supabase, ap.id),
    ]);
    availability =
      index.byAccessPointId.get(ap.id) ??
      (ap.nps_campground_id ? (index.byNpsCampgroundId.get(ap.nps_campground_id) ?? null) : null);
    booking = bookingLink;
  }
  if (ap.nps_campground_id) {
    npsCampground = await getNPSCampgroundInfo(supabase, ap.nps_campground_id, availability);
  }

  // Format the access point detail
  const accessPoint: AccessPointDetail = {
    id: ap.id,
    riverId: ap.river_id ?? '',
    name: ap.name,
    slug: ap.slug,
    riverMile: currentMile,
    type: ap.type as AccessPointType,
    types: (ap.types || (ap.type ? [ap.type] : [])) as AccessPointType[],
    isPublic: ap.is_public ?? false,
    ownership: ap.ownership,
    description: ap.description,
    amenities: ap.amenities || [],
    parkingInfo: ap.parking_info,
    roadAccess: ap.road_access,
    facilities: ap.facilities,
    feeRequired: ap.fee_required ?? false,
    feeNotes: ap.fee_notes,
    directionsOverride: ap.directions_override,
    imageUrls: ap.image_urls || [],
    googleMapsUrl: ap.google_maps_url,
    coordinates: { lng, lat },
    // New detail fields
    roadSurface: (ap.road_surface as RoadSurface[]) || [],
    parkingCapacity: ap.parking_capacity as ParkingCapacity | null,
    managingAgency: ap.managing_agency as ManagingAgency | null,
    officialSiteUrl: ap.official_site_url,
    localTips: ap.local_tips,
    nearbyServices: (ap.nearby_services as unknown as NearbyService[]) || [],
    drivingLat: ap.driving_lat != null ? parseFloat(String(ap.driving_lat)) : null,
    drivingLng: ap.driving_lng != null ? parseFloat(String(ap.driving_lng)) : null,
    // 'MO' is the same fallback getRivers uses for a row with no state, so a
    // river missing one still gets a path that resolves rather than a broken
    // /rivers/undefined/... link.
    path: riverAccessPath(river.state || 'MO', river.slug, ap.slug),
    river: {
      id: river.id,
      name: river.name,
      slug: river.slug,
    },
    npsCampground,
    // The sibling. Same object as npsCampground.availability today, and the
    // only field a non-NPS campground could ever fill — see the type.
    availability,
    // The other sibling, and the only route by which a campground with no
    // nps_campgrounds row can offer a booking at all: its reservation URL
    // lives on the directory row, which nothing but campsite_facilities links
    // to the access point.
    booking,
  };

  return {
    ok: true,
    data: { accessPoint, nearbyAccessPoints, gaugeStatus },
  };
}

// Helper to estimate float time based on distance
function estimateFloatTime(miles: number): string | null {
  if (miles <= 0) return null;
  // Assume average 2 mph float speed
  const hours = miles / 2;
  if (hours < 1) {
    return `~${Math.round(hours * 60)} min`;
  }
  return `~${Math.round(hours * 10) / 10} hr`;
}

// Helper to get gauge status for the river (segment-aware based on access point river mile)
async function getGaugeStatus(
  supabase: SupabaseServerClient,
  riverId: string,
  accessPointRiverMile: number
): Promise<AccessPointGaugeStatus | null> {
  try {
    // First, try to find the nearest gauge at or upstream of the access point
    // (largest river_mile that is <= access point's river mile)
    let riverGauge = null;

    if (accessPointRiverMile > 0) {
      const { data: nearestGauge } = await supabase
        .from('river_gauges')
        .select(
          `
          gauge_station_id,
          is_primary,
          river_mile,
          threshold_unit,
          level_too_low,
          level_low,
          level_optimal_min,
          level_optimal_max,
          level_high,
          level_dangerous,
          gauge_stations (
            id,
            usgs_site_id,
            name
          )
        `
        )
        .eq('river_id', riverId)
        .not('river_mile', 'is', null)
        .lte('river_mile', accessPointRiverMile)
        .order('river_mile', { ascending: false })
        .limit(1)
        .single();

      if (nearestGauge) {
        riverGauge = nearestGauge;
      }
    }

    // Fall back to primary gauge if no segment-specific gauge found
    if (!riverGauge) {
      const { data: primaryGauge } = await supabase
        .from('river_gauges')
        .select(
          `
          gauge_station_id,
          is_primary,
          river_mile,
          threshold_unit,
          level_too_low,
          level_low,
          level_optimal_min,
          level_optimal_max,
          level_high,
          level_dangerous,
          gauge_stations (
            id,
            usgs_site_id,
            name
          )
        `
        )
        .eq('river_id', riverId)
        .eq('is_primary', true)
        .single();

      riverGauge = primaryGauge;
    }

    if (!riverGauge || !riverGauge.gauge_stations) {
      return null;
    }

    // Supabase returns joined relations - handle both array and single object cases
    const gaugeData = riverGauge.gauge_stations;
    const gauge = (Array.isArray(gaugeData) ? gaugeData[0] : gaugeData) as {
      id: string;
      usgs_site_id: string;
      name: string;
    } | undefined;

    if (!gauge) {
      return null;
    }

    // Fetch the latest reading for this gauge from gauge_readings
    const { data: latestReading } = await supabase
      .from('gauge_readings')
      .select('gauge_height_ft, discharge_cfs, reading_timestamp')
      .eq('gauge_station_id', gauge.id)
      .order('reading_timestamp', { ascending: false })
      .limit(1)
      .single();

    const heightFt = latestReading?.gauge_height_ft ?? null;
    const cfs = latestReading?.discharge_cfs ?? null;

    // Use computeCondition for consistent condition evaluation
    const thresholds: ConditionThresholds = {
      levelTooLow: riverGauge.level_too_low,
      levelLow: riverGauge.level_low,
      levelOptimalMin: riverGauge.level_optimal_min,
      levelOptimalMax: riverGauge.level_optimal_max,
      levelHigh: riverGauge.level_high,
      levelDangerous: riverGauge.level_dangerous,
      thresholdUnit: (riverGauge.threshold_unit || 'ft') as 'ft' | 'cfs',
    };

    const condition = computeCondition(heightFt, thresholds, cfs);

    return {
      level: condition.code,
      cfs,
      heightFt,
      label: getConditionShortLabel(condition.code),
      trend: null,
      lastUpdated: latestReading?.reading_timestamp ?? null,
      gaugeId: gauge.id,
      gaugeName: gauge.name,
      usgsId: gauge.usgs_site_id,
    };
  } catch (error) {
    console.error('Error fetching gauge status:', error);
    return null;
  }
}

// Helper to get NPS campground info for an access point.
// Availability is passed in rather than read here: the caller needs the same
// value for the detail's own sibling field, and reading it twice would be two
// queries describing one campground.
async function getNPSCampgroundInfo(
  supabase: SupabaseServerClient,
  npsCampgroundId: string,
  availability: CampsiteAvailabilityInfo | null
): Promise<NPSCampgroundInfo | null> {
  try {
    const { data: cg, error } = await supabase
      .from('nps_campgrounds')
      .select('*')
      .eq('id', npsCampgroundId)
      .single();

    if (error || !cg) return null;

    const amenitiesData = typeof cg.amenities === 'string'
      ? JSON.parse(cg.amenities)
      : cg.amenities || {};

    const feesData = typeof cg.fees === 'string'
      ? JSON.parse(cg.fees)
      : cg.fees || [];

    const imagesData = typeof cg.images === 'string'
      ? JSON.parse(cg.images)
      : cg.images || [];

    const operatingHoursData = typeof cg.operating_hours === 'string'
      ? JSON.parse(cg.operating_hours)
      : cg.operating_hours || [];

    return {
      npsId: cg.nps_id,
      name: cg.name,
      npsUrl: cg.nps_url,
      reservationInfo: cg.reservation_info,
      // Held to the same standard as the directory's URL, because it feeds the
      // same button under the same provider-naming label. All 30 rows carrying
      // one are already www.recreation.gov, so this changes nothing today and
      // catches the day the NPS feed publishes a concessioner's site instead —
      // where "Book on Recreation.gov" would be the wrong sentence.
      reservationUrl: bookingUrlFor('recreation_gov', cg.reservation_url),
      fees: feesData.map((f: { cost?: string; description?: string; title?: string }) => ({
        cost: f.cost || '0.00',
        description: f.description || '',
        title: f.title || 'Camping Fee',
      })),
      totalSites: cg.total_sites || 0,
      sitesReservable: cg.sites_reservable || 0,
      sitesFirstCome: cg.sites_first_come || 0,
      sitesGroup: cg.sites_group || 0,
      sitesTentOnly: cg.sites_tent_only || 0,
      sitesElectrical: cg.sites_electrical || 0,
      sitesRvOnly: cg.sites_rv_only || 0,
      sitesWalkBoatTo: cg.sites_walk_boat_to || 0,
      amenities: {
        toilets: amenitiesData.toilets || [],
        showers: amenitiesData.showers || [],
        cellPhoneReception: amenitiesData.cellPhoneReception || 'Unknown',
        potableWater: amenitiesData.potableWater || [],
        campStore: amenitiesData.campStore || 'No',
        firewoodForSale: amenitiesData.firewoodForSale || 'No',
        dumpStation: amenitiesData.dumpStation || 'No',
        trashCollection: amenitiesData.trashRecyclingCollection || 'Unknown',
      },
      operatingHours: operatingHoursData.map((oh: { description?: string; name?: string }) => ({
        description: oh.description || '',
        name: oh.name || '',
      })),
      classification: cg.classification,
      weatherOverview: cg.weather_overview,
      images: imagesData,
      // Cached rows only, and null whenever this campground is not linked to a
      // booking system Eddy reads — which is most of them. Kept alongside the
      // detail's own sibling copy until builds that read only this one age out.
      availability,
    };
  } catch (error) {
    console.error('Error fetching NPS campground info:', error);
    return null;
  }
}
