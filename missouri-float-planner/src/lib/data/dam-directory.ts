// Presentation model for /dams. No additional fetch or duplicated dam state.
// The directory is built from the same stored snapshots and registry as the dam pages.

import type { DamMetricValue, DamSnapshot } from '@shared/dam-types';
import { generationNow, scheduleOutlook, scheduledChangeSummary } from '@shared/dam-generation';
import { groupDamsForIndex } from './dam-grouping';
import { getUsaceDam } from '@/lib/flow-providers/usace-registry';

export interface DirectoryReading {
  value: number;
  at: string;
  dailyMean?: boolean;
}

export interface DirectoryDam {
  id: string;
  name: string;
  lakeName: string | null;
  state: string;
  hasTurbines: boolean;
  lakeLevel: DirectoryReading | null;
  release: DirectoryReading | null;
  // Observed classification AND original observation time. The client checks
  // age again; an open page must never freeze "Generating" past two hours.
  generation: {
    kind: 'generating' | 'minimum-flow' | 'idle';
    at: string;
  } | null;
  nextChange: string | null;
  scheduleStale: boolean;
}

export interface DirectoryDamGroup {
  label: string;
  dams: DirectoryDam[];
}

function measured(reading: DamMetricValue | undefined): DirectoryReading | null {
  return reading && Number.isFinite(reading.value) && Number.isFinite(Date.parse(reading.at))
    ? { value: reading.value, at: reading.at, ...(reading.dailyMean ? { dailyMean: true } : {}) }
    : null;
}

function directoryDam(dam: DamSnapshot, now: number): DirectoryDam {
  const observed = generationNow(dam, now);
  const generation = typeof dam.generationFloorCfs === 'number' && observed.kind !== 'unavailable'
    ? {
        kind: (observed.kind === 'generating'
          ? 'generating'
          : observed.minimumFlow ? 'minimum-flow' : 'idle') as 'generating' | 'minimum-flow' | 'idle',
        at: observed.observedAt,
      }
    : null;

  const publishesSchedule = Boolean(getUsaceDam(dam.id)?.swpaCode);
  const outlook = publishesSchedule
    ? scheduleOutlook(dam.schedule, dam.generationReference, now)
    : null;
  // Only an actual upcoming move receives a scheduled time. In particular,
  // do not reuse the old "no more releases" sentence when a posted day is idle.
  const nextChange = !dam.hasTurbines
    ? null
    : !publishesSchedule
      ? 'No hourly schedule'
      : !outlook
        ? 'Schedule unavailable'
        : outlook.move
          ? scheduledChangeSummary(dam.schedule, dam.generationReference, now)
          : 'No change in posted hours';

  return {
    id: dam.id,
    name: dam.name,
    lakeName: dam.lakeName,
    state: dam.state,
    hasTurbines: dam.hasTurbines,
    lakeLevel: measured(dam.metrics.poolElevation),
    release: measured(dam.metrics.release),
    generation,
    nextChange,
    scheduleStale: Boolean(outlook?.stale),
  };
}

export function buildDamDirectoryGroups(dams: DamSnapshot[], now: number): DirectoryDamGroup[] {
  return groupDamsForIndex(dams).map(group => ({
    label: group.label,
    dams: group.dams.map(dam => directoryDam(dam, now)),
  }));
}
