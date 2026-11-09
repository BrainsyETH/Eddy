// /dams uses the existing full-size dam cards and their interactive hourly
// schedules. Keep the list payload small by omitting detail-only history and
// forecast data; the individual dam report still owns those views.

import type { DamSnapshot } from '@shared/dam-types';
import { groupDamsForIndex, type DamGroup } from './dam-grouping';

export type DirectoryDamGroup = DamGroup;

export function buildDamDirectoryGroups(dams: DamSnapshot[]): DirectoryDamGroup[] {
  return groupDamsForIndex(dams).map(group => ({
    label: group.label,
    dams: group.dams.map(dam => ({
      ...dam,
      // DamListCard renders the complete posted hourly chart for today using
      // 'schedule'. Do not trim the days here: next-change sentences also
      // depend on future posted days.
      pattern: undefined,
      generationForecast: undefined,
    })),
  }));
}
