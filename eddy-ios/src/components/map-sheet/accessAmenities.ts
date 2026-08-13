// eddy-ios/src/components/map-sheet/accessAmenities.ts
// What is actually AT an access point, as a mark where the catalog has drawn one
// and as a word where it has not.
//
// ── Why this exists ───────────────────────────────────────────────────────
// `access_points.amenities` is a bare TEXT[] with no database constraint, and
// every surface in the product has rendered it the same way: as plain text
// chips. That is fine in a page with room to breathe and wrong in a list row on
// the map sheet, where "Parking, Restrooms, Boat Ramp" is three words competing
// with the name of the place for one line. A mark says the same thing in 16pt
// and reads at a glance, which is what a list of twelve put-ins needs.
//
// ── The vocabulary is small, and it is closed in practice ─────────────────
// Six values appear across the seeds and the ingestion scripts: parking,
// restrooms, camping, picnic, boat_ramp, store. Five of them are declared in the
// web app's AMENITIES constant; `store` is in the seed data and has never been
// in the constant, which is exactly the kind of drift an unconstrained column
// invites. Both are handled below and neither is trusted to be the whole list —
// see `unknown`.
//
// ── ABSENT, NEVER SUBSTITUTED ─────────────────────────────────────────────
// picnic and store get a LABEL AND NO MARK. The catalog has no picnic table and
// no shop, and the near misses are all wrong in the way placeSymbol's header
// already rules out: `facilities` is the restroom drawing, so hanging a picnic
// area on it would make one drawing mean two things in the same sheet. A mark
// the reader cannot decode is worse than the word it replaced. Same rule the UX
// audit applied to access-type badges: carry the mark where one exists, show the
// label alone where it does not.
//
// ── A pure .ts module, on purpose ────────────────────────────────────────
// The web suite type-checks and runs this file (the Expo app has no runner of
// its own) and resolves `@/*` to its OWN src/, so nothing here may import
// through the app alias or from a .tsx — which is why the names below are a
// plain union rather than EddySymbolName. The link back to the catalog is made
// by USE: the call sites pass these straight into EddySymbol's `name` prop, so a
// name that drifts out of the catalog fails `make check-mobile` where it is
// drawn. Identical constraint and identical remedy to placeSymbol.ts.

/** The subset of the Eddy catalog that can stand for an amenity. */
export type AmenitySymbolName = 'parking' | 'facilities' | 'campground' | 'boatRamp';

export interface AccessAmenity {
  /** The raw database value, and a stable React key. */
  slug: string;
  /** Title-case, for the chip and for the accessibility label. */
  label: string;
  /** The catalog mark, or null when the honest answer is the word alone. */
  symbol: AmenitySymbolName | null;
}

/**
 * The declared vocabulary.
 *
 * Mirrors `AMENITIES` in missouri-float-planner/src/constants/index.ts, plus the
 * `store` the seeds write and that constant omits. A plain object rather than a
 * `satisfies Record<...>` over a union, because the column is unconstrained: a
 * total table would be claiming an exhaustiveness the database cannot enforce,
 * which is the mistake MAPS_SHEET_SERVICE_MODEL_PLAN.md records under "any wire
 * type that ends in `| string` IS `string`". The precision lives in the symbol
 * type; the lookup is a decoder at the boundary.
 */
const KNOWN: Record<string, { label: string; symbol: AmenitySymbolName | null }> = {
  parking: { label: 'Parking', symbol: 'parking' },
  restrooms: { label: 'Restrooms', symbol: 'facilities' },
  camping: { label: 'Camping', symbol: 'campground' },
  boat_ramp: { label: 'Boat ramp', symbol: 'boatRamp' },
  // Drawn by nobody — see the header.
  picnic: { label: 'Picnic area', symbol: null },
  store: { label: 'Store', symbol: null },
};

/**
 * `boat_ramp` -> `Boat ramp`, for a value nobody has declared yet.
 *
 * Sentence case rather than Title Case so an unknown value sits beside the known
 * ones without announcing itself as a different kind of thing. It is still
 * SHOWN: a column with no constraint will grow a value one day, and dropping it
 * silently is how a real fact about a put-in disappears with no bug report.
 */
function humanise(slug: string): string {
  const words = slug.replace(/_/g, ' ').trim();
  if (!words) return '';
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * Decode the column into things that can be drawn.
 *
 * Order is PRESERVED from the row rather than sorted: the ingestion writes them
 * roughly in the order the source lists them, and re-ordering here would make
 * two put-ins with the same amenities look different for no reason a reader
 * could name.
 *
 * Blanks and duplicates are dropped — both occur in hand-entered rows, and a
 * repeated mark reads as two of the thing rather than as one recorded twice.
 */
export function accessAmenities(
  amenities: string[] | null | undefined,
): AccessAmenity[] {
  if (!amenities?.length) return [];
  const seen = new Set<string>();
  const out: AccessAmenity[] = [];
  for (const raw of amenities) {
    const slug = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    const known = KNOWN[slug];
    const label = known?.label ?? humanise(slug);
    if (!label) continue;
    out.push({ slug, label, symbol: known?.symbol ?? null });
  }
  return out;
}

/** An amenity the catalog can draw. Narrowed so no call site needs a `!`. */
export interface DrawableAmenity extends AccessAmenity {
  symbol: AmenitySymbolName;
}

/**
 * Just the ones with a mark, for a row that has space for icons and not words.
 *
 * The caller still owes the reader the full list somewhere — this is the glance,
 * not the record. `accessAmenityLabel` is what names them for VoiceOver, which
 * gets every one of them whether or not it was drawable.
 */
export function drawableAmenities(
  amenities: string[] | null | undefined,
): DrawableAmenity[] {
  return accessAmenities(amenities).filter(
    (entry): entry is DrawableAmenity => entry.symbol != null,
  );
}

/**
 * One spoken phrase for a whole amenity row.
 *
 * Returns null rather than an empty string when there is nothing, so a caller
 * can drop the property entirely instead of announcing a blank.
 */
export function accessAmenityLabel(amenities: string[] | null | undefined): string | null {
  const entries = accessAmenities(amenities);
  if (!entries.length) return null;
  return entries.map((entry) => entry.label).join(', ');
}
