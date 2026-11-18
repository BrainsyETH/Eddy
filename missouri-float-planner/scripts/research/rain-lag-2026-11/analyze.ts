/**
 * Step 5 of the rain-to-river lag study. No network, no database.
 *
 * Applies the locked rules (lag.ts) to the committed hourly series and writes
 * each gauge's result. Running it again on the same data gives the same files;
 * results.test.ts holds it to that.
 *
 * node --import tsx scripts/research/rain-lag-2026-11/analyze.ts [--check]
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { calendar, REASONS, storms, verdict, windowHours, type Reason, type Storm, type Verdict } from './lag';
import { readTable } from './series';

interface Basin { site: string; name: string | null; squareMiles: number; studied: boolean }
export interface GaugeResult {
  site: string; name: string | null; squareMiles: number;
  result: 'range' | 'no_range'; reason: Reason | null;
  windowHours: number | null; hoursWithFlow: number | null; verdict: Verdict | null;
}
export interface Results {
  study: string; window: string; lockedOn: string;
  totals: { inScope: number; ranges: number; noRange: Partial<Record<Reason, number>> };
  gauges: GaugeResult[];
  notStudied: { site: string; reason: Reason }[];
}

const round = (value: number | null, places = 2) => value === null ? null : Math.round(value * 10 ** places) / 10 ** places;
export function analyze(folder: string): { results: Results; stormRows: string[] } {
  const protocol = JSON.parse(readFileSync(join(folder, 'protocol.json'), 'utf8'));
  const { basins } = JSON.parse(readFileSync(join(folder, 'data', 'basins.json'), 'utf8')) as { basins: Basin[] };
  const rain = readTable(join(folder, 'data', 'rain-hourly.csv.gz')), flow = readTable(join(folder, 'data', 'flow-hourly.csv.gz'));
  const origin = Date.parse(protocol.window.start), time = (hours: number | null) => hours === null ? '' : new Date(origin + hours * 3_600_000).toISOString().slice(0, 16) + 'Z';
  const years = calendar(protocol.window.start, protocol.window.study_years.map((year: { start: string }) => year.start));
  const dam = protocol.scope.dam_controlled.sites as Record<string, string>;
  const stormRows = ['site,rain_first_hour_utc,rain_last_hour_utc,inches,rain_start_utc,rain_centre_utc,set_aside,baseline_cfs,crest_cfs,crest_utc,rise_begins_utc,responded,time_to_rise_h,time_to_crest_h'];
  const gauges = basins.map((basin): GaugeResult => {
    const base = { site: basin.site, name: basin.name, squareMiles: basin.squareMiles };
    const none = (reason: Reason, hoursWithFlow: number | null = null): GaugeResult => ({ ...base, result: 'no_range', reason, windowHours: null, hoursWithFlow, verdict: null });
    if (basin.site in dam) return none('dam_controlled');
    const hoursWithFlow = flow.values[basin.site].filter(value => value !== null).length;
    if (!hoursWithFlow) return none('no_flow_record', 0);
    const found = storms(rain.values[basin.site], flow.values[basin.site], basin.squareMiles), outcome = verdict(found, years);
    for (const storm of found as Storm[]) stormRows.push([basin.site, time(storm.first), time(storm.last), round(storm.inches), time(storm.rainStart), time(storm.rainCentre),
      storm.setAside ?? '', round(storm.baseline, 1) ?? '', round(storm.crest, 1) ?? '', time(storm.crestAt), time(storm.riseAt), storm.responded ?? '',
      round(storm.timeToRise, 1) ?? '', round(storm.timeToCrest, 1) ?? ''].join(','));
    const tidy = (range: { p10: number; median: number; p90: number } | null) => range && { ...range, p10: round(range.p10, 1)!, median: round(range.median, 1)!, p90: round(range.p90, 1)! };
    return { ...base, result: outcome.released ? 'range' : 'no_range', reason: outcome.reason, windowHours: windowHours(basin.squareMiles), hoursWithFlow,
      verdict: { ...outcome, crest: outcome.crest && { ...tidy(outcome.crest)!, yearMedians: outcome.crest.yearMedians.map(value => round(value, 1)) },
        rise: outcome.rise && { ...tidy(outcome.rise)!, steady: outcome.rise.steady } } };
  });
  const noRange: Partial<Record<Reason, number>> = {};
  for (const reason of REASONS) { const count = gauges.filter(gauge => gauge.reason === reason).length; if (count) noRange[reason] = count; }
  return { stormRows, results: { study: protocol.study, window: `${protocol.window.start}/${protocol.window.end_exclusive}`, lockedOn: protocol.locked_on,
    totals: { inScope: gauges.length, ranges: gauges.filter(gauge => gauge.result === 'range').length, noRange }, gauges,
    notStudied: (protocol.scope.not_studied.sites as string[]).map(site => ({ site, reason: 'watershed_not_reviewed' as const })) } };
}

if (require.main === module) {
  const { results, stormRows } = analyze(__dirname);
  mkdirSync(join(__dirname, 'results'), { recursive: true });
  writeFileSync(join(__dirname, 'results', 'results.json'), `${JSON.stringify(results, null, 1)}\n`);
  writeFileSync(join(__dirname, 'results', 'storms.csv'), `${stormRows.join('\n')}\n`);
  console.log(JSON.stringify(results.totals));
}
