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

/* ── What Eddy knows but never wrote down ────────────────────────────────── */
//
// `amenities` is empty on 148 of 312 approved access points, and for 141 of
// those the SAME ROW holds a `facilities` sentence describing exactly what is
// there. Baptist Camp on the Current is the shape of it: no amenities array, a
// facilities line reading "Vault toilets only", a parking_info line reading
// "Paved lot with ample parking", and a parking_capacity of 20 — so Eddy holds
// the fact three times over and the list row drew nothing.
//
// ── Structured evidence first, prose second, and never a guess ────────────
//
// Two kinds of evidence, and they are not equally trustworthy:
//
//   STRUCTURED — a parking capacity, a boat-ramp type, a linked campground.
//   The column's existence IS the claim; nothing is being interpreted.
//
//   PROSE — the facilities and parking sentences. Read with a negation rule,
//   because half of them are about what is NOT there: "No restrooms", "No
//   public parking at bridge", "No boat ramp — carry-in access". A matcher
//   that only looked for the word would put a restroom mark on a put-in whose
//   own description says it has none, and somebody would drive there.
//
// So a clause that carries a negation DENIES every term in it, denials outrank
// grants wherever both occur, and a term nobody mentions produces nothing. The
// declared column still wins outright: it is the curated field, and this is a
// reading of the rows nobody has curated yet.
//
// This is a read-side repair of a data gap, not a replacement for filling it.
// Backfilling `amenities` would fix the website, the exports and the offline
// bundle too; until then the phone stops throwing away what it was sent.

/** Whatever the caller holds about a place. Structural — any shape with these. */
export interface AmenityEvidence {
  amenities?: string[] | null;
  /** Free prose: "Concrete boat ramp, vault toilets, potable water…". */
  facilities?: string | null;
  parkingInfo?: string | null;
  /** A capacity recorded at all means somebody parks here. */
  parkingCapacity?: string | null;
  type?: string | null;
  types?: string[] | null;
  /** Presence, never the contents — a linked NPS campground is a campground. */
  npsCampground?: unknown;
}

/**
 * Words that mean the clause is about an ABSENCE.
 *
 * Whole words only: `not` must not fire on "notable", and `no` must not fire
 * on "north" — both appear in this corpus ("north bank", "no trash service").
 */
const NEGATION = /\b(?:no|not|none|without|lacks?|lacking)\b/i;

/**
 * The terms that stand for each mark.
 *
 * Deliberately narrow. "Space for approximately 5 vehicles" is parking to a
 * human and is not matched here, because the words that would catch it —
 * `space`, `pull-off`, `vehicles` — also catch sentences that are about
 * something else. A missing mark costs a glance; a wrong one costs a drive.
 */
const TERMS: { symbol: AmenitySymbolName; slug: string; label: string; pattern: RegExp }[] = [
  { symbol: 'parking', slug: 'parking', label: 'Parking', pattern: /\b(?:parking|lot)\b/i },
  {
    symbol: 'facilities',
    slug: 'restrooms',
    label: 'Restrooms',
    pattern: /\b(?:restrooms?|toilets?|privy|privies|outhouses?|bathrooms?)\b/i,
  },
  {
    symbol: 'boatRamp',
    slug: 'boat_ramp',
    label: 'Boat ramp',
    pattern: /\b(?:boat ramps?|ramps?|slipway|launch)\b/i,
  },
  {
    symbol: 'campground',
    slug: 'camping',
    label: 'Camping',
    pattern: /\b(?:campgrounds?|campsites?|camping)\b/i,
  },
];

/**
 * Sentence-ish pieces, and NOT comma-separated ones.
 *
 * "No restrooms, potable water, picnic tables, or maintained structures" is one
 * negation governing a list — split it on commas and every item after the first
 * reads as present. Splitting only on real boundaries keeps the "No" attached
 * to everything it governs, which is the conservative direction.
 */
function clauses(prose: string): string[] {
  return prose
    .split(/[.;\n]|—|–|--/)
    .map((part) => part.trim())
    .filter(Boolean);
}

/**
 * Marks for a place, from everything about it rather than one column.
 *
 * Declared amenities keep their order and their meaning; evidence only ever
 * appends. Returns the same narrowed type `drawableAmenities` does, so a call
 * site swaps one for the other without knowing which fact came from where.
 */
export function drawableAmenitiesFor(point: AmenityEvidence): DrawableAmenity[] {
  const declared = drawableAmenities(point.amenities);
  const claimed = new Set(declared.map((entry) => entry.slug));

  const granted = new Set<AmenitySymbolName>();
  const denied = new Set<AmenitySymbolName>();

  for (const prose of [point.facilities, point.parkingInfo]) {
    if (!prose) continue;
    for (const clause of clauses(prose)) {
      const negated = NEGATION.test(clause);
      for (const term of TERMS) {
        if (!term.pattern.test(clause)) continue;
        (negated ? denied : granted).add(term.symbol);
      }
    }
  }

  // Structured facts, which no sentence can talk out of: they are records
  // rather than descriptions. Added after the prose pass so a denial still
  // wins — "No public parking at bridge" beside a stray capacity is a
  // contradiction, and the safe reading of a contradiction is silence.
  if (point.parkingCapacity) granted.add('parking');
  const types = [point.type, ...(point.types ?? [])].filter(Boolean) as string[];
  if (types.includes('boat_ramp')) granted.add('boatRamp');
  if (point.npsCampground || types.includes('campground')) granted.add('campground');

  const inferred = TERMS.filter(
    (term) => granted.has(term.symbol) && !denied.has(term.symbol) && !claimed.has(term.slug),
  ).map((term) => ({ slug: term.slug, label: term.label, symbol: term.symbol }));

  return [...declared, ...inferred];
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

/**
 * The spoken phrase for a row drawn by `drawableAmenitiesFor`.
 *
 * The pair has to move together. A row that draws a restroom mark from the
 * facilities sentence while speaking only the empty `amenities` column would
 * give a VoiceOver reader strictly less than the screen shows, which is the
 * failure the marks-plus-label arrangement exists to avoid.
 */
export function accessAmenityLabelFor(point: AmenityEvidence): string | null {
  const declared = accessAmenities(point.amenities);
  const spoken = declared.map((entry) => entry.label);
  const named = new Set(declared.map((entry) => entry.slug));

  for (const mark of drawableAmenitiesFor(point)) {
    if (!named.has(mark.slug)) spoken.push(mark.label);
  }

  return spoken.length ? spoken.join(', ') : null;
}
