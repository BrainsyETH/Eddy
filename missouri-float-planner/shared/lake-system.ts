// shared/lake-system.ts
// The words for a lake's neighbours: what feeds it, the dam that holds it, and
// where the release goes. Shared so the web card and the iOS screen say the
// same thing about the same row.
//
// Observations only. A release is a reading with its age; nothing here states
// a schedule, so SWPA's "subject to change" note has nothing to travel with.
// The dam screen keeps the plan, and every dam row opens it.

import { READING_LAGGING_AFTER_HOURS, relativeAgeShort } from './dam-schedule-copy';
import type { LakeSystemFlow, LakeSystemRow, LakeSystemStage, LakeWeather } from './lake-types';

export const LAKE_SYSTEM_STAGE_LABELS: Record<LakeSystemStage, string> = {
  coming_in: 'Coming in',
  dam: 'At the dam',
  below: 'Below the dam',
};

/** Hourly sources go stale at six hours and daily ones at thirty-six, the lake page's own limits. */
const STALE_AFTER_HOURS = { spot: 6, daily: 36 } as const;

export interface LakeSystemRowCopy {
  title: string;
  /** Short facts in reading order. Empty when the row has nothing measured to say. */
  facts: string[];
  /** "2 hr ago", or null when no fact carries a time. */
  age: string | null;
  /** True when the dated fact is past its cadence's limit. A client dims the facts and keeps the age. */
  stale: boolean;
}

function cfs(value: number): string {
  return `${Math.round(value).toLocaleString('en-US')} cfs`;
}

function isStale(at: string | undefined, daily: boolean, now: number): boolean {
  if (!at) return false;
  const ms = Date.parse(at);
  if (!Number.isFinite(ms)) return true;
  return now - ms > STALE_AFTER_HOURS[daily ? 'daily' : 'spot'] * 3_600_000;
}

/** A daily average says so; a once-a-day report of some other kind says that instead. */
function cadenceNote(flow: LakeSystemFlow): string {
  return flow.dailyMean ? ' (daily avg)' : flow.daily ? ' (daily report)' : '';
}

function isDaily(flow: LakeSystemFlow | undefined): boolean {
  return Boolean(flow?.dailyMean || flow?.daily);
}

/**
 * Whether an observed turbine state may still be stated in the present tense.
 *
 * The dam screen's own line (generatingForNow): only a fresh reading speaks
 * for now. The server applies it when it builds the row, but a client can hold
 * the row far longer than that, with no signal at the lake, so the test runs
 * again here on the reader's clock. Past the line the row keeps its release
 * and its age and says nothing about the turbines.
 */
function speaksForNow(at: string, now: number): boolean {
  const ms = Date.parse(at);
  if (!Number.isFinite(ms)) return false;
  const hours = (now - ms) / 3_600_000;
  // An hour of clock skew ahead is current; further ahead is not a reading of now.
  return hours >= -1 && hours <= READING_LAGGING_AFTER_HOURS;
}

function flowFact(label: string, flow: LakeSystemFlow): string {
  return `${label} ${cfs(flow.cfs)}${cadenceNote(flow)}`;
}

/** The copy for one row, or null for a kind this build does not know. */
export function lakeSystemRowCopy(row: LakeSystemRow, now = Date.now()): LakeSystemRowCopy | null {
  switch (row.kind) {
    case 'inflow':
      return {
        title: 'Inflow',
        facts: [`${cfs(row.flow.cfs)}${cadenceNote(row.flow)} into the lake`],
        age: relativeAgeShort(row.flow.at, now),
        stale: isStale(row.flow.at, isDaily(row.flow), now),
      };
    case 'river': {
      const facts: string[] = [];
      if (row.condition) facts.push(row.condition.label);
      if (row.reading) facts.push(row.reading.unit === 'cfs' ? cfs(row.reading.value) : `${row.reading.value.toFixed(2)} ft`);
      return {
        title: row.name,
        facts,
        age: relativeAgeShort(row.reading?.at, now),
        stale: isStale(row.reading?.at, false, now),
      };
    }
    case 'dam': {
      const facts: string[] = [];
      // A downstream dam is there for its lake, so the lake's level leads.
      if (row.pool) facts.push(`Level ${row.pool.valueFt.toFixed(2)} ft`);
      if (row.release) facts.push(flowFact('Release', row.release));
      if (row.generation && speaksForNow(row.generation.at, now)) facts.push(row.generation.on ? 'Generating' : 'Not generating');
      const dated = row.release ?? row.pool;
      const daily = isDaily(row.release);
      return {
        title: row.stage === 'below' && row.lakeName ? row.lakeName : row.name,
        facts,
        age: relativeAgeShort(dated?.at, now),
        stale: isStale(dated?.at, daily, now),
      };
    }
    default:
      return null;
  }
}

/** The line under a row's title that says how it relates to the lake, when the title alone does not. */
export function lakeSystemRowRelation(row: LakeSystemRow): string | null {
  if (row.kind !== 'dam') return null;
  if (row.stage === 'coming_in') return row.via ? `Releases down the ${row.via}` : null;
  if (row.stage === 'below' && row.lakeName) return `Held by ${row.name}`;
  return null;
}

/**
 * The wind line: sustained speed, where it comes from, and the gust when the
 * source reports one. A measurement, never advice: Eddy has no basis to call
 * a wind safe for a boat it has not seen.
 */
export function lakeWindLine(weather: Pick<LakeWeather, 'windMph' | 'windFrom' | 'windGustMph'>): string {
  if (weather.windMph < 1) return 'Calm';
  const gust = weather.windGustMph !== undefined && weather.windGustMph > weather.windMph
    ? `, gusts ${Math.round(weather.windGustMph)}`
    : '';
  return `${Math.round(weather.windMph)} mph from the ${weather.windFrom}${gust}`;
}

/** Weather older than this is not "now" on a lake; the card says so instead of dropping the reading. */
export const LAKE_WEATHER_STALE_AFTER_HOURS = 2;

export function lakeWeatherIsStale(weather: Pick<LakeWeather, 'observedAt'>, now = Date.now()): boolean {
  if (!weather.observedAt) return false;
  const ms = Date.parse(weather.observedAt);
  return !Number.isFinite(ms) || now - ms > LAKE_WEATHER_STALE_AFTER_HOURS * 3_600_000;
}
