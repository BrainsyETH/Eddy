// eddy-ios/src/components/map-sheet/gaugeTabs.ts
// Which tabs a gauge gets. Same shape as the access registry, and for the same
// reason: a function, because two stations on the same layer can have very
// different amounts to say.
//
// ── The tier split is not cosmetic ────────────────────────────────────────
// A CURATED station carries a ladder somebody decided on, so it earns Levels:
// a table of what the numbers mean for floating a named river. A NATIONAL-tier
// station has no ladder and never will, so it has no Levels tab — giving it one
// would mean inventing thresholds.
//
// What the national tier gets instead is NOT a tab of its own. Its percentile
// is one sentence, so it goes in Now beside the reading it qualifies, and the
// station note goes in About. A "Context" tab holding a single sentence would
// be a swipe charged for a line that fits above the fold.
//
// The rule the two tiers must never break is that a percentile is a comparison
// to a station's own record and a condition is a verdict about floating. They
// never appear together and never wear each other's words — shared/flow-band.ts
// exists because that mixture shipped once and had to be unpicked.

/**
 * What the map already knows about a tapped gauge.
 *
 * Flattened out of MapPin at the call site rather than passed as a pin, so this
 * module and the tabs stay usable from anywhere and testable from the web
 * suite — which cannot resolve the app's `@/` paths. Same reasoning as the
 * access registry's LayerTapped.
 */
export interface GaugePinFacts {
  /** The provider-native station id. Null for a station carrying neither. */
  siteId: string | null;
  /** Curated tier when true, national reference tier when false. */
  curated: boolean;
  /** Pre-composed headline, in the station's own unit. */
  reading: string | null;
  /** Condition code, curated only. Absent means there is no ladder. */
  code: string | null;
  codeLabel: string | null;
  updatedAt: string | null;
  qualifierNote: string | null;
  /** Whether this station is rated against more than one river. */
  riverCount: number;
}

/**
 * ── THERE IS NO `now` TAB, AND THERE IS NO `rivers` TAB ───────────────────
 *
 * `now` went because the glance IS now. A gauge's reading and its meaning are
 * carried on the MapPin — both tiers, before the sheet opens — so the sheet
 * paints them in the collapsed detent with nothing outstanding, and a first tab
 * whose job was to repeat them was a swipe charged for something already on
 * screen. What that tab genuinely added — the percentile in words, the updated
 * time, the station id, the station's own qualifier on today's number — is About,
 * which is where a reader goes to ask about the instrument rather than the water.
 *
 * `rivers` went for the reason its own comment gave about the single-river case:
 * a tab holding rows the reader can see elsewhere is a wasted swipe. The list is
 * a section inside Levels now, which is the tab about what this station's
 * numbers mean for named rivers — the same subject, one destination.
 */
export type GaugeTabKey = 'levels' | 'history' | 'about';

export interface GaugeTabDef {
  key: GaugeTabKey;
  label: string;
}

const LABELS: Record<GaugeTabKey, string> = {
  levels: 'Levels',
  history: 'History',
  about: 'About',
};

/** Fixed, so the bar reads the same from one station to the next. */
const ORDER: GaugeTabKey[] = ['levels', 'history', 'about'];

export function gaugeTabs(facts: GaugePinFacts): GaugeTabDef[] {
  const keys = new Set<GaugeTabKey>();

  // Levels is the ladder, so it exists exactly where a ladder does. The check
  // is riverCount rather than `curated`, because a station can be curated and
  // still be waiting for its thresholds — and an empty ladder table is the
  // "present and empty" this whole design avoids.
  if (facts.curated && facts.riverCount > 0) keys.add('levels');

  // Any station with an id has readings to chart, whichever tier it is in.
  if (facts.siteId) keys.add('history');

  // ALWAYS, and it is what guarantees a gauge never falls to a single-tab or
  // zero-tab set now that `now` is gone. A national station with no site id has
  // only this one — see PinSheet's shell guard, which must not route a gauge to
  // the callout on that basis.
  keys.add('about');

  return ORDER.filter((key) => keys.has(key)).map((key) => ({ key, label: LABELS[key] }));
}
