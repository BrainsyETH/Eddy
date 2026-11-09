// Presentation model for /dams. No additional fetch or duplicated dam state.
// The directory is built from the same stored snapshots and registry as the dam pages.

import type { DamMetricValue, DamSnapshot, DamScheduleDay } from '@shared/dam-types';
import { generationNow } from '@shared/dam-generation';
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
  schedule: Array<Pick<DamScheduleDay, 'scheduleDate' | 'hours' | 'retrievedAt'>>;
  generationReference: DamSnapshot['generationReference'];
  hasHourlySchedule: boolean;
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

  return {
    id: dam.id,
    name: dam.name,
    lakeName: dam.lakeName,
    state: dam.state,
    hasTurbines: dam.hasTurbines,
    lakeLevel: measured(dam.metrics.poolElevation),
    release: measured(dam.metrics.release),
    generation,
    schedule: dam.schedule,
    generationReference: dam.generationReference,
    hasHourlySchedule: publishesSchedule,
  };
}

export function buildDamDirectoryGroups(dams: DamSnapshot[], now: number): DirectoryDamGroup[] {
  return groupDamsForIndex(dams).map(group => ({
    label: group.label,
    dams: group.dams.map(dam => directoryDam(dam, now)),
  }));
}
