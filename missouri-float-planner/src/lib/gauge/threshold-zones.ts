// src/lib/gauge/threshold-zones.ts
// Re-export shim. The implementation moved to shared/threshold-zones.ts so the
// iOS app can import the same ladder maths through Metro's watchFolders rather
// than keeping a second copy that would drift — the same arrangement
// condition-system.ts already has.
//
// Web code can keep importing from '@/lib/gauge/threshold-zones'; nothing about
// the four call sites had to change.

export {
  buildZones,
  formatZoneValue,
  formatZoneRange,
  zoneMarkerPercent,
  findZoneIndex,
  DEFAULT_THRESHOLD_DESCRIPTIONS,
} from '@shared/threshold-zones';

export type { ThresholdValues, ThresholdDescriptions, Zone } from '@shared/threshold-zones';
