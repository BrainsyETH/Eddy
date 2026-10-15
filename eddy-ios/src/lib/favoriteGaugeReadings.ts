import type { MapGauge } from '@eddy/types';
import { CONDITION_SYSTEM } from '@eddy/conditions';
import { isReadingStale } from '@eddy/conditions/reading-staleness';
import { gaugeConditionCode, gaugePlaceLabel, gaugesForRiver } from './gaugeCondition';
import { formatReading, readingAge } from './readingCopy';

/** Prefer CFS, then feet; colour still follows this river's actual rating unit. */
export function favoriteGaugeReadings(gauges: MapGauge[], riverSlug: string) {
  return gaugesForRiver(gauges, riverSlug).map(gauge => {
    const discharge = gauge.dischargeCfs != null && Number.isFinite(gauge.dischargeCfs) ? gauge.dischargeCfs : null;
    const stage = gauge.gaugeHeightFt != null && Number.isFinite(gauge.gaugeHeightFt) ? gauge.gaugeHeightFt : null;
    const hasReading = discharge != null || stage != null;
    const reading = discharge != null ? formatReading(discharge, 'cfs')
      : stage != null ? formatReading(stage, 'ft') : 'Reading unavailable';
    const age = hasReading ? readingAge(gauge.readingAgeHours) : null;
    const code = age && !isReadingStale(gauge.readingAgeHours)
      ? gaugeConditionCode({ ...gauge, dischargeCfs: discharge, gaugeHeightFt: stage }, riverSlug)
      : 'unknown';
    const notice = hasReading ? [
      gauge.readingSuspect ? 'Check reading' : null,
      isReadingStale(gauge.readingAgeHours) || !age ? age ?? 'Reading time unavailable' : null,
    ].filter(Boolean).join(' · ') : '';
    return {
      gauge,
      place: gaugePlaceLabel(gauge.name),
      reading,
      code,
      hasReading,
      notice,
      accessibilityLabel: [gauge.name, reading, CONDITION_SYSTEM[code].label, age,
        hasReading && gauge.readingSuspect ? gauge.qualifierNote || 'Check reading' : null,
        hasReading && !age ? 'Reading time unavailable' : null,
      ].filter(Boolean).join(', '),
    };
  });
}

export type FavoriteGaugeReading = ReturnType<typeof favoriteGaugeReadings>[number];
