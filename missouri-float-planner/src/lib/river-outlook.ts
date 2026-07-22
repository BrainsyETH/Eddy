import { computeCondition, getConditionShortLabel, type ConditionThresholds } from '@/lib/conditions';
import type { GaugeTrend } from '@/lib/gauge-trend';
import type { ConditionCode } from '@/types/api';

export const OUTLOOK_TIME_ZONE = 'America/Chicago';
export const SIGNIFICANT_RAIN_CHANCE = 70;

export interface RiverForecastStage {
  dateTime: string;
  valueFt: number;
}

export interface DailyRiverForecast {
  date: string;
  valueFt: number | null;
  conditionCode: ConditionCode | null;
}

function dateKey(date: Date, timeZone = OUTLOOK_TIME_ZONE): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export function getOutlookDates(now = new Date(), count = 3): string[] {
  const today = dateKey(now);
  const [year, month, day] = today.split('-').map(Number);
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(Date.UTC(year, month - 1, day + index, 12));
    return date.toISOString().slice(0, 10);
  });
}

/** Select the highest official forecast stage in each local calendar day. */
export function groupForecastByDay(
  stages: RiverForecastStage[],
  dates: string[],
  stageThresholds: ConditionThresholds | null,
): DailyRiverForecast[] {
  const maximums = new Map<string, number>();
  for (const stage of stages) {
    if (!Number.isFinite(stage.valueFt)) continue;
    const key = dateKey(new Date(stage.dateTime));
    const current = maximums.get(key);
    if (current == null || stage.valueFt > current) maximums.set(key, stage.valueFt);
  }

  return dates.map((date) => {
    const valueFt = maximums.get(date) ?? null;
    return {
      date,
      valueFt,
      conditionCode: valueFt == null || !stageThresholds
        ? null
        : computeCondition(valueFt, { ...stageThresholds, thresholdUnit: 'ft' }).code,
    };
  });
}

export function buildOfficialOutlookSummary(days: DailyRiverForecast[]): string {
  const withStage = days.filter((day) => day.valueFt != null);
  const withCondition = withStage.filter((day) => day.conditionCode != null);
  if (withStage.length === 0) return 'The official river forecast has no readings in this 72-hour window.';
  if (withCondition.length === 0) return 'Official stage forecast available; local condition bands are unavailable in feet.';

  const labels = withCondition.map((day) => getConditionShortLabel(day.conditionCode!));
  if (labels.every((label) => label === labels[0])) {
    return `NWS forecast stays ${labels[0]} through ${formatOutlookDay(withCondition.at(-1)!.date, false)}.`;
  }
  const peak = withCondition.reduce((highest, day) => day.valueFt! > highest.valueFt! ? day : highest);
  return `NWS forecast reaches ${getConditionShortLabel(peak.conditionCode!)} by ${formatOutlookDay(peak.date, false)}.`;
}

export function buildGuidanceSummary(
  trend: GaugeTrend | null,
  rainDays: Array<{ dayOfWeek: string; precipitation: number }>,
): string {
  const trendText = trend ? `${trend.label} now.` : 'Current trend unavailable.';
  const significantRain = rainDays.filter((day) => day.precipitation >= SIGNIFICANT_RAIN_CHANCE);
  if (significantRain.length > 0) {
    const names = significantRain.map((day) => day.dayOfWeek).join(' & ');
    return `${trendText} Rain ${names} could change levels—recheck before you go.`;
  }
  return `${trendText} No significant rain is forecast—recheck before launch.`;
}

export function formatOutlookDay(date: string, todayLabel = true): string {
  if (todayLabel && date === getOutlookDates(new Date(), 1)[0]) return 'Today';
  return new Intl.DateTimeFormat('en-US', {
    timeZone: OUTLOOK_TIME_ZONE,
    weekday: 'short',
  }).format(new Date(`${date}T12:00:00Z`));
}
