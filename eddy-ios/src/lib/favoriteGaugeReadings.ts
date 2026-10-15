import type { MapGauge } from '@eddy/types';
import { isReadingStale } from '@eddy/conditions/reading-staleness';
import { gaugePlaceLabel, gaugesForRiver } from './gaugeCondition';
import { formatReading, readingAge } from './readingCopy';

/** Discharge is explicit here even when a river's condition is rated in feet. */
export function favoriteGaugeReadings(gauges: MapGauge[], riverSlug: string) {
  return gaugesForRiver(gauges, riverSlug).map(gauge => {
    const hasFlow = gauge.dischargeCfs != null && Number.isFinite(gauge.dischargeCfs);
    const reading = hasFlow ? formatReading(gauge.dischargeCfs!, 'cfs') : 'CFS unavailable';
    const age = hasFlow ? readingAge(gauge.readingAgeHours) : null;
    const notice = hasFlow ? [
      gauge.readingSuspect ? 'Check reading' : null,
      isReadingStale(gauge.readingAgeHours) || !age ? age ?? 'Reading time unavailable' : null,
    ].filter(Boolean).join(' · ') : '';
    return {
      gauge,
      place: gaugePlaceLabel(gauge.name),
      reading,
      hasFlow,
      notice,
      accessibilityLabel: [gauge.name, reading, age,
        hasFlow && gauge.readingSuspect ? gauge.qualifierNote || 'Check reading' : null,
        hasFlow && !age ? 'Reading time unavailable' : null,
      ].filter(Boolean).join(', '),
    };
  });
}

export type FavoriteGaugeReading = ReturnType<typeof favoriteGaugeReadings>[number];
