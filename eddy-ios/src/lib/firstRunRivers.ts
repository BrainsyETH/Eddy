// Six river suggestions for onboarding.
//
// The named rivers are a preference, not a fixed catalog: missing slugs are
// skipped and the remaining slots are filled floatable-first, so additions or
// removals upstream never leave holes in the suggestions.
//
// Location replaces the suggested set rather than merely reordering it. A
// nearby river outside the featured six should become discoverable immediately.
// Search in firstRunPlaces independently covers the full catalog, so proximity
// never limits someone planning a trip away from home.

import type { RiverListItem } from '@eddy/types';
// Relative, not '@/theme/conditions': the web test runner that covers this file
// resolves '@/' to ITS OWN src, so the alias would point at a directory that
// does not exist there. Same reason the shared packages import each other
// relatively.
import { floatableRank } from '../theme/conditions';

/**
 * The opening hand, in display order.
 *
 * Verified against the Supabase seeds. A slug that does not resolve costs
 * nothing — it is simply skipped and the gap is filled below.
 */
export const FEATURED_RIVER_SLUGS = [
  'current',
  'jacks-fork',
  'meramec',
  'big-piney',
  'huzzah',
  'eleven-point',
] as const;

/** Two columns of three. More is a list; fewer is not a demonstration. */
export const FIRST_RUN_RIVER_COUNT = 6;

/** Floatable first, then alphabetical, so the fill is deterministic. */
function byFloatableThenName(a: RiverListItem, b: RiverListItem): number {
  const rank =
    floatableRank(a.currentCondition?.code ?? 'unknown') -
    floatableRank(b.currentCondition?.code ?? 'unknown');
  if (rank !== 0) return rank;
  return a.name.localeCompare(b.name);
}

/**
 * The rivers the picker shows.
 *
 * With `distanceByRiver`, the nearest win outright — a river with no known
 * distance is only used to fill a grid the nearby ones could not, never mixed in
 * among them, because an unknown distance sorted as a large one would put a
 * river from the other end of the state above one three miles away.
 *
 * Without it, the featured slugs lead and floatable-first fills the rest.
 */
export function pickFirstRunRivers(
  rivers: RiverListItem[],
  distanceByRiver?: Map<string, number> | null,
  limit: number = FIRST_RUN_RIVER_COUNT,
): RiverListItem[] {
  const seen = new Set<string>();
  const unique = rivers.filter((river) => {
    if (!river?.id || seen.has(river.id)) return false;
    seen.add(river.id);
    return true;
  });

  if (distanceByRiver && distanceByRiver.size > 0) {
    const known = unique
      .filter((river) => distanceByRiver.has(river.id))
      .sort((a, b) => {
        const delta = (distanceByRiver.get(a.id) ?? 0) - (distanceByRiver.get(b.id) ?? 0);
        return delta !== 0 ? delta : byFloatableThenName(a, b);
      });

    if (known.length >= limit) return known.slice(0, limit);

    // Not enough gauged rivers nearby to fill the grid. Top it up rather than
    // rendering a short one — the layout is the demonstration.
    const rest = unique
      .filter((river) => !distanceByRiver.has(river.id))
      .sort(byFloatableThenName);
    return [...known, ...rest].slice(0, limit);
  }

  const byslug = new Map(unique.map((river) => [river.slug, river]));
  const picked: RiverListItem[] = [];
  const takenIds = new Set<string>();

  for (const slug of FEATURED_RIVER_SLUGS) {
    const river = byslug.get(slug);
    if (!river || takenIds.has(river.id)) continue;
    picked.push(river);
    takenIds.add(river.id);
    if (picked.length === limit) return picked;
  }

  for (const river of [...unique].sort(byFloatableThenName)) {
    if (takenIds.has(river.id)) continue;
    picked.push(river);
    takenIds.add(river.id);
    if (picked.length === limit) break;
  }

  return picked;
}

/** Keep selected rivers visible when location replaces the suggestions. */
export function retainSelectedRivers(
  suggestions: RiverListItem[],
  rivers: RiverListItem[],
  selected: ReadonlySet<string>,
): RiverListItem[] {
  const shown = new Set(suggestions.map((river) => river.id));
  return [...rivers.filter((river) => selected.has(river.id) && !shown.has(river.id)), ...suggestions];
}
