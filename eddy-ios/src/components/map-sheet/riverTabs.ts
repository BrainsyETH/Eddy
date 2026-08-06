// eddy-ios/src/components/map-sheet/riverTabs.ts
// Which tabs a river gets, and the shape its sheet is built from.
//
// PURE, like tabs.ts and gaugeTabs.ts beside it, and for a reason worth
// stating: the Expo app has no test runner, so these rules are covered from the
// web suite — and a module that imports a React Native component cannot be
// loaded there at all (esbuild chokes on react-native/index.js). Keeping the
// registry free of components is what makes it testable.

import type { ConditionCode, Hazard, MapAccessPoint } from '@eddy/types';


/**
 * The empty tab set is REACHABLE and is not a bug.
 *
 * Gating `conditions` on more than one gauge means a river with one gauge, no
 * mapped access points and no hazards now yields `[]` — which was impossible
 * while `conditions` was unconditional. RiverSheetPanel renders a glance-only
 * sheet in that case (MapSheet treats absent children as `glanceOnly`), and
 * that is the right outcome: everything such a river has to say fits above the
 * fold, so there is nothing to swipe to.
 */

/** A gauge on this river, already graded against ITS ladder by the caller. */
export interface RiverGaugeRow {
  siteId: string;
  name: string;
  code: ConditionCode;
  reading: string | null;
  isPrimary: boolean;
}

export interface RiverSheetData {
  slug: string;
  name: string;
  region: string | null;
  /**
   * The river's OWN verdict — the colour the map draws its line in.
   *
   * Not derived from `gauges` here: the curated river list and the statewide
   * collection each publish a per-river condition, and the map screen resolves
   * between them so the sheet and the line under the finger cannot disagree.
   * Re-deriving it from the gauge rows would be a second opinion about the same
   * water, which is the failure shared/flow-band.ts exists to prevent.
   */
  code: ConditionCode;
  gauges: RiverGaugeRow[];
  /** Every access point on this river. Ordered by the tabs that need it. */
  accesses: MapAccessPoint[];
  hazards: Hazard[];
}

export type RiverTabKey = 'conditions' | 'floats' | 'accesses' | 'hazards';

const LABELS: Record<RiverTabKey, string> = {
  conditions: 'Conditions',
  floats: 'Floats',
  accesses: 'Accesses',
  hazards: 'Hazards',
};

const ORDER: RiverTabKey[] = ['conditions', 'floats', 'accesses', 'hazards'];

export function riverTabs(river: RiverSheetData): { key: RiverTabKey; label: string }[] {
  const keys = new Set<RiverTabKey>();

  // ── ONE GAUGE NEEDS NO TAB ──────────────────────────────────────────────
  // The glance now carries the river's verdict and its primary station's
  // reading, so on a single-gauge river a Conditions tab holds one row the
  // reader can already see — a swipe charged for nothing. This is exactly the
  // rule gaugeTabs.ts already applies in the mirror direction ("ONE river needs
  // no list"), and the two should not disagree about the same idea.
  //
  // A river with NO gauges gets no tab either: the glance says it is not rated,
  // and a page whose whole content is a second way of saying so is worse than
  // its absence.
  if (river.gauges.length > 1) keys.add('conditions');

  // Two access points is the minimum that makes a float; one is a place to
  // stand. The statewide network carries rivers Eddy has not mapped put-ins
  // for yet, so this is a real case rather than a defensive one.
  if (river.accesses.length >= 2) keys.add('floats');
  if (river.accesses.length > 0) keys.add('accesses');
  if (river.hazards.length > 0) keys.add('hazards');
  return ORDER.filter((key) => keys.has(key)).map((key) => ({ key, label: LABELS[key] }));
}
