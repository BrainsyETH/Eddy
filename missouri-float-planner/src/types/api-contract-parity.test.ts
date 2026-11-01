// The API contract, checked by the compiler.
//
// The iOS app's types (packages/eddy-types) and the web API's types
// (src/types/api.ts) are written by hand in both places — "Mirrored … by hand"
// says so in several comments — and nothing compared them, so a field renamed
// on the server compiled cleanly on both sides and broke the app at runtime.
//
// Every name the two files share is listed below. IDENTICAL ones must stay
// identical: this file stops compiling (`make check-web`, via
// `tsc -p tsconfig.test.json`) the moment either side changes alone. DRIFTED
// ones already differ; each is a known gap to reconcile, and the runtime test
// at the bottom fails if one of them is fixed (move it up) or a new shared
// name appears unlisted (decide which list it belongs in).
//
// Lives in a .test.ts because shippable web code may not import from outside
// missouri-float-planner/ (CLAUDE.md); tests may.

import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import type * as Web from '@/types/api';
import type * as App from '../../../packages/eddy-types/index';

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Expect<T extends true> = T;

// ── Identical: must stay that way ───────────────────────────────────────────
export type IdenticalContract = [
  Expect<Equal<Web.AccessPointType, App.AccessPointType>>,
  Expect<Equal<Web.AlertComparator, App.AlertComparator>>,
  Expect<Equal<Web.AlertFeedEntry, App.AlertFeedEntry>>,
  Expect<Equal<Web.AlertMetric, App.AlertMetric>>,
  Expect<Equal<Web.AlertRule, App.AlertRule>>,
  Expect<Equal<Web.AlertRuleMode, App.AlertRuleMode>>,
  Expect<Equal<Web.AlertRuleResponse, App.AlertRuleResponse>>,
  Expect<Equal<Web.AlertRuleScope, App.AlertRuleScope>>,
  Expect<Equal<Web.AlertRuleSeed, App.AlertRuleSeed>>,
  Expect<Equal<Web.AlertRuleSource, App.AlertRuleSource>>,
  Expect<Equal<Web.AlertRulesResponse, App.AlertRulesResponse>>,
  Expect<Equal<Web.AlertSubscriptionEntry, App.AlertSubscriptionEntry>>,
  Expect<Equal<Web.AlertSubscriptionKind, App.AlertSubscriptionKind>>,
  Expect<Equal<Web.AlertSubscriptionsResponse, App.AlertSubscriptionsResponse>>,
  Expect<Equal<Web.AlertsResponse, App.AlertsResponse>>,
  Expect<Equal<Web.AppConfigResponse, App.AppConfigResponse>>,
  Expect<Equal<Web.AppFeatureFlags, App.AppFeatureFlags>>,
  Expect<Equal<Web.CreateFeedbackRequest, App.CreateFeedbackRequest>>,
  Expect<Equal<Web.EddyUpdateEntry, App.EddyUpdateEntry>>,
  Expect<Equal<Web.EddyUpdatesResponse, App.EddyUpdatesResponse>>,
  Expect<Equal<Web.FeedbackContext, App.FeedbackContext>>,
  Expect<Equal<Web.FeedbackContextType, App.FeedbackContextType>>,
  Expect<Equal<Web.FeedbackResponse, App.FeedbackResponse>>,
  Expect<Equal<Web.FeedbackType, App.FeedbackType>>,
  Expect<Equal<Web.GaugeFloodStages, App.GaugeFloodStages>>,
  Expect<Equal<Web.GaugeForecastReading, App.GaugeForecastReading>>,
  Expect<Equal<Web.GaugeHistoryReading, App.GaugeHistoryReading>>,
  Expect<Equal<Web.GaugeTypicalReading, App.GaugeTypicalReading>>,
  Expect<Equal<Web.Hazard, App.Hazard>>,
  Expect<Equal<Web.HazardSeverity, App.HazardSeverity>>,
  Expect<Equal<Web.HazardType, App.HazardType>>,
  Expect<Equal<Web.HazardsResponse, App.HazardsResponse>>,
  Expect<Equal<Web.ManagingAgency, App.ManagingAgency>>,
  Expect<Equal<Web.MapSpring, App.MapSpring>>,
  Expect<Equal<Web.MeEntitlement, App.MeEntitlement>>,
  Expect<Equal<Web.MeEntitlementRefreshResponse, App.MeEntitlementRefreshResponse>>,
  Expect<Equal<Web.MeProfile, App.MeProfile>>,
  Expect<Equal<Web.MeProfileResponse, App.MeProfileResponse>>,
  Expect<Equal<Web.NearbyAccessPoint, App.NearbyAccessPoint>>,
  Expect<Equal<Web.NearbyService, App.NearbyService>>,
  Expect<Equal<Web.NearbyServiceType, App.NearbyServiceType>>,
  Expect<Equal<Web.NotificationPreferences, App.NotificationPreferences>>,
  Expect<Equal<Web.NotificationPreferencesResponse, App.NotificationPreferencesResponse>>,
  Expect<Equal<Web.ParkingCapacity, App.ParkingCapacity>>,
  Expect<Equal<Web.River, App.River>>,
  Expect<Equal<Web.RiverAlert, App.RiverAlert>>,
  Expect<Equal<Web.RiverAlertSeverity, App.RiverAlertSeverity>>,
  Expect<Equal<Web.RiverAlertSource, App.RiverAlertSource>>,
  Expect<Equal<Web.RiverAlertsResponse, App.RiverAlertsResponse>>,
  Expect<Equal<Web.RiverListItem, App.RiverListItem>>,
  Expect<Equal<Web.RiverVisual, App.RiverVisual>>,
  Expect<Equal<Web.RiverVisualLevelGroup, App.RiverVisualLevelGroup>>,
  Expect<Equal<Web.RiverVisualsResponse, App.RiverVisualsResponse>>,
  Expect<Equal<Web.RiversResponse, App.RiversResponse>>,
  Expect<Equal<Web.RoadSurface, App.RoadSurface>>,
  Expect<Equal<Web.SavePlanResponse, App.SavePlanResponse>>,
  Expect<Equal<Web.ServiceOffering, App.ServiceOffering>>,
  Expect<Equal<Web.SpringPositionSource, App.SpringPositionSource>>,
  Expect<Equal<Web.StarredDamEntry, App.StarredDamEntry>>,
  Expect<Equal<Web.StarredDamsResponse, App.StarredDamsResponse>>,
  Expect<Equal<Web.StarredRiverEntry, App.StarredRiverEntry>>,
  Expect<Equal<Web.StarredRiversResponse, App.StarredRiversResponse>>,
  Expect<Equal<Web.VesselType, App.VesselType>>,
  Expect<Equal<Web.VesselTypesResponse, App.VesselTypesResponse>>,
];

/** Shared names that already differ between the two files. Shrink this list. */
const DRIFTED = [
  'AccessPointDetail',
  'AccessPointDetailResponse',
  'AccessPointGaugeStatus',
  'AccessPointsResponse',
  'CampgroundsResponse',
  'ConditionResponse',
  'FloatPlan',
  'FlowRating',
  'GaugeHistoryResponse',
  'PlanResponse',
  'RiverDetailResponse',
  'StarredGaugeEntry',
  'StarredGaugesResponse',
];
const IDENTICAL = [
  'AccessPointType',
  'AlertComparator',
  'AlertFeedEntry',
  'AlertMetric',
  'AlertRule',
  'AlertRuleMode',
  'AlertRuleResponse',
  'AlertRuleScope',
  'AlertRuleSeed',
  'AlertRuleSource',
  'AlertRulesResponse',
  'AlertSubscriptionEntry',
  'AlertSubscriptionKind',
  'AlertSubscriptionsResponse',
  'AlertsResponse',
  'AppConfigResponse',
  'AppFeatureFlags',
  'CreateFeedbackRequest',
  'EddyUpdateEntry',
  'EddyUpdatesResponse',
  'FeedbackContext',
  'FeedbackContextType',
  'FeedbackResponse',
  'FeedbackType',
  'GaugeFloodStages',
  'GaugeForecastReading',
  'GaugeHistoryReading',
  'GaugeTypicalReading',
  'Hazard',
  'HazardSeverity',
  'HazardType',
  'HazardsResponse',
  'ManagingAgency',
  'MapSpring',
  'MeEntitlement',
  'MeEntitlementRefreshResponse',
  'MeProfile',
  'MeProfileResponse',
  'NearbyAccessPoint',
  'NearbyService',
  'NearbyServiceType',
  'NotificationPreferences',
  'NotificationPreferencesResponse',
  'ParkingCapacity',
  'River',
  'RiverAlert',
  'RiverAlertSeverity',
  'RiverAlertSource',
  'RiverAlertsResponse',
  'RiverListItem',
  'RiverVisual',
  'RiverVisualLevelGroup',
  'RiverVisualsResponse',
  'RiversResponse',
  'RoadSurface',
  'SavePlanResponse',
  'ServiceOffering',
  'SpringPositionSource',
  'StarredDamEntry',
  'StarredDamsResponse',
  'StarredRiverEntry',
  'StarredRiversResponse',
  'VesselType',
  'VesselTypesResponse',
];

const exported = (path: string) =>
  new Set([...readFileSync(path, 'utf8').matchAll(/^export (?:interface|type) (\w+)/gm)].map((m) => m[1]));

test('every type name shared by the web API and the iOS app is classified', () => {
  const web = exported('src/types/api.ts');
  const app = exported('../packages/eddy-types/index.ts');
  const shared = [...web].filter((name) => app.has(name)).sort();
  assert.deepEqual(shared, [...IDENTICAL, ...DRIFTED].sort(), 'A shared name is unlisted, or a listed one is gone');
});

