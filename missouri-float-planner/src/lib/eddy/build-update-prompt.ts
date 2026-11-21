// Pure Read prompt assembly. Runtime imports must stay free of SDKs and database clients.
import { RIVER_NOTES } from '@/data/eddy-quotes';
import type { UpdateTarget } from '@/data/river-sections';
import type { NWSAlert } from '@/lib/nws/alerts';
import type { WeatherData, ForecastData, PrecipitationSummary } from '@/lib/weather/openweather';
import type { GaugeTrajectory } from './gauge-trajectory';
import type { RiverContext } from '@/lib/rivers/context';
import { DEFAULT_TIMEZONE } from '@/lib/rivers/defaults';
import { getLocalDateStrings } from '@/lib/social/local-time';
import { buildConditionSemantics } from './condition-semantics';
import { readingTimePromptLine, reportFactsPrompt, type ReportFacts } from './report-facts';
import { materialOutlookLines } from './material-outlook';
import { seasonPromptLines, trendPromptLines } from './trend-lines';

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
  riverCtx: RiverContext | null = null,
  /** When the prompt is for. Now, except in a replay of a recorded morning. */
  now: Date = new Date(),
): string {
  const riverNotes = riverCtx?.characteristics?.riverNote ?? RIVER_NOTES[target.riverSlug];
  const lines: string[] = [];

  // Date context in the river's local timezone so day-of-week and "this
  // weekend" references are right for the river, not for Missouri.
  const { dayOfWeek, dateStr } = getLocalDateStrings(riverCtx?.timezone ?? DEFAULT_TIMEZONE, now);
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
  const readingTime = readingTimePromptLine(gauge.readingTimestamp, now);
  if (readingTime) lines.push(readingTime);

  // Gauge threshold knowledge
  if (gauge.notes) {
    lines.push(`Gauge notes: ${gauge.notes}`);
  } else if (riverNotes) {
    lines.push(`Gauge notes: ${riverNotes}`);
  }
  // How the gauge has moved, and how today compares with the season. A flat
  // gauge and an ordinary season are one line or nothing: see trend-lines.ts.
  const trend = trendPromptLines(trajectory);
  if (trend.length) lines.push('', ...trend);
  const season = seasonPromptLines(trajectory, gauge.facts.conditionCode);
  if (season.length) lines.push('', ...season);

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

  // No rain-to-river lag and no recovery rate. Both were per-river numbers
  // typed in with no source. The lag was removed when it was measured
  // (scripts/research/rain-lag-2026-11), and the recovery rates went on the
  // owner's word on 2026-11-19: the measured 6- and 24-hour change above
  // already says how fast this river is dropping today.

  // No current weather and no three-day forecast. Weather belongs in the app's
  // Weather section, which is rebuilt on every view; a Read is stored for the
  // day. The days ahead reach the Read only when rain is likely. See
  // material-outlook.ts.
  const outlook = materialOutlookLines(forecast, now);
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
    lines.push('[LOCAL KNOWLEDGE: background for you. Use what is about this gauge\'s water; never recite it]');
    lines.push(localKnowledge);
  }

  return lines.join('\n');
}
