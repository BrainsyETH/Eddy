// packages/eddy-types/index.ts
// Shared API contracts between the Next.js backend and the Expo app.
//
// WHY THIS EXISTS: this project has already been bitten by the same concept
// being implemented more than once and drifting apart (four separate condition
// ladders, two flood-stage overrides). The iOS app is a client of this exact
// backend, so its contracts belong in one place that both sides import.
//
// HOW IT'S WIRED (deliberately NOT an npm workspace): Vercel builds with Root
// Directory = missouri-float-planner/, and converting the repo root to a
// workspace changes how installs resolve there — a real risk to a live deploy.
// Instead the Expo app reaches this directory via Metro `watchFolders` plus a
// tsconfig path alias. Vercel never sees it; the web app keeps building exactly
// as before.
//
// The backend's src/types/api.ts remains authoritative for web-only shapes.
// Move a type here only when BOTH sides use it.

// ── Conditions ───────────────────────────────────────────────────
// NOT redefined here. The canonical condition system lives in
// missouri-float-planner/shared/condition-system.ts, which owns the codes, the
// colours, the labels and BOTH severity orderings, and which states outright
// that nothing else may hardcode condition values.
//
// This file re-exports the type so the API shapes below can reference it
// without a second definition. Anything needing colours, labels or ordering
// should import from shared/condition-system directly:
//   CONDITION_SYSTEM  — colours + labels (never hardcode hex)
//   FLOATABLE_NOW     — the strict flowing/good bucket public counts use
//   WEEKEND_SEVERITY   — floatable-first ordering for "where can I go"
//
// An earlier version of this file duplicated a severity map and a floatable
// helper. Both already existed there, and WEEKEND_SEVERITY had itself already
// been consolidated out of four copies — so the duplicates were re-creating a
// problem someone had explicitly fixed.

export type { ConditionCode } from '../../missouri-float-planner/shared/condition-system';
import type { ConditionCode } from '../../missouri-float-planner/shared/condition-system';

// ── Rivers ───────────────────────────────────────────────────────

export interface River {
  id: string;
  name: string;
  slug: string;
  lengthMiles: number;
  description: string | null;
  difficultyRating: string | null;
  region: string | null;
}

/**
 * Direction of travel for a gauge, as words rather than a number.
 *
 * Deliberately carries NO raw delta. The web's GaugeTrend has one, but it is
 * unit-dependent: "+0.04" reads sensibly in feet and absurdly against a
 * discharge of 944 cfs. `label` is derived from PERCENT change upstream
 * (see computeTrend in the web app), so it is the only part of a trend that
 * means the same thing in both units — which is why it is the only part that
 * crosses this boundary.
 */
export interface RiverReadingTrend {
  direction: 'rising' | 'falling' | 'steady';
  /** e.g. "Rising fast", "Falling slowly", "Holding steady". */
  label: string;
  /** Hours actually spanned, which is near but rarely exactly the 6h requested. */
  windowHours: number;
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
     * Which unit this river's thresholds are defined in — and therefore the ONLY
     * unit its reading may be shown in. 18 of 24 active rivers are 'cfs', so a
     * consumer defaulting to feet is wrong most of the time.
     *
     * Null only when no primary gauge row carries a unit. Consumers must not
     * substitute the other unit's value; see primaryReading() in eddy-ios.
     */
    thresholdUnit: 'ft' | 'cfs' | null;
    gaugeHeightFt: number | null;
    dischargeCfs: number | null;
    readingAgeHours: number | null;
    /** Null when there aren't two readings in the window to compare honestly. */
    trend: RiverReadingTrend | null;
  } | null;
}

export interface RiversResponse {
  rivers: RiverListItem[];
}

// ── Map geometry (GET /api/rivers/[slug]) ────────────────────────
// Mirrors the web app's RiverWithDetails in src/types/api.ts. Only the fields
// the map actually draws are declared here — see the note on MapAccessPoint
// below for why this is a subset rather than a second full definition.

// Bounds is NOT redefined here. packages/eddy-geo already owns it, because the
// tile maths there is what consumes it, and a second identical tuple type is
// exactly the kind of duplication this file exists to prevent.
export type { Bounds } from '../eddy-geo/index';
import type { Bounds } from '../eddy-geo/index';

export interface RiverGeometry {
  type: 'LineString';
  /** [lng, lat] pairs. Can be empty: the endpoint degrades rather than 404s. */
  coordinates: Array<[number, number]>;
}

export interface RiverDetail extends River {
  geometry: RiverGeometry;
  bounds: Bounds;
}

export interface RiverDetailResponse {
  river: RiverDetail;
}

/**
 * The access-point fields the map needs, and only those.
 *
 * The web's AccessPoint carries ~25 fields (NPS campground data, fee notes,
 * road surface, nearby services) that exist for the detail page and would be
 * pure drift risk to restate here. This is a STRUCTURAL SUBSET, so the web type
 * stays assignable to it without either side redefining the other.
 */
export interface MapAccessPoint {
  id: string;
  name: string;
  riverMile: number;
  type: string;
  isPublic: boolean;
  coordinates: { lng: number; lat: number };
  /**
   * Every type this point carries, not just the primary one. OPTIONAL because
   * the field is a later addition on the web side and older rows fall back to a
   * single `type` — a consumer that needs the full set must treat an absent
   * array as `[type]` rather than as "no types".
   *
   * The map filter reads this: a point can be both a boat ramp AND a
   * campground, and filtering on `type` alone would hide it under one of them.
   */
  types?: string[];
  slug?: string;
  description?: string | null;
  amenities?: string[];
  feeRequired?: boolean;
  /**
   * Photographs of the place, best first.
   *
   * Already on the wire — /api/rivers/[slug]/access-points has sent
   * `imageUrls` since the imagery backfill — and simply never declared here, so
   * the app listed put-ins as three lines of text while the website showed what
   * each one looks like. That difference matters more than it sounds: "Cedar
   * Grove Access" is a name, and a photo of a gravel ramp with room for two
   * cars is the thing that tells you whether you can get a trailer down it.
   *
   * OPTIONAL and possibly EMPTY. Coverage is partial and always will be, so
   * every consumer has to have a no-photo layout that is not an apology.
   */
  imageUrls?: string[];
}

export interface AccessPointsResponse {
  accessPoints: MapAccessPoint[];
}

/** Access-point types the planner and the map filters know about. */
export const ACCESS_POINT_TYPES = [
  'boat_ramp',
  'gravel_bar',
  'campground',
  'bridge',
  'access',
  'park',
] as const;

/**
 * Every type this point carries, resolved and in display order.
 *
 * `types` first, falling back to `[type]` — the reason `types` is optional
 * above. Unknown slugs are kept and sorted last rather than dropped: a type the
 * database grows before the app ships is still true about the place.
 */
export function accessPointTypes(point: MapAccessPoint): string[] {
  const all = point.types?.length ? point.types : [point.type];
  const seen = Array.from(new Set(all.filter(Boolean)));
  return seen.sort((a, b) => {
    const ai = ACCESS_POINT_TYPE_ORDER.indexOf(a as AccessPointType);
    const bi = ACCESS_POINT_TYPE_ORDER.indexOf(b as AccessPointType);
    return (ai < 0 ? ACCESS_POINT_TYPE_ORDER.length : ai) -
      (bi < 0 ? ACCESS_POINT_TYPE_ORDER.length : bi);
  });
}

/**
 * Does this access point camp?
 *
 * Written once here because both the map filter and the planner's overnight
 * logic ask the same question, and a second copy would be a second answer.
 */
export function isCampground(point: MapAccessPoint): boolean {
  return accessPointTypes(point).includes('campground');
}

export type AccessPointType = (typeof ACCESS_POINT_TYPES)[number];

/**
 * What to CALL each type on screen.
 *
 * Sentence case, which is the app's register — the website's own map in
 * src/constants/index.ts is Title Case ("Boat Ramp", "River Access") because it
 * sits in headings there. Deliberately not shared with it: the two differ on
 * purpose, and a single map would have to pick a loser.
 *
 * Lives here rather than in a component because three screens ask the same
 * question — the plan sheet, the bail-out list along a route, and the map
 * callout — and it was already answered twice, identically, in two of them.
 */
export const ACCESS_POINT_TYPE_LABELS: Record<AccessPointType, string> = {
  boat_ramp: 'Boat ramp',
  gravel_bar: 'Gravel bar',
  campground: 'Campground',
  bridge: 'Bridge',
  access: 'Access',
  park: 'Park',
};

/**
 * Display order, most-specific-use first: how you get on the water, then
 * whether you can stay, then what the bank is like.
 *
 * Matches ACCESS_POINT_TYPE_ORDER on the website so a point tagged three ways
 * lists them the same on both.
 */
export const ACCESS_POINT_TYPE_ORDER: AccessPointType[] = [
  'access',
  'campground',
  'boat_ramp',
  'gravel_bar',
  'bridge',
  'park',
];

/** Falls back to the de-slugged raw value, so an unmapped type still reads. */
export function accessTypeLabel(type: string): string {
  return ACCESS_POINT_TYPE_LABELS[type as AccessPointType] ?? type.replace(/_/g, ' ');
}

// ── Live conditions (GET /api/conditions/[riverId]) ──────────────
// Mirrors the web app's RiverCondition, narrowed to the fields a phone shows.

export type FlowRating = 'very_low' | 'low' | 'normal' | 'high' | 'very_high';

export interface RiverConditionDetail {
  label: string;
  code: ConditionCode;
  gaugeHeightFt: number | null;
  dischargeCfs: number | null;
  /** Which unit this river's thresholds are actually defined in. */
  thresholdUnit?: 'ft' | 'cfs';
  /** When the river was MEASURED. Quote this, never "now". */
  readingTimestamp: string | null;
  readingAgeHours: number | null;
  /** True when the reading is stale or the gauge is suspect — always surface it. */
  accuracyWarning: boolean;
  accuracyWarningReason: string | null;
  gaugeName: string | null;
  gaugeUsgsId: string | null;
  /**
   * Where today's flow sits against this day-of-year historically, 0-100.
   * Backed by usgs_daily_percentiles — 89,304 rows snapshotted before USGS
   * decommissioned the legacy statistics service.
   */
  percentile?: number | null;
  medianDischargeCfs?: number | null;
  flowRating?: FlowRating;
  flowDescription?: string;
  /**
   * The ladder this reading is graded against, in `thresholdUnit`.
   *
   * Present so the phone can draw the band scale without a second request. A
   * bare "944 cfs" is not a decision — most people cannot say whether that is
   * near the low end or the flood end, and that is more true in cfs than in
   * feet. Bands come from buildZones in @shared/threshold-zones, which the app
   * imports directly so the scale cannot drift from the website's.
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
  usgsUrl?: string | null;
}

export interface ConditionResponse {
  condition: RiverConditionDetail | null;
  available: boolean;
  error?: string;
}

// ── Hazards (GET /api/rivers/[slug]/hazards) ─────────────────────
// Safety data. Free, always — see kindRequiresEntitlement in the alert engine
// for the same rule applied to push.

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
  coordinates: { lng: number; lat: number };
}

export interface HazardsResponse {
  hazards: Hazard[];
}

// ── Gauge stations (GET /api/gauges) ─────────────────────────────
// Every active USGS station Eddy tracks, with its latest reading. One flat
// request for all of them, which is what lets the map draw a gauge layer and
// the search bar match on gauge names without a request per river.

export interface MapGauge {
  id: string;
  usgsSiteId: string;
  name: string;
  /**
   * The endpoint defaults unparseable PostGIS locations to (0, 0) rather than
   * omitting the gauge, so a consumer plotting these MUST drop null island —
   * see hasCoordinates below.
   */
  coordinates: { lng: number; lat: number };
  gaugeHeightFt: number | null;
  dischargeCfs: number | null;
  readingTimestamp: string | null;
  readingAgeHours: number | null;
  /** USGS qualifier codes flag this reading as ice-affected, estimated, or bad. */
  readingSuspect: boolean;
  qualifierNote: string | null;
  /**
   * Which rivers grade against this gauge, and the ladder each grades with.
   *
   * The levels ride along so a client can classify the reading ITSELF rather
   * than asking for a condition per gauge — which is what lets the map paint
   * forty pins in their own colours off one request. Grade them through
   * classifyReading in @eddy/conditions/condition-ladder; never re-implement
   * the comparisons.
   *
   * Null for a station tracked but not yet wired to a river — those still
   * belong on the map, they just have no ladder to colour against.
   */
  thresholds:
    | Array<{
        riverId: string;
        riverName: string;
        riverSlug: string | null;
        isPrimary: boolean;
        thresholdUnit: 'ft' | 'cfs';
        levelTooLow: number | null;
        levelLow: number | null;
        levelOptimalMin: number | null;
        levelOptimalMax: number | null;
        levelHigh: number | null;
        levelDangerous: number | null;
        /** NWS flood stage in feet. Outranks the ladder above when reached. */
        floodStageFt: number | null;
      }>
    | null;
}

export interface GaugesResponse {
  gauges: MapGauge[];
}

// ── The national tier (GET /api/gauges/map) ──────────────────────────────────
// "All Gauges" from docs/EDDY_IOS_STRATEGY.md: ~14,000 USGS stream gauges the
// map draws by viewport. A SEPARATE type from MapGauge rather than a widened
// one, for two reasons:
//
//   1. MapGauge carries a thresholds array with twelve level columns per linked
//      river. Repeating that shape for hundreds of gauges per pan is a payload
//      that exists to be thrown away — a reference gauge has no ladder.
//   2. The two are graded by different code and MUST NOT be confused.
//      gaugeConditionCode() takes a MapGauge and answers a floatability
//      verdict; a MapGaugeLite gets a flow band, which is a comparison to this
//      site's own history and never a verdict. Keeping them structurally
//      distinct is what stops the second becoming the first by accident.

export interface MapGaugeLite {
  /** gauge_stations.id — the key stars are stored under. */
  id: string;
  /** USGS site number, e.g. "07019000". */
  siteId: string;
  name: string;
  /** Nested to match MapGauge, so hasCoordinates() applies unchanged. */
  coordinates: { lng: number; lat: number };
  dischargeCfs: number | null;
  gaugeHeightFt: number | null;
  readingTimestamp: string | null;
  readingAgeHours: number | null;
  /** USGS qualifier codes flag this reading as ice-affected, estimated, or bad. */
  readingSuspect: boolean;
  /**
   * Eddy rates this gauge against a river. When true, the full ladder is
   * available from /api/gauges — this payload deliberately does not carry it.
   */
  curated: boolean;
  /**
   * 0-100 against this site's own discharge on this day of the year.
   *
   * null means we hold no statistics for the site, which is common and is NOT
   * an error: it renders as a neutral pin. Grade it with flowBand() from
   * @eddy/conditions/flow-band — never with the condition ladder.
   */
  flowPercentile: number | null;
}

export interface MapGaugesResponse {
  gauges: MapGaugeLite[];
  /** True when the cap dropped lower-discharge gauges; the UI discloses it. */
  capped: boolean;
  /** How many matched before the cap — what lets the UI say "300 of 1,240". */
  total: number;
}

/** Rejects null island, which /api/gauges emits for an unparseable location. */
export function hasCoordinates(point: { coordinates: { lng: number; lat: number } }): boolean {
  const { lng, lat } = point.coordinates;
  return Number.isFinite(lng) && Number.isFinite(lat) && (lng !== 0 || lat !== 0);
}

// ── Services (GET /api/rivers/[slug]/services) ───────────────────
// Outfitters, campgrounds, shuttles and lodging near a river. Narrowed hard:
// the web response carries booking platforms, fee ranges and NPS site counts
// for a detail page the phone does not have.

export type ServiceType =
  | 'outfitter'
  | 'campground'
  | 'canoe_rental'
  | 'shuttle'
  | 'lodging'
  | string;

export interface RiverService {
  id: string;
  name: string;
  type: ServiceType;
  phone: string | null;
  website: string | null;
  city: string | null;
  state: string | null;
  /** Null when the service has no geocode — it then belongs in a list, not a map. */
  latitude: number | null;
  longitude: number | null;
  description: string | null;
  servicesOffered: string[];
}

export interface ServicesResponse {
  services: RiverService[];
}

// ── Float planning (GET /api/vessel-types, GET /api/plan) ────────
// The planner is the reason the map exists. A plan answers four questions in
// one request — how far, how long, how bad is the shuttle, and what is in the
// water between here and there — because at a put-in on one bar of LTE, four
// round trips is four chances to fail.

export interface VesselType {
  id: string;
  name: string;
  slug: string;
  description: string;
  icon: string;
  speeds: { lowWater: number; normal: number; highWater: number };
}

export interface VesselTypesResponse {
  vesselTypes: VesselType[];
}

export interface FloatPlanCondition {
  label: string;
  code: ConditionCode;
  gaugeHeightFt: number | null;
  dischargeCfs: number | null;
  thresholdUnit: 'ft' | 'cfs';
  readingTimestamp?: string | null;
  readingAgeHours?: number | null;
  accuracyWarning: boolean;
  accuracyWarningReason?: string | null;
  gaugeName?: string | null;
  gaugeUsgsId?: string | null;
  percentile?: number | null;
  medianDischargeCfs?: number | null;
}

export interface FloatPlan {
  river: River;
  putIn: MapAccessPoint;
  takeOut: MapAccessPoint;
  vessel: VesselType;
  distance: { miles: number; formatted: string };
  /**
   * NULL IS A VERDICT, NOT A GAP. The server refuses to estimate a float time
   * in dangerous water — publishing "about 5 hours" for a river in flood would
   * be an invitation. Render the absence as the warning it is.
   */
  floatTime: {
    minutes: number;
    formatted: string;
    speedMph: number;
    isEstimate?: boolean;
    /** 'trip' includes typical stops; 'moving' is paddling-only. */
    basis?: 'trip' | 'moving';
    timeRange?: { min: number; max: number };
  } | null;
  /** Take-out → put-in, which is the direction the shuttle actually drives. */
  driveBack: {
    minutes: number;
    miles: number;
    formatted: string;
    routeSummary: string | null;
    routeGeometry: RiverGeometry | null;
  };
  condition: FloatPlanCondition;
  hazards: Hazard[];
  /** The floated stretch itself. Geometry can be null on an unmapped segment. */
  route: { type: 'Feature'; geometry: RiverGeometry | null; properties: unknown };
  /**
   * Everything the server thinks is worth saying out loud: a worse gauge inside
   * the span, a stale reading, an implausible shuttle, a put-in with no road.
   * Never filter these down on the client.
   */
  warnings: string[];
}

export interface PlanResponse {
  plan: FloatPlan;
}

export interface SavePlanResponse {
  shortCode: string;
  url: string;
}

/**
 * Campgrounds along a planned stretch (GET /api/plan/campgrounds).
 *
 * The server does the spacing, not the client: a database function walks the
 * segment and returns camps at floatable intervals (10–15 river miles by
 * default), which is a different list from "every campground on this river".
 *
 * `recommendedStops` is nights, i.e. `tripDurationDays - 1`. It can disagree
 * with `campgrounds.length` — a stretch may simply not have four well-spaced
 * camps on it — and that disagreement is information, not an error to hide.
 * The endpoint requires `tripDurationDays >= 2` and 400s below that.
 */
export interface CampgroundsResponse {
  campgrounds: MapAccessPoint[];
  totalDistance: number;
  recommendedStops: number;
}

// ── Search (GET /api/search) ─────────────────────────────────────
// One query across rivers, gauges and access points. Server-side rather than a
// downloaded index: there are ~500 access points, and shipping all of them to
// every phone that opens the map would cost more than the feature is worth.

export type SearchResultKind = 'river' | 'gauge' | 'access_point';

export interface SearchResult {
  kind: SearchResultKind;
  id: string;
  name: string;
  /** Pre-composed second line — the server owns this wording, not the client. */
  subtitle: string | null;
  riverId: string | null;
  riverName: string | null;
  riverSlug: string | null;
  riverMile: number | null;
  coordinates: { lng: number; lat: number } | null;
}

export interface SearchResponse {
  query: string;
  results: SearchResult[];
}

// ── Alert events (the outbox the app's Alerts tab reads) ─────────

export type EventKind = 'floatable' | 'warning' | 'easing' | 'recovery' | 'info';

export interface RiverConditionEvent {
  id: string;
  riverId: string;
  oldConditionCode: ConditionCode;
  newConditionCode: ConditionCode;
  kind: EventKind;
  /** Quote this in UI copy, never detectedAt — see the latency note below. */
  readingAt: string | null;
  detectedAt: string;
}

/**
 * USGS reporting lag plus the cron cadence means an alert lands roughly 20–75
 * minutes after the real transition. Copy must say "first to know", never
 * "instantly", and should surface `readingAt` rather than `detectedAt`.
 */
export const ALERT_LATENCY_NOTE = 'Conditions are checked regularly; readings can lag the river by up to about an hour.';

// ── River outlook (GET /api/rivers/[slug]/outlook) ───────────────
// The 72-hour picture and Eddy's interpretation, assembled server-side.
//
// The website builds this in the browser from three separate fetches (weather,
// NWS forecast, gauge history). The phone gets it finished instead: three round
// trips at a put-in on one bar of LTE is three chances to fail, and the phone
// has no business holding threshold ladders to do the arithmetic itself.

/**
 * The decision hierarchy. Three fields, and the split between them is load
 * bearing: `eddyRead` interprets the river as it stands NOW, `watchFor` owns
 * everything forward-looking. Collapsing them into one paragraph is what makes
 * a report restate the same NWS sentence twice.
 */
export interface EddyTakeSections {
  /** The call, not the label — "Stay off the river today", never "This is High". */
  bottomLine: string;
  eddyRead: string;
  watchFor: string;
}

export interface OutlookWeatherDay {
  date: string;
  dayOfWeek: string;
  tempHigh: number;
  tempLow: number;
  condition: string;
  /** OpenWeather icon code, e.g. '10d'. Clients map it to their own glyphs. */
  conditionIcon: string;
  /** Probability, 0-100. */
  precipitation: number;
}

export interface RiverOutlookDay {
  date: string;
  weather: OutlookWeatherDay | null;
  /**
   * NWS forecast stage. ALWAYS feet, even on a cfs-rated river — the NWS
   * publishes stage only — and `conditionCode` is graded against the river's
   * foot ladder accordingly. Never render `valueFt` beside a cfs reading
   * without saying which is which.
   */
  river: { valueFt: number | null; conditionCode: ConditionCode | null };
  /** Emphasis decided server-side so clients cannot drift on what counts. */
  rainKind: 'none' | 'unlikely' | 'possible' | 'significant';
  rainLabel: string;
  heatAdvisory: boolean;
}

export interface RiverOutlookResponse {
  available: boolean;
  sections: EddyTakeSections | null;
  days: RiverOutlookDay[];
  sourceKind: 'checking' | 'official' | 'guidance';
  sourceLabel: string;
  hasOfficialForecast: boolean;
  /** True when there is no official hydrograph and this is weather-only. */
  isGuidance: boolean;
  trend: RiverReadingTrend | null;
  currentCondition: ConditionCode;
  gaugeName: string | null;
  /**
   * The station this whole answer describes.
   *
   * OPTIONAL, because an app build can outrun a deploy. When a caller asked for
   * a specific gauge, this is how it tells whether it got one — an unknown id
   * falls back to the river's primary rather than failing, and a screen that
   * could not see the difference would label the primary's forecast and read
   * with the name of a station ninety miles away.
   */
  gaugeStationId?: string | null;
  /**
   * The town the weather above was actually fetched at.
   *
   * OPTIONAL because an app build can outrun a deploy. Null and absent both mean
   * "do not label it" — never substitute the river's name, which is not a place
   * a forecast comes from.
   */
  weatherLocation?: string | null;
  /**
   * The long read: the same multi-paragraph prose /rivers shows on the web, as
   * against `sections.eddyRead`, which is one line.
   *
   * OPTIONAL for the same forward-compatibility reason. Null means either that
   * no model wrote one or that the live river has moved far enough that the
   * prose would contradict the condition badge — the server withholds it in
   * that case, and a client must NOT paper over the difference by reaching for
   * its own cached copy.
   */
  fullRead?: string | null;
  /** Non-null only when a model wrote the read; null means deterministic copy. */
  generatedAt: string | null;
}

export interface AlertFeedEntry {
  id: string;
  riverId: string;
  riverName: string;
  riverSlug: string;
  oldConditionCode: ConditionCode;
  newConditionCode: ConditionCode;
  kind: EventKind;
  /** In the gauge's primary unit only — never a cross-unit fallback. */
  readingValue: number | null;
  readingUnit: 'ft' | 'cfs' | null;
  /** When the river was MEASURED. Quote this, not detectedAt. */
  readingAt: string | null;
  detectedAt: string;
}

export interface AlertsResponse {
  alerts: AlertFeedEntry[];
}

// ── Consumer account endpoints (/api/me/*) ───────────────────────

export interface MeEntitlement {
  entitlementId: string;
  /** Derived server-side from expires_at; never trust a client clock. */
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

/** Response from DELETE /api/me. */
export interface MeDeleteResponse {
  ok: true;
  /** Rows removed per table — float_plans is deleted explicitly, not cascaded. */
  deleted: Record<string, number>;
  /**
   * True when the account had a live subscription at deletion time. Deleting an
   * account CANNOT cancel an Apple subscription — only the user can, in their
   * Apple ID settings — so the app has to say so rather than imply billing
   * stopped.
   */
  hadActiveEntitlement: boolean;
}

export interface StarredGaugeEntry {
  gaugeId: string;
  gaugeName: string;
  usgsSiteId: string;
  /** The river this gauge is PRIMARY for, when it is primary for one. */
  riverName: string | null;
  riverSlug: string | null;
  starredAt: string;
}

/** Response for GET /api/me/starred-gauges */
export interface StarredGaugesResponse {
  starred: StarredGaugeEntry[];
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

export interface AlertSubscriptionEntry {
  id: string;
  riverId: string;
  riverName: string;
  riverSlug: string;
  kind: AlertSubscriptionKind;
  oneShot: boolean;
  firedAt: string | null;
  createdAt: string;
}

export interface AlertSubscriptionsResponse {
  subscriptions: AlertSubscriptionEntry[];
}

// ── Remote config / kill switches (GET /api/app-config) ──────────

export interface AppFeatureFlags {
  push: boolean;
  offlineDownloads: boolean;
  planner: boolean;
  chat: boolean;
}

export interface AppConfigResponse {
  /** Builds below this must refuse to run and prompt for an upgrade. */
  minSupportedVersion: string;
  latestVersion: string;
  upgradeMessage: string | null;
  features: AppFeatureFlags;
  minRefreshSeconds: number;
  notice: string | null;
}

/**
 * Compares dotted numeric versions. Returns <0, 0, >0 like a sort comparator.
 *
 * Missing segments count as 0, so "1.2" === "1.2.0". Non-numeric segments are
 * treated as 0 rather than NaN: a malformed version must not silently compare
 * as "newer than everything" and let an unsupported build through.
 */
export function compareVersions(a: string, b: string): number {
  const parse = (v: string) =>
    String(v ?? '')
      .split('.')
      .map((part) => {
        const n = parseInt(part, 10);
        return Number.isFinite(n) ? n : 0;
      });

  const left = parse(a);
  const right = parse(b);
  const len = Math.max(left.length, right.length);

  for (let i = 0; i < len; i++) {
    const diff = (left[i] ?? 0) - (right[i] ?? 0);
    if (diff !== 0) return diff < 0 ? -1 : 1;
  }
  return 0;
}

/**
 * Whether this build is below the server's supported floor.
 *
 * Fails OPEN: if either version is missing we return false (allow the app to
 * run). Locking someone out because config was unreadable is far worse than
 * briefly letting an old build through — and /api/app-config already serves
 * permissive defaults for the same reason.
 */
export function isUpgradeRequired(
  currentVersion: string | null | undefined,
  minSupportedVersion: string | null | undefined,
): boolean {
  if (!currentVersion || !minSupportedVersion) return false;
  return compareVersions(currentVersion, minSupportedVersion) < 0;
}

// ── River visuals ───────────────────────────────────────────────────────────
// What the river actually looks like, banded by the condition it was photographed
// at. Ported from the web app's src/types/api.ts, which has served the same
// endpoint to the website's gallery since it shipped.
//
// THE BANDING IS THE POINT. These are not decorative river photos — each one
// carries the reading it was taken at and the level that reading grades to, so
// the question they answer is "what does 900 cfs look like here", not "is this
// river pretty". A photo shown without its level would be the second thing while
// claiming to be the first.

export interface RiverVisual {
  id: string;
  imageUrl: string;
  description: string;
  gaugeHeightFt: number | null;
  dischargeCfs: number | null;
  /**
   * Which of the two readings above this photo was BANDED on — from the photo's
   * own gauge, not the river's. Optional because it post-dates the endpoint;
   * treat a missing value the way readingCopy does, as "no declared unit".
   */
  thresholdUnit?: 'ft' | 'cfs';
  accessPointId: string | null;
  accessPointName: string | null;
  accessPointHref: string | null;
  gaugeStationId: string | null;
  gaugeName: string | null;
  submitterName: string | null;
  conditionCode: ConditionCode;
  capturedAt: string | null;
  createdAt: string;
}

export interface RiverVisualLevelGroup {
  code: ConditionCode;
  visuals: RiverVisual[];
}

export interface RiverVisualsResponse {
  /**
   * Photos matching the river's CURRENT condition, proximity-sorted.
   *
   * Frequently empty even where photos exist — a river with four photos taken
   * at flowing and one at flood has nothing here on a low-water day — so a
   * consumer that reads only this field shows an empty card most of the time.
   * Fall back to `byLevel` and say which level is being shown.
   */
  visuals: RiverVisual[];
  /** Every verified photo grouped by level (dry → flood); non-empty bands only. */
  byLevel: RiverVisualLevelGroup[];
  currentCondition: ConditionCode;
  currentGaugeHeightFt: number | null;
  currentDischargeCfs: number | null;
}
