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
  usgsId: string;
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

  // River context
  river: {
    id: string;
    name: string;
    slug: string;
  };

  // NPS campground data (available when access point is linked to an NPS campground)
  npsCampground: NPSCampgroundInfo | null;
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
  /** Link to USGS gauge page for more details */
  usgsUrl?: string | null;
}

export interface ConditionGauge {
  id: string;
  name: string | null;
  usgsSiteId: string | null;
  isPrimary: boolean;
  gaugeHeightFt: number | null;
  dischargeCfs: number | null;
  thresholdUnit?: 'ft' | 'cfs';
  readingTimestamp: string | null;
  readingAgeHours: number | null;
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
  city: string;
  state: string;
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
export type FeedbackType = 'inaccurate_data' | 'missing_access_point' | 'suggestion' | 'bug_report' | 'other' | 'partner';
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
