// /dams uses the existing full-size dam cards and their interactive hourly
// schedules. Keep the list payload small by omitting the detail-only observed
// history; the individual dam report still owns that view.

import type { DamSnapshot } from '@shared/dam-types';
import { groupDamsForIndex, type DamGroup } from './dam-grouping';

export type DirectoryDamGroup = DamGroup;

/** Longest search kept from a URL. Dam and lake names are far shorter. */
export const DIRECTORY_QUERY_MAX_LENGTH = 80;

type ParamValue = string | string[] | null | undefined;

function firstValue(value: ParamValue): string {
  return (Array.isArray(value) ? value[0] : value) ?? '';
}

/**
 * The search and state filter a /dams URL asks for, made safe to render.
 *
 * Shared links from the old Conditions explorer used `?q=` and `?state=` (an
 * uppercase state code), so both are honoured. A repeated parameter arrives
 * from Next as an array and takes its first value; it used to reach
 * `.toUpperCase()` and fail the whole page. A state the directory does not
 * list falls back to all states, because a select cannot show a value it has
 * no option for. Used by the page and by the client's Back/Forward restore.
 */
export function parseDirectoryFilters(
  params: { q?: ParamValue; state?: ParamValue },
  knownStates: Iterable<string>,
): { query: string; state: string } {
  const query = firstValue(params.q).trim().slice(0, DIRECTORY_QUERY_MAX_LENGTH);
  const requested = firstValue(params.state).trim().toUpperCase();
  const state = new Set(knownStates).has(requested) ? requested : 'all';
  return { query, state };
}

export function buildDamDirectoryGroups(dams: DamSnapshot[]): DirectoryDamGroup[] {
  return groupDamsForIndex(dams).map(group => ({
    label: group.label,
    dams: group.dams.map(dam => ({
      ...dam,
      // DamListCard renders the complete posted hourly chart for today using
      // 'schedule'. Do not trim the days here: next-change sentences also
      // depend on future posted days. The operator's forecast stays too: for
      // the three Nashville dams it is the only forward view, and the card
      // states its next change where an SWPA dam draws a schedule.
      pattern: undefined,
    })),
  }));
}
