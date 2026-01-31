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
  type: AccessPointType;
  isPublic: boolean;
  ownership: string | null;
  description: string | null;
  amenities: string[];
  parkingInfo: string | null;
  feeRequired: boolean;
  feeNotes: string | null;
  directionsOverride?: string | null;
  imageUrls: string[];
  googleMapsUrl?: string | null;
  coordinates: {
    lng: number;
    lat: number;
  };
}

export type AccessPointType =
  | 'boat_ramp'
  | 'gravel_bar'
  | 'campground'
  | 'bridge'
  | 'access'
  | 'park';

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
  | 'optimal'
  | 'low'
  | 'very_low'
  | 'too_low'
  | 'unknown';

/** Flow rating based on discharge percentile comparison to historical data */
export type FlowRating = 'flood' | 'high' | 'good' | 'low' | 'poor' | 'unknown';

export interface RiverCondition {
  label: string;
  code: ConditionCode;
  gaugeHeightFt: number | null;
  dischargeCfs: number | null;
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
    timeRange?: {          // min/max range from segment data
      min: number;
      max: number;
    };
  } | null;
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
export type ReportType = 'hazard' | 'water_level' | 'debris';
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
}

// Shuttle service types
export interface ShuttleService {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  primaryAccessPointId: string | null;
  serviceRadiusMiles: number | null;
  offersShuttle: boolean;
  offersRental: boolean;
  offersCamping: boolean;
  rentalTypes: string[];
  shuttlePriceRange: string | null;
  rentalPriceRange: string | null;
  hoursOfOperation: Record<string, string> | null;
  seasonalNotes: string | null;
  active: boolean;
  verified: boolean;
}

export interface ShuttleServicesResponse {
  services: ShuttleService[];
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
  feeRequired?: boolean;
  feeNotes?: string;
  approved?: boolean;
}

export interface UpdateAccessPointRequest extends Partial<CreateAccessPointRequest> {
  id: string;
}
