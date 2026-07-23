export type ApiErrorCode =
  | 'authentication_required'
  | 'invalid_token'
  | 'permanent_account_required'
  | 'entitlement_required'
  | 'validation_failed'
  | 'not_found'
  | 'unsupported_app_version'
  | 'service_unavailable'
  | 'internal_error';

export interface ApiErrorBody {
  error: string;
  code: ApiErrorCode;
  details?: Record<string, unknown>;
}

export interface MeEntitlement {
  entitlementId: string;
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

export interface MeProfileResponse {
  profile: MeProfile;
  isAnonymous: boolean;
  entitlement: MeEntitlement | null;
}

export interface StarredRiverEntry {
  riverId: string;
  riverName: string;
  riverSlug: string;
  starredAt: string;
}

export interface StarredRiversResponse {
  starred: StarredRiverEntry[];
}

export type AlertSubscriptionKind = 'floatable' | 'safety' | 'all';

export interface AlertSubscription {
  id: string;
  riverId: string;
  kind: AlertSubscriptionKind;
  oneShot: boolean;
  firedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RiverConditionEvent {
  id: string;
  riverId: string;
  oldConditionCode: string;
  newConditionCode: string;
  kind: 'floatable' | 'warning' | 'easing' | 'recovery' | 'info';
  readingValue: number | null;
  readingUnit: 'ft' | 'cfs' | null;
  readingAt: string | null;
  detectedAt: string;
}

export interface SavedFloatSummary {
  id: string;
  shortCode: string;
  riverId: string | null;
  startAccessId: string | null;
  endAccessId: string | null;
  vesselTypeId: string | null;
  distanceMiles: number | null;
  estimatedFloatMinutes: number | null;
  createdAt: string | null;
}

export interface AppConfigResponse {
  minimumSupportedVersion: string;
  latestVersion: string;
  maintenance: boolean;
  features: {
    purchases: boolean;
    pushAlerts: boolean;
    offlineMaps: boolean;
    nativeMap: boolean;
  };
}
