// eddy-ios/src/map/layerRows.ts
// The number a layer-sheet row prints, given its tiers and what is switched on.
//
// ── WHY THIS IS NOT INSIDE MapLayersSheet ────────────────────────────────
//
// It was, and the resolver's own tests could not see it. `accessLayers.ts`
// proves that 10 places hold the boat-ramp role and 7 of them wear ramp marks;
// none of that stops the SHEET printing the wrong one of those numbers beside
// the switch. A row's figure is a projection of the counts onto what is
// currently active, the projection has a rule, and a rule with no test is where
// the last one went wrong — the row read its own key unconditionally and
// therefore announced fifty access points in a state that draws ten.
//
// Pure and free of `LayerDef`, which lives in the themed catalog the web suite
// cannot load. The row is described structurally instead, the same way
// `serviceLayers.ts` declares its own keys — see that file's header.

/** Where a tier's count is measured. Absent means statewide. */
export type LayerCountScope = 'statewide' | 'viewport';

/** Just the fields the count rule reads. Structural — see the header. */
export interface CountableRow<K extends string> {
  key: K;
  /** The layers this row switches, when it has more than one. */
  tiers?: readonly K[];
  /**
   * True when the tiers REFINE one population instead of partitioning it, in
   * which case they are listed OUTERMOST FIRST and each is a subset of the one
   * before it. See LayerDef.tiersRefine for the whole argument.
   */
  tiersRefine?: boolean;
  /**
   * Where each tier's count is measured, when the tiers do not all measure the
   * same universe. Tiers with different scopes must never be summed — see
   * layerRowCount.
   */
  scopes?: Partial<Record<K, LayerCountScope>>;
}

/**
 * The figure beside a row, or `undefined` when there is nothing it can stand
 * behind.
 *
 * ── ONE RULE, TWO ARITHMETICS ────────────────────────────────────────────
 *
 * A tiered row's count describes WHAT ITS LIVE TIERS ACCOUNT FOR. That is the
 * whole rule; the two shapes of tier just compute it differently.
 *
 *   • Partitioning tiers (gauges, river services) are disjoint, so the row is
 *     their SUM. A gauge is rated or it is not; a service is one pin under
 *     whichever tier claims it.
 *
 *   • Refining tiers (access points) are nested, so the row is the OUTERMOST
 *     ACTIVE one — every ramp is already inside "all access". Summing them
 *     would count every ramp twice; reading the row's own key unconditionally
 *     is worse, because "All access" off with "Boat ramps" on is a reachable
 *     state (the chips toggle independently of the row) that draws ten places
 *     under a row claiming fifty.
 *
 * `undefined` when no tier is live, for both shapes, because a row that is
 * drawing nothing has nothing to describe — and because the alternative, a row
 * falling back to its whole population, makes the figure jump UP as the reader
 * switches the row OFF.
 *
 * `undefined` also propagates from any tier that has not answered yet: a count
 * is only worth printing when the whole of it has arrived. "1" beside a row
 * whose second tier is still fetching is a number that will change under the
 * reader's eyes, and this sheet has never shown a figure it cannot stand behind.
 *
 * And `undefined` when the live tiers are counted in DIFFERENT SCOPES — one
 * statewide, one per viewport — because their sum is a number measured in no
 * universe at all. See the scope check below.
 */
export function layerRowCount<K extends string>(
  row: CountableRow<K>,
  active: readonly K[],
  counts: Partial<Record<K, number>> | undefined,
): number | undefined {
  if (!row.tiers) return counts?.[row.key];

  const live = row.tiers.filter((key) => active.includes(key));
  if (live.length === 0) return undefined;

  // Nested: the first live tier is the widest, and it contains the rest.
  if (row.tiersRefine) return counts?.[live[0]];

  // ── TIERS IN DIFFERENT SCOPES HAVE NO SUM ────────────────────────────────
  //
  // The gauges row is the case: the rated tier is counted statewide while the
  // national tier is counted per viewport ("N in view"). Adding those gave a
  // figure that was part-state, part-screen, changed on every pan, and said so
  // nowhere. A row whose live tiers measure different universes prints
  // nothing; each tier chip still prints its own honestly-scoped number.
  const scopes = new Set(live.map((key) => row.scopes?.[key] ?? 'statewide'));
  if (scopes.size > 1) return undefined;

  let total = 0;
  for (const key of live) {
    const value = counts?.[key];
    if (value == null) return undefined;
    total += value;
  }
  return total;
}

/**
 * The stored layer set, with this session's own enables laid over it.
 *
 * ── THE RACE THIS RESOLVES ───────────────────────────────────────────────
 *
 * The map restores its layer set from AsyncStorage asynchronously, and a
 * search result or a "View on map" deep link can switch a layer on BEFORE the
 * restore answers — the deep link runs in the screen's first effect flush,
 * squarely inside that window. Applying the stored set wholesale then strips
 * the layer the camera is already flying toward: an invisible pin under an
 * open sheet.
 *
 * Neither blunt answer is right. Persisting the enable would overwrite the
 * user's stored choices with `defaults + one layer`; skipping the restore
 * would throw their choices away for the session. So the restore applies and
 * the session's enables are merged over it — a search enable is a view
 * affordance, not a settings choice, and it persists only if the user later
 * touches the sheet (which writes the whole current set, as it always has).
 *
 * Stored order first, then any session enables not already present. `stored`
 * may be `[]` — everything switched off is a choice, and an enable over it
 * yields exactly that one layer.
 */
export function mergeRestoredLayers<K extends string>(
  stored: readonly K[],
  sessionEnabled: Iterable<K>,
): K[] {
  const merged = [...stored];
  for (const key of sessionEnabled) {
    if (!merged.includes(key)) merged.push(key);
  }
  return merged;
}

/** Just the fields the grouping rule reads. Structural — see the header. */
export interface SectionableRow<K extends string, S extends string> {
  key: K;
  /** The heading this row sits under, or absent for the ungrouped rows. */
  section?: S;
}

/** A heading and the rows beneath it. `label` is null for the ungrouped block. */
export interface LayerRowGroup<K extends string, S extends string> {
  label: string | null;
  rows: SectionableRow<K, S>[];
}

/**
 * The sheet's rows, in the order they are drawn, under the headings they belong
 * to.
 *
 * ── WHAT THIS MAY AND MAY NOT DO ─────────────────────────────────────────
 *
 * It drops nothing, and it reorders only by moving whole sections: every row
 * goes in exactly one group, ungrouped rows keep their position at the top, and
 * WITHIN a group the rows keep their catalog order. Collecting a section's rows
 * together is the one rearrangement it makes and the entire reason it exists —
 * so a heading changes what a reader is told about the rows, and never which
 * rows there are. That is the whole difference between
 * a heading and a filter, and it is the property worth testing: a grouping that
 * silently dropped a row would take a layer off the sheet while leaving it on
 * the map, which is precisely the "switched on and drawing nothing" failure the
 * sheet exists to prevent.
 *
 * An empty section is omitted rather than drawn as a bare heading, for the same
 * absent-never-empty reason the pin sheet's sections follow.
 *
 * Pure, and free of `LayerDef` and of the section table itself, so the web suite
 * can execute it — same constraint and same solution as `layerRowCount` above.
 */
export function groupLayerRows<K extends string, S extends string>(
  rows: readonly SectionableRow<K, S>[],
  sections: readonly { key: S; label: string }[],
): LayerRowGroup<K, S>[] {
  const groups: LayerRowGroup<K, S>[] = [];

  const ungrouped = rows.filter((row) => row.section == null);
  if (ungrouped.length > 0) groups.push({ label: null, rows: ungrouped });

  for (const section of sections) {
    const inSection = rows.filter((row) => row.section === section.key);
    if (inSection.length > 0) groups.push({ label: section.label, rows: inSection });
  }

  return groups;
}
