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

// ── One access point (GET /api/rivers/[slug]/access/[accessSlug]) ────────────
// Everything the website's access page renders, which is a great deal more than
// MapAccessPoint holds.
//
// MapAccessPoint is deliberately a SUBSET — "the fields the map needs, and only
// those" — because it arrives several hundred at a time and most of it would be
// thrown away. This is the opposite case: one place, fetched because somebody
// tapped it, and the questions they have standing in a driveway with a boat on
// the roof are exactly the ones the extra fields answer. Can I get down there in
// a two-wheel-drive. Is there room to park. Is there a toilet. Who do I call for
// a shuttle. How far to the next take-out.
//
// A SECOND type rather than optional fields on the first, so nothing can render
// a list row expecting detail that the list endpoint never sends.

export type RoadSurface =
  | 'paved'
  | 'gravel_maintained'
  | 'gravel_unmaintained'
  | 'dirt'
  | 'seasonal'
  | '4wd_required';

export type ManagingAgency =
  | 'MDC'
  | 'NPS'
  | 'USFS'
  | 'COE'
  | 'State Park'
  | 'County'
  | 'Municipal'
  | 'Private';

/**
 * Free text on the wire, not a number: the column stores buckets ('roadside',
 * 'limited', '50+') alongside plain counts, and coercing '50+' to 50 would state
 * something the data does not.
 */
export type ParkingCapacity =
  | '5' | '10' | '15' | '20' | '25' | '30' | '50+'
  | 'roadside' | 'limited' | 'unknown';

export type NearbyServiceType =
  | 'outfitter'
  | 'campground'
  | 'canoe_rental'
  | 'shuttle'
  | 'lodging';

/**
 * An outfitter or shuttle attached to THIS access point.
 *
 * A different shape from RiverService, and not a duplicate of it: that one is a
 * geocoded row in the services directory for a whole river, and this is a hand-
 * curated note on one put-in ("2 mi", "weekends only after Labor Day"). Every
 * field but name and type is optional because most entries carry two of them.
 */
export interface NearbyService {
  name: string;
  type: NearbyServiceType;
  phone?: string;
  website?: string;
  /** Pre-composed distance text — "2 mi". Never a number to do maths on. */
  distance?: string;
  notes?: string;
}

/**
 * The reading at the gauge that governs this access point.
 *
 * Pre-graded by the server, unlike everywhere else in this file where the app
 * classifies a reading itself against a ladder it was sent. That is fine here
 * because this shape carries no ladder to classify against — and it means the
 * access page and the river page cannot disagree about the same water.
 */
export interface AccessPointGaugeStatus {
  level: ConditionCode;
  cfs: number | null;
  heightFt: number | null;
  label: string;
  trend: 'rising' | 'falling' | 'steady' | null;
  lastUpdated: string | null;
  gaugeId: string;
  gaugeName: string;
  /** The site id — what /api/gauges/[siteId] and its history key off. */
  usgsId: string;
}

/** A neighbouring put-in, for "what's the next take-out from here". */
export interface NearbyAccessPoint {
  id: string;
  name: string;
  slug: string;
  direction: 'upstream' | 'downstream';
  distanceMiles: number;
  /** Pre-composed — "~1.5 hr". Null when the stretch has no float estimate. */
  estimatedFloatTime: string | null;
  riverMile: number;
}

/**
 * NPS campground enrichment, narrowed hard.
 *
 * The web type carries operating hours, weather overviews, credits on every
 * photo and eight separate site-count columns for a desktop table. A phone
 * screen wants to know whether you can book it and roughly how big it is, so
 * that is what crosses the wire here.
 */
export interface NpsCampgroundSummary {
  name: string;
  npsUrl: string | null;
  reservationInfo: string | null;
  reservationUrl: string | null;
  totalSites: number;
  sitesReservable: number;
  sitesFirstCome: number;
}

export interface AccessPointDetail {
  id: string;
  riverId: string;
  name: string;
  slug: string;
  riverMile: number;
  type: AccessPointType;
  types: AccessPointType[];
  isPublic: boolean;
  ownership: string | null;
  description: string | null;
  amenities: string[];
  parkingInfo: string | null;
  roadAccess: string | null;
  facilities: string | null;
  feeRequired: boolean;
  feeNotes: string | null;
  imageUrls: string[];
  coordinates: { lng: number; lat: number };
  roadSurface: RoadSurface[];
  parkingCapacity: ParkingCapacity | null;
  managingAgency: ManagingAgency | null;
  officialSiteUrl: string | null;
  /**
   * HTML from the admin's rich-text editor, NOT plain text.
   *
   * There is no HTML renderer in the app and adding one for a single field is
   * not worth a dependency, so consumers strip it — see stripHtml in
   * src/lib/accessCopy.ts. Never put this in a <Text> as-is.
   */
  localTips: string | null;
  nearbyServices: NearbyService[];
  /**
   * Where to actually DRIVE, when it differs from where the boat goes in.
   *
   * A gravel bar's coordinate is on the water; the parking area can be a
   * quarter mile up a track. Directions must prefer these and fall back to
   * `coordinates` — see driveToUrl.
   */
  drivingLat: number | null;
  drivingLng: number | null;
  /**
   * Canonical WEB path, e.g. /rivers/missouri/current/access/akers-ferry
   *
   * Note the shape is the WEBSITE's, not this app's — the app routes to
   * /river/<slug>/access/<accessSlug>, with no state segment, and cannot
   * reconstruct the web one because the state is not in this payload. It is
   * served for exactly that reason: it is what a share sheet must hand out.
   * Sibling of RiverListItem.path.
   *
   * OPTIONAL here and required in the website's own copy of this type, which is
   * the difference between "the server always sends it" and "this build of the
   * app can be talking to a deploy that predates it". A TestFlight build outlives
   * the deploy it was cut against; consumers must treat its absence as "no share
   * button" rather than shipping a link to /undefined. Same rule the gauge-detail
   * fetch already follows.
   */
  path?: string;
  river: { id: string; name: string; slug: string };
  npsCampground: NpsCampgroundSummary | null;
}

export interface AccessPointDetailResponse {
  accessPoint: AccessPointDetail;
  nearbyAccessPoints: NearbyAccessPoint[];
  /** Null when the river has no gauge, or when its reading failed to load. */
  gaugeStatus: AccessPointGaugeStatus | null;
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
  /**
   * The station's provider-native site id — a USGS site number, an NWS LID, or
   * a USACE dam slug. Named `usgsSiteId` for history: it predates
   * multi-provider support and has call sites across both apps, so renaming it
   * to `siteId` is a separate refactor. Pair it with the station's provider
   * before building any provider-specific URL.
   *
   * NULLABLE, and not hypothetically: gauge_stations keeps the id in
   * `usgs_site_id` OR `site_id_external` depending on provider, both columns
   * are nullable, and /api/gauges sends whichever it finds. A station carrying
   * neither arrives here as null — which is how the Search tab crashed on
   * `.toLowerCase()` of a USACE dam's id. Nothing may assume a string.
   */
  usgsSiteId: string | null;
  /**
   * Registry id from the backend's flow-provider registry; 'usgs' when the
   * column is null. /api/gauges has always sent this — it was simply missing
   * from this type, which is how the app came to render a USACE dam as
   * "USGS swl-clearwater-dam" and link it to a waterdata.usgs.gov 404.
   *
   * Optional because the field post-dates some cached payloads; read it as
   * `provider ?? 'usgs'` and never assume USGS without checking.
   */
  provider?: string;
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

// ── One gauge (GET /api/gauges/[siteId]) ─────────────────────────────────────
// The gauge screen's own endpoint, and the only one that answers for BOTH tiers.
//
// /api/gauges is curated-only (it has to be — see its header on the 414 it took
// when it was not) and /api/gauges/map is bounded by a viewport. The gauge
// screen is reached from a callout, a starred row, a search result and a deep
// link, and in most of those the station is a national one that neither list
// has ever returned. Asking for a 300-gauge viewport to render one station is
// the shape that was worth a route.
//
// It is a THIRD gauge type rather than a widened MapGauge, for the same reason
// MapGaugeLite is a second one: the two tiers are graded by different code and
// must not be confusable. This one spans both, so it carries `curated` and a
// nullable ladder, and a consumer has to branch on those rather than on which
// endpoint the object came from.

export interface GaugeDetailThreshold {
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
}

/**
 * Official NWS thresholds for a station, in FEET.
 *
 * ── Why an uncurated gauge is allowed to have these ────────────────────────
 * Eddy issues a floatability verdict only about stretches a human has rated,
 * and that rule is not bent here: these are the National Weather Service's
 * numbers, for about 12,700 forecast points, quoted. Relaying somebody else's
 * published threshold is not the same as inventing one — which is what makes
 * this the only safety-adjacent fact the national tier gets to carry.
 *
 * ── FEET, and only feet ────────────────────────────────────────────────────
 * NWPS publishes these as stages; its category `flow` field comes back as
 * -9999 everywhere. So every one of these compares against `gaugeHeightFt` and
 * NOTHING may compare them against discharge — a station rated in cfs whose
 * flood stage is 20 would otherwise read as flooding at 20 cfs. Consumers guard
 * on the unit before drawing or grading, the same way the condition ladder is
 * guarded.
 *
 * Any field can be null; most stations publish two of the four and some
 * publish none, in which case the whole object is null rather than four nulls.
 */
export interface GaugeFloodStages {
  /** Where the Weather Service starts watching. Below minor flood. */
  actionFt: number | null;
  /** Minor flood — what "flood stage" means unqualified. */
  floodFt: number | null;
  moderateFt: number | null;
  majorFt: number | null;
  /**
   * The NWS location id these came from, e.g. "VNBM7".
   *
   * Carried so the number is attributable rather than anonymous, and because it
   * is the id the Weather Service's own page for this gauge is keyed on.
   */
  lid: string | null;
  /**
   * Where the numbers came from.
   *
   * 'nwps' is the station-level import, matched spatially against the NOAA
   * gauge layer. 'curated' is river_gauges, whose stages were accepted only
   * after the USGS id NWPS reported matched ours — a stricter check than
   * proximity. Surfaced because the two were gathered differently and a reader
   * comparing an Eddy river against a creek beside it deserves to know which.
   */
  source: 'nwps' | 'curated';
}

export interface GaugeDetail {
  /** gauge_stations.id — the key stars are stored under. */
  id: string;
  /** The provider-native site id, and what every per-gauge route keys off. */
  siteId: string;
  name: string;
  /** Registry id from the backend's flow-provider registry; 'usgs' by default. */
  provider: string;
  /**
   * Eddy rates this station against at least one river.
   *
   * THE BRANCH. A curated gauge gets a condition verdict from the ladder below;
   * an uncurated one gets a flow band, which is a comparison to its own history
   * and never a verdict. Nothing may grade one as the other.
   */
  curated: boolean;
  coordinates: { lng: number; lat: number };
  gaugeHeightFt: number | null;
  dischargeCfs: number | null;
  readingTimestamp: string | null;
  readingAgeHours: number | null;
  readingSuspect: boolean;
  qualifierNote: string | null;
  /** 0-100 vs this site's own day-of-year history; null when none is held. */
  flowPercentile: number | null;
  /**
   * Null — not an empty array — for a station Eddy has not rated, so "no ladder
   * exists" is distinguishable from "the ladder came back empty". Primary
   * association first, so `[0]` is the river the app should open.
   */
  thresholds: GaugeDetailThreshold[] | null;
  /**
   * NWS stages, from whichever source holds them for this tier. Null when the
   * station is not an NWS forecast point, which is most of them.
   */
  floodStages: GaugeFloodStages | null;
  /** The station's own public page, or null for a provider without one. */
  publicUrl: string | null;
  /**
   * What this station's reading means, in the words written for it
   * (gauge_stations.threshold_descriptions.note).
   *
   * The only vocabulary left for a station with neither a ladder nor a
   * percentile — which is precisely a USACE dam release. Migration 00198 wrote
   * the one that matters: the Black below Clearwater runs at whatever the
   * Corps releases, and releases can change without notice.
   *
   * Optional: it post-dates deployed builds of the endpoint.
   */
  stationNote?: string | null;
}

export interface GaugeDetailResponse {
  gauge: GaugeDetail;
}

// ── Gauge history (GET /api/gauges/[siteId]/history?days=) ───────────────────
// The hydrograph behind the chart. Served from stored readings, falling back to
// the live provider when what is stored is sparse OR stale — which is the
// ordinary case for every station the cron no longer polls, i.e. all ~14,000
// national ones. Works for any station, both tiers.
//
// Downsampled server-side to roughly one point per hour, so a 30-day request is
// ~720 points rather than ~2,900. Nothing here should re-sample it.

export interface GaugeHistoryReading {
  timestamp: string;
  gaugeHeightFt: number | null;
  dischargeCfs: number | null;
}

export interface GaugeHistoryResponse {
  siteId: string;
  siteName: string;
  /** Oldest first. Can be empty; the endpoint 404s only when it has nothing. */
  readings: GaugeHistoryReading[];
  /**
   * Extremes over the returned window, per unit.
   *
   * Null when the station publishes nothing in that unit — which is why the
   * chart must pick its axis from the unit it is DRAWING rather than assuming
   * both are present. A stage-only station has null discharge bounds and vice
   * versa, and there are plenty of each.
   */
  stats: {
    minDischarge: number | null;
    maxDischarge: number | null;
    minHeight: number | null;
    maxHeight: number | null;
  };
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

/**
 * The live reading a gauge result carries.
 *
 * NESTED, and present only on `gauge` rows. A river result has a condition that
 * means something else entirely and an access point has no reading at all, so
 * six nullable columns at the top of SearchResult would invite exactly the
 * confusion between a VERDICT and a COMPARISON that the two filter bars are
 * built to keep visible.
 *
 * OPTIONAL on the wire. Older deployments of the website answer /api/search
 * without it, and the Search tab has to render those rows rather than treat a
 * missing field as an error — same posture the whole endpoint already takes.
 */
export interface SearchResultGauge {
  /** Eddy rates this station against a river; it has a condition ladder. */
  curated: boolean;
  gaugeHeightFt: number | null;
  dischargeCfs: number | null;
  readingTimestamp: string | null;
  readingAgeHours: number | null;
  /** 0-100 vs this site's own day-of-year history; null when none is held. */
  flowPercentile: number | null;
}

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
  /**
   * The station's provider-native site id. Gauge results only.
   *
   * REQUIRED to open one: every per-gauge route keys off this, not off `id`,
   * which is the gauge_stations uuid. Optional here because it is a later
   * addition to the endpoint — a result without one cannot be navigated to and
   * the client must fall back to selecting it rather than pushing a screen.
   */
  siteId?: string | null;
  /** Gauge results only; null when the station has no stored reading. */
  gauge?: SearchResultGauge | null;
  /**
   * The access point's own slug. Access-point results only.
   *
   * Required to OPEN one: its detail route is
   * /api/rivers/[slug]/access/[accessSlug], and `riverSlug` is only half of
   * that pair. Optional here for the same reason as `siteId` — a later addition
   * to the endpoint, so a result without one renders but cannot be navigated to.
   */
  accessSlug?: string | null;
}

export interface SearchResponse {
  query: string;
  results: SearchResult[];
  /**
   * Whether a page exists past this one. Optional because a deployed website
   * older than the paging change does not send it, and the app ships through
   * App Store review while the site does not — absent means "assume not", which
   * degrades a paged list to the single page it used to be.
   *
   * Never infer this from `results.length === limit`: a multi-kind page is
   * allocated across kinds and can come back short while every kind has more.
   */
  hasMore?: boolean;
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

/**
 * How far back the condition feed reaches.
 *
 * The feed is a LOG of what rivers have done, not a per-user inbox — the rows
 * are the same for everybody, so there is nothing to mark read and nothing to
 * delete. That only works if it ages out on its own, and it did not: /api/alerts
 * bounded by `limit` alone, which means "the last N events ever". Six days after
 * the outbox shipped that still looked like recent news; six months after, it
 * would have been a screen of history with no way to clear it, which is exactly
 * how it gets mistaken for a broken inbox.
 *
 * Seven days because a condition change older than that is not a plan you can
 * act on — the river has moved since — and the river screen carries the current
 * reading anyway.
 */
export const ALERT_FEED_WINDOW_DAYS = 7;

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

// ── High water right now (GET /api/high-water) ───────────────────
//
// A SNAPSHOT, and deliberately not the feed above. AlertFeedEntry is a
// TRANSITION — it has an old code and a new one, and it exists because
// something changed. A HighWaterEntry is a STATE: this river is high, as of
// now, whether or not it moved today.
//
// The two are kept structurally distinct so neither can be mistaken for the
// other. A river that has been in flood for a fortnight belongs on one and not
// the other, and a good→flowing flicker belongs on the other and not this one.

export type HighWaterKind = 'river' | 'gauge' | 'dam';

export interface HighWaterEntry {
  kind: HighWaterKind;
  /** Prefixed by kind — a river id and a gauge id can otherwise collide. */
  id: string;
  name: string;
  subtitle: string | null;
  /**
   * Always `high` or `dangerous`. The endpoint filters on RUNNING_HIGH, so a
   * consumer never has to; the code is here to colour the row and to tell the
   * two apart, which the label alone does not — `dangerous` reads "Flood".
   */
  conditionCode: ConditionCode;
  conditionLabel: string;
  /**
   * The reading in `readingUnit`, and ONLY in that unit. Null when the station
   * published nothing in the unit its ladder is defined in — never the other
   * unit's number, which would be graded against the wrong thresholds.
   */
  readingValue: number | null;
  readingUnit: 'ft' | 'cfs' | null;
  readingAgeHours: number | null;
  /** Route targets. A row opens whichever of these it has. */
  riverSlug: string | null;
  siteId: string | null;
  damId: string | null;
}

export interface HighWaterResponse {
  entries: HighWaterEntry[];
  /** When the snapshot was taken, so a screen can say "as of". */
  asOf: string;
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

export interface StarredDamEntry {
  /**
   * The USACE registry slug, e.g. 'swl-clearwater-dam'.
   *
   * NOT a uuid, unlike the other two star kinds. Dams are read through from
   * CWMS and SWPA rather than stored, so their identity lives in the web app's
   * usace-registry — see migration 00206 for why starred_dams has no FK.
   */
  damId: string;
  damName: string;
  lakeName: string | null;
  /** The tailwater river, when this dam controls one. Only Clearwater today. */
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

// ── Alert rules (GET /api/me/alerts) ─────────────────────────────
//
// The MERGED view of everything a user has asked to be told about. Two tables
// stand behind it — alert_subscriptions for river condition alerts, which are
// fanned out from a global outbox, and gauge_alert_subscriptions for per-rule
// evaluation — because a user-defined level cannot be precomputed into one
// shared event. See migration 00200 for that argument in full.
//
// The split is a SERVER concern. A client that had to know which table a rule
// lived in would have to reimplement the routing rule every time it listed,
// paused or deleted one, so `source` exists to be echoed back on writes and for
// nothing else.

export type AlertRuleSource = 'river_condition' | 'gauge';

/** What the rule is ABOUT, which is not the same as where it is stored. */
export type AlertRuleScope = 'river' | 'gauge';

/**
 * How the rule decides.
 *
 * `condition` defers to Eddy's ladder — the same verdict the river screen shows,
 * so the alert and the app can never disagree. `threshold` is the user's own
 * number, which is the thing the ladder cannot express: a ladder says "high",
 * and some people want to know at 3.2 ft specifically.
 */
export type AlertRuleMode = 'condition' | 'threshold';

/**
 * Which series a threshold is measured against. EXPLICIT, never inferred from
 * whichever value happens to be present — grading a cfs number against a foot
 * threshold is exactly the cross-unit mistake the reading helpers in this
 * codebase refuse to make.
 */
export type AlertMetric = 'gauge_height_ft' | 'discharge_cfs';

export type AlertComparator = 'above' | 'below' | 'between';

export interface AlertRule {
  id: string;
  /** Which table this lives in — echo it back on PATCH/DELETE. */
  source: AlertRuleSource;
  scope: AlertRuleScope;
  mode: AlertRuleMode;

  riverId: string | null;
  riverName: string | null;
  riverSlug: string | null;

  /** gauge_stations uuid. Null for a river-condition rule. */
  gaugeId: string | null;
  gaugeName: string | null;
  /** The provider-native site id — what /gauge/[siteId] routes on. */
  usgsSiteId: string | null;
  /**
   * False when the station has no condition ladder, i.e. the national tier.
   * Such a rule can only ever be `threshold` mode; offering the user a
   * condition picker for one would be offering a verdict Eddy does not issue.
   */
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

  /** Condition mode only. */
  conditionKind: AlertSubscriptionKind | null;

  /** Threshold mode only. */
  metric: AlertMetric | null;
  comparator: AlertComparator | null;
  thresholdValue: number | null;
  thresholdValueMax: number | null;

  enabled: boolean;
  oneShot: boolean;
  /** Set once a one-shot has been spent; clearing it re-arms the rule. */
  firedAt: string | null;
  lastTriggeredAt: string | null;
  createdAt: string;
}

export interface AlertRulesResponse {
  rules: AlertRule[];
}

/**
 * The reading a rule was seeded from, returned by POST /api/me/gauge-alerts.
 *
 * A new rule starts already knowing which side of its threshold the river is on,
 * so it fires on the next CROSSING rather than immediately. The app needs this
 * value to say so — "the Meramec is at 5.2 ft now, we'll tell you the next time
 * it comes up past 3.0 ft" — because a rule that silently declines to fire on
 * water the user can see reads like a bug.
 */
export interface AlertRuleSeed {
  value: number | null;
  unit: 'ft' | 'cfs' | null;
  readingAt: string | null;
  /** 'inside' means the condition is already met at creation time. */
  state: 'inside' | 'outside' | null;
}

export interface AlertRuleResponse {
  rule: AlertRule;
  seed: AlertRuleSeed | null;
}

/**
 * The national tier refreshes ONCE AN HOUR (sync-gauge-latest runs at :20),
 * against curated stations' 15 minutes on a rising river. Alerts on an
 * uncurated gauge are correspondingly slower, and a screen that shows both
 * kinds side by side has to say which one the user is looking at.
 */
export const GAUGE_ALERT_LATENCY_NOTE =
  'This gauge updates about once an hour, so alerts on it can lag the river by more than that.';

/** Stage to two decimals, discharge whole — the precision each is reported at. */
export function formatAlertValue(value: number, metric: AlertMetric): string {
  if (metric === 'gauge_height_ft') return `${value.toFixed(2)} ft`;
  return `${Math.round(value).toLocaleString('en-US')} cfs`;
}

/**
 * The rule's trigger, as one sentence fragment — "rises above 3.00 ft".
 *
 * Deliberately EXCLUDES the river or gauge name. Every caller already has the
 * target: the manage list prints it as the row title, and the notification
 * copy puts it in the title line. Baking it in here would produce "Huzzah Creek
 * — Huzzah Creek rises above 3.00 ft" at both.
 *
 * Shared rather than written twice because the app, the push body and any
 * future web UI must describe the same rule identically. A user who reads
 * "above 3 ft" in the list and "over 3.0 feet" in the notification has to work
 * out whether they are the same alert.
 */
export function describeAlertRule(rule: AlertRule): string {
  if (rule.mode === 'condition') {
    switch (rule.conditionKind) {
      case 'floatable':
        return 'when it becomes floatable';
      case 'safety':
        return 'on high and dangerous water';
      default:
        return 'on any condition change';
    }
  }

  const metric = rule.metric ?? 'gauge_height_ft';
  const low = rule.thresholdValue;
  if (low == null) return 'when conditions change';

  switch (rule.comparator) {
    case 'below':
      return `when it drops below ${formatAlertValue(low, metric)}`;
    case 'between': {
      const high = rule.thresholdValueMax;
      // A `between` rule missing its upper bound is a shape the database
      // rejects, so this can only be a truncated payload. Degrade to the half
      // the rule does state rather than printing "between 3.00 ft and null".
      if (high == null) return `when it rises above ${formatAlertValue(low, metric)}`;
      return `while it is between ${formatAlertValue(low, metric)} and ${formatAlertValue(high, metric)}`;
    }
    default:
      return `when it rises above ${formatAlertValue(low, metric)}`;
  }
}

// ── Notification preferences (GET/PUT /api/me/notification-preferences) ──

/**
 * Quiet hours SUPPRESS rather than queue.
 *
 * deliver-push already drops any event older than three hours, because "your
 * river is floatable" must never fire about water that has since dropped. A
 * quiet window outlives that by design, so "hold it until morning" would
 * deliver either a stale promise or, more often, nothing at all. What the user
 * gets instead is the free Alerts feed, which is still there when they wake.
 * Say that in the UI; do not imply a digest.
 */
export interface NotificationPreferences {
  quietHoursEnabled: boolean;
  /** Minutes past LOCAL midnight, 0-1439. start > end is an overnight window. */
  quietStartMinute: number | null;
  quietEndMinute: number | null;
  /** IANA zone the two minute offsets are interpreted in. */
  timezone: string;
  /** High and dangerous water still arrives during the window. */
  safetyOverridesQuiet: boolean;
}

export interface NotificationPreferencesResponse {
  preferences: NotificationPreferences;
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

// ── Dams (GET /api/dams, GET /api/dams/[damId]) ──────────────────────────────
// NOT redefined here, for the same reason ConditionCode is not: the definitions
// live in missouri-float-planner/shared/dam-types.ts, which both this package
// and the web app can reach, while packages/ is unreachable from a Vercel build
// rooted at missouri-float-planner/. See that file for the per-metric contract —
// in short, a metric the dam does not publish is ABSENT rather than null, and
// absent must render nothing rather than "0 cfs".
export type {
  DamMetricValue,
  DamScheduleDay,
  DamSnapshot,
  DamStaleness,
  DamTailwater,
  DamsResponse,
  ScheduledHour,
  UsaceMetric,
} from '../../missouri-float-planner/shared/dam-types';

// ── River reaches (GET /api/rivers/[slug]/reaches) ───────────────────────────
// Same arrangement as the dam types above and for the same build reason. A
// reach is a stretch of one river whose water behaves differently enough that
// one condition badge for the whole river would be wrong for part of it — the
// Black above and below Clearwater Dam. See that file for why a reach is not a
// float segment, and why clients gate their panel on `differsFromRiver`.
export type {
  ReachReport,
  ReachRiverType,
  RiverReach,
  RiverReachesResponse,
} from '../../missouri-float-planner/shared/reach-types';

// ── Feedback (POST /api/feedback) ────────────────────────────────────────────
// Mirrors the website's own copy in src/types/api.ts by hand, the same
// arrangement everything else in this file uses — Vercel installs only
// missouri-float-planner/, so that app cannot import this package.
//
// Every client submits through the rate-limited API route. Direct database
// inserts are denied by RLS so callers cannot bypass its validation.

/**
 * `gauge_recalibration` is "the ladder is wrong" — the water did not match the
 * verdict — and is fixed by moving a threshold. `inaccurate_data` is a
 * correction to a field somebody typed. They read alike and are triaged
 * differently, which is why they are two types. See migration 00208.
 *
 * `partner` is a website-only flow (the embed workbench) and has no app surface.
 */
export const FEEDBACK_TYPES = [
  'inaccurate_data',
  'missing_access_point',
  'suggestion',
  'bug_report',
  'other',
  'partner',
  'gauge_recalibration',
] as const;
export type FeedbackType = (typeof FEEDBACK_TYPES)[number];

export type FeedbackContextType = 'gauge' | 'access_point' | 'river' | 'general';

/** What the report is ABOUT, so a triager does not have to read prose to find out. */
export interface FeedbackContext {
  type: FeedbackContextType;
  id?: string;
  name?: string;
  /**
   * Anything the surface knew at the moment of the report. On a gauge that
   * means the reading and the condition code: without them a row arrives
   * disputing a number that has since changed, and the complaint cannot be
   * checked against what Eddy was actually claiming.
   */
  data?: Record<string, unknown>;
}

export interface CreateFeedbackRequest {
  feedbackType: FeedbackType;
  userName?: string;
  /** Required by the route. Validated server-side as well as in the form. */
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

// ── River alerts (GET /api/river-alerts) ─────────────────────────────────────
// Closures and weather warnings for a river, from the two agencies that publish
// them. Hand-mirrored into the website's src/types/api.ts, like everything else
// in this file.
//
// ── Why this is not a HighWaterEntry ────────────────────────────────────────
// That type carries a `conditionCode`, documented as always `high` or
// `dangerous`, and every row of it is the output of a threshold ladder a human
// set. A park closure is not a reading and has no ladder; a Flood Warning is
// somebody else's verdict, not Eddy's. Folding either into that shape would mean
// inventing a condition code for a thing nobody graded, which is the exact rule
// /api/high-water's header exists to state. Separate feed, separate type.

/**
 * Who said it. Load-bearing: it decides the wording, the icon and how much
 * weight a reader should give the row, and it must never be inferred from text.
 */
export type RiverAlertSource = 'nws' | 'nps';

/**
 * How loud the row should be.
 *
 * Deliberately three values and not the NWS's five or the NPS's four. Both
 * vocabularies are mapped INTO this one at the edge, because a screen showing
 * "Severe" beside "Caution" invites a comparison neither agency intended — they
 * do not share a scale. Unknown input maps to `notice`, never upward: inventing
 * urgency from a string we do not recognise is how a park newsletter becomes a
 * hazard warning.
 */
export type RiverAlertSeverity = 'warning' | 'watch' | 'notice';

export interface RiverAlert {
  /** Stable across refetches, and prefixed by source — the two id spaces differ. */
  id: string;
  source: RiverAlertSource;
  severity: RiverAlertSeverity;
  /** Which river this was matched to. One upstream alert can produce several. */
  riverSlug: string;
  riverName: string;
  /** One line. The NWS headline, or the NPS alert title. */
  title: string;
  /** The body, already truncated upstream. May be empty. */
  body: string;
  /** The agency's own name for it — "Flood Warning", "Closure". Shown verbatim. */
  category: string;
  /** ISO. Null when the agency published none, which the NPS routinely does. */
  startsAt: string | null;
  endsAt: string | null;
  /** The agency's page for this alert, when there is one. */
  url: string | null;
}

export interface RiverAlertsResponse {
  alerts: RiverAlert[];
  /** When this was assembled — both feeds are cached, so it is not "now". */
  asOf: string;
}

/**
 * Why an alerts list can be empty and still be doing its job.
 *
 * Shown wherever the section renders nothing, because "no alerts" and "we could
 * not reach the agencies" look identical to a reader and mean opposite things.
 */
export const RIVER_ALERT_SOURCE_NOTE =
  'Closures come from the National Park Service and weather warnings from the National Weather Service. Neither covers every river, and neither replaces checking locally.';

// ── Public land (GET /api/public-lands) ──────────────────────────────────────
// USGS PAD-US protected-area boundaries, clipped to the requested viewport and
// simplified for the requested zoom by the server.
//
// OWNERSHIP, NOT PERMISSION. This is the one thing every consumer of these
// types has to carry, and it is why `access` is a passthrough string rather
// than anything Eddy computed: a polygon says a public agency owns the ground
// and says nothing about whether a paddler may camp on it, portage across it or
// tie up to it. See the 00209 migration header for the long version, and
// PUBLIC_LAND_OWNERSHIP_NOTE below for the sentence to put on screen.

/**
 * PAD-US `Pub_Access`, verbatim: OA open · RA restricted · XA closed · UK
 * unknown.
 *
 * NEVER collapse to a boolean. 'RA' covers permit-only, daylight-only, seasonal
 * and hunting-only, and flattening those into "open" or "closed" would be
 * inventing a fact about somewhere a person might drive to.
 */
export type PublicLandAccess = 'OA' | 'RA' | 'XA' | 'UK';

export interface PublicLandProperties {
  id: string;
  /** The agency's unit name: "Mark Twain National Forest", "Current River CA". */
  name: string;
  /** Managing agency, verbatim ('USFS', 'NPS', 'UNK'). */
  manager: string | null;
  managerType: string | null;
  /** 'NF', 'WSR', 'SCA'… what actually tells a reader what they are looking at. */
  designation: string | null;
  /**
   * One of PublicLandAccess — typed as `string` on the wire on purpose.
   *
   * NEVER null and always upper-case: the server normalises it, so a renderer
   * can key a `match` expression straight off this field without a coalesce and
   * an upcase in map-expression dialect. An unrecognised code (PAD-US is a
   * federal dataset that gains them without asking us) arrives VERBATIM and must
   * render as unknown — which is what publicLandAccessStyle does, and why this
   * is a string rather than the union above.
   */
  access: string;
  acres: number | null;
}

export interface PublicLandFeature {
  type: 'Feature';
  properties: PublicLandProperties;
  /** GeoJSON MultiPolygon/Polygon, already clipped and simplified server-side. */
  geometry: unknown;
}

/**
 * A GeoJSON FeatureCollection carrying two foreign members.
 *
 * Foreign members are legal (RFC 7946 §6.1) and are what let both clients hand
 * this straight to a map source — MapLibre and Mapbox each ignore what they do
 * not recognise — instead of unwrapping an envelope at every call site.
 */
export interface PublicLandsResponse {
  type: 'FeatureCollection';
  features: PublicLandFeature[];
  /** True when the server dropped the smallest parcels to meet the cap. */
  capped: boolean;
  /** How many were in the viewport before the cap. */
  total: number;
}

/**
 * What a public-land boundary does not mean, in one sentence.
 *
 * Shown wherever the layer is switched on. Exported rather than written twice
 * because the web layer panel and the iOS layer sheet must not be able to
 * disagree about it — and because a caveat that lives in two files is a caveat
 * that gets edited in one.
 */
export const PUBLIC_LAND_OWNERSHIP_NOTE =
  'Ownership, not permission. Boundaries are the agency’s own and do not imply a right to land, camp or portage — check the managing agency before you count on it.';

/** How PAD-US labels its own access classes, for a callout or a legend. */
export const PUBLIC_LAND_ACCESS_LABELS: Record<PublicLandAccess, string> = {
  OA: 'Open access',
  RA: 'Restricted access',
  XA: 'Closed to the public',
  UK: 'Access unknown',
};

/**
 * How each access class is painted, on BOTH maps.
 *
 * A colour table in a types package is unusual and is here for one reason: the
 * website and the phone draw this layer with two different rendering engines
 * off one dataset, and a reader who learns what a shade means on one must not
 * be taught something else by the other. The web app cannot import this at
 * runtime (Vercel installs only missouri-float-planner/), so it mirrors the
 * table and a test in the web suite asserts the two are identical — the same
 * arrangement the nav-link builders use.
 *
 * ── Why this is not a traffic light ────────────────────────────────────────
 * Every value is an earth tone from the brand's sandbar/stone families, and
 * NONE of them appears in CONDITION_SYSTEM or the flow ramp. That is a hard
 * rule, not a preference. Red, amber and green on this map already mean "do not
 * float", "use caution" and "go" — about the water, from a gauge reading Eddy
 * stands behind. Reusing them for a federal ownership classification would be
 * making a safety-shaped promise about somewhere a person might drive to, from
 * a field that is 'UK' on 296 of the 1,753 parcels loaded.
 *
 * So the encoding is: one family for "this is public ground", with WEIGHT
 * carrying confidence — open is the most solid, unknown the faintest — and the
 * words in the callout carrying the actual classification.
 */
export interface PublicLandAccessStyle {
  /** Interior, with alpha baked in: the fill is data-driven by colour. */
  fill: string;
  /** Boundary. Opaque — an edge is what makes a parcel readable at all. */
  line: string;
  /** False for every class but OA, which is the only one drawn solid. */
  solid: boolean;
}

export const PUBLIC_LAND_ACCESS_STYLE: Record<PublicLandAccess, PublicLandAccessStyle> = {
  // Sandbar-800 on sandbar-700 at 26%: the most present treatment, because this
  // is the only class where the agency itself says the public may be here.
  OA: { fill: 'rgba(122,104,75,0.26)', line: '#5C4E38', solid: true },
  // Same hue, half the fill, dashed edge. "Public, but ask first" — which is
  // what 'RA' means and why it cannot share OA's solid boundary.
  RA: { fill: 'rgba(122,104,75,0.13)', line: '#7A684B', solid: false },
  // The darkest edge in the family. Closed ground should read as a wall, and it
  // is the one class where walking in gets someone turned around.
  XA: { fill: 'rgba(61,52,37,0.16)', line: '#3D3425', solid: false },
  // Warm stone rather than sandbar, and the faintest of the four: it is the
  // absence of an answer, and it should look like one.
  UK: { fill: 'rgba(164,156,142,0.09)', line: '#A49C8E', solid: false },
};

/** The style for an access code, tolerating a code PAD-US added after us. */
export function publicLandAccessStyle(access: string | null | undefined): PublicLandAccessStyle {
  const key = (access ?? '').toUpperCase();
  return (
    PUBLIC_LAND_ACCESS_STYLE[key as PublicLandAccess] ?? PUBLIC_LAND_ACCESS_STYLE.UK
  );
}

/** The label for an access code, tolerating a code PAD-US added after us. */
export function publicLandAccessLabel(access: string | null | undefined): string {
  const key = (access ?? '').toUpperCase();
  return PUBLIC_LAND_ACCESS_LABELS[key as PublicLandAccess] ?? PUBLIC_LAND_ACCESS_LABELS.UK;
}

// ── Eddy's written conditions prose (GET /api/eddy-updates) ──────────────
//
// One batched, CDN-cached request carrying the latest non-expired update for
// every river PLUS a statewide entry under the key "global". Public and
// unauthenticated: this is not the per-river written read sold behind the
// paywall, which comes from /api/rivers/[slug]/outlook and is a different
// artifact entirely.
//
// Mirrored in missouri-float-planner/src/types/api.ts, which is what the web
// app imports — Vercel installs only that directory and never sees this file.

export interface EddyUpdateEntry {
  quoteText: string;
  summaryText: string | null;
  conditionCode: string;
  gaugeHeightFt: number | null;
  dischargeCfs: number | null;
  readingTimestamp: string | null;
  snapshotId: string | null;
  /**
   * When the prose was written, NOT when the reading was taken.
   *
   * Load-bearing, and the reason it must be shown: this text is generated
   * once a day at 6:10am Central. Anything rendering it has to say so, and
   * the server withholds the statewide entry outright once it can no longer
   * stand behind it. See src/lib/eddy/global-prose-gate.ts.
   */
  generatedAt: string;
}

export interface EddyUpdatesResponse {
  /**
   * Keyed by river slug. The statewide summary is under "global", and is
   * ABSENT rather than stale when the server has withheld it — a missing key
   * is the signal, so never fall back to a previous one.
   */
  updates: Record<string, EddyUpdateEntry>;
}
