// src/types/api.ts
// API request/response types for Eddy

export interface River {
  id: string;
  name: string;
  slug: string;
  lengthMiles: number;
  description: string | null;
  difficultyRating: string | null;
  region: string | null;
}

export interface RiverWithDetails extends River {
  geometry: GeoJSON.LineString;
  bounds: [number, number, number, number]; // [minLng, minLat, maxLng, maxLat]
}

export interface RiverListItem extends River {
  accessPointCount: number;
  /** rivers.state code, e.g. 'MO' */
  state: string;
  /** rivers.river_type — hydrological archetype, e.g. 'spring_fed_float' */
  riverType: string | null;
  /** Canonical page path, e.g. /rivers/missouri/current */
  path: string;
  currentCondition: {
    label: string;
    code: ConditionCode;
    /**
     * The unit this river's thresholds are defined in, and therefore the only
     * unit its reading may be displayed in. Most rivers are 'cfs'.
     */
    thresholdUnit: 'ft' | 'cfs' | null;
    gaugeHeightFt: number | null;
    dischargeCfs: number | null;
    readingAgeHours: number | null;
    /**
     * Words only, no delta — see RiverReadingTrend in packages/eddy-types for
     * why a raw delta must not cross an API that serves both ft and cfs rivers.
     */
    trend: {
      direction: 'rising' | 'falling' | 'steady';
      label: string;
      windowHours: number;
    } | null;
  } | null;
}

export interface AccessPoint {
  id: string;
  riverId: string;
  name: string;
  slug: string;
  riverMile: number;
  type: AccessPointType; // Primary type (for backwards compatibility)
  types: AccessPointType[]; // All types (new - supports multiple)
  isPublic: boolean;
  /**
   * May this point be chosen as a put-in or take-out?
   *
   * Distinct from whether the record is published at all, which is the server's
   * `approved` and never reaches this type. A state park or campground on the
   * water is a real destination with a real page and pin, and still not
   * somewhere a boat goes in — Montauk State Park at the Current's headwaters is
   * the case this exists for. Draw these; never offer them as endpoints.
   *
   * OPTIONAL because payloads predating the field omit it. Absent means "assume
   * eligible", which matches how every point behaved before the split — do not
   * read `undefined` as false, or an older cached payload silently empties the
   * planner.
   */
  isFloatEndpoint?: boolean;
  ownership: string | null;
  description: string | null;
  amenities: string[];
  parkingInfo: string | null;
  roadAccess: string | null;
  facilities: string | null;
  feeRequired: boolean;
  feeNotes: string | null;
  directionsOverride?: string | null;
  imageUrls: string[];
  googleMapsUrl?: string | null;
  coordinates: {
    lng: number;
    lat: number;
  };
  // Optional detail fields (available when fetched with detail data)
  roadSurface?: string[];
  parkingCapacity?: string | null;
  managingAgency?: string | null;
  officialSiteUrl?: string | null;
  localTips?: string | null;
  nearbyServices?: NearbyService[];
  // NPS campground data (when linked)
  npsCampground?: NPSCampgroundInfo | null;
}

export type AccessPointType =
  | 'boat_ramp'
  | 'gravel_bar'
  | 'campground'
  | 'bridge'
  | 'access'
  | 'park';

// ─────────────────────────────────────────────────────────────
// Access Point Detail Types (for enhanced detail pages)
// ─────────────────────────────────────────────────────────────

/** Road surface options for access point roads */
export type RoadSurface =
  | 'paved'
  | 'gravel_maintained'
  | 'gravel_unmaintained'
  | 'dirt'
  | 'seasonal'
  | '4wd_required';

/** Managing agency options for facilities */
export type ManagingAgency =
  | 'MDC'
  | 'NPS'
  | 'USFS'
  | 'COE'
  | 'State Park'
  | 'County'
  | 'Municipal'
  | 'Private';

/** Parking capacity options for quick stats */
export type ParkingCapacity =
  | '5' | '10' | '15' | '20' | '25' | '30' | '50+'
  | 'roadside' | 'limited' | 'unknown';

/** Nearby service type (outfitter, campground, etc.) */
export type NearbyServiceType =
  | 'outfitter'
  | 'campground'
  | 'canoe_rental'
  | 'shuttle'
  | 'lodging';

/** Nearby service (outfitter, campground, etc.) */
export interface NearbyService {
  name: string;
  type: NearbyServiceType;
  phone?: string;
  website?: string;
  distance?: string;  // "2 mi", "0.5 mi"
  notes?: string;     // "Weekends only after Labor Day"
}

/** Gauge status for access point detail page */
export interface AccessPointGaugeStatus {
  level: ConditionCode;
  cfs: number | null;
  heightFt: number | null;
  label: string;  // "Optimal for floating"
  trend: 'rising' | 'falling' | 'steady' | null;
  lastUpdated: string | null;  // ISO timestamp
  gaugeId: string;
  gaugeName: string;
  /**
   * The station's provider-native site id — a USGS site number, an NWS LID, or
   * a USACE dam slug.
   *
   * NULLABLE, and it always was: this is filled from `usgs_site_id` OR
   * `site_id_external`, both nullable columns, and it was typed `string` while
   * Clearwater — a Corps release rated for the Black River, and reachable from
   * every access point on it — carries null in the first and a slug in the
   * second. Pair it with `provider` before printing it; never caption it USGS
   * on its own.
   */
  usgsId: string | null;
  /** Registry id from src/lib/flow-providers. Absent means 'usgs'. */
  provider?: string | null;
}

/** Simplified access point for "nearby" list */
export interface NearbyAccessPoint {
  id: string;
  name: string;
  slug: string;
  direction: 'upstream' | 'downstream';
  distanceMiles: number;
  estimatedFloatTime: string | null;  // "~1.5 hr"
  riverMile: number;
  /**
   * May a float end here?
   *
   * The Float-trips tab turns each of these rows into "plan a trip to X", so a
   * neighbour that is not a launch has to be listed without that action — it is
   * still the next thing down the river, and still not a take-out. Absent means
   * eligible, matching every other payload carrying this field.
   */
  isFloatEndpoint?: boolean;
}

/** Extended access point for detail page */
export interface AccessPointDetail extends AccessPoint {
  // New detail fields
  roadSurface: RoadSurface[];
  parkingCapacity: ParkingCapacity | null;
  managingAgency: ManagingAgency | null;
  officialSiteUrl: string | null;
  localTips: string | null;  // HTML from TipTap
  nearbyServices: NearbyService[];

  // Driving coordinates (for nav deep links)
  drivingLat: number | null;
  drivingLng: number | null;

  /**
   * Canonical page path, e.g. /rivers/missouri/current/access/akers-ferry
   *
   * Served rather than composed by the consumer because the state segment is
   * not otherwise in this payload, and the iOS route (/river/<slug>/access/...)
   * cannot be turned into the web one without it. Anything that hands a user a
   * link to this access point — a share sheet, a push, an embed — needs the
   * canonical form, and only the server can build it. Mirrors RiverListItem.path.
   */
  path: string;

  // River context
  river: {
    id: string;
    name: string;
    slug: string;
  };

  // NPS campground data (available when access point is linked to an NPS campground)
  npsCampground: NPSCampgroundInfo | null;

  /**
   * Live availability, WHATEVER KIND OF CAMPGROUND THIS IS.
   *
   * A sibling of npsCampground rather than a field inside it, which is the
   * whole point. A Missouri State Park — Meramec, Onondaga Cave, Washington —
   * has no nps_campgrounds row, but campsite_facilities carries live
   * availability for it through its other foreign key. Nested inside
   * npsCampground that was not merely absent, it was UNREPRESENTABLE, and the
   * app's tab registry says so in a comment sized for this exact change.
   *
   * NPSCampgroundInfo.availability still carries the same object and is not
   * being removed in this change: a TestFlight build reads only the nested one,
   * and outlives the deploy it was cut against.
   */
  availability?: CampsiteAvailabilityInfo | null;

  /**
   * Where to book this campground, when Eddy holds a reservation URL for it.
   *
   * A SIBLING OF `availability`, not a field on it, for the reason
   * src/lib/camping/booking.ts gives at length: availability drops out for
   * calendar reasons — stale nights, an uncovered weekend, nothing reservable
   * in the window — and none of those are reasons to stop telling somebody
   * where to book.
   *
   * Only ever `nearby_services.reservation_url`, never `officialSiteUrl`. See
   * bookingAction in the app's campgroundFacts.ts for why that distinction is
   * load-bearing rather than pedantic.
   */
  booking?: BookingLinkInfo | null;
}

/**
 * The one link that takes a booking, and the system it belongs to.
 *
 * `source` names the provider so the app can say "Book on Recreation.gov"
 * rather than "Book" — a button that leaves the app having told the reader
 * nothing about where they are going is a surprise, not a link.
 */
export interface BookingLinkInfo {
  url: string;
  source: 'recreation_gov' | 'mo_state_parks';
}

/**
 * Live availability for the coming weekend, when Eddy has it.
 *
 * Null everywhere it does not: unlinked campgrounds, state parks outside the
 * UseDirect systems Eddy reads, and every private outfitter. Consumers must
 * render nothing at all in that case — a blank slot reads as "not applicable",
 * where the word "unknown" reads as Eddy being broken.
 */
export interface CampsiteAvailabilityInfo {
  /** Server-resolved so the two clients can never describe different weekends. */
  window: { startDate: string; endDate: string; label: string };
  /** Sites free for every night of the window, not just the best night. */
  sitesOpen: number;
  /** Sites bookable at all. Excludes walk-up inventory. */
  sitesReservable: number;
  /** `closed` is seasonal and must not be worded as "fully booked". */
  status: 'open' | 'full' | 'closed' | 'not_yet_released';
  kind: 'campground' | 'backcountry_district';
  source: 'recreation_gov' | 'mo_state_parks';
  fetchedAt: string;
  /** Identifies the facility to `/api/campsites`, which lists its sites. */
  facilityId?: string;
  /**
   * Every measured night of the stored horizon, ascending.
   *
   * SPARSE BY DESIGN. A date missing from this array was not measured — a
   * season that ends mid-horizon, or a sync that ran out of budget — and a
   * client must draw that as a gap. Rendering it as zero would turn "we did not
   * look" into "fully booked", which are opposite instructions to a reader.
   *
   * The fields above summarise `window` ONLY. Folding this whole array with
   * summarizeWindow would take a minimum across a fortnight and report a
   * campground with forty free sites on twelve nights as fully booked.
   */
  nights?: CampsiteNightInfo[];
}

/** One measured night. */
export interface CampsiteNightInfo {
  date: string;
  sitesOpen: number;
  sitesReservable: number;
  status: 'open' | 'full' | 'closed' | 'not_yet_released';
}

/** NPS campground data enrichment for access point detail */
export interface NPSCampgroundInfo {
  npsId: string;
  name: string;
  npsUrl: string | null;
  reservationInfo: string | null;
  reservationUrl: string | null;
  fees: { cost: string; description: string; title: string }[];
  totalSites: number;
  sitesReservable: number;
  sitesFirstCome: number;
  sitesGroup: number;
  sitesTentOnly: number;
  sitesElectrical: number;
  sitesRvOnly: number;
  sitesWalkBoatTo: number;
  amenities: {
    toilets: string[];
    showers: string[];
    cellPhoneReception: string;
    potableWater: string[];
    campStore: string;
    firewoodForSale: string;
    dumpStation: string;
    trashCollection: string;
  };
  operatingHours: { description: string; name: string }[];
  classification: string | null;
  weatherOverview: string | null;
  images: { url: string; title: string; altText: string; caption: string; credit: string }[];
  /** Null unless this campground is linked to a booking system Eddy reads. */
  availability: CampsiteAvailabilityInfo | null;
}

export interface VesselType {
  id: string;
  name: string;
  slug: string;
  description: string;
  icon: string;
  speeds: {
    lowWater: number;
    normal: number;
    highWater: number;
  };
}

export type ConditionCode =
  | 'dangerous'
  | 'high'
  | 'flowing'
  | 'good'
  | 'low'
  | 'too_low'
  | 'unknown';

/** Flow rating based on discharge percentile comparison to historical data */
export type FlowRating = 'flood' | 'high' | 'good' | 'low' | 'poor' | 'unknown';

export interface RiverCondition {
  label: string;
  code: ConditionCode;
  gaugeHeightFt: number | null;
  dischargeCfs: number | null;
  thresholdUnit?: 'ft' | 'cfs';
  readingTimestamp: string | null;
  readingAgeHours: number | null;
  accuracyWarning: boolean;
  accuracyWarningReason: string | null;
  gaugeName: string | null;
  gaugeUsgsId: string | null;
  /** Percentile-based flow rating (new system) */
  flowRating?: FlowRating;
  /** User-friendly flow description */
  flowDescription?: string;
  /** Current discharge percentile (0-100) compared to historical data for this date */
  percentile?: number | null;
  /** Median (50th percentile) discharge for this date in cfs */
  medianDischargeCfs?: number | null;
  /**
   * The condition ladder for the gauge this reading came from, in that gauge's
   * threshold unit. Lets a client band the reading — draw the scale it sits on
   * — without a second request. Same shape as ConditionGauge.thresholds.
   */
  thresholds?: {
    levelTooLow: number | null;
    levelLow: number | null;
    levelOptimalMin: number | null;
    levelOptimalMax: number | null;
    levelHigh: number | null;
    levelDangerous: number | null;
    thresholdUnit?: 'ft' | 'cfs';
  };
  /** Link to USGS gauge page for more details */
  usgsUrl?: string | null;
}

export interface ConditionGauge {
  id: string;
  name: string | null;
  /**
   * The station's provider-native site id — a USGS site number, an NWS LID, or
   * a USACE dam slug. Named `usgsSiteId` for history: it predates multi-provider
   * support and has ~105 call sites, so renaming it to `siteId` is a separate
   * refactor rather than a prerequisite. Pair it with `provider` before building
   * any provider-specific URL.
   */
  usgsSiteId: string | null;
  /** Registry id from src/lib/flow-providers. Absent means 'usgs'. */
  provider?: string;
  isPrimary: boolean;
  gaugeHeightFt: number | null;
  dischargeCfs: number | null;
  thresholdUnit?: 'ft' | 'cfs';
  readingTimestamp: string | null;
  readingAgeHours: number | null;
  /**
   * This gauge's condition ladder (shape matches lib/conditions
   * ConditionThresholds), so clients can band a reading without another fetch
   * — e.g. the photo submit form's live "files under" preview.
   */
  thresholds?: {
    levelTooLow: number | null;
    levelLow: number | null;
    levelOptimalMin: number | null;
    levelOptimalMax: number | null;
    levelHigh: number | null;
    levelDangerous: number | null;
    thresholdUnit?: 'ft' | 'cfs';
  } | null;
}

export interface Hazard {
  id: string;
  riverId: string;
  name: string;
  type: HazardType;
  riverMile: number;
  description: string | null;
  severity: HazardSeverity;
  portageRequired: boolean;
  portageSide: 'left' | 'right' | 'either' | null;
  seasonalNotes: string | null;
  coordinates: {
    lng: number;
    lat: number;
  };
}

export type HazardType =
  | 'low_water_dam'
  | 'portage'
  | 'strainer'
  | 'rapid'
  | 'private_property'
  | 'waterfall'
  | 'shoal'
  | 'bridge_piling'
  | 'other';

export type HazardSeverity = 'info' | 'caution' | 'warning' | 'danger';

export interface FloatPlan {
  river: River;
  putIn: AccessPoint;
  takeOut: AccessPoint;
  vessel: VesselType;
  distance: {
    miles: number;
    formatted: string;
  };
  floatTime: {
    minutes: number;
    formatted: string;
    speedMph: number;
    isEstimate?: boolean;  // true if calculated, false if from known segment data
    /** 'trip' includes typical stops; 'moving' is paddling-only. */
    basis?: 'trip' | 'moving';
    timeRange?: {          // honest min/max range (asymmetric, skewed long)
      min: number;
      max: number;
    };
  } | null;  // null when conditions are dangerous — we do not estimate a time
  driveBack: {
    minutes: number;
    miles: number;
    formatted: string;
    routeSummary: string | null;
    routeGeometry: GeoJSON.LineString | null;
  };
  condition: RiverCondition;
  hazards: Hazard[];
  route: GeoJSON.Feature<GeoJSON.LineString>;
  warnings: string[];
}

// API Response Types
export interface RiversResponse {
  rivers: RiverListItem[];
}

export interface RiverDetailResponse {
  river: RiverWithDetails;
}

export interface AccessPointsResponse {
  accessPoints: AccessPoint[];
}

export interface HazardsResponse {
  hazards: Hazard[];
}

export interface ConditionResponse {
  condition: RiverCondition | null;
  available: boolean;
  error?: string;
  diagnostic?: string;
  gauges?: ConditionGauge[];
}

export interface VesselTypesResponse {
  vesselTypes: VesselType[];
}

export interface PlanResponse {
  plan: FloatPlan;
}

export interface SavePlanRequest {
  riverId: string;
  startId: string;
  endId: string;
  vesselTypeId: string;
  /**
   * Snapshot of the already-computed plan, sent by the interactive planner so
   * the save endpoint doesn't have to re-run the full (USGS + Mapbox) plan
   * calculation just to persist a shareable short code. Omitted by legacy
   * callers, in which case the server recomputes as a fallback.
   */
  snapshot?: SavePlanSnapshot;
}

export interface SavePlanSnapshot {
  distanceMiles: number;
  estimatedFloatMinutes: number | null;
  driveBackMinutes: number | null;
  conditionCode: string | null;
  gaugeHeightFt: number | null;
  dischargeCfs: number | null;
  gaugeName: string | null;
}

export interface SavePlanResponse {
  shortCode: string;
  url: string;
}

// Multi-day trip planning types
export interface CampgroundsResponse {
  campgrounds: AccessPoint[];
  totalDistance: number;
  recommendedStops: number;
}

export interface PlanParams {
  riverId: string;
  startId: string;
  endId: string;
  vesselTypeId?: string;
  tripDurationDays?: number;
}

// Community reporting types
export type ReportType = 'hazard' | 'water_level' | 'debris' | 'river_visual';
export type ReportStatus = 'pending' | 'verified' | 'rejected';

export interface CommunityReport {
  id: string;
  userId: string | null;
  riverId: string;
  hazardId: string | null;
  type: ReportType;
  coordinates: {
    lng: number;
    lat: number;
  };
  riverMile: number | null;
  imageUrl: string | null;
  description: string;
  status: ReportStatus;
  verifiedBy: string | null;
  verifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
  // River visual fields
  gaugeHeightFt: number | null;
  dischargeCfs: number | null;
  thresholdUnit?: 'ft' | 'cfs';
  accessPointId: string | null;
  accessPointName: string | null;
  gaugeStationId: string | null;
  submitterName: string | null;
}

export interface CommunityReportsResponse {
  reports: CommunityReport[];
}

export interface CreateReportRequest {
  riverId: string;
  hazardId?: string;
  type: ReportType;
  latitude: number;
  longitude: number;
  imageUrl?: string;
  description: string;
  // River visual fields
  gaugeHeightFt?: number;
  dischargeCfs?: number;
  accessPointId?: string;
  gaugeStationId?: string;
  submitterName?: string;
}

// River visual display types
export interface RiverVisual {
  id: string;
  imageUrl: string;
  description: string;
  gaugeHeightFt: number | null;
  dischargeCfs: number | null;
  thresholdUnit?: 'ft' | 'cfs';
  accessPointId: string | null;
  accessPointName: string | null;
  /** Canonical path to the access point detail page, when known. */
  accessPointHref: string | null;
  gaugeStationId: string | null;
  /** Name of the gauge the photo's stage/flow reading came from (its reach gauge). */
  gaugeName: string | null;
  submitterName: string | null;
  conditionCode: ConditionCode;
  /** When the photo was taken (EXIF capture time), when known. */
  capturedAt: string | null;
  createdAt: string;
}

export interface RiverVisualLevelGroup {
  code: ConditionCode;
  visuals: RiverVisual[];
}

/** A verified river-visual photo as a map pin (all levels, with coordinates). */
export interface RiverVisualPin {
  id: string;
  imageUrl: string;
  lat: number;
  lng: number;
  conditionCode: ConditionCode;
  gaugeHeightFt: number | null;
  dischargeCfs: number | null;
  /** Name of the gauge the photo's stage/flow reading came from (its reach gauge). */
  gaugeName: string | null;
  /**
   * Whether the photo's level band equals its own gauge's CURRENT band — i.e.
   * the photo depicts roughly what that stretch looks like right now. True when
   * either side is unknown: pins are only de-emphasized on positive evidence.
   */
  matchesCurrent: boolean;
  accessPointName: string | null;
  accessPointHref: string | null;
  /** When the photo was taken (EXIF capture time), when known. */
  capturedAt: string | null;
  createdAt: string;
}

export interface RiverVisualsResponse {
  /** Photos matching the river's current condition (proximity-sorted). */
  visuals: RiverVisual[];
  /** Every verified photo grouped by computed level (dry → flood); non-empty bands only. */
  byLevel: RiverVisualLevelGroup[];
  currentCondition: ConditionCode;
  currentGaugeHeightFt: number | null;
  currentDischargeCfs: number | null;
}

// Nearby service directory types (replaces old ShuttleService)
export type NearbyServiceDirectoryType = 'outfitter' | 'campground' | 'cabin_lodge';

export type NearbyServiceStatus =
  | 'active'
  | 'seasonal'
  | 'temporarily_closed'
  | 'permanently_closed'
  | 'unverified';

export type ServiceOffering =
  | 'canoe_rental'
  | 'kayak_rental'
  | 'raft_rental'
  | 'tube_rental'
  | 'jon_boat_rental'
  | 'shuttle'
  | 'camping_primitive'
  | 'camping_rv'
  | 'cabins'
  | 'lodge_rooms'
  | 'general_store'
  | 'food_service'
  | 'showers'
  | 'fishing_supplies'
  | 'horseback_riding'
  | 'swimming_pool'
  | 'wifi'
  | 'potable_water'
  | 'fire_rings'
  | 'picnic_tables'
  | 'boat_ramp'
  | 'dump_station'
  | 'flush_toilets'
  | 'vault_toilets'
  | 'laundry'
  | 'playground';

export interface NearbyServiceDirectory {
  id: string;
  name: string;
  slug: string;
  type: NearbyServiceDirectoryType;
  phone: string | null;
  phoneTollFree: string | null;
  email: string | null;
  website: string | null;
  addressLine1: string | null;
  /**
   * Null for the NPS campgrounds this route synthesises into the directory:
   * a campground inside a national riverway has no town of its own. The column
   * is NOT NULL on `nearby_services`, but this type describes the WIRE, and the
   * wire carries both. @eddy/types has always had it right.
   *
   * Display copy either way. Once a row has coordinates the pin is what says
   * where it is — six rows were filed under the wrong town until 20260809120000,
   * and four of those wrong towns put the business on the wrong river.
   */
  city: string | null;
  state: string | null;
  zip: string | null;
  latitude: number | null;
  longitude: number | null;
  description: string | null;
  servicesOffered: ServiceOffering[];
  seasonalNotes: string | null;
  npsAuthorized: boolean;
  usfsAuthorized: boolean;
  ownerName: string | null;
  ownershipChangedAt: string | null;
  status: NearbyServiceStatus;
  verifiedSource: string | null;
  displayOrder: number;
  rivers: ServiceRiverLink[];
  managingAgency: string | null;
  reservationUrl: string | null;
  bookingPlatform: string | null;
  tentSites: number | null;
  rvSites: number | null;
  cabinCount: number | null;
  maxGuests: number | null;
  feeRange: string | null;
  seasonOpenMonth: number | null;
  seasonCloseMonth: number | null;
  details: Record<string, unknown>;
  /** Null unless this listing is linked to a booking system Eddy reads. */
  availability?: CampsiteAvailabilityInfo | null;
}

export interface ServiceRiverLink {
  riverId: string;
  riverName: string;
  riverSlug: string;
  isPrimary: boolean;
  sectionDescription: string | null;
}

export interface NearbyServicesDirectoryResponse {
  services: NearbyServiceDirectory[];
}

// Admin Types
export interface CreateAccessPointRequest {
  riverId: string;
  name: string;
  latitude: number;
  longitude: number;
  type: AccessPointType;
  isPublic: boolean;
  ownership?: string;
  description?: string;
  amenities?: string[];
  parkingInfo?: string;
  roadAccess?: string;
  facilities?: string;
  feeRequired?: boolean;
  feeNotes?: string;
  approved?: boolean;
}

export interface UpdateAccessPointRequest extends Partial<CreateAccessPointRequest> {
  id: string;
}

// Feedback types
/**
 * `gauge_recalibration` is "the ladder is wrong", not "this field is wrong".
 * It is deliberately separate from `inaccurate_data`, which collects
 * corrections to rows somebody typed; see migration 00208.
 */
export const FEEDBACK_TYPES = [
  'inaccurate_data',
  'missing_access_point',
  'suggestion',
  'bug_report',
  'other',
  'partner',
  'gauge_recalibration',
  // Reports about a published community photo. Kept as its own type rather than
  // folded into `other` because App Store Guideline 1.2 requires a reporting
  // mechanism for user-generated content AND a timely response to what it
  // produces — and a report that arrives in the queue labelled "Other" is one
  // nobody triages differently from a typo correction. See the migration.
  'objectionable_content',
] as const;
export type FeedbackType = (typeof FEEDBACK_TYPES)[number];
export type FeedbackContextType = 'gauge' | 'access_point' | 'river' | 'general';
export type FeedbackStatus = 'pending' | 'reviewed' | 'resolved' | 'dismissed';

export interface FeedbackContext {
  type: FeedbackContextType;
  id?: string;
  name?: string;
  data?: Record<string, unknown>;
}

export interface Feedback {
  id: string;
  feedbackType: FeedbackType;
  userName: string | null;
  userEmail: string;
  message: string;
  imageUrl: string | null;
  contextType: FeedbackContextType | null;
  contextId: string | null;
  contextName: string | null;
  contextData: Record<string, unknown> | null;
  status: FeedbackStatus;
  adminNotes: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateFeedbackRequest {
  feedbackType: FeedbackType;
  userName?: string;
  userEmail: string;
  message: string;
  imageUrl?: string;
  context?: FeedbackContext;
}

export interface FeedbackResponse {
  success: boolean;
  id?: string;
  error?: string;
}

export interface FeedbackListResponse {
  feedback: Feedback[];
  total: number;
}

export interface UpdateFeedbackRequest {
  id: string;
  status?: FeedbackStatus;
  adminNotes?: string;
}

// ─────────────────────────────────────────────────────────────
// Inbound Email API Types (mail received at *@eddy.guide via Resend)
// ─────────────────────────────────────────────────────────────

export type InboundEmailStatus = 'unread' | 'read' | 'archived' | 'spam';

/** Attachment metadata from Resend (binary content is fetched on demand). */
export interface InboundEmailAttachmentMeta {
  id?: string;
  filename?: string | null;
  content_type?: string;
  content_disposition?: string | null;
  content_id?: string | null;
}

export interface InboundEmail {
  id: string;
  emailId: string;
  messageId: string | null;
  fromAddress: string | null;
  toAddresses: string[];
  ccAddresses: string[];
  bccAddresses: string[];
  receivedFor: string[];
  replyTo: string[];
  subject: string | null;
  textBody: string | null;
  htmlBody: string | null;
  attachments: InboundEmailAttachmentMeta[];
  bodyFetched: boolean;
  status: InboundEmailStatus;
  lastRepliedAt: string | null;
  resendCreatedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface InboundEmailListResponse {
  emails: InboundEmail[];
  total: number;
  unread: number;
}

export interface UpdateInboundEmailRequest {
  status?: InboundEmailStatus;
}

export interface ReplyInboundEmailRequest {
  /** Plain-text reply body. */
  body: string;
  /** Optional From override; must be an address on the sending domain. */
  from?: string;
}

export interface ReplyInboundEmailResponse {
  email: InboundEmail;
  /** Resend id of the sent reply. */
  sendId: string | null;
}

// ─────────────────────────────────────────────────────────────
// Access Point Detail API Types
// ─────────────────────────────────────────────────────────────

/** Response for access point detail page */
export interface AccessPointDetailResponse {
  accessPoint: AccessPointDetail;
  nearbyAccessPoints: NearbyAccessPoint[];
  gaugeStatus: AccessPointGaugeStatus | null;
}

/** Request to update access point detail fields (admin) */
export interface UpdateAccessPointDetailRequest {
  id: string;
  // Basic info
  name?: string;
  slug?: string;
  types?: AccessPointType[];
  description?: string;
  isPublic?: boolean;
  ownership?: string;
  feeRequired?: boolean;
  feeNotes?: string;
  // Road
  roadSurface?: RoadSurface[];
  roadAccess?: string;
  // Parking
  parkingCapacity?: ParkingCapacity | null;
  parkingInfo?: string;
  // Facilities
  facilities?: string;
  managingAgency?: ManagingAgency | null;
  officialSiteUrl?: string;
  // Navigation
  drivingLat?: number | null;
  drivingLng?: number | null;
  directionsOverride?: string;
  // Content
  localTips?: string;
  nearbyServices?: NearbyService[];
  imageUrls?: string[];
}

// ─────────────────────────────────────────────────────────────
// /api/me/* — Bearer-token consumer endpoints (iOS Phase 0)
// ─────────────────────────────────────────────────────────────

/** Entitlement snapshot derived from RevenueCat-synced state */
export interface MeEntitlement {
  entitlementId: string;
  /** True iff expires_at is in the future (computed server-side) */
  isActive: boolean;
  expiresAt: string | null;
  willRenew: boolean | null;
  productId: string | null;
  billingIssue: boolean;
}

export interface MeProfile {
  id: string;
  displayName: string | null;
  homeRegion: string | null;
  createdAt: string;
}

/** Response for GET /api/me/profile */
export interface MeProfileResponse {
  profile: MeProfile;
  /** True for anonymous Supabase sessions (pre Sign-in-with-Apple) */
  isAnonymous: boolean;
  /** Null when the user has never had an entitlement */
  entitlement: MeEntitlement | null;
}

export interface StarredGaugeEntry {
  gaugeId: string;
  gaugeName: string;
  usgsSiteId: string;
  /** Registry id for the station's publisher. */
  provider: string;
  /** The river this gauge is PRIMARY for, when it is primary for one. */
  riverName: string | null;
  riverSlug: string | null;
  starredAt: string;
}

/** Response for GET /api/me/starred-gauges */
export interface StarredGaugesResponse {
  starred: StarredGaugeEntry[];
}

export interface StarredDamEntry {
  /**
   * The USACE registry slug, e.g. 'swl-clearwater-dam'.
   *
   * NOT a uuid, unlike the other two star kinds. Dams are read through from
   * CWMS and SWPA rather than stored, so their identity lives in
   * src/lib/flow-providers/usace-registry.ts — see migration 00206 for why
   * starred_dams therefore has no foreign key.
   */
  damId: string;
  damName: string;
  lakeName: string | null;
  /**
   * The tailwater river, when this dam controls one.
   *
   * Only Clearwater has one today. It is carried so a synced-down star can name
   * the water it affects before /api/dams lands, the same way a starred gauge
   * carries the river it rates.
   */
  riverSlug: string | null;
  starredAt: string;
}

/** Response for GET /api/me/starred-dams */
export interface StarredDamsResponse {
  starred: StarredDamEntry[];
}

export interface StarredRiverEntry {
  riverId: string;
  riverName: string;
  riverSlug: string;
  starredAt: string;
}

/** Response for GET /api/me/starred-rivers */
export interface StarredRiversResponse {
  starred: StarredRiverEntry[];
}

export type AlertSubscriptionKind = 'floatable' | 'safety' | 'all';

export interface AlertSubscriptionEntry {
  id: string;
  riverId: string;
  riverName: string;
  riverSlug: string;
  kind: AlertSubscriptionKind;
  /** One-shot subscriptions auto-expire after their first matching push */
  oneShot: boolean;
  firedAt: string | null;
  createdAt: string;
}

/** Response for GET /api/me/alert-subscriptions */
export interface AlertSubscriptionsResponse {
  subscriptions: AlertSubscriptionEntry[];
}

// ─────────────────────────────────────────────────────────────
// /api/me/alerts — the MERGED rule list
// ─────────────────────────────────────────────────────────────
//
// Two tables stand behind this: alert_subscriptions (river condition alerts,
// fanned out from a global outbox) and gauge_alert_subscriptions (per-rule
// evaluation, because a user-defined level cannot be precomputed into one
// shared event — migration 00200 makes that argument in full).
//
// The split is a SERVER concern. `source` exists so a client can echo it back
// on PATCH/DELETE without having to reimplement the routing rule.
//
// Mirrored in packages/eddy-types/index.ts, by hand — @eddy/types is not
// resolvable from this app's tsconfig. It is a wire format, so a change to
// either is a change to both.

export type AlertRuleSource = 'river_condition' | 'gauge';
export type AlertRuleScope = 'river' | 'gauge';
export type AlertRuleMode = 'condition' | 'threshold';
/** Explicit, never inferred — a cfs number against a foot ladder is the bug. */
export type AlertMetric = 'gauge_height_ft' | 'discharge_cfs';
export type AlertComparator = 'above' | 'below' | 'between';

export interface AlertRule {
  id: string;
  source: AlertRuleSource;
  scope: AlertRuleScope;
  mode: AlertRuleMode;

  riverId: string | null;
  riverName: string | null;
  riverSlug: string | null;

  gaugeId: string | null;
  gaugeName: string | null;
  usgsSiteId: string | null;
  /** False for the national tier, which has no ladder and so no condition mode. */
  curated: boolean;

  /**
   * The river alert this rule was created from, when it was created from one.
   *
   * ── What it changes for a client ─────────────────────────────────────────
   *
   * A parented rule is GATED by its parent: pausing the river alert stops this
   * one from firing, without touching its own `enabled`. So a list that draws
   * children under their parent must draw a child of a paused parent as
   * unavailable rather than as on — its switch is true and it will not fire,
   * and only this field explains why. Deleting the parent deletes it too, by
   * cascade.
   *
   * Null is the ordinary case: a rule set from the gauge screen, a custom level,
   * anything on the national tier. Those stand alone and are governed by nothing
   * but themselves.
   *
   * Always null on a river_condition rule — a river alert has no parent, and it
   * is the thing other rules point AT.
   */
  parentId: string | null;

  conditionKind: AlertSubscriptionKind | null;

  metric: AlertMetric | null;
  comparator: AlertComparator | null;
  thresholdValue: number | null;
  thresholdValueMax: number | null;

  enabled: boolean;
  oneShot: boolean;
  firedAt: string | null;
  lastTriggeredAt: string | null;
  createdAt: string;
}

/** Response for GET /api/me/alerts */
export interface AlertRulesResponse {
  rules: AlertRule[];
}

/**
 * The reading a rule was seeded from, returned by POST /api/me/gauge-alerts.
 * A new rule already knows which side of its threshold the river is on, so it
 * fires on the next CROSSING rather than immediately; the app needs this to say
 * so, because silently declining to fire reads like a bug.
 */
export interface AlertRuleSeed {
  value: number | null;
  unit: 'ft' | 'cfs' | null;
  readingAt: string | null;
  state: 'inside' | 'outside' | null;
}

export interface AlertRuleResponse {
  rule: AlertRule;
  seed: AlertRuleSeed | null;
}

// ─────────────────────────────────────────────────────────────
// /api/me/notification-preferences — quiet hours
// ─────────────────────────────────────────────────────────────

/**
 * Quiet hours SUPPRESS rather than queue — see migration 00201. deliver-push
 * already drops events older than three hours, and a quiet window outlives
 * that, so "hold it until morning" would deliver a stale promise or nothing.
 */
export interface NotificationPreferences {
  quietHoursEnabled: boolean;
  /** Minutes past LOCAL midnight, 0-1439. start > end is an overnight window. */
  quietStartMinute: number | null;
  quietEndMinute: number | null;
  timezone: string;
  safetyOverridesQuiet: boolean;
}

export interface NotificationPreferencesResponse {
  preferences: NotificationPreferences;
}

// ─────────────────────────────────────────────────────────────
// /api/app-config — remote config + kill switches for the app
// ─────────────────────────────────────────────────────────────

export interface AppFeatureFlags {
  push: boolean;
  planner: boolean;
  chat: boolean;
}

/** Response for GET /api/app-config. Mirrored in packages/eddy-types. */
export interface AppConfigResponse {
  /** Builds below this must refuse to run and prompt for an upgrade. */
  minSupportedVersion: string;
  latestVersion: string;
  upgradeMessage: string | null;
  features: AppFeatureFlags;
  /** Client-side floor on refresh frequency, so we can shed load remotely. */
  minRefreshSeconds: number;
  /** Free-form outage banner, e.g. "USGS is down; readings may be stale". */
  notice: string | null;
}

// ─────────────────────────────────────────────────────────────
// /api/alerts — public condition-change feed (free to read)
// ─────────────────────────────────────────────────────────────

/**
 * One condition change. `readingAt` is when the river was MEASURED and is what
 * UI must quote; `detectedAt` is when our cron noticed, which trails reality by
 * roughly 20–75 minutes.
 */
export interface AlertFeedEntry {
  id: string;
  riverId: string;
  riverName: string;
  riverSlug: string;
  oldConditionCode: ConditionCode;
  newConditionCode: ConditionCode;
  kind: 'floatable' | 'warning' | 'easing' | 'recovery' | 'info';
  /** In the gauge's primary unit only — never a cross-unit fallback. */
  readingValue: number | null;
  readingUnit: 'ft' | 'cfs' | null;
  readingAt: string | null;
  detectedAt: string;
}

/** Response for GET /api/alerts */
export interface AlertsResponse {
  alerts: AlertFeedEntry[];
}

// ── River alerts (GET /api/river-alerts) ─────────────────────────────────────
// Mirrored by hand from packages/eddy-types/index.ts, which carries the full
// rationale. @eddy/types is not resolvable from shippable web code — Vercel
// installs only missouri-float-planner/ — so the two copies are kept in step by
// review, exactly as the rest of this file is.
//
// Deliberately NOT folded into HighWaterEntry: that type's conditionCode is
// always the output of a threshold ladder a human set, and neither a park
// closure nor a Weather Service warning has one.

export type RiverAlertSource = 'nws' | 'nps';

/**
 * Three levels, not the NWS's five or the NPS's four. Both agency vocabularies
 * map INTO this at the edge; unknown values floor at 'notice' and never
 * promote, so an unrecognised category cannot become a hazard warning.
 */
export type RiverAlertSeverity = 'warning' | 'watch' | 'notice';

export interface RiverAlert {
  id: string;
  source: RiverAlertSource;
  severity: RiverAlertSeverity;
  riverSlug: string;
  riverName: string;
  title: string;
  body: string;
  /** The agency's own name for it — "Flood Warning", "Closure". Shown verbatim. */
  category: string;
  startsAt: string | null;
  endsAt: string | null;
  url: string | null;
}

export interface RiverAlertsResponse {
  alerts: RiverAlert[];
  asOf: string;
}

// ── Eddy's written conditions prose (GET /api/eddy-updates) ──────────────
// Mirrors packages/eddy-types/index.ts, which is what the Expo app imports.
// Kept in both because Vercel installs only missouri-float-planner/ and so
// cannot resolve the package. See the note at the top of eddy-types.

export interface EddyUpdateEntry {
  quoteText: string;
  summaryText: string | null;
  conditionCode: string;
  gaugeHeightFt: number | null;
  dischargeCfs: number | null;
  readingTimestamp: string | null;
  snapshotId: string | null;
  /** When the prose was WRITTEN — see the eddy-types copy for why it matters. */
  generatedAt: string;
}

export interface EddyUpdatesResponse {
  /** Keyed by river slug; the statewide summary is under "global". */
  updates: Record<string, EddyUpdateEntry>;
}

// ── /api/gauges/[siteId]/history ────────────────────────────────────────────
//
// Mirrored in packages/eddy-types/index.ts, by hand — @eddy/types is not
// resolvable from this app's tsconfig, because Vercel installs only
// missouri-float-planner/. tsconfig.test.json's header records what happened
// the last time that alias reached production code. It is a wire format, so a
// change to either is a change to both.

export interface GaugeHistoryReading {
  timestamp: string;
  gaugeHeightFt: number | null;
  dischargeCfs: number | null;
  /** Provider quality codes on this observation ('P' provisional, 'e', 'Ice'). */
  qualifiers?: string[];
}

/** Day-of-year discharge statistics — what this river normally does on this date. */
export interface GaugeTypicalReading {
  /** Calendar date these statistics were matched to (server-local, UTC in production), as YYYY-MM-DD. */
  date: string;
  p25Cfs: number | null;
  p50Cfs: number | null;
  p75Cfs: number | null;
  yearsOfRecord: number | null;
}

/** An official NWS forecast point. Never model guidance presented as official. */
export interface GaugeForecastReading {
  timestamp: string;
  gaugeHeightFt: number | null;
  dischargeCfs: number | null;
}

export interface GaugeHistoryResponse {
  siteId: string;
  siteName: string;
  /** Oldest first. Can be empty; the endpoint 404s only when it has nothing. */
  readings: GaugeHistoryReading[];
  /** Timestamp of the newest observation, for an explicit "now" boundary. */
  observedThrough: string | null;
  /** True when the server reduced the series. Extrema are retained either way. */
  sampled: boolean;
  /** Empty for non-USGS providers and for sites with no percentile record. */
  typical: GaugeTypicalReading[];
  /** Only points still ahead of observedThrough. Empty is the ordinary case. */
  forecast: GaugeForecastReading[];
  /** Null whenever forecast is empty, or when NWPS reports no issuance time. */
  forecastIssuedAt: string | null;
  /** Publisher page, for attribution and deeper inspection. */
  sourceUrl: string | null;
  /** Extremes over the FULL window, not the sampled series. */
  stats: {
    minDischarge: number | null;
    maxDischarge: number | null;
    minHeight: number | null;
    maxHeight: number | null;
  };
}
