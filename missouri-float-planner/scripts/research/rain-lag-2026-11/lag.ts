/**
 * Rain-to-river lag: the rules in protocol.json, as code.
 *
 * Pure. Hours are indexes into two equal-length hourly series that start at
 * the study window's first hour: rain[i] is the watershed's inches during hour
 * i and flow[i] is the mean discharge in the same hour. null is "no value".
 * Times are in hours from the start of the window, so the middle of hour i is
 * i + 0.5.
 */
export const RULES = {
  wetHour: 0.01, dryGapHours: 12, stormInches: 0.5, maxSpellHours: 36,
  priorHours: 48, priorInches: 0.25, laterInches: 0.25,
  baselineHours: 6, baselineMinHours: 4, maxMissingFlow: 0.1,
  responseFraction: 0.25, responseCfs: 5, riseFraction: 0.1, crestEdgeHours: 6,
  windows: [{ upTo: 500, hours: 72 }, { upTo: 2000, hours: 120 }, { upTo: Infinity, hours: 168 }],
  minStorms: 8, minPerYear: 3, minSeasons: 2, maxSeasonShare: 0.75,
  bigStormInches: 1, minBigStorms: 4, minBigResponseRate: 0.5,
  steadyRatio: 3, steadyHours: 6, yearsHours: 3, yearsRatio: 1.5,
} as const;

export const REASONS = ['watershed_not_reviewed', 'dam_controlled', 'no_flow_record', 'too_few_storms', 'uneven_years',
  'one_season', 'seldom_responds', 'too_variable', 'years_disagree'] as const;
export type Reason = typeof REASONS[number];

export type SetAside = 'long_rain' | 'rain_record_incomplete' | 'wet_before' | 'outside_window'
  | 'flow_record_incomplete' | 'no_crest_in_window' | 'rain_again_before_crest' | 'rising_before_rain';

export interface Storm {
  /** First and last wet hour of the spell. */
  first: number; last: number; inches: number;
  /** Moments 10% and 50% of the rain had fallen. null when the spell holds an hour with no amount. */
  rainStart: number | null; rainCentre: number | null;
  setAside: SetAside | null;
  baseline: number | null; crest: number | null; crestAt: number | null; riseAt: number | null;
  responded: boolean | null; timeToRise: number | null; timeToCrest: number | null;
}

export function windowHours(squareMiles: number): number {
  return RULES.windows.find(window => squareMiles <= window.upTo)!.hours;
}

/** Spells of rain: wet hours joined across dry gaps shorter than twelve hours. An hour with no amount is not wet. */
export function spells(rain: readonly (number | null)[]): { first: number; last: number }[] {
  const found: { first: number; last: number }[] = [];
  let first = -1, last = -1;
  for (let hour = 0; hour < rain.length; hour++) {
    if ((rain[hour] ?? 0) < RULES.wetHour) continue;
    if (first >= 0 && hour - last > RULES.dryGapHours) { found.push({ first, last }); first = -1; }
    if (first < 0) first = hour;
    last = hour;
  }
  if (first >= 0) found.push({ first, last });
  return found;
}

/** The moment a share of the spell's rain had fallen, placed inside its hour in proportion. */
function moment(rain: readonly (number | null)[], first: number, last: number, total: number, share: number): number {
  let fallen = 0;
  for (let hour = first; hour <= last; hour++) {
    const amount = rain[hour] ?? 0;
    if (amount > 0 && fallen + amount >= share * total) return hour + (share * total - fallen) / amount;
    fallen += amount;
  }
  return last + 1;
}

const sum = (values: readonly (number | null)[], from: number, to: number) => {
  let total = 0;
  for (let hour = from; hour < to; hour++) total += values[hour] ?? 0;
  return total;
};
const anyMissing = (values: readonly (number | null)[], from: number, to: number) => {
  for (let hour = from; hour < to; hour++) if (values[hour] == null) return true;
  return false;
};
export function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b), middle = sorted.length >> 1;
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}
/** Linear interpolation between ordered values ("type 7"). */
export function percentile(values: readonly number[], share: number): number {
  const sorted = [...values].sort((a, b) => a - b), at = (sorted.length - 1) * share, below = Math.floor(at);
  return sorted[below] + (sorted[Math.min(below + 1, sorted.length - 1)] - sorted[below]) * (at - below);
}

/** Every spell of half an inch or more, measured or set aside with one reason. */
export function storms(rain: readonly (number | null)[], flow: readonly (number | null)[], squareMiles: number): Storm[] {
  if (rain.length !== flow.length) throw new Error('Rain and flow must cover the same hours');
  const window = windowHours(squareMiles), found: Storm[] = [];
  for (const { first, last } of spells(rain)) {
    const inches = sum(rain, first, last + 1);
    if (inches < RULES.stormInches) continue;
    const storm: Storm = { first, last, inches, rainStart: null, rainCentre: null, setAside: null, baseline: null, crest: null,
      crestAt: null, riseAt: null, responded: null, timeToRise: null, timeToCrest: null };
    found.push(storm);
    const aside = (reason: SetAside) => { storm.setAside = reason; };
    if (anyMissing(rain, first, last + 1)) { aside('rain_record_incomplete'); continue; }
    storm.rainStart = moment(rain, first, last, inches, 0.1);
    storm.rainCentre = moment(rain, first, last, inches, 0.5);
    if (last - first + 1 > RULES.maxSpellHours) { aside('long_rain'); continue; }
    // The search runs from the first wet hour to the end of the window after the rain centre.
    const end = Math.floor(storm.rainCentre) + window;
    if (first - RULES.priorHours < 0 || end >= rain.length) { aside('outside_window'); continue; }
    if (anyMissing(rain, first - RULES.priorHours, first)) { aside('rain_record_incomplete'); continue; }
    if (sum(rain, first - RULES.priorHours, first) >= RULES.priorInches) { aside('wet_before'); continue; }
    const before = flow.slice(first - RULES.baselineHours, first).filter((value): value is number => value != null);
    if (before.length < RULES.baselineMinHours) { aside('flow_record_incomplete'); continue; }
    let missing = 0, crest = -Infinity, crestHour = -1;
    for (let hour = first; hour <= end; hour++) {
      const value = flow[hour];
      if (value == null) missing++;
      else if (value > crest) { crest = value; crestHour = hour; }
    }
    if (crestHour < 0 || missing / (end - first + 1) > RULES.maxMissingFlow) { aside('flow_record_incomplete'); continue; }
    const baseline = storm.baseline = median(before), rise = crest - baseline;
    storm.crest = crest; storm.crestAt = crestHour + 0.5;
    storm.responded = rise >= RULES.responseFraction * baseline && rise >= RULES.responseCfs;
    if (!storm.responded) continue;
    if (anyMissing(rain, last + 1, crestHour + 1)) { aside('rain_record_incomplete'); continue; }
    if (crestHour > end - RULES.crestEdgeHours) { aside('no_crest_in_window'); continue; }
    if (sum(rain, last + 1, crestHour + 1) >= RULES.laterInches) { aside('rain_again_before_crest'); continue; }
    let riseHour = crestHour;
    for (let hour = first; hour <= crestHour; hour++) {
      const value = flow[hour];
      if (value != null && value >= baseline + RULES.riseFraction * rise) { riseHour = hour; break; }
    }
    storm.riseAt = riseHour + 0.5;
    if (storm.riseAt < storm.rainStart || storm.crestAt <= storm.rainCentre) { aside('rising_before_rain'); continue; }
    storm.timeToRise = storm.riseAt - storm.rainStart;
    storm.timeToCrest = storm.crestAt - storm.rainCentre;
  }
  return found;
}

export interface Calendar {
  /** For an hour index: which study year it falls in (0-based) and its month (1 to 12). */
  year(hour: number): number; month(hour: number): number; years: number;
}
const SEASON = ['winter', 'winter', 'spring', 'spring', 'spring', 'summer', 'summer', 'summer', 'fall', 'fall', 'fall', 'winter'] as const;

export interface Verdict {
  released: boolean;
  /** The first failing rule in protocol order, and every failing rule. */
  reason: Reason | null; failed: Reason[];
  counted: number; responded: number; perYear: number[]; perSeason: Record<string, number>;
  bigStorms: number; bigResponded: number;
  setAside: Partial<Record<SetAside, number>>;
  crest: { p10: number; median: number; p90: number; yearMedians: (number | null)[] } | null;
  rise: { p10: number; median: number; p90: number; steady: boolean } | null;
  /** Whole hours, rounded outward. Present only when released. */
  publish: { crestHours: [number, number]; riseHours: [number, number] | null; storms: number } | null;
}

const steady = (low: number, high: number) => high <= RULES.steadyRatio * low || high - low <= RULES.steadyHours;

/** The release rule: all tests, in the protocol's order. */
export function verdict(all: readonly Storm[], calendar: Calendar): Verdict {
  const counted = all.filter(storm => storm.setAside === null), hits = counted.filter(storm => storm.responded);
  const setAside: Verdict['setAside'] = {};
  for (const storm of all) if (storm.setAside) setAside[storm.setAside] = (setAside[storm.setAside] ?? 0) + 1;
  const perYear = Array.from({ length: calendar.years }, () => 0), perSeason: Record<string, number> = {};
  for (const storm of hits) {
    const hour = Math.floor(storm.rainCentre!);
    perYear[calendar.year(hour)]++;
    const season = SEASON[calendar.month(hour) - 1];
    perSeason[season] = (perSeason[season] ?? 0) + 1;
  }
  const big = counted.filter(storm => storm.inches >= RULES.bigStormInches), bigResponded = big.filter(storm => storm.responded).length;
  const crests = hits.map(storm => storm.timeToCrest!), rises = hits.map(storm => storm.timeToRise!);
  const yearMedians = perYear.map((count, year) => count
    ? median(hits.filter(storm => calendar.year(Math.floor(storm.rainCentre!)) === year).map(storm => storm.timeToCrest!)) : null);
  const crest = crests.length ? { p10: percentile(crests, 0.1), median: median(crests), p90: percentile(crests, 0.9), yearMedians } : null;
  const rise = rises.length ? { p10: percentile(rises, 0.1), median: median(rises), p90: percentile(rises, 0.9), steady: false } : null;
  if (rise) rise.steady = steady(rise.p10, rise.p90);
  const failed: Reason[] = [];
  if (hits.length < RULES.minStorms) failed.push('too_few_storms');
  if (perYear.some(count => count < RULES.minPerYear)) failed.push('uneven_years');
  const seasons = Object.values(perSeason);
  if (seasons.length < RULES.minSeasons || seasons.some(count => count / hits.length > RULES.maxSeasonShare)) failed.push('one_season');
  if (big.length < RULES.minBigStorms || bigResponded / big.length < RULES.minBigResponseRate) failed.push('seldom_responds');
  if (!crest || !steady(crest.p10, crest.p90)) failed.push('too_variable');
  const medians = yearMedians.filter((value): value is number => value !== null);
  if (medians.length < calendar.years || !(Math.max(...medians) - Math.min(...medians) <= RULES.yearsHours
    || Math.max(...medians) <= RULES.yearsRatio * Math.min(...medians))) failed.push('years_disagree');
  const released = failed.length === 0;
  return { released, reason: failed[0] ?? null, failed, counted: counted.length, responded: hits.length, perYear, perSeason,
    bigStorms: big.length, bigResponded, setAside, crest, rise,
    publish: released && crest && rise ? { crestHours: [Math.floor(crest.p10), Math.ceil(crest.p90)],
      riseHours: rise.steady ? [Math.floor(rise.p10), Math.ceil(rise.p90)] : null, storms: hits.length } : null };
}

/** Hour indexes for a study window made of whole study years. */
export function calendar(start: string, yearStarts: readonly string[]): Calendar {
  const origin = Date.parse(start), starts = yearStarts.map(value => (Date.parse(value) - origin) / 3_600_000);
  return {
    years: starts.length,
    year: hour => { let year = 0; for (let i = 0; i < starts.length; i++) if (hour >= starts[i]) year = i; return year; },
    month: hour => new Date(origin + hour * 3_600_000).getUTCMonth() + 1,
  };
}
