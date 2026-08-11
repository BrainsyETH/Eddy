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
import { serviceOnLayer } from './serviceLayers';

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
 * Is this service the same place as one of these access points?
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
 * Moved here from `layers.ts`, where it could not be tested at all: this is the
 * same "one place, one marker" decision the resolver below exists to own, and it
 * was the one part of it living in the module the web suite cannot load.
 */
export function drawnAsAccessPoint(
  service: { latitude: number | null; longitude: number | null },
  points: readonly { coordinates: { lng: number; lat: number } }[],
): boolean {
  const { latitude, longitude } = service;
  if (latitude == null || longitude == null) return false;
  const lngScale = Math.max(0.2, Math.cos((latitude * Math.PI) / 180));
  return points.some(
    (point) =>
      Math.abs(point.coordinates.lat - latitude) <= SAME_PLACE_DEGREES &&
      Math.abs(point.coordinates.lng - longitude) <= SAME_PLACE_DEGREES / lngScale,
  );
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
  /** The role whose mark this place is drawn with, per MARK_PRIORITY. */
  owner: PlaceRole;
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
  representedBy: Readonly<Partial<Record<PlaceRole, number>>>;
}

export interface ResolvedAccessLayers {
  /** Zero or one marker per access point, never two. */
  markers: ResolvedAccessMarker[];
  /**
   * The campground services that draw, after the same-place dedupe.
   *
   * Only when the campground role is active. RiverMap builds their pins itself —
   * they carry availability, a booking link and a description an access point
   * does not have.
   */
  serviceMarkers: RiverService[];
  statsByRole: Record<PlaceRole, RoleStats>;
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
): ResolvedAccessLayers {
  const stats: Record<PlaceRole, RoleStats> = {
    access: emptyStats(),
    campground: emptyStats(),
    boatRamp: emptyStats(),
  };
  const representedBy: Record<PlaceRole, Partial<Record<PlaceRole, number>>> = {
    access: {},
    campground: {},
    boatRamp: {},
  };

  const markers: ResolvedAccessMarker[] = [];
  const campgroundPoints: MapAccessPoint[] = [];

  for (const entry of input.accessPoints) {
    const held = placeRoles(entry.point);
    if (held.has('campground')) campgroundPoints.push(entry.point);

    const owner = MARK_PRIORITY.find((role) => held.has(role) && roles.has(role)) ?? null;
    if (owner) markers.push({ entry, owner });

    for (const role of held) {
      const bucket = stats[role];
      bucket.totalMatches += 1;
      if (owner === null) bucket.notShown += 1;
      else if (owner === role) bucket.ownedMarkers += 1;
      else {
        bucket.representedElsewhere += 1;
        representedBy[role][owner] = (representedBy[role][owner] ?? 0) + 1;
      }
    }
  }

  // ── The directory's campgrounds ─────────────────────────────────────────
  //
  // Eligible, locatable and on the camping tier, in that order — the same three
  // tests, asked once, that the pins and the counts used to ask separately and
  // differently. A service that IS one of the access points above is dropped
  // here rather than counted as represented elsewhere: it is not a second place
  // being drawn under someone else's mark, it is the same place seeded twice,
  // and counting it would make one campground two.
  const serviceMarkers: RiverService[] = [];
  for (const service of input.services ?? []) {
    if (!serviceOnLayer(service, 'campgrounds')) continue;
    if (!serviceEligible(service)) continue;
    if (!mappableService(service)) continue;
    if (service.latitude == null || service.longitude == null) continue;
    if (drawnAsAccessPoint(service, campgroundPoints)) continue;

    stats.campground.totalMatches += 1;
    if (roles.has('campground')) {
      stats.campground.ownedMarkers += 1;
      serviceMarkers.push(service);
    } else {
      stats.campground.notShown += 1;
    }
  }

  for (const role of PLACE_ROLES) stats[role].representedBy = representedBy[role];

  return {
    markers,
    serviceMarkers,
    statsByRole: stats,
    servicesKnown: input.services != null,
  };
}

/** What a role is called in a sentence about the map. */
const ROLE_NOUN: Record<PlaceRole, string> = {
  access: 'access points',
  campground: 'campgrounds',
  boatRamp: 'boat ramps',
};

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
export function accessOverlapNote(role: PlaceRole, stats: RoleStats): string | null {
  if (stats.representedElsewhere === 0 && stats.notShown === 0) return null;
  const parts = [`${stats.ownedMarkers} drawn as ${ROLE_NOUN[role]}`];
  for (const other of MARK_PRIORITY) {
    const count = stats.representedBy[other];
    if (count) parts.push(`${count} as ${ROLE_NOUN[other]}`);
  }
  if (stats.notShown > 0) parts.push(`${stats.notShown} not shown`);
  return parts.join(' · ');
}
