// Pure Read prompt assembly. Runtime imports must stay free of SDKs and database clients.
import { RIVER_NOTES } from '@/data/eddy-quotes';
import type { UpdateTarget } from '@/data/river-sections';
import type { NWSAlert } from '@/lib/nws/alerts';
import type { WeatherData, ForecastData, PrecipitationSummary } from '@/lib/weather/openweather';
import type { GaugeTrajectory } from './gauge-trajectory';
import type { RainLagInfo } from './rain-lag';
import type { RiverContext } from '@/lib/rivers/context';
import { DEFAULT_TIMEZONE } from '@/lib/rivers/defaults';
import { getLocalDateStrings } from '@/lib/social/local-time';
import { buildConditionSemantics } from './condition-semantics';
import { reportFactsPrompt, type ReportFacts } from './report-facts';
import { materialOutlookLines } from './material-outlook';

export interface GaugeContext {
  facts: ReportFacts;
  readingTimestamp: string | null;
  notes: string | null;
}

// Keep a measured trace distinct from no rain without implying extra precision.
function rainAmount(inches: number): string {
  return inches < 0.01 ? '<0.01' : inches.toFixed(2);
}

export function buildPrompt(
  target: UpdateTarget,
  gauge: GaugeContext,
  weather: WeatherData | null,
  forecast: ForecastData | null,
  alerts: NWSAlert[],
  localKnowledge: string,
  trajectory: GaugeTrajectory | null = null,
  precipitation: PrecipitationSummary | null = null,
  rainLag: RainLagInfo | null = null,
  riverCtx: RiverContext | null = null,
): string {
  const riverNotes = riverCtx?.characteristics?.riverNote ?? RIVER_NOTES[target.riverSlug];
  const lines: string[] = [];

  // Date context in the river's local timezone so day-of-week and "this
  // weekend" references are right for the river, not for Missouri.
  const { dayOfWeek, dateStr } = getLocalDateStrings(riverCtx?.timezone ?? DEFAULT_TIMEZONE);
  lines.push(`Date: ${dayOfWeek}, ${dateStr}`);
  lines.push('');

  lines.push(`Generate an Eddy condition update for: ${target.riverName}`);
  if (target.sectionName) {
    lines.push(`Section: ${target.sectionName}`);
  }
  if (target.sectionDescription) {
    lines.push(`Section context: ${target.sectionDescription}`);
  }

  // River character (from rivers.river_type + river_characteristics)
  if (riverCtx) {
    lines.push('');
    lines.push('[RIVER CHARACTER]');
    // Effective type, so this line agrees with the guidance below it rather
    // than announcing "spring fed float" above dam-tailwater semantics.
    const effectiveType = target.sectionRiverType ?? riverCtx.riverType;
    lines.push(`Type: ${effectiveType.replace(/_/g, ' ')}`);
    const hazards = riverCtx.characteristics?.primaryHazards;
    if (hazards && hazards.length > 0) {
      lines.push(`Primary hazards: ${hazards.map((h) => h.replace(/_/g, ' ')).join(', ')}`);
    }
  }

  // Condition semantics (region + low/rising-water framing) — moved out of the
  // system prompt so that prompt stays static and cacheable.
  lines.push('');
  lines.push('[CONDITION SEMANTICS — how to interpret conditions on THIS river]');
  lines.push(
    buildConditionSemantics(riverCtx, {
      riverType: target.sectionRiverType,
      lowWaterMeaning: target.sectionLowWaterMeaning,
      risingWaterHazards: target.sectionRisingWaterHazards,
    }),
  );

  lines.push('');
  lines.push('[CURRENT GAUGE DATA]');

  lines.push(reportFactsPrompt(gauge.facts));
  if (gauge.readingTimestamp) {
    const ageHours = (Date.now() - new Date(gauge.readingTimestamp).getTime()) / (1000 * 60 * 60);
    if (ageHours > 6) lines.push(`WARNING: Reading is ${Math.round(ageHours)} hours old, data may be stale.`);
  }

  // Gauge threshold knowledge
  if (gauge.notes) {
    lines.push(`Gauge notes: ${gauge.notes}`);
  } else if (riverNotes) {
    lines.push(`Gauge notes: ${riverNotes}`);
  }
  // Gauge trajectory. The changes and rate cover the past day; the peak and
  // low cover trajectory.windowDays, and each line says which it is.
  if (trajectory) {
    lines.push('');
    lines.push('[GAUGE TRAJECTORY]');
    if (trajectory.change24h != null) {
      const sign24 = trajectory.change24h >= 0 ? '+' : '';
      const startHeight = trajectory.currentHeightFt != null
        ? (trajectory.currentHeightFt - trajectory.change24h).toFixed(1)
        : '?';
      lines.push(`24h change: ${sign24}${trajectory.change24h.toFixed(1)} ft (was ${startHeight} ft yesterday)`);
    }
    if (trajectory.change6h != null) {
      const sign6 = trajectory.change6h >= 0 ? '+' : '';
      lines.push(`6h change: ${sign6}${trajectory.change6h.toFixed(1)} ft`);
    }
    if (trajectory.rateFtPerHour != null && trajectory.acceleration) {
      lines.push(`Rate: ${trajectory.acceleration} at ${Math.abs(trajectory.rateFtPerHour).toFixed(2)} ft/hr`);
    }
    if (trajectory.windowPeak) {
      lines.push(`${trajectory.windowDays}-day peak: ${trajectory.windowPeak.heightFt.toFixed(1)} ft`);
    }
    if (trajectory.windowLow) {
      lines.push(`${trajectory.windowDays}-day low: ${trajectory.windowLow.heightFt.toFixed(1)} ft`);
    }
    lines.push(`Summary: ${trajectory.narrative}`);

    // Historical percentile context
    if (trajectory.percentileContext) {
      lines.push('');
      lines.push('[HISTORICAL CONTEXT]');
      lines.push(trajectory.percentileContext);
    }
  }

  // Recent rain. Three states, and the model has to be able to tell them
  // apart: an amount, a measured zero, and no measurement at all. Leaving the
  // block out for both of the last two made "it has not rained" and "we do not
  // know" the same silence. Every state also says what it is a measurement OF:
  // one weather point over three hours, not the watershed above the gauge.
  const rainPlace = weather?.city ? `at ${weather.city}` : 'at the weather point';
  lines.push('');
  if (precipitation && (precipitation.rain1h > 0 || precipitation.rain3h > 0)) {
    lines.push('[RECENT PRECIPITATION]');
    const parts: string[] = [];
    if (precipitation.rain1h > 0) parts.push(`Last 1h: ${rainAmount(precipitation.rain1h)} in`);
    if (precipitation.rain3h > 0) parts.push(`Last 3h: ${rainAmount(precipitation.rain3h)} in`);
    lines.push(parts.join(' | '));
    lines.push(`Measured ${rainPlace}: one weather point, not the watershed upstream.`);
  } else if (precipitation) {
    lines.push(`Recent rain: none reported ${rainPlace} in the past 3 hours. That is one weather point, not the watershed upstream, and it says nothing about rain before that.`);
  } else {
    lines.push('Recent rain: no measurement is available for this report. Do not describe the past hours as dry or as wet.');
  }

  // Rain-to-river lag info
  if (rainLag) {
    lines.push('');
    lines.push('[RAIN-TO-RIVER LAG]');
    lines.push(`Typical response time: ${rainLag.hours} hours from local rain to gauge response`);
    lines.push(`Note: ${rainLag.note}`);
    lines.push(`Recovery rate: ${rainLag.dropRateFtPerDay}`);
  }

  // No current weather and no three-day forecast. Weather belongs in the app's
  // Weather section, which is rebuilt on every view; a Read is stored for the
  // day. The days ahead reach the Read only when rain is likely. See
  // material-outlook.ts.
  const outlook = materialOutlookLines(forecast);
  if (outlook.length) {
    lines.push('');
    lines.push(...outlook);
  }

  // NWS alerts
  if (alerts.length > 0) {
    lines.push('');
    lines.push('[ACTIVE NWS ALERTS]');
    for (const alert of alerts.slice(0, 3)) {
      lines.push(`[${alert.severity}] ${alert.event}: ${alert.headline}`);
      if (alert.description) {
        lines.push(`  ${alert.description.slice(0, 300)}`);
      }
    }
  }

  // Local knowledge from EDDY_KNOWLEDGE.md
  if (localKnowledge) {
    lines.push('');
    lines.push('[LOCAL KNOWLEDGE — use to inform your update, not recite]');
    lines.push(localKnowledge);
  }

  return lines.join('\n');
}
