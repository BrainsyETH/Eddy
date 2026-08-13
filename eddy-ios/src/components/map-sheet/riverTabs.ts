// eddy-ios/src/components/map-sheet/riverTabs.ts
// Which tabs a river gets, and the shape its sheet is built from.
//
// PURE, like tabs.ts and gaugeTabs.ts beside it, and for a reason worth
// stating: the Expo app has no test runner, so these rules are covered from the
// web suite — and a module that imports a React Native component cannot be
// loaded there at all (esbuild chokes on react-native/index.js). Keeping the
// registry free of components is what makes it testable.

import type { ConditionCode, Hazard, MapAccessPoint, RiverService } from '@eddy/types';
import { serviceEligible, serviceTiers } from '@eddy/types';


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
  /**
   * The directory rows that serve this river — campgrounds, rentals, lodging.
   *
   * Held by the map screen already, for the layers it draws, so this tab costs
   * no request. UNFILTERED by location on purpose: see serviceSections.
   */
  services: RiverService[];
}

export type RiverTabKey = 'conditions' | 'services' | 'accesses' | 'hazards';

const LABELS: Record<RiverTabKey, string> = {
  conditions: 'Conditions',
  services: 'Camping & outfitters',
  accesses: 'Accesses',
  hazards: 'Hazards',
};

const ORDER: RiverTabKey[] = ['conditions', 'services', 'accesses', 'hazards'];

/**
 * The three groups the services tab draws, in the order it draws them.
 *
 * ── WHY THIS REPLACED THE FLOATS TAB ──────────────────────────────────────
 * Floats listed every consecutive put-in→take-out pair on the river — twelve
 * access points produced eleven rows, each of them a distance and a "Plan"
 * button. It read as a menu of trips and was nothing of the kind: the pairs are
 * an artefact of sorting by river mile, not a set of floats anybody curated, and
 * the planner two taps away already builds any of them from either end. What a
 * river sheet was missing was the thing the river screen has and the map could
 * not answer — where to sleep and who rents boats.
 *
 * ── THE GROUPING IS THE SHIPPED MODEL, NOT A NEW ONE ──────────────────────
 * `serviceTiers` is multi-valued and capability-aware: 42% of directory rows
 * belong in two or more tiers, because an outfitter that rents cabins is both.
 * So a row can appear under two headings here, and that is correct — it is the
 * same business answering two different questions. Inventing a single-group
 * rule for this tab would re-encode the mutual exclusivity that
 * MAPS_SHEET_SERVICE_MODEL_PLAN.md's W0 exists to have removed.
 *
 * ── ELIGIBLE, BUT NOT MAPPABLE ────────────────────────────────────────────
 * `serviceEligible` drops businesses that have closed. `mappableService` is
 * deliberately NOT applied: most directory rows still have no confirmed
 * coordinate, and a LIST is the one surface where a place with no pin still
 * belongs. That is the same call `app/river/[slug].tsx` makes for its own
 * Outfitters section, for the same reason, and it is why eligibility and
 * location quality are two predicates rather than one "usable" flag.
 */
export const SERVICE_SECTIONS = [
  { tier: 'camping', title: 'Campgrounds' },
  { tier: 'rentals', title: 'Rentals & shuttles' },
  { tier: 'lodging', title: 'Cabins & lodges' },
] as const;

/**
 * Partition a river's services into the sections above.
 *
 * Pure and exported so the web suite can test the grouping without mounting
 * anything — the tab body is then only a renderer.
 */
export function serviceSections(
  services: RiverService[],
): { tier: string; title: string; rows: RiverService[] }[] {
  const eligible = services.filter(serviceEligible);
  return SERVICE_SECTIONS.map((section) => ({
    tier: section.tier,
    title: section.title,
    rows: eligible.filter((service) => serviceTiers(service).includes(section.tier)),
  })).filter((section) => section.rows.length > 0);
}

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

  // ── QUALIFIED ON WHAT IT WILL DRAW, not on the raw row count ────────────
  // A river can carry directory rows that are all permanently closed, or that
  // all fall outside the three tiers — and a tab that opens onto three absent
  // sections is the "present and empty" promise the registry exists to prevent.
  // Asking serviceSections is asking the tab body itself.
  if (serviceSections(river.services).length > 0) keys.add('services');

  if (river.accesses.length > 0) keys.add('accesses');
  if (river.hazards.length > 0) keys.add('hazards');
  return ORDER.filter((key) => keys.has(key)).map((key) => ({ key, label: LABELS[key] }));
}
