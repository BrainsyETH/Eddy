import type { ConditionCode, MapGauge } from '@eddy/types';
import { gaugeFreshness } from '@eddy/conditions/gauge-freshness';
import { conditionLabel } from '../theme/conditions';
import { gaugeConditionCode, gaugeLink, gaugePlaceLabel, gaugeReadingText, gaugesForRiver } from './gaugeCondition';

export interface GaugeMenuOption {
  id: string;
  name: string;
  reading: string | null;
  code: ConditionCode;
  timestamp?: string | null;
  suspect?: boolean;
  disabled?: boolean;
  /** The gauge the river's verdict, alerts and rivers-list chip follow. */
  isPrimary?: boolean;
}

/** The default overview agrees with the map; alternates need usable observations. */
export function riverOverviewCondition(riverCode: ConditionCode, defaultSiteId: string | undefined,
  selected: { siteId: string; code: ConditionCode; timestamp?: string | null; suspect?: boolean } | null,
  now = Date.now()): ConditionCode {
  if (!selected || selected.siteId === defaultSiteId) return riverCode;
  return selected.suspect || gaugeFreshness(selected.timestamp, now) !== 'live' ? 'unknown' : selected.code;
}

/** Never present an old or suspect observation as today's floatability. */
export function gaugeMenuSubtitle(option: GaugeMenuOption, now = Date.now()): string {
  if (option.disabled) return 'Station link unavailable';
  if (!option.reading) return 'Reading unavailable';
  const freshness = gaugeFreshness(option.timestamp, now);
  const status = option.suspect ? 'Check reading'
    : freshness === 'live' ? conditionLabel(option.code)
    : freshness === 'delayed' ? 'Reporting delayed'
    : freshness === 'historical' ? 'Historical reading'
    : 'Observation time unavailable';
  const line = `${option.reading} · ${status}`;
  return option.isPrimary ? `${line} · Rates river` : line;
}

export function gaugeMenuOptions(gauges: MapGauge[], riverSlug: string): GaugeMenuOption[] {
  return gaugesForRiver(gauges, riverSlug).map(gauge => ({
    id: gauge.id,
    name: gaugePlaceLabel(gauge.name),
    reading: gaugeReadingText(gauge, riverSlug),
    code: gaugeConditionCode(gauge, riverSlug),
    timestamp: gauge.readingTimestamp,
    suspect: gauge.readingSuspect,
    disabled: !gauge.usgsSiteId,
    isPrimary: gaugeLink(gauge, riverSlug)?.isPrimary ?? false,
  }));
}
