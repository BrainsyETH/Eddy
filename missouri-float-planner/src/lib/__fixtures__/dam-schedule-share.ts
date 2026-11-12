import type { DamSnapshot } from '@shared/dam-types';

export const scheduleShareNow = Date.parse('2026-11-12T14:30:00Z');
export function scheduleShareFixture(): DamSnapshot {
  return {
    id: 'swt-fort-gibson-dam', name: 'Fort Gibson Dam', lakeName: 'Fort Gibson Lake', state: 'OK',
    lat: 35.87, lon: -95.22, hasTurbines: true, generating: null, metrics: {}, sources: ['SWPA'],
    generationReference: { units: 4, schedulingCapacityMw: 60, fullGenerationCfs: 32000, source: 'SWPA' },
    schedule: ['2026-11-12', '2026-11-13'].map(scheduleDate => ({
      scheduleDate, retrievedAt: '2026-11-12T14:20:00Z', idle: [],
      hours: Array.from({ length: 24 }, (_, i) => ({ hourEnding: i + 1,
        megawatts: i >= 7 && i < 10 ? 30 : i >= 15 && i < 20 ? 60 : 0, cfs: null, isRamp: false })),
    })),
  };
}
