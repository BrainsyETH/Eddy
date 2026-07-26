import {
  computeCondition,
  getConditionShortLabel,
  hasMaterialConditionChange,
  type ConditionThresholds,
} from '@/lib/conditions';
import type { GaugeTrend } from '@/lib/gauge-trend';
import type { ConditionCode } from '@/types/api';
import type { EddyTakeSections } from '@/lib/eddy/take-sections';

export const OUTLOOK_TIME_ZONE = 'America/Chicago';
export const SIGNIFICANT_RAIN_CHANCE = 70;
/** Below this, a nonzero rain chance is shown but styled as background noise. */
export const LOW_RAIN_CHANCE = 20;
/**
 * Forecast high at or above which a float day needs a heat plan — earlier
 * launch, more water, a shade stop. Set at the NWS heat-advisory neighbourhood
 * for Missouri rather than a "hot day" threshold, so the flag stays rare enough
 * to mean something in July.
 */
export const HEAT_ADVISORY_TEMP_F = 95;

export type RainPresentation = {
  kind: 'none' | 'unlikely' | 'possible' | 'significant';
  label: string;
};

export function getRainPresentation(precipitation: number): RainPresentation {
  if (precipitation === 0) return { kind: 'none', label: 'No rain' };
  // A 5% chance is not a planning signal. Keep the honest number but let it
  // read as quiet, so only chances that could actually move a float day carry
  // the emphasized treatment.
  if (precipitation < LOW_RAIN_CHANCE) return { kind: 'unlikely', label: `Rain ${precipitation}%` };
  return {
    kind: precipitation >= SIGNIFICANT_RAIN_CHANCE ? 'significant' : 'possible',
    label: `Rain ${precipitation}%`,
  };
}

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
  sourceKind: 'checking' | 'official' | 'guidance';
  sourceLabel: string;
  hasOfficialForecast: boolean;
  isWeatherLoading: boolean;
  futureUnavailable: boolean;
  isGuidance: boolean;
  trend: GaugeTrend | null;
}

export interface BuildEddyTakeSectionsInput {
  outlook: RiverOutlookState;
  currentCondition: ConditionCode;
  generatedEddyRead?: string | null;
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

/**
 * The decision, not the label. The condition strip directly above this already
 * shows the canonical band in full color, so restating "this gauge is in the
 * High range" spent the most prominent line in the report on a repeat. Each
 * line leads with the call and then says what it means on the water.
 */
function buildBottomLine(condition: ConditionCode): string {
  switch (condition) {
    case 'dangerous':
      return 'Stay off the river today. Wait for the gauge to drop out of flood range.';
    case 'high':
      return 'Use caution today. Expect pushy water, strainers, and fewer easy places to pull out.';
    case 'too_low':
      return 'Wait on this float today. You would spend more time dragging than floating.';
    case 'low':
      return 'Floatable today, with shallow water and some dragging likely.';
    case 'good':
      return 'Floatable today, with dependable water through the riffles.';
    case 'flowing':
      return 'Floatable today. Levels are about as good as this gauge gets.';
    default:
      return 'There is not enough current river data to make a reliable call.';
  }
}

function significantRainDays(outlook: RiverOutlookState): OutlookWeatherDay[] {
  return outlook.days
    .map((day) => day.weather)
    .filter((day): day is OutlookWeatherDay => day != null && day.precipitation >= SIGNIFICANT_RAIN_CHANCE);
}

/** Build the live decision hierarchy shown in the compact and fallback report. */
export function buildEddyTakeSections({
  outlook,
  currentCondition,
  generatedEddyRead,
}: BuildEddyTakeSectionsInput): EddyTakeSections {
  const conditionLabel = currentCondition === 'unknown' ? null : getConditionShortLabel(currentCondition);
  const forecastDays = outlook.days.filter((day) => day.river.conditionCode != null);
  const rainDays = significantRainDays(outlook);

  // "Eddy's read" interprets the river as it stands right now; "Watch for"
  // owns everything forward-looking. Keeping that split is what stops the two
  // panels from printing the same NWS sentence side by side.
  let liveGuidance: string;
  if (!conditionLabel) {
    liveGuidance = 'The current gauge condition is unavailable, so there is not enough evidence for a reliable local read.';
  } else if (outlook.sourceKind === 'checking') {
    liveGuidance = `${conditionLabel} is verified now. The rest of the outlook is still loading.`;
  } else if (outlook.trend) {
    liveGuidance = `${conditionLabel} is verified now, with the gauge ${outlook.trend.label.toLowerCase()} over the last ${outlook.trend.windowHours} hours.`;
  } else {
    liveGuidance = `${conditionLabel} is verified now. A recent measured trend is unavailable.`;
  }

  let watchFor: string;
  if (outlook.sourceKind === 'checking') {
    watchFor = 'Wait for the 72-hour outlook, then recheck the gauge before launch.';
  } else if (outlook.futureUnavailable) {
    watchFor = 'Future river and weather guidance is unavailable; recheck the gauge before launch.';
  } else {
    // Compare safety classes, not raw labels. Day one's forecast value is the
    // day's maximum stage, so a raw comparison flagged "watch today" whenever
    // the peak nudged Ideal into Good — a warning about nothing.
    const changedDay = forecastDays.find((day) =>
      hasMaterialConditionChange(currentCondition, day.river.conditionCode!),
    );
    if (changedDay) {
      watchFor = `Watch ${formatOutlookDay(changedDay.date, false)}, when the NWS outlook reaches ${getConditionShortLabel(changedDay.river.conditionCode!)}; recheck before launch.`;
    } else if (rainDays.length > 0) {
      const names = rainDays.map((day) => day.dayOfWeek).join(' and ');
      watchFor = `Forecast rain ${names} is the main swing factor; recheck before launch and after the rain.`;
    } else if (outlook.trend?.direction === 'rising') {
      watchFor = `${outlook.trend.label} is the main change signal; recheck immediately before launch.`;
    } else {
      watchFor = 'No major change signal appears in the available outlook; still recheck the gauge before launch.';
    }
  }

  return {
    bottomLine: buildBottomLine(currentCondition),
    eddyRead: generatedEddyRead?.trim() || liveGuidance,
    watchFor,
  };
}

export function buildDeterministicEddyReport(sections: EddyTakeSections): string {
  return `Bottom line: ${sections.bottomLine} Eddy’s read: ${sections.eddyRead} Watch for: ${sections.watchFor}`;
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
  // Match the requested local calendar dates rather than slicing the weather
  // service's own list: it can include a trailing part of the previous local
  // day, and slicing first would then discard the third requested day.
  const weatherByDate = new Map(weatherDays.map((day) => [day.date, day]));
  const riverDays = groupForecastByDay(riverStages, dates, stageThresholds);
  const hasOfficialForecast = riverDays.some((day) => day.valueFt != null);
  const futureUnavailable = !hasOfficialForecast && (
    weatherError || (!weatherPending && weatherDays.length === 0)
  );
  const sourceKind = riverPending ? 'checking' : hasOfficialForecast ? 'official' : 'guidance';

  return {
    days: dates.map((date, index) => ({
      date,
      weather: weatherByDate.get(date) ?? null,
      river: riverDays[index],
    })),
    sourceKind,
    sourceLabel: sourceKind === 'checking'
      ? 'Checking river forecast'
      : sourceKind === 'official'
        ? 'NWS 72-hour river forecast'
        : 'Current river trend + weather outlook',
    hasOfficialForecast,
    isWeatherLoading: weatherPending,
    futureUnavailable,
    isGuidance: sourceKind === 'guidance' && !futureUnavailable,
    trend,
  };
}

export function formatOutlookDay(date: string, todayLabel = true): string {
  if (todayLabel && date === getOutlookDates(new Date(), 1)[0]) return 'Today';
  return new Intl.DateTimeFormat('en-US', {
    timeZone: OUTLOOK_TIME_ZONE,
    weekday: 'short',
  }).format(new Date(`${date}T12:00:00Z`));
}
