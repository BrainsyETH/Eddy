import type { ConditionCode, MapGauge } from '@eddy/types';
import { gaugeFreshness } from '@eddy/conditions/gauge-freshness';
import { conditionLabel } from '../theme/conditions';
import { gaugeConditionCode, gaugePlaceLabel, gaugeReadingText, gaugesForRiver } from './gaugeCondition';

export interface GaugeMenuOption {
  id: string;
  name: string;
  reading: string | null;
  code: ConditionCode;
  timestamp?: string | null;
  suspect?: boolean;
}

/** Never present an old or suspect observation as today's floatability. */
export function gaugeMenuSubtitle(option: GaugeMenuOption, now = Date.now()): string {
  if (!option.reading) return 'Reading unavailable';
  const freshness = gaugeFreshness(option.timestamp, now);
  const status = option.suspect ? 'Check reading'
    : freshness === 'live' ? conditionLabel(option.code)
    : freshness === 'delayed' ? 'Reporting delayed'
    : freshness === 'historical' ? 'Historical reading'
    : 'Observation time unavailable';
  return `${option.reading} · ${status}`;
}

export function gaugeMenuOptions(gauges: MapGauge[], riverSlug: string): GaugeMenuOption[] {
  return gaugesForRiver(gauges, riverSlug).map(gauge => ({
    id: gauge.id,
    name: gaugePlaceLabel(gauge.name),
    reading: gaugeReadingText(gauge, riverSlug),
    code: gaugeConditionCode(gauge, riverSlug),
    timestamp: gauge.readingTimestamp,
    suspect: gauge.readingSuspect,
  }));
}
