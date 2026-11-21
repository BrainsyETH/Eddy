// src/lib/eddy/build-gauge-prompt.ts
// Pure assembly of a secondary gauge Read's user message. Like
// build-update-prompt.ts for the river Read: no SDK, no database client and no
// file read, so the admin test panel can rebuild a recorded morning's message
// with it (src/lib/ai/model-test.ts) and a test can run it on fixed inputs.
//
// The knowledge text is passed in for the same reason. The generator selects
// it once (getRiverKnowledgeForGauge) and records the text it sent; a replay
// selects it again from today's file.
import type { RiverContext } from '@/lib/rivers/context';
import { DEFAULT_TIMEZONE } from '@/lib/rivers/defaults';
import { getLocalDateStrings } from '@/lib/social/local-time';
import type { ForecastData } from '@/lib/weather/openweather';
import { buildSecondaryGaugeSemantics } from './condition-semantics';
import type { GaugeTrajectory } from './gauge-trajectory';
import { materialOutlookLines } from './material-outlook';
import { readingTimePromptLine, reportFactsPrompt, type ReportFacts } from './report-facts';
import { seasonPromptLines, trendPromptLines } from './trend-lines';

/** What the message names: the station and its river. */
export interface GaugePromptTarget {
  gaugeName: string;
  riverName: string;
}

export interface GaugePromptInputs {
  target: GaugePromptTarget;
  facts: ReportFacts;
  readingTimestamp: string | null;
  trajectory: GaugeTrajectory | null;
  forecast: ForecastData | null;
  riverCtx: RiverContext | null;
  /** False unless a section check proved no reach overrides the river's type. */
  riverBehaviorApplies: boolean;
  /** The text getRiverKnowledgeForGauge() returned for this station, or ''. */
  riverKnowledge: string;
  /** When the message is for. Now, except in a replay of a recorded morning. */
  now?: Date;
}

export function buildGaugePrompt(inputs: GaugePromptInputs): string {
  const { target, facts, readingTimestamp, trajectory, forecast, riverCtx, riverBehaviorApplies, riverKnowledge } = inputs;
  const now = inputs.now ?? new Date();
  const lines: string[] = [];

  const { dayOfWeek, dateStr } = getLocalDateStrings(riverCtx?.timezone ?? DEFAULT_TIMEZONE, now);
  lines.push(`Date: ${dayOfWeek}, ${dateStr}`);
  lines.push('');
  lines.push(`Generate a secondary-gauge update for: ${target.gaugeName} on the ${target.riverName}.`);
  // The gauge's distance from its assigned reach is deliberately not in the
  // prompt. It is not a river mile, and labelled as one it had Eddy put Eureka
  // "at river mile 5.0 this close to the Missouri confluence".

  lines.push('');
  lines.push('[CONDITION SEMANTICS — how to interpret conditions on THIS river]');
  lines.push(buildSecondaryGaugeSemantics(riverCtx, riverBehaviorApplies));
  if (riverKnowledge) {
    lines.push('');
    lines.push('[RIVER KNOWLEDGE: background for you, about the whole river unless it says "This gauge" or names a section. Use only what fits this gauge\'s stretch; never recite it]');
    lines.push(riverKnowledge);
  }
  lines.push('');
  lines.push('[THIS GAUGE]');
  lines.push(reportFactsPrompt(facts));
  const readingTime = readingTimePromptLine(readingTimestamp, now);
  if (readingTime) lines.push(readingTime);

  const trend = trendPromptLines(trajectory);
  if (trend.length) lines.push('', ...trend);
  const season = seasonPromptLines(trajectory, facts.conditionCode);
  if (season.length) lines.push('', ...season);

  // No weather outlook. The days ahead reach the Read only when rain is likely:
  // see material-outlook.ts.
  const outlook = materialOutlookLines(forecast, now);
  if (outlook.length) {
    lines.push('');
    lines.push(...outlook);
  }

  return lines.join('\n');
}
