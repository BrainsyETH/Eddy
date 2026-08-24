// eddy-ios/src/map/accessLayers.ts
// Which places the access family draws, which mark each one wears, and how many
// of each there are — one structure, three reads, so they cannot disagree.
//
// ── WHAT THIS REPLACED, AND WHY A THIRD LAYER FORCED IT ───────────────────
//
// Every access-family layer used to re-derive its own population. RiverMap built
// `accessPins` and `campgroundPins` from independent filters; the map screen's
// `layerCounts` re-derived the same two sets a second time to produce numbers.
// Two layers meant four filters and four chances to disagree, and they had
// already disagreed twice — `cabin_lodge` fell off a layer for a release, and
// four consumers of `mappableService` each asked a slightly different question
// until W3a unified them.
//
// Boat ramps would have made it six. So the population is derived ONCE here and
// everything else reads it.
//
// ── KIND, ROLE, OVERLAY — three axes, not one ────────────────────────────
//
// `pin.layer` records WHICH ICON THE FINGER LANDED ON. That is exactly the right
// input for one question — which mark the sheet header shows — and it had become
// the key for four more that are about the PLACE rather than about the map: is
// this a campground (initialTabKey), what fact does this kind of place need
// (decisionSlot), is this somewhere you drive to (isDriveable), can you sleep
// near here (the callout's Airbnb row). Answering a question about a place with
// a fact about the map is why a new layer broke features that had nothing to do
// with it.
//
// A ROLE is what a place offers. Campground and boat ramp are roles of the same
// access point, and only roles contend for a marker. See
// docs/decisions/0008-map-features-have-kinds-and-roles.md for the full model,
// including the two axes this module does NOT cover (kinds, which never contend
// — a USGS station and a put-in at one coordinate are two markers, legitimately
// — and overlays, which are not places at all and which `PinLayerKey` already
// excludes at compile time).
//
// ── SCOPE: the places that COMPETE FOR A MARKER AT ONE LOCATION ──────────
//
// In: access points, and the campground services from the directory that are the
// same place as one. Out: gauges, hazards, dams, outfitters, lodging, public
// land, radar. They never contend for the same marker, and two of them —
// `allGauges` and `publicLand` — carry a three-state count contract
// (`undefined` = not asked, `0` = looked and found none, `n`) that this module
// has no concept of and must not flatten. So `layerCounts` is PARTLY replaced:
// the access family comes from here, the rest keeps its own computation.
//
// ── A pure .ts module, on purpose ────────────────────────────────────────
//
// `layers.ts` resolves colours through the palette and imports
// @expo/vector-icons, so the web suite — the only runner the Expo app has —
// cannot load it, not even for a type. Membership rules therefore live apart
// from layer definitions, exactly as `serviceLayers.ts` already does and for the
// same reason. Nothing here may import through the `@/*` alias.

import {
  accessPointTypes,
  isCampground,
  serviceEligible,
  type MapAccessPoint,
  type RiverService,
} from '@eddy/types';
import { mappableService } from './mappable';
import { serviceOnLayer, type ServiceLayerKey } from './serviceLayers';

/**
 * What a place OFFERS, as against what layer happens to be drawing it.
 *
 * Stage 0's slice of the vocabulary — access points and the campgrounds that sit
 * on them. Gauges, hazards and dams are KINDS rather than roles and are
 * deliberately absent: a gauge is not a role of a place, and folding it in here
 * would make "the campground role of a USGS station" a sentence the type system
 * accepts.
 */
export type PlaceRole = 'access' | 'campground' | 'boatRamp';

/**
 * What a DIRECTORY service offers, in the same currency as a place's roles.
 *
 * Named for the tier rather than the layer key so `campground` is one word here
 * and in `PlaceRole` — a campground is a campground whether Eddy learnt about it
 * from an access point or from the directory, and two spellings of it is how the
 * access family got into trouble the first time.
 */
export type ServiceMarkOwner = 'campground' | 'rentals' | 'lodging';

/**
 * Every mark a place can wear, across both families.
 *
 * The two vocabularies meet here and only here, because a count has to be able
 * to say where its places went and "3 drawn as rentals & shuttles" is a sentence
 * about a campground service. `campground` is deliberately shared: it is the one
 * mark both families can wear, which is exactly why a service sitting on an
 * access point is absorbed rather than drawn twice.
 */
export type MarkOwner = PlaceRole | 'rentals' | 'lodging';

/**
 * WHICH LAYER OWNS A SERVICE'S ONE MARKER.
 *
 * ── THE BUG THIS CLOSES ──────────────────────────────────────────────────
 *
 * 52 of the directory's 138 mapped rows (38%) are on the camping tier AND at
 * least one other — 40 camping-and-rentals, 35 camping-and-lodging. Every one of
 * them drew TWICE with Campgrounds and River services both on, because the
 * campgrounds branch minted `camp-service:{id}` while the rentals and lodging
 * branches minted `service:{id}`: two id namespaces for one row, so nothing
 * downstream could even notice they were the same place.
 *
 * Fourteen were worse still. A camping service absorbed by an access point was
 * dropped from the campgrounds layer and then drawn anyway by rentals — Akers
 * Ferry Canoe Rental absorbed into Akers Ferry, and a second pin on top of it.
 * Absorption only ever removed a service from ONE of the three places that draw
 * services.
 *
 * ── THE ORDER ────────────────────────────────────────────────────────────
 *
 * Campground first, for the reason MARK_PRIORITY gives: somebody who switched
 * Campgrounds on is asking where they sleep, and a tent is the answer. Rentals
 * before lodging preserves exactly what the map already did — `lodgingPins` has
 * always dropped whatever the rentals tier was drawing — so this reorganises the
 * rule without changing that half of its answer.
 */
export const SERVICE_MARK_PRIORITY: readonly ServiceMarkOwner[] = [
  'campground',
  'rentals',
  'lodging',
];

/**
 * WHICH SINGLE MARK A COMPOSED PLACE WEARS.
 *
 * ── WHY THERE HAS TO BE ONE ORDER ────────────────────────────────────────
 *
 * An access point that has absorbed a service holds marks from both families at
 * once — Akers Ferry is a put-in AND the canoe rental sitting on it — so
 * `MARK_PRIORITY` and `SERVICE_MARK_PRIORITY` can no longer each pick a winner
 * for it. Two orders would give two answers, and a place with two answers draws
 * twice, which is the failure this whole module exists to prevent.
 *
 * BOTH EXISTING ORDERS SURVIVE AS SUBSEQUENCES, deliberately, so nothing that
 * held before is reversed here:
 *
 *   MARK_PRIORITY          campground → boatRamp →                      access
 *   SERVICE_MARK_PRIORITY  campground →            rentals → lodging
 *   this                   campground → boatRamp → rentals → lodging → access
 *
 * `access` stays last for the reason MARK_PRIORITY gives — it is the broad
 * category every one of these places is already in — and the service marks slot
 * between the ramp and it because "you can rent a boat here" is more specific
 * than "you can get on the water here" and less specific than the two physical
 * facts above it.
 */
function isPlaceRole(mark: MarkOwner): mark is PlaceRole {
  return mark === 'access' || mark === 'campground' || mark === 'boatRamp';
}

export const COMPOSED_MARK_PRIORITY: readonly MarkOwner[] = [
  'campground',
  'boatRamp',
  'rentals',
  'lodging',
  'access',
];

/** The layer each service mark is switched by. Exported for search, which has
 * to name the owning layer of a pin it builds outside the resolver. */
export const SERVICE_OWNER_LAYER: Record<ServiceMarkOwner, ServiceLayerKey> = {
  campground: 'campgrounds',
  rentals: 'outfitters',
  lodging: 'lodging',
};

/**
 * The layer keys that draw access-family places — NOT imported from `layers.ts`.
 *
 * Declared locally for the reason in the header, and asserted to be a subset of
 * `LayerKey` over in `layers.ts`, where the themed catalog is allowed to know
 * about the pure rule. The dependency points that way round on purpose; the
 * reverse would drag the palette into the web suite.
 */
export type AccessLayerKey = 'access' | 'campgrounds' | 'boatRamps';

/** The role each access-family layer asks for. */
export const LAYER_ROLE: Record<AccessLayerKey, PlaceRole> = {
  access: 'access',
  campgrounds: 'campground',
  boatRamps: 'boatRamp',
};

/** The layer each role is switched by. The inverse of LAYER_ROLE. */
export const ROLE_LAYER: Record<PlaceRole, AccessLayerKey> = {
  access: 'access',
  campground: 'campgrounds',
  boatRamp: 'boatRamps',
};

/** Every role, in a fixed order, for callers building a total record. */
export const PLACE_ROLES: readonly PlaceRole[] = ['access', 'campground', 'boatRamp'];

/**
 * WHICH SINGLE MARK WINS when a place has more than one active role.
 *
 * ── ITS OWN CONSTANT, and emphatically not ACCESS_POINT_TYPE_ORDER ───────
 *
 * That list is a LISTING order — "most-specific-use first", the order the type
 * badges are printed in, matched to the website so a point tagged three ways
 * reads the same on both. This is a different question: which one mark is most
 * decision-useful when only one can be drawn. The two agree today by
 * coincidence, and `accessLabel` in RiverMap carries a third hand-written order
 * that drops `access` entirely. Three orders answering three questions is
 * correct; one order pretending to answer all three is how the first two drift.
 *
 * Campground first, because somebody who has switched Campgrounds on is asking
 * where they sleep and a tent is the answer. Access last, because it is the
 * broad category every one of these places is already in — see placeRoles.
 */
export const MARK_PRIORITY: readonly PlaceRole[] = ['campground', 'boatRamp', 'access'];

/**
 * The role of an access-family layer key, or null for every other layer.
 *
 * The four sites that were asking `pin.layer === 'campgrounds'` ask this now.
 * Two of them (the opening tab, the peek's reserved fact) are genuinely about
 * the icon that was tapped and still key on the layer — what they gain is that
 * "is this an access-family place at all" is now one question with one answer,
 * so a fourth mark cannot silently drop a put-in's water reading or its
 * Directions row the way `boatRamps` would have.
 */
export function accessRoleForLayer(layer: string): PlaceRole | null {
  return LAYER_ROLE[layer as AccessLayerKey] ?? null;
}

/** The roles the given layer keys ask for, ignoring every non-access layer. */
export function activeRoles(layers: readonly string[]): ReadonlySet<PlaceRole> {
  const roles = new Set<PlaceRole>();
  for (const layer of layers) {
    const role = accessRoleForLayer(layer);
    if (role) roles.add(role);
  }
  return roles;
}

/**
 * What one access point offers.
 *
 * EVERY access point holds `access`. The row is called "Access points" and its
 * population is the access points — a boat ramp is one, a campground you can put
 * in at is one, and a count that dropped them would be a count of "the ones with
 * no other tag", which is not a thing anybody asked to see. That is also what
 * makes the Access row's number hold still while other rows are switched on and
 * off, which it did not do before.
 *
 * `isCampground` is called rather than restated: it is the campground predicate
 * the planner's overnight logic already uses, and a second copy would be a
 * second answer.
 *
 * This is what the POINT says about itself. The resolver may add `campground` on
 * top, for a place the directory knows camps and the access-point row does not
 * say so — see the absorption note in resolveAccessMarkers.
 */
export function placeRoles(point: MapAccessPoint): ReadonlySet<PlaceRole> {
  const roles = new Set<PlaceRole>(['access']);
  if (isCampground(point)) roles.add('campground');
  if (accessPointTypes(point).includes('boat_ramp')) roles.add('boatRamp');
  return roles;
}

/**
 * How close counts as "the same place", in degrees of latitude.
 *
 * ~0.002° is a little over 200 m. Generous on purpose: the two records were
 * geocoded independently, and a campground is an area rather than a point — a
 * service pinned at the entrance and an access point pinned at the ramp are one
 * place even though they are two hundred metres apart.
 *
 * ── WHAT THIS RADIUS MAY AND MAY NOT DECIDE ──────────────────────────────
 *
 * It decides PRESENTATION only: whether to draw one marker or two. That is a
 * visual judgement, reversible, and it asserts nothing about the world.
 *
 * It may NEVER drive a record merge. Proximity is evidence, not proof, and a
 * phone number attached to the wrong campground is worse than no phone number.
 * The old comment here conceded as much — "two DIFFERENT campgrounds that close
 * together on one river do not exist IN THIS DATASET" is a claim about today's
 * rows rather than an invariant, and MULTI_STATE_SCALING_PLAN.md is the document
 * that ends it. A real merge needs the identity links in horizon 2c of
 * MAPS_SHEET_SERVICE_MODEL_PLAN.md (`access_point_services`), which is a
 * production write and out of this module's reach.
 */
const SAME_PLACE_DEGREES = 0.002;

/**
 * Which of these access points is the same place as this service, if any.
 *
 * Position, not name. "Red Bluff Campground" and "Red Bluff Recreation Area" are
 * one place under two names, and the reverse trap exists too — matching on names
 * would eventually collapse two genuinely different places that share a creek's
 * name. What the reader is being spared is two pins in one spot, which is a
 * question about coordinates.
 *
 * Longitude is scaled by latitude so the box is square on the ground. At 37°N a
 * degree of longitude is about four fifths of a degree of latitude, and an
 * unscaled comparison would quietly make the box wider than it is tall.
 *
 * Returns the INDEX rather than a boolean because the caller does not merely
 * drop the duplicate — it has to know which access point absorbed it. First
 * match wins; two access points inside one 200 m box is not a case this dataset
 * has, and picking between them would be a guess either way.
 *
 * Moved here from `layers.ts`, where it could not be tested at all: this is the
 * same "one place, one marker" decision the resolver below exists to own, and it
 * was the one part of it living in the module the web suite cannot load.
 */
export function samePlaceIndex(
  service: { latitude: number | null; longitude: number | null },
  points: readonly { coordinates: { lng: number; lat: number } }[],
): number {
  const { latitude, longitude } = service;
  if (latitude == null || longitude == null) return -1;
  const lngScale = Math.max(0.2, Math.cos((latitude * Math.PI) / 180));
  return points.findIndex(
    (point) =>
      Math.abs(point.coordinates.lat - latitude) <= SAME_PLACE_DEGREES &&
      Math.abs(point.coordinates.lng - longitude) <= SAME_PLACE_DEGREES / lngScale,
  );
}

/** The predicate half of `samePlaceIndex`, for callers that only need the answer. */
export function drawnAsAccessPoint(
  service: { latitude: number | null; longitude: number | null },
  points: readonly { coordinates: { lng: number; lat: number } }[],
): boolean {
  return samePlaceIndex(service, points) >= 0;
}

/**
 * An access point and the river it belongs to, as the resolver passes it through.
 *
 * Structural rather than importing RiverMap's `MapPinAccessPoint`: that module
 * imports Mapbox and react-native, so a file the web suite runs may not
 * reference it even as a type. The shapes match, and RiverMap builds its pins
 * from what comes back.
 */
export interface AccessPointEntry {
  point: MapAccessPoint;
  riverSlug?: string | null;
}

/**
 * One place and the mark it wears.
 *
 * Deliberately NOT a `MapPin`. That type lives in RiverMap alongside the Mapbox
 * import, so returning one would put this module out of the web suite's reach —
 * which is the whole reason it exists. RiverMap keeps building pins through
 * `mapAccessPointPin`, which already stamps the canonical `access:{id}`, the
 * photo and the detail route; this decides only WHICH of them is drawn and as
 * what.
 */
export interface ResolvedAccessMarker {
  entry: AccessPointEntry;
  /** The mark this place is drawn with, per COMPOSED_MARK_PRIORITY. */
  owner: MarkOwner;
  /**
   * Every LIVE role this one pin is standing in for, `owner` included.
   *
   * Held roles intersected with the active ones — so it names the rows this pin
   * is currently answering, never the ones the reader has switched off.
   *
   * ── WHY A PIN HAS TO SAY THIS ────────────────────────────────────────────
   *
   * One place, one marker is the rule, and it is right. What it costs is that a
   * place wearing its strongest mark stops saying what else it is: Cedargrove is
   * a river access AND a campground, and with both rows on it draws a tent
   * captioned `Camp · Mile 12.3`. Nothing on the map then says the put-in is
   * there — so asking for campgrounds appears to have REMOVED the access point,
   * which is exactly how the confusion was reported.
   *
   * The asymmetry is the tell: with Campgrounds OFF the same place draws
   * `Campground · Cedargrove`, because `accessLabel` prefixes the strongest
   * type. The generic mark cues the speciality and the specialised mark drops
   * the generic one, so the fact is available in exactly one of the two states a
   * reader can be in.
   *
   * `accessOverlapNote` already says this for a ROW ("3 drawn as campgrounds");
   * this is the same fact for a PLACE, which is where the reader is looking when
   * they conclude a pin is missing. Membership, not a second derivation — the
   * resolver computed it in pass 1 and used to discard everything but the
   * winner.
   */
  roles: ReadonlySet<MarkOwner>;
}

/**
 * What a role's count actually means.
 *
 * ── "A COUNT OF PINS" WAS NEVER TRUE, and boat ramps did not make it false ──
 *
 * Guardrail 5 of MAPS_SHEET_SERVICE_MODEL_PLAN.md used to read "a count beside a
 * switch is a count of PINS". Checking the render path shows it could not have
 * been: below `ZOOM.cluster` Mapbox collapses access pins into bubbles, and
 * between `ZOOM.cluster` and `ZOOM.places` every access-family feature draws as
 * an identical 4.5px coloured circle — `pins-access-overview` stops at
 * `ZOOM.places` and the role mark only appears above it. Labels carry no
 * `textAllowOverlap` and collide-suppress independently on top of that. For most
 * of the zoom range no role mark is drawn at all, so no honest number can be
 * "what is on screen".
 *
 * What we do know is REPRESENTATION, and these are its four buckets. The
 * invariant is the reason they are four rather than three:
 *
 *   totalMatches === ownedMarkers + representedElsewhere + notShown
 *
 * `notShown` is what makes it hold under a toggle that HIDES things — turn the
 * Access chip off with Campgrounds on and a campground+ramp is represented as a
 * tent while a plain ramp is nowhere. Without the third term the algebra is
 * simply false in that state, and the assertion worth writing is the one that
 * fails when a filter silently drops a place.
 */
export interface RoleStats {
  /**
   * Every place with this role, whatever any switch is set to.
   *
   * The number beside the row, and the one that HOLDS STILL. The Access row's
   * count used to drop when Campgrounds was switched on, because the two rows
   * partitioned the put-ins between them; the places did not stop being access
   * points, so the count no longer pretends they did.
   */
  totalMatches: number;
  /** Places drawing THIS role's mark right now. */
  ownedMarkers: number;
  /** Places with this role wearing a different active role's mark. */
  representedElsewhere: number;
  /** Places with this role that no active role covers: nothing on the map. */
  notShown: number;
  /**
   * Which roles the `representedElsewhere` places went to, and how many each.
   *
   * Kept so the overlap note can NAME the layer rather than saying "somewhere
   * else" — "3 as campgrounds" is a sentence a reader can act on. Derived here
   * rather than in the component, so the note and the count cannot come from two
   * different passes over the data.
   */
  representedBy: Readonly<Partial<Record<MarkOwner, number>>>;
}

/**
 * One directory service and the single mark it wears.
 *
 * `layers` is every LIVE service layer this row answers, `owner`'s included —
 * the same fact `ResolvedAccessMarker.roles` carries and for the same reason: a
 * campground that also rents canoes now draws once, and the pin is the only
 * thing that can say it is both.
 */
export interface ResolvedServiceMarker {
  service: RiverService;
  owner: ServiceMarkOwner;
  layers: ReadonlySet<ServiceMarkOwner>;
}

export interface ResolvedAccessLayers {
  /** Zero or one marker per access point, never two. */
  markers: ResolvedAccessMarker[];
  /**
   * The directory services that draw, one marker each, after the same-place
   * dedupe and after tier ownership.
   *
   * ── NOW ALL THREE SERVICE LAYERS, NOT JUST CAMPING ─────────────────────
   *
   * This used to be the camping half only, and rentals and lodging were filtered
   * out of `services` independently in RiverMap — which is how a campground that
   * rents canoes came to draw two pins under two different id namespaces. One
   * list, one marker per row, and the owning layer stated. RiverMap still builds
   * the pins themselves: a service carries availability, a booking link and a
   * description an access point does not have.
   */
  serviceMarkers: ResolvedServiceMarker[];
  statsByRole: Record<PlaceRole, RoleStats>;
  /**
   * The four buckets again, for the directory's own rows.
   *
   * Separate from `statsByRole` because the populations differ: the Campgrounds
   * ROW counts access points and services together (`statsByRole.campground`),
   * while the River services row counts only the directory. `campground` here is
   * the SERVICE half alone, which is what makes the two composable rather than
   * double-counted.
   */
  statsByServiceOwner: Record<ServiceMarkOwner, RoleStats>;
  /**
   * Whether the services directory had landed when this was resolved.
   *
   * FALSE MEANS THE CAMPGROUND TOTAL IS PARTIAL — access points only — and a
   * caller printing it anyway would show a number that grows under the reader's
   * eyes. The sheet's rule is that a count is `undefined` until the whole of it
   * has arrived, and this is the flag that lets the caller honour it.
   */
  servicesKnown: boolean;
}

function emptyStats(): RoleStats {
  return {
    totalMatches: 0,
    ownedMarkers: 0,
    representedElsewhere: 0,
    notShown: 0,
    representedBy: {},
  };
}

/**
 * Membership, visibility and ownership, in one pass.
 *
 *   membership = placeRoles(place).has(role)
 *   visibility = the intersection of those roles with the active ones
 *   ownership  = MARK_PRIORITY's first pick out of that intersection
 *
 * Three reads of one structure. They were three separate derivations before,
 * which is exactly the drift this replaced.
 */
export function resolveAccessMarkers(
  input: {
    accessPoints: readonly AccessPointEntry[];
    /** The services directory, or null while it has not landed. */
    services: readonly RiverService[] | null;
  },
  roles: ReadonlySet<PlaceRole>,
  /**
   * The service layers that are switched on.
   *
   * Optional, and defaulted from `roles`, so a caller that only cares about the
   * access family keeps the behaviour it had. Passing it is what lets one
   * resolver own the whole "one place, one marker" question instead of leaving
   * rentals and lodging to filter the same directory a second and third time.
   */
  serviceLayers: ReadonlySet<ServiceLayerKey> = new Set(
    roles.has('campground') ? (['campgrounds'] as ServiceLayerKey[]) : [],
  ),
): ResolvedAccessLayers {
  const stats: Record<PlaceRole, RoleStats> = {
    access: emptyStats(),
    campground: emptyStats(),
    boatRamp: emptyStats(),
  };
  const representedBy: Record<PlaceRole, Partial<Record<MarkOwner, number>>> = {
    access: {},
    campground: {},
    boatRamp: {},
  };
  const serviceStats: Record<ServiceMarkOwner, RoleStats> = {
    campground: emptyStats(),
    rentals: emptyStats(),
    lodging: emptyStats(),
  };
  const serviceRepresentedBy: Record<ServiceMarkOwner, Partial<Record<MarkOwner, number>>> = {
    campground: {},
    rentals: {},
    lodging: {},
  };
  const activeServiceOwners = new Set<ServiceMarkOwner>(
    SERVICE_MARK_PRIORITY.filter((owner) => serviceLayers.has(SERVICE_OWNER_LAYER[owner])),
  );

  // ── Pass 1: what each access point says about itself ────────────────────
  //
  // ── AND IT IS A SET OF MARKS, NOT OF ROLES ────────────────────────────
  //
  // An access point that absorbs a service takes on that service's marks too,
  // so this holds the union rather than what the access-point row says by
  // itself. See the absorption note in pass 2 for what may and may not be
  // carried across.
  const held = input.accessPoints.map(
    (entry) => new Set<MarkOwner>(placeRoles(entry.point)),
  );
  const points = input.accessPoints.map((entry) => entry.point);

  // ── Pass 2: the directory's campgrounds, and the ones that are already here ─
  //
  // Eligible, locatable and on the camping tier, in that order — the same three
  // tests, asked once, that the pins and the counts used to ask separately and
  // differently.
  //
  // ── A SERVICE ON TOP OF AN ACCESS POINT IS ABSORBED, NOT JUST DROPPED ──
  //
  // The dedupe used to run against the access points ALREADY TAGGED
  // `campground`, which quietly made the tag a precondition for noticing the
  // duplicate. A place the directory knows is a campground whose access-point
  // row is tagged only `access` therefore drew TWICE, two hundred metres apart,
  // with Access and Campgrounds both on — the exact failure the radius exists to
  // prevent, surviving in the one case where the two records disagree about what
  // the place is. Which is the normal case for a disagreement.
  //
  // So the absorbing access point gains the CAMPGROUND ROLE. Dropping the
  // service without it would be worse than the duplicate: the place would then
  // be missing from the Campgrounds layer entirely, and "ask the map for
  // campgrounds and not be shown Red Bluff" is the failure the campgrounds
  // branch was rewritten to fix.
  //
  // ── WHAT IS CARRIED, AND WHAT IS EMPHATICALLY NOT ─────────────────────
  //
  // The role, and only the role: a membership fact, used to pick a mark and
  // count a row. The service's phone number, availability, booking link and
  // description stay on the service record and are NOT attached to the access
  // point, because those are claims about a business and ~200 m is evidence
  // rather than proof (ADR 0008). Presentation may be decided on proximity; a
  // record merge may not. Reuniting the two records properly — so the absorbed
  // campground's phone number survives — needs the `access_point_services`
  // identity links, which are horizon 2c and a production write.
  //
  // The booking link and availability are not gone from the app in the meantime:
  // the absorbing pin opens the access point's sheet, whose camping section
  // renders that access point's own `nearbyServices`. What is not guaranteed is
  // that the absorbed row is one of them, and closing that gap is exactly what
  // the identity links are for. This is the same trade the campground-tagged
  // case has made since the radius was written; what changes here is that it is
  // no longer conditional on a tag.
  //
  // ── AND ABSORPTION NOW REMOVES THE ROW FROM EVERY SERVICE LAYER ────────
  //
  // It used to remove it from the campgrounds layer alone, because that was the
  // only layer this loop knew about. Fourteen rows were absorbed into an access
  // point and then drawn anyway by rentals or lodging — Akers Ferry Canoe Rental
  // absorbed into Akers Ferry, and a second pin on top of it. A place that is
  // the same place as an access point is that place on EVERY layer, so the loop
  // walks the whole drawable directory rather than the camping slice of it.
  const indexById = new Map<string, number>();
  points.forEach((point, index) => indexById.set(point.id, index));

  const serviceMarkers: ResolvedServiceMarker[] = [];
  for (const service of input.services ?? []) {
    if (!serviceEligible(service)) continue;
    if (!mappableService(service)) continue;
    if (service.latitude == null || service.longitude == null) continue;

    // Which service marks this row could wear at all, whatever is switched on.
    const held_ = new Set<ServiceMarkOwner>(
      SERVICE_MARK_PRIORITY.filter((owner) =>
        serviceOnLayer(service, SERVICE_OWNER_LAYER[owner]),
      ),
    );
    if (held_.size === 0) continue;

    // ── AN EXPLICIT LINK IS CONSULTED FIRST, AND IT IS THE LAST WORD ──────
    //
    // `accessPointId` is `access_point_services` on the wire, and only ever its
    // `same_place` rows — the database saying these two records are one arrival
    // point. Where it is set, proximity is not consulted at all: not as a
    // tiebreak, not as a sanity check.
    //
    // That is not tidiness. Meramec State Park's two rows are 3 km apart and
    // Onondaga Cave's 1 km; no radius reaches either, and one that did would
    // swallow genuinely distinct neighbours 74 m apart. The link is the only
    // evidence that can cross that distance, so it has to outrank the geometry
    // it contradicts.
    //
    // The inverse case is why it must also SUPPRESS the radius: if the linked
    // access point is not in this list (another river, an unapproved row), the
    // service draws on its own. Falling back to proximity there would absorb it
    // into whichever put-in happened to be nearby — a stated identity overruled
    // by a guess, which is worse than the duplicate.
    //
    // Absent — an older server, a row nobody has linked, or a pair recorded as
    // `located_at` because the two ends are one facility but two destinations —
    // the radius decides exactly as it did before.
    const linkedTo = service.accessPointId;
    const absorbedBy =
      linkedTo != null
        ? indexById.get(linkedTo) ?? -1
        : held_.has('campground')
          ? samePlaceIndex(service, points)
          : -1;
    if (absorbedBy >= 0) {
      // ── EVERY MARK CROSSES, NOT JUST `campground` ───────────────────────
      //
      // Only the campground mark used to, which quietly deleted the rest: a
      // camping-and-rentals row absorbed here lost its rentals membership
      // outright — no pin under Rentals & shuttles, and nothing in that row's
      // count. Fourteen rows were in that state, Akers Ferry Canoe Rental among
      // them, and with Access off and Rentals on the place drew NOTHING AT ALL.
      // One place one marker had become one place no marker.
      //
      // A mark is a membership fact used to pick an icon and count a row, which
      // is the class of thing ADR 0008 says the radius MAY carry ("what the
      // radius may carry is the ROLE, and only the role"). It says campground
      // because campground was the only case; the argument was never about
      // which mark.
      //
      // WHAT STILL DOES NOT CROSS is the service's CONTENT — its phone number,
      // booking link, availability and description. Those are claims about a
      // business, ~200 m is evidence rather than proof, and attaching them to
      // the wrong record is the harm ADR 0008 actually names. Carrying content
      // needs a verified identity link, not a radius.
      for (const mark of held_) held[absorbedBy].add(mark);
      // Not counted separately either: it is not a second place drawn under
      // someone else's mark, it is the same place seeded twice, and counting it
      // would make one campground two. Its marks are counted once, as the
      // composed place's, in pass 3.
      continue;
    }

    // One mark, by declared precedence — the same three-line rule the access
    // family uses, over the service family's own priority.
    const owner = SERVICE_MARK_PRIORITY.find(
      (candidate) => held_.has(candidate) && activeServiceOwners.has(candidate),
    ) ?? null;
    if (owner) {
      const live = new Set<ServiceMarkOwner>(
        SERVICE_MARK_PRIORITY.filter(
          (candidate) => held_.has(candidate) && activeServiceOwners.has(candidate),
        ),
      );
      serviceMarkers.push({ service, owner, layers: live });
    }

    for (const mark of held_) {
      const bucket = serviceStats[mark];
      bucket.totalMatches += 1;
      if (owner === null) bucket.notShown += 1;
      else if (owner === mark) bucket.ownedMarkers += 1;
      else {
        bucket.representedElsewhere += 1;
        serviceRepresentedBy[mark][owner] = (serviceRepresentedBy[mark][owner] ?? 0) + 1;
      }
    }

    // The Campgrounds ROW counts access points and services together, so a
    // STANDALONE camping service is folded into `statsByRole.campground` here.
    // An ABSORBED one is not: it reached `held` in the branch above and is
    // counted once as the composed place's, in pass 3. Counting it here as well
    // would make one campground two, which is the arithmetic the absorption
    // exists to fix.
    if (held_.has('campground')) {
      stats.campground.totalMatches += 1;
      if (owner === 'campground') stats.campground.ownedMarkers += 1;
      else if (owner === null) stats.campground.notShown += 1;
      else {
        stats.campground.representedElsewhere += 1;
        representedBy.campground[owner] = (representedBy.campground[owner] ?? 0) + 1;
      }
    }
  }

  // ── Pass 3: ownership and the four buckets, over the COMPOSED place ─────
  //
  // Every mark the place holds, from its own row and from anything it absorbed,
  // against every mark that is live — so a put-in that absorbed a canoe rental
  // draws under Rentals & shuttles when that is the only row switched on, and
  // draws ONCE when several are.
  const activeMarks = new Set<MarkOwner>([...roles, ...activeServiceOwners]);
  const markers: ResolvedAccessMarker[] = [];
  input.accessPoints.forEach((entry, index) => {
    const owner =
      COMPOSED_MARK_PRIORITY.find((mark) => held[index].has(mark) && activeMarks.has(mark)) ??
      null;
    if (owner) {
      // The same intersection `owner` is the first pick out of, kept whole
      // instead of collapsed to its winner. Built in priority order so the cue
      // reads strongest-first and its first word is the mark being worn.
      const live = new Set<MarkOwner>();
      for (const mark of COMPOSED_MARK_PRIORITY) {
        if (held[index].has(mark) && activeMarks.has(mark)) live.add(mark);
      }
      markers.push({ entry, owner, roles: live });
    }

    // Each mark counted once, into whichever family's row asks about it. The
    // two records stay separate because the two rows do — Access points counts
    // places, River services counts what the directory offers — but a composed
    // place contributes to both, which is the point.
    for (const mark of held[index]) {
      const bucket = isPlaceRole(mark) ? stats[mark] : serviceStats[mark];
      const by = isPlaceRole(mark) ? representedBy[mark] : serviceRepresentedBy[mark];
      bucket.totalMatches += 1;
      if (owner === null) bucket.notShown += 1;
      else if (owner === mark) bucket.ownedMarkers += 1;
      else {
        bucket.representedElsewhere += 1;
        by[owner] = (by[owner] ?? 0) + 1;
      }
    }
  });

  for (const role of PLACE_ROLES) stats[role].representedBy = representedBy[role];
  for (const owner of SERVICE_MARK_PRIORITY) {
    serviceStats[owner].representedBy = serviceRepresentedBy[owner];
  }

  return {
    markers,
    serviceMarkers,
    statsByRole: stats,
    statsByServiceOwner: serviceStats,
    servicesKnown: input.services != null,
  };
}

/** What a mark is called in a sentence about the map. */
const ROLE_NOUN: Record<MarkOwner, string> = {
  access: 'access points',
  campground: 'campgrounds',
  boatRamp: 'boat ramps',
  // The two service marks, worded as the layer rows word themselves — a reader
  // matching "2 as cabins & lodges" against the sheet has to find that row.
  rentals: 'rentals & shuttles',
  lodging: 'cabins & lodges',
};

/** Every mark, in the order a sentence should name them. */
const MARK_ORDER: readonly MarkOwner[] = [
  'campground',
  'boatRamp',
  'access',
  'rentals',
  'lodging',
];

/**
 * What a mark is called ON A PIN — singular, and what a paddler calls it.
 *
 * ── ONE TABLE, because a composed place wears marks from both families ───
 *
 * This was two — `ROLE_CUE` over PlaceRole and `SERVICE_CUE` over
 * ServiceMarkOwner — which was right while the two families could not meet on
 * one pin. An absorbed service puts them on the same marker, so a second table
 * would mean a caller picking which vocabulary to ask, and the answer for a
 * put-in that rents canoes would be "both".
 *
 * Still not `ROLE_NOUN`, which is plural and belongs to a sentence about a
 * LAYER ("3 drawn as campgrounds") — captioning one pin "access points" is what
 * that reuse would produce. Still not `ACCESS_POINT_TYPE_LABELS`, whose bare
 * "Access" labels a badge with a sheet around it and reads as a fragment beside
 * a river mile. And still not `serviceTypeLabel`, which says what the BUSINESS
 * is rather than which rows the pin answers.
 *
 * `Cabins` rather than `Cabins & lodges`: the row is named for a population and
 * a pin is one place, so the plural-and-ampersand form reads as a category
 * label where a noun belongs.
 */
const MARK_CUE: Record<MarkOwner, string> = {
  access: 'River access',
  campground: 'Camp',
  boatRamp: 'Ramp',
  rentals: 'Rentals',
  lodging: 'Cabins',
};

/**
 * What one pin says it is, strongest first.
 *
 * Returns every live mark, `owner` included by default, so the caller joins one
 * list rather than special-casing the mark it is already drawing. A place
 * answering a single row yields a single cue and reads exactly as it always
 * has — which is what keeps this from being a redesign of every pin on the map.
 *
 * ── `exclude` IS FOR A CALLER WHOSE SUBTITLE ALREADY LEADS ───────────────
 *
 * A standalone service pin opens with `serviceTypeLabel` — "Outfitter", "Cabin
 * or lodge" — which is finer-grained than the tier it owns, so replacing it
 * with "Rentals" would trade information for symmetry. That caller passes its
 * owner and gets only the rows the mark is HIDING. An access-family pin has a
 * bare name for a label, so its subtitle is the only place any mark can appear
 * and it names all of them.
 */
export function markCues(marks: ReadonlySet<MarkOwner>, exclude?: MarkOwner): string[] {
  return COMPOSED_MARK_PRIORITY.filter(
    (mark) => marks.has(mark) && mark !== exclude,
  ).map((mark) => MARK_CUE[mark]);
}

/**
 * The line under a layer row saying where its places actually went.
 *
 * ── WHY THE ROW NEEDS IT AT ALL ──────────────────────────────────────────
 *
 * The count is now membership, so "Boat ramps · 10" stays 10 whether or not
 * Campgrounds is on — and with Campgrounds on, three of those ten wear tents.
 * A number that holds still is only honest if the sheet says what happened to
 * the places behind it; otherwise the reader counts ramp marks, finds seven, and
 * concludes the map is broken.
 *
 * Null when there is nothing to explain — every place wearing its own mark needs
 * no sentence — which is the same absent-never-empty rule the sheet's sections
 * follow.
 *
 * Built here rather than in the component so the numbers in the sentence and the
 * number on the row come from one pass. A note recomputed beside the count is
 * two derivations of one fact, which is the whole failure this module replaced.
 */
export function accessOverlapNote(role: MarkOwner, stats: RoleStats): string | null {
  if (stats.representedElsewhere === 0 && stats.notShown === 0) return null;
  const parts = [`${stats.ownedMarkers} drawn as ${ROLE_NOUN[role]}`];
  for (const other of MARK_ORDER) {
    const count = stats.representedBy[other];
    if (count) parts.push(`${count} as ${ROLE_NOUN[other]}`);
  }
  if (stats.notShown > 0) parts.push(`${stats.notShown} not shown`);
  return parts.join(' · ');
}
