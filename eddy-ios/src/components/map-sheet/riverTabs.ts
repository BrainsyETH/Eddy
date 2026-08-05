// eddy-ios/src/components/map-sheet/riverTabs.ts
// Which tabs a river gets, and the shape its sheet is built from.
//
// PURE, like tabs.ts and gaugeTabs.ts beside it, and for a reason worth
// stating: the Expo app has no test runner, so these rules are covered from the
// web suite — and a module that imports a React Native component cannot be
// loaded there at all (esbuild chokes on react-native/index.js). Keeping the
// registry free of components is what makes it testable.

import type { ConditionCode, Hazard, MapAccessPoint } from '@eddy/types';

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
  const keys = new Set<RiverTabKey>(['conditions']);
  // Two access points is the minimum that makes a float; one is a place to
  // stand. The statewide network carries rivers Eddy has not mapped put-ins
  // for yet, so this is a real case rather than a defensive one.
  if (river.accesses.length >= 2) keys.add('floats');
  if (river.accesses.length > 0) keys.add('accesses');
  if (river.hazards.length > 0) keys.add('hazards');
  return ORDER.filter((key) => keys.has(key)).map((key) => ({ key, label: LABELS[key] }));
}
