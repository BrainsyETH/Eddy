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

// ── The Weather section, written the way somebody would say it ──────────────
//
// This used to be one canned sentence out of six, and five of the six ended
// "recheck the gauge before launch" — so the panel labelled WEATHER read as a
// disclaimer with a variable in it. Worse, it never once mentioned the weather:
// no temperature, no heat, and a 60% chance of rain was silently rounded to
// "no major change signal" because only 70%-and-up counted as a signal at all.
// On a Missouri river in July the forecast high is the single most consequential
// number on the screen, and this section was the only place it could have gone.
//
// So the section is composed rather than selected: the sky, then the heat when
// there is any, then what any of it means for the water. Each part is present
// only when it has something to say, and the closing advice is phrased by the
// branch that earned it instead of being stapled to all six.
//
// STILL DETERMINISTIC, and still refusing to invent a river response. Rain is
// reported as rain — the one thing this must never do is turn a precipitation
// percentage into a promise about a gauge, which is why the rain branch talks
// about when to LOOK rather than about what the river will do. The only
// forward-looking claim about water anywhere in here is the NWS's own published
// hydrograph, attributed to the NWS.

const FULL_WEEKDAY: Record<string, string> = {
  Sun: 'Sunday',
  Mon: 'Monday',
  Tue: 'Tuesday',
  Wed: 'Wednesday',
  Thu: 'Thursday',
  Fri: 'Friday',
  Sat: 'Saturday',
};

/**
 * How a person names a day out loud.
 *
 * The two nearest ones by their relation to now — nobody standing on a gravel
 * bar on Wednesday says "Wed" when they mean today — and everything past that
 * by its full name rather than the three-letter form the strip above uses. The
 * strip is a table with seven characters of width per column; this is a
 * sentence.
 */
function spokenDay(index: number, dayOfWeek: string | null | undefined): string {
  if (index === 0) return 'today';
  if (index === 1) return 'tomorrow';
  if (!dayOfWeek) return 'later this week';
  return FULL_WEEKDAY[dayOfWeek] ?? dayOfWeek;
}

/** "today", "today and Thursday", "today, Thursday and Friday". */
function listDays(names: string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/** "highs around 88°" / "highs 84–91°". Null when no day carries a forecast. */
function highsClause(days: OutlookWeatherDay[]): string | null {
  if (days.length === 0) return null;
  const highs = days.map((day) => day.tempHigh);
  const low = Math.min(...highs);
  const high = Math.max(...highs);
  return low === high ? `highs around ${low}°` : `highs ${low}–${high}°`;
}

interface DatedDay {
  name: string;
  weather: OutlookWeatherDay | null;
  conditionCode: ConditionCode | null;
}

/**
 * The Weather section: the sky, the heat, and what either does to the plan.
 *
 * Assembled as up to three sentences. Callers reach this only once the outlook
 * has settled and has something ahead of it to describe — 'checking' and
 * `futureUnavailable` are answered before it, because neither is weather.
 */
function buildWeatherWatch(outlook: RiverOutlookState, currentCondition: ConditionCode): string {
  const dated: DatedDay[] = outlook.days.map((day, index) => ({
    name: spokenDay(index, day.weather?.dayOfWeek),
    weather: day.weather,
    conditionCode: day.river.conditionCode,
  }));
  const withWeather = dated.filter((day) => day.weather != null);

  const rain = withWeather.filter((day) => day.weather!.precipitation >= SIGNIFICANT_RAIN_CHANCE);
  // The band the old copy dropped on the floor: enough of a chance to change
  // what you pack, not enough to claim it is going to happen.
  const maybeRain = withWeather.filter(
    (day) =>
      day.weather!.precipitation >= LOW_RAIN_CHANCE &&
      day.weather!.precipitation < SIGNIFICANT_RAIN_CHANCE,
  );
  const hot = withWeather.filter((day) => day.weather!.tempHigh >= HEAT_ADVISORY_TEMP_F);

  // Compare safety classes, not raw labels. Day one's forecast value is the
  // day's maximum stage, so a raw comparison flagged "watch today" whenever the
  // peak nudged Flowing into Good — a warning about nothing.
  const changed = dated.find(
    (day) =>
      day.conditionCode != null && hasMaterialConditionChange(currentCondition, day.conditionCode),
  );

  const sentences: string[] = [];

  // ── The sky ───────────────────────────────────────────────────────────────
  // The temperature rides along here EXCEPT on a heat day, where the sentence
  // below owns the numbers and printing them twice would read as a stutter.
  const highs = hot.length > 0 ? null : highsClause(withWeather.map((day) => day.weather!));
  const withHighs = (lead: string) => (highs ? `${lead}, ${highs}.` : `${lead}.`);
  if (rain.length > 0) {
    sentences.push(withHighs(`Rain is likely ${listDays(rain.map((day) => day.name))}`));
  } else if (maybeRain.length > 0) {
    sentences.push(
      withHighs(
        `Rain is possible ${listDays(maybeRain.map((day) => day.name))} without being a sure thing`,
      ),
    );
  } else if (withWeather.length > 1) {
    sentences.push(withHighs(`Dry through ${withWeather[withWeather.length - 1].name}`));
  } else if (withWeather.length === 1) {
    sentences.push(withHighs('Dry today'));
  }

  // ── The heat ──────────────────────────────────────────────────────────────
  // The one part of a forecast that changes a float day on its own, and the one
  // the old copy had no way to say. Advice rather than a number, because 97° is
  // a fact and "put in early" is what to do about it.
  if (hot.length > 0) {
    const peak = Math.max(...hot.map((day) => day.weather!.tempHigh));
    sentences.push(
      `Hot ${listDays(hot.map((day) => day.name))} — around ${peak}° at the peak, so put in early and carry more water than you think you need.`,
    );
  }

  // ── What any of it means for the water ────────────────────────────────────
  if (changed) {
    sentences.push(
      `The NWS has this gauge reaching ${getConditionShortLabel(changed.conditionCode!)} by ${changed.name}, which is the thing to watch — read it again the morning you go.`,
    );
  } else if (rain.length > 0 || maybeRain.length > 0) {
    // Deliberately says nothing about what the river will do. Rain upstream of
    // a gauge is a reason to look again; it is not a forecast, and this section
    // has never been allowed to turn one into the other.
    sentences.push(
      'Rain upstream is what would change this river, so look at the gauge again once it has moved through — and once more before you put in.',
    );
  } else if (outlook.trend?.direction === 'rising') {
    sentences.push(
      `The gauge is already ${outlook.trend.label.toLowerCase()}, which matters more here than anything in the sky. Read it again right before you launch.`,
    );
  } else {
    sentences.push(
      'Nothing in the outlook is set to move this river much, but read the gauge again the morning you go.',
    );
  }

  return sentences.join(' ');
}

/** Build the live decision hierarchy shown in the compact and fallback report. */
export function buildEddyTakeSections({
  outlook,
  currentCondition,
  generatedEddyRead,
}: BuildEddyTakeSectionsInput): EddyTakeSections {
  const conditionLabel = currentCondition === 'unknown' ? null : getConditionShortLabel(currentCondition);

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

  // The two states that are not weather at all are answered here; everything
  // that genuinely has a sky to describe goes through buildWeatherWatch.
  let watchFor: string;
  if (outlook.sourceKind === 'checking') {
    watchFor = 'The 72-hour outlook is still coming in. Read the gauge again before you load the boats either way.';
  } else if (outlook.futureUnavailable) {
    watchFor = 'No weather or river forecast came back, so there is nothing to look ahead at here. Read the gauge again right before you launch and treat the rest as unknown.';
  } else {
    watchFor = buildWeatherWatch(outlook, currentCondition);
  }

  return {
    bottomLine: buildBottomLine(currentCondition),
    eddyRead: generatedEddyRead?.trim() || liveGuidance,
    watchFor,
  };
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
