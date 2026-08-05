// eddy-ios/src/components/map-sheet/placeSymbol.ts
// Which Eddy symbol stands for the place a finger landed on.
//
// ── Why this is a resolver and not a lookup at the call site ──────────────
// A tapped place has TWO vocabularies describing it and they disagree. The
// layer says which icon was on screen (`campgrounds`, `gauges`, `access`); the
// access point's own `types` say what the place is (a boat ramp that is also a
// campground). Neither is authoritative on its own, so the precedence has to be
// written down once rather than re-guessed by each header.
//
// LAYER WINS, for the same reason initialTabKey lets it decide the opening tab:
// the campgrounds layer and the access layer present the SAME access point
// under different icons, and the one the reader tapped is the one they were
// looking for. Showing a tent in the sheet after they tapped a tent is the
// whole of it. Falling to `types` only when the layer is the generic `access`
// one is what stops a tent-tapper being handed a boat ramp.
//
// ── Absent, never substituted ────────────────────────────────────────────
// Three of the six access types have no art yet — gravel bar, bridge, park —
// and they resolve to the GENERIC access mark rather than to something adjacent.
// `eddy-road` is close enough to a bridge to be tempting and wrong: it is the
// road-access section mark on the access-point screen, so borrowing it here
// would make one drawing mean two things in the same product. The catalog gains
// a bridge or it keeps the generic pin. Same rule as sections.tsx's absent rows.
//
// ── A pure .ts module, on purpose ────────────────────────────────────────
// The web test suite type-checks and runs this file (the Expo app has no runner
// of its own) and resolves `@/*` to its OWN src/, so nothing here may import
// through the app alias or from a .tsx — which is also why the names below are
// a plain union rather than EddySymbolName. The link back to the catalog is
// made by USE: PlaceHead and AccessTypeBadges pass these values straight into
// EddySymbol's `name` prop, so a name that drifts out of the catalog fails
// `make check-mobile` at the call site. See tabs.ts for the same constraint.
import type { MapAccessPoint } from '@eddy/types';
import { accessPointTypes } from '@eddy/types';

/** The subset of the Eddy catalog that can name a place. */
export type PlaceSymbolName =
  | 'accessPoint'
  | 'boatRamp'
  | 'campground'
  | 'dam'
  | 'gauge'
  | 'hazard'
  | 'outfitter';

/** Just the field the layer rule reads. Structural — see the header. */
interface LayerTapped {
  layer: string;
}

/**
 * What the LAYER says, when the layer says anything.
 *
 * `access` is absent deliberately: it is the layer that carries every kind of
 * access point, so it defers to the types instead of answering for them. Both
 * gauge tiers share one mark — the tier distinction is a vocabulary, not a
 * different object, and `eddyRated` is the chip that draws it.
 */
const LAYER_SYMBOL: Record<string, PlaceSymbolName> = {
  gauges: 'gauge',
  allGauges: 'gauge',
  dams: 'dam',
  hazards: 'hazard',
  outfitters: 'outfitter',
  campgrounds: 'campground',
};

/** What a single access type says, for the types the catalog has drawn. */
const TYPE_SYMBOL: Record<string, PlaceSymbolName> = {
  boat_ramp: 'boatRamp',
  campground: 'campground',
};

/**
 * The mark for one access type, or null where the catalog has no art.
 *
 * Null rather than a stand-in, so a badge shows a label alone instead of
 * borrowing a drawing that means something else. See the header.
 */
export function accessTypeSymbol(type: string): PlaceSymbolName | null {
  return TYPE_SYMBOL[type] ?? null;
}

/**
 * The types worth spending badge space on.
 *
 * `access` is useful by itself: it says this is a plain put-in with none of the
 * more specific roles the catalog knows. Beside Boat ramp, Campground, Bridge,
 * Gravel bar or Park it says only that an access point is an access point — the
 * sheet title and every one of those labels already said that. Keep the generic
 * badge only when it is the whole answer.
 */
export function accessBadgeTypes(point: MapAccessPoint): string[] {
  const types = accessPointTypes(point);
  return types.length > 1 ? types.filter((type) => type !== 'access') : types;
}

/**
 * The mark for a tapped place: layer first, then its own types, then generic.
 *
 * Never null. Every pin the sheet can open is one of the things above or is an
 * access point, and a header with a hole where its identity goes is worse than
 * a generic pin — which is a true statement about the place, not a placeholder.
 */
export function placeSymbol(
  pin: LayerTapped,
  accessPoint: MapAccessPoint | null,
): PlaceSymbolName {
  const byLayer = LAYER_SYMBOL[pin.layer];
  if (byLayer) return byLayer;
  if (!accessPoint) return 'accessPoint';
  // ACCESS_POINT_TYPE_ORDER already sorts these most-specific-use first, so the
  // first type with art is the one worth drawing: a point tagged both
  // `campground` and `boat_ramp` reads as a campground, which is the order the
  // website lists them in too.
  for (const type of accessPointTypes(accessPoint)) {
    const symbol = accessTypeSymbol(type);
    if (symbol) return symbol;
  }
  return 'accessPoint';
}
