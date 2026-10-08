import { createRouteEstimateContext, estimateRoute, type SegmentReader } from '@/lib/calculations/route-estimate';
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
import { loadLinkedServices, withLinkedServices } from '@/lib/access-points/linked-services';

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
  options: {
    /** Map sheets can render core facts before the full route calculations. */
    includeEstimates?: boolean;
    segmentReader?: SegmentReader;
    /** Skip unrelated detail queries for the float-estimate representation. */
    estimatesOnly?: boolean;
    onTiming?: (phase: string, durationMs: number) => void;
  } = {},
): Promise<AccessPointDetailResult> {
  let phaseStarted = performance.now();
  const timed = (phase: string) => {
    const now = performance.now();
    options.onTiming?.(phase, now - phaseStarted);
    phaseStarted = now;
  };
  // Left-join the selected point to preserve river-not-found vs point-not-found.
  // Neighbour summaries travel in the same database round trip for both views.
  const { data: river, error } = await supabase
    .from('rivers')
    .select(`id, name, slug, state,
      access:access_points!access_points_river_id_fkey(*),
      neighbours:access_points!access_points_river_id_fkey(id, name, slug, river_mile_downstream, is_float_endpoint)`)
    .eq('slug', riverSlug)
    .eq('access.slug', accessSlug)
    .eq('access.approved', true)
    .eq('neighbours.approved', true)
    .maybeSingle();

  timed('identity');
  if (error) throw error;
  if (!river) return { ok: false, reason: 'river-not-found' };
  const ap = river.access[0];
  if (!ap) return { ok: false, reason: 'not-found' };

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

  const currentMile = ap.river_mile_downstream != null ? parseFloat(String(ap.river_mile_downstream)) : 0;

  // These independent details are unnecessary in the estimates-only response.
  const [gaugeStatus, linked] = await Promise.all([
    // Uses the access point's own mile, so the reach's gauge is chosen rather
    // than the river's headline one.
    options.estimatesOnly ? null : getGaugeStatus(supabase, river.id, ap.river_mile_downstream != null ? currentMile : null),
    // Read unconditionally and first — see the long note below on why the gate
    // cannot come before the query it gates.
    options.estimatesOnly ? [] : loadLinkedServices(supabase, ap.id),
  ]);

  timed('related');
  const allAccessPoints = river.neighbours;

  const nearbyAccessPoints: NearbyAccessPoint[] = [];

  // TWO neighbours each way, nearest first — not one. One take-out per
  // direction offered exactly one float from every put-in; the second is what
  // lets the sheet's Float trips tab (and this page's Nearby list) offer a
  // short and a long option each way without another request. Two rather than
  // more because each row past the decision costs a line of a sheet that is
  // negotiating with the map for the screen.
  const NEIGHBORS_PER_DIRECTION = 2;

  if (allAccessPoints) {
    const mileOf = (p: { river_mile_downstream: unknown }) =>
      p.river_mile_downstream != null ? parseFloat(String(p.river_mile_downstream)) : null;

    const withMiles = allAccessPoints
      .filter((p) => p.id !== ap.id)
      .map((p) => ({ point: p, mile: mileOf(p) }))
      .filter((entry): entry is { point: (typeof allAccessPoints)[number]; mile: number } =>
        entry.mile != null
      );

    // Upstream (lower river mile = closer to headwaters), nearest first.
    const upstream = withMiles
      .filter((entry) => entry.mile < currentMile)
      .sort((a, b) => b.mile - a.mile)
      .slice(0, NEIGHBORS_PER_DIRECTION);

    // Downstream (higher river mile = further from headwaters), nearest first.
    const downstream = withMiles
      .filter((entry) => entry.mile > currentMile)
      .sort((a, b) => a.mile - b.mile)
      .slice(0, NEIGHBORS_PER_DIRECTION);

    // Upstream first, then downstream, each nearest-first — the order the
    // web's Nearby list renders verbatim. The app regroups by direction, so
    // it only needs the per-direction order to hold.
    for (const entry of upstream) {
      const distance = currentMile - entry.mile;
      nearbyAccessPoints.push({
        id: entry.point.id,
        name: entry.point.name,
        slug: entry.point.slug,
        direction: 'upstream',
        distanceMiles: Math.round(distance * 10) / 10,
        estimatedFloatTime: null,
        riverMile: entry.mile,
        // `!== false` so a row read before the column existed stays eligible.
        // The Float-trips tab offers a trip TO each of these, and a park is a
        // neighbour worth naming without being a trip you can take.
        isFloatEndpoint: entry.point.is_float_endpoint !== false,
      });
    }

    for (const entry of downstream) {
      const distance = entry.mile - currentMile;
      nearbyAccessPoints.push({
        id: entry.point.id,
        name: entry.point.name,
        slug: entry.point.slug,
        direction: 'downstream',
        distanceMiles: Math.round(distance * 10) / 10,
        estimatedFloatTime: null,
        riverMile: entry.mile,
        // `!== false` so a row read before the column existed stays eligible.
        // The Float-trips tab offers a trip TO each of these, and a park is a
        // neighbour worth naming without being a trip you can take.
        isFloatEndpoint: entry.point.is_float_endpoint !== false,
      });
    }
  }

  if (options.includeEstimates !== false) {
    const estimateContext = createRouteEstimateContext(supabase, options.segmentReader);
    await Promise.all(nearbyAccessPoints.map(async (point) => {
      if (ap.is_float_endpoint === false || point.isFloatEndpoint === false) return;
      try {
        const estimate = await estimateRoute(supabase, { riverId: river.id,
          startId: point.direction === 'upstream' ? point.id : ap.id,
          endId: point.direction === 'upstream' ? ap.id : point.id }, undefined, estimateContext);
        point.estimatedFloatTime = estimate.floatTime?.formatted ?? null;
        point.distanceMiles = Math.round(estimate.distanceMiles * 10) / 10;
      } catch { /* An unavailable route must not invent a time. */ }
    }));
  }

  timed('estimates');

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
  //
  // ── AND A LINK IS A THIRD WAY OF BEING ONE ────────────────────────────
  //
  // Washington State Park Access is the case that forced this. Its `types` are
  // EMPTY and it has no nps_campground_id — correctly, because it is a boat
  // launch and not a campground — so the gate said "plain put-in" and skipped
  // the block. But it is `located_at` the park's campground, which has 19 nights
  // of live availability, and the whole point of that link is to put those
  // nights on the sheet a reader taps. A gate that reads only the access point's
  // own row can never see a fact about two records.
  //
  // So the links are read FIRST and unconditionally: one indexed lookup by
  // access_point_id, on a page that already makes several. Gating the gate on
  // the query it gates is a circle, and the query is cheaper than the circle.
  //
  // `linked` is now read in the batch above rather than here, which is the same
  // "first and unconditionally" one round trip earlier.

  const campgroundish =
    ap.nps_campground_id != null ||
    (Array.isArray(ap.types) && (ap.types as string[]).includes('campground')) ||
    linked.length > 0;

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

  if (campgroundish && !options.estimatesOnly) {
    const [index, bookingLink] = await Promise.all([
      loadAvailability(supabase),
      loadBookingLink(
        supabase,
        ap.id,
        linked.map((service) => service.id),
      ),
    ]);
    // ── AND A THIRD WAY IN: the service this place is linked to ───────────
    //
    // The two lookups above cover the ids the access point carries ITSELF —
    // its own, and the nps_campgrounds row it points at. Neither reaches a
    // facility that hangs off `nearby_services` unless somebody also set
    // `campsite_facilities.access_point_id`, and for ten facilities nobody
    // has: Alley Spring, Round Spring, Washington State Park and seven more
    // name their directory row and no access point, so their availability
    // could not reach the sheet a reader actually taps.
    //
    // `access_point_services` is the join that closes it, and this is the
    // first thing to read it — until now the table recorded a relationship and
    // routed nothing. Last in the chain, deliberately: the ids on the access
    // point are the rows the map pin came from, and a link is a statement
    // about two records rather than one.
    availability =
      index.byAccessPointId.get(ap.id) ??
      (ap.nps_campground_id ? (index.byNpsCampgroundId.get(ap.nps_campground_id) ?? null) : null) ??
      linked.reduce<CampsiteAvailabilityInfo | null>(
        (found, service) => found ?? index.byNearbyServiceId.get(service.id) ?? null,
        null,
      );
    booking = bookingLink;
  }
  if (ap.nps_campground_id && !options.estimatesOnly) {
    npsCampground = await getNPSCampgroundInfo(supabase, ap.nps_campground_id, availability);
  }

  timed('camping');

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
    // The sheet still opens for a place that is not a launch; what the clients
    // must not do is offer to plan from one. `!== false` keeps a pre-column row
    // eligible.
    isFloatEndpoint: ap.is_float_endpoint !== false,
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
    // The hand-curated entries, with the canonical rows this place is linked to
    // folded in — so a pin that absorbed a business finally carries that
    // business's phone and website rather than leaving them on the record it
    // dropped. See withLinkedServices for why this is one list and not two.
    nearbyServices: withLinkedServices(
      ((ap.nearby_services as unknown as NearbyService[]) || []),
      linked,
    ) as NearbyService[],
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

// One river_gauges row with its station, as every gauge lookup below reads it.
const RIVER_GAUGE_SELECT = `
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
  flood_stage_ft,
  gauge_stations!inner (
    id,
    usgs_site_id,
    site_id_external,
    provider,
    name
  )
`;

// Helper to get gauge status for the river (segment-aware based on access point river mile)
export async function getGaugeStatus(
  supabase: SupabaseServerClient,
  riverId: string,
  // null when the access point has no recorded mile. It must not be read as
  // mile 0: that would place it in the headwater reach (Boxley on the Buffalo,
  // above Clearwater Dam on the Black) instead of rating it by the primary —
  // and get_river_condition_segment skips sections for a NULL mile too.
  accessPointRiverMile: number | null
): Promise<AccessPointGaugeStatus | null> {
  try {
    const mile = accessPointRiverMile;
    // Both reads depend only on the mile, so they run together rather than
    // adding a serial round-trip to every access-point open.
    const [sectionResult, nearestResult] = mile == null ? [null, null] : await Promise.all([
      supabase
        .from('river_sections')
        .select('primary_gauge_station_id, river_mile_start, river_mile_end, sort_order')
        .eq('river_id', riverId)
        .order('sort_order'),
      // The nearest gauge at or upstream of the access point.
      supabase
        .from('river_gauges')
        .select(RIVER_GAUGE_SELECT)
        .eq('river_id', riverId)
        .eq('gauge_stations.active', true)
        .not('river_mile', 'is', null)
        .lte('river_mile', mile)
        .order('river_mile', { ascending: false })
        .limit(1)
        .single(),
    ]);

    // A curated reach wins over proximity, just as in the planner RPC.
    // Query errors and broken explicit assignments must not silently rate a
    // stretch using the river-wide primary (possibly across a dam).
    if (sectionResult?.error) return null;
    const section = mile == null ? undefined : sectionResult?.data?.find((s) => s.primary_gauge_station_id
      && (s.river_mile_start == null || mile >= Number(s.river_mile_start))
      && (s.river_mile_end == null || mile < Number(s.river_mile_end)));
    let riverGauge = null;
    if (section?.primary_gauge_station_id) {
      const { data, error } = await supabase.from('river_gauges')
        .select(RIVER_GAUGE_SELECT)
        .eq('river_id', riverId)
        .eq('gauge_station_id', section.primary_gauge_station_id)
        .eq('gauge_stations.active', true)
        .maybeSingle();
      if (error || !data) return null;
      riverGauge = data;
    }

    if (!riverGauge && nearestResult?.data) {
      riverGauge = nearestResult.data;
    }

    // Fall back to primary gauge if no segment-specific gauge found
    if (!riverGauge) {
      const { data: primaryGauge } = await supabase
        .from('river_gauges')
        .select(RIVER_GAUGE_SELECT)
        .eq('river_id', riverId)
        .eq('is_primary', true)
        .eq('gauge_stations.active', true)
        .single();

      riverGauge = primaryGauge;
    }

    if (!riverGauge || !riverGauge.gauge_stations) {
      return null;
    }

    // Supabase returns joined relations - handle both array and single object cases
    const gaugeData = riverGauge.gauge_stations;
    // `usgs_site_id` is null for anything the USGS does not publish; the id
    // then lives in `site_id_external`. Typed `string` here for a while, which
    // is how a Corps release came to be captioned as a USGS site number.
    const gauge = (Array.isArray(gaugeData) ? gaugeData[0] : gaugeData) as {
      id: string;
      usgs_site_id: string | null;
      site_id_external: string | null;
      provider: string | null;
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
      floodStageFt: riverGauge.flood_stage_ft,
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
      // Same coalesce order the gauge routes and search_gauges use, so one
      // station is identified the same way wherever it appears.
      usgsId: gauge.usgs_site_id ?? gauge.site_id_external,
      // A null column is a legacy row and those are all USGS; the registry
      // post-dates them. Resolved here so the renderer never has to guess.
      provider: gauge.provider ?? 'usgs',
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
