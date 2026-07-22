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

export interface OutlookWeatherDay {
  date: string;
  dayOfWeek: string;
  tempHigh: number;
  tempLow: number;
  condition: string;
  conditionIcon: string;
  precipitation: number;
}

export interface RiverOutlookDay {
  date: string;
  weather: OutlookWeatherDay | null;
  river: DailyRiverForecast;
}

export interface RiverOutlookState {
  days: RiverOutlookDay[];
  summary: string;
  sourceKind: 'checking' | 'official' | 'guidance';
  sourceLabel: string;
  hasOfficialForecast: boolean;
  isInitialLoading: boolean;
  isWeatherLoading: boolean;
  futureUnavailable: boolean;
  isGuidance: boolean;
}

export interface BuildRiverOutlookInput {
  weatherDays: OutlookWeatherDay[];
  weatherPending: boolean;
  weatherError: boolean;
  riverStages: RiverForecastStage[];
  riverPending: boolean;
  trend: GaugeTrend | null;
  stageThresholds: ConditionThresholds | null;
  now?: Date;
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

/**
 * Turn the evidence-led outlook into Eddy's concise, deterministic verdict.
 * This deliberately uses only canonical condition labels and the same forecast
 * state already shown above it; the generated long-form report remains separate.
 */
export function buildEddyTakeSummary(
  outlook: RiverOutlookState,
  currentCondition: ConditionCode,
): string {
  const currentLabel = currentCondition === 'unknown'
    ? null
    : getConditionShortLabel(currentCondition);
  const currentLead = currentLabel ? `${currentLabel} today` : 'Use today’s reading';

  if (outlook.sourceKind === 'checking') {
    return `${currentLead}. I’m checking what comes next—check back before launch.`;
  }

  if (outlook.futureUnavailable) {
    return currentLabel
      ? `I can tell you it’s ${currentLabel} today, but not what comes next—check again before launch.`
      : 'I can’t see what comes next—use today’s reading and check again before launch.';
  }

  if (outlook.hasOfficialForecast) {
    const forecastDays = outlook.days.filter((day) => day.river.conditionCode != null);
    if (forecastDays.length === 0) {
      return `${currentLead}. The NWS stage outlook is available—check the numbers before launch.`;
    }

    const labels = forecastDays.map((day) => getConditionShortLabel(day.river.conditionCode!));
    const lastDay = forecastDays.at(-1)!;
    const lastLabel = labels.at(-1)!;
    const hasMultipleDays = forecastDays.length > 1;
    const staysInOneBand = labels.every((label) => label === labels[0]);

    if (hasMultipleDays && staysInOneBand && (!currentLabel || lastLabel === currentLabel)) {
      return `${currentLead}, and the NWS keeps it ${lastLabel} through ${formatOutlookDay(lastDay.date, false)}.`;
    }

    const peak = forecastDays.reduce((highest, day) =>
      day.river.valueFt! > highest.river.valueFt! ? day : highest,
    );
    const peakLabel = getConditionShortLabel(peak.river.conditionCode!);
    if (!currentLabel || peakLabel !== currentLabel || !staysInOneBand) {
      return `${currentLead}, but the NWS has it reaching ${peakLabel} by ${formatOutlookDay(peak.date, false)}—plan around that.`;
    }

    return `${currentLead}. The NWS stage outlook is available—check it again before launch.`;
  }

  const rainDays = outlook.days
    .map((day) => day.weather)
    .filter((day): day is OutlookWeatherDay => day != null && day.precipitation >= SIGNIFICANT_RAIN_CHANCE);
  if (rainDays.length > 0) {
    const names = rainDays.map((day) => day.dayOfWeek).join(' and ');
    return `${currentLead}. Rain ${names} could move the river—check again before launch.`;
  }

  return `${currentLead}. The weather outlook is quiet, but check the river again before launch.`;
}

/** Build the complete presentational state once so every consumer agrees. */
export function buildRiverOutlookState({
  weatherDays,
  weatherPending,
  weatherError,
  riverStages,
  riverPending,
  trend,
  stageThresholds,
  now = new Date(),
}: BuildRiverOutlookInput): RiverOutlookState {
  const dates = getOutlookDates(now);
  const weatherByDate = new Map(weatherDays.slice(0, 3).map((day) => [day.date, day]));
  const riverDays = groupForecastByDay(riverStages, dates, stageThresholds);
  const hasOfficialForecast = riverDays.some((day) => day.valueFt != null);
  const isInitialLoading = weatherPending && riverPending;
  const futureUnavailable = !hasOfficialForecast && (
    weatherError || (!weatherPending && weatherDays.length === 0)
  );
  const sourceKind = riverPending ? 'checking' : hasOfficialForecast ? 'official' : 'guidance';
  const summary = riverPending
    ? 'Checking the official river forecast…'
    : hasOfficialForecast
      ? buildOfficialOutlookSummary(riverDays)
      : futureUnavailable
        ? 'Future outlook unavailable—use the current reading and recheck before launch.'
        : weatherPending
          ? 'Checking the river and weather outlook…'
          : buildGuidanceSummary(trend, weatherDays.slice(0, 3));

  return {
    days: dates.map((date, index) => ({
      date,
      weather: weatherByDate.get(date) ?? null,
      river: riverDays[index],
    })),
    summary,
    sourceKind,
    sourceLabel: sourceKind === 'checking'
      ? 'Checking river forecast'
      : sourceKind === 'official'
        ? 'NWS 72-hour river forecast'
        : 'Trend + local weather',
    hasOfficialForecast,
    isInitialLoading,
    isWeatherLoading: weatherPending,
    futureUnavailable,
    isGuidance: sourceKind === 'guidance' && !futureUnavailable,
  };
}

export function formatOutlookDay(date: string, todayLabel = true): string {
  if (todayLabel && date === getOutlookDates(new Date(), 1)[0]) return 'Today';
  return new Intl.DateTimeFormat('en-US', {
    timeZone: OUTLOOK_TIME_ZONE,
    weekday: 'short',
  }).format(new Date(`${date}T12:00:00Z`));
}
