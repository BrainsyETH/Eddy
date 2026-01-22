// src/types/api.ts
// API request/response types for Missouri Float Planner

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
  } | null;
  driveBack: {
    minutes: number;
    miles: number;
    formatted: string;
    routeSummary: string | null;
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
