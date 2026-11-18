import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { calendar, percentile, REASONS, RULES, spells, storms, verdict, windowHours, type Storm } from './lag';

const HOURS = 600;
/** A dry record at a steady 100 cfs. */
const quiet = () => ({ rain: Array<number | null>(HOURS).fill(0), flow: Array<number | null>(HOURS).fill(100) });
/** Rain from `at` for `hours`, and a hydrograph that starts rising `rise` hours later and crests `crest` hours later. */
function storm(record: ReturnType<typeof quiet>, at: number, hours: number, inches: number, rise: number, crest: number, peak = 400) {
  for (let hour = at; hour < at + hours; hour++) record.rain[hour] = inches / hours;
  for (let hour = at + rise; hour < at + crest + 60; hour++) {
    const up = (hour - (at + rise)) / (crest - rise), down = 1 - (hour - (at + crest)) / 60;
    record.flow[hour] = 100 + (peak - 100) * Math.max(0, hour <= at + crest ? up : down);
  }
  return record;
}

test('the protocol and the code state the same numbers', () => {
  const protocol = JSON.parse(readFileSync(join(__dirname, 'protocol.json'), 'utf8'));
  assert.equal(protocol.locked_before_any_analysis_of_real_data, true);
  assert.deepEqual(Object.keys(protocol.reasons_for_no_range), [...REASONS]);
  assert.deepEqual(protocol.response.window_hours_after_rain_centre.map((row: { watershed_sq_mi_up_to: number | null; hours: number }) =>
    [row.watershed_sq_mi_up_to ?? Infinity, row.hours]), RULES.windows.map(row => [row.upTo, row.hours]));
  const text = JSON.stringify(protocol);
  for (const phrase of ['0.01 in or more in the hour', 'shorter than 12 hours', 'total of 0.50 in or more', 'no more than 36 hours',
    '0.25 in or more over the watershed in the 48 hours before', 'Median hourly flow in the 6 hours before', 'At least 4 of the 6',
    'more than 10% of the hours', 'at least 25% of baseline and at least 5 cfs', 'baseline plus 10%', 'last 6 hours of the window',
    'At least 8 counted storms', 'At least 3 of them in each study year', 'at least 2 seasons', 'more than 75%',
    'at least 4 counted storms of 1.00 in or more, and at least half', 'no more than 3 times the 10th', 'no more than 6 hours apart',
    'within 3 hours of each other', 'no more than 1.5 times']) assert.ok(text.includes(phrase), phrase);
});

test('spells join wet hours across gaps shorter than twelve hours', () => {
  const rain = Array<number | null>(60).fill(0);
  rain[5] = 0.2; rain[16] = 0.2; rain[29] = 0.2; rain[30] = null;
  // 5 to 16 is ten dry hours (joined); 16 to 29 is twelve (a new spell).
  assert.deepEqual(spells(rain), [{ first: 5, last: 16 }, { first: 29, last: 29 }]);
});

test('window length follows watershed size', () => {
  assert.deepEqual([57, 500, 501, 2000, 2001].map(windowHours), [72, 72, 120, 120, 168]);
});

test('a clean storm is timed from the rain to the rise and the crest', () => {
  const record = storm(quiet(), 100, 4, 1.2, 6, 20), [found] = storms(record.rain, record.flow, 300);
  assert.equal(found.setAside, null);
  assert.equal(found.responded, true);
  assert.equal(found.baseline, 100);
  // Even rain over four hours: 10% has fallen at 100.4 and half at 102.
  assert.ok(Math.abs(found.rainStart! - 100.4) < 1e-9 && Math.abs(found.rainCentre! - 102) < 1e-9);
  assert.equal(found.crestAt, 120.5);
  assert.equal(found.timeToCrest, 18.5);
  // The rise passes 10% of the way up in hour 108 (two hours into a 14-hour climb).
  assert.equal(found.riseAt, 108.5);
  assert.ok(Math.abs(found.timeToRise! - 8.1) < 1e-9);
});

test('a storm the river ignores is counted as no response', () => {
  const record = quiet();
  for (let hour = 100; hour < 104; hour++) record.rain[hour] = 0.2;
  for (let hour = 110; hour < 130; hour++) record.flow[hour] = 120;
  const [found] = storms(record.rain, record.flow, 300);
  assert.deepEqual([found.setAside, found.responded, found.timeToCrest], [null, false, null]);
});

test('each set-aside reason is reached', () => {
  const reason = (change: (record: ReturnType<typeof quiet>) => void, squareMiles = 300) => {
    const record = storm(quiet(), 100, 4, 1.2, 6, 20);
    change(record);
    return storms(record.rain, record.flow, squareMiles).find(found => found.first <= 103 && found.last >= 100)!.setAside;
  };
  assert.equal(reason(record => { for (let hour = 104; hour < 140; hour++) record.rain[hour] = 0.02; }), 'long_rain');
  assert.equal(reason(record => { record.rain[102] = null; }), 'rain_record_incomplete');
  assert.equal(reason(record => { record.rain[70] = null; }), 'rain_record_incomplete');
  assert.equal(reason(record => { record.rain[60] = 0.3; }), 'wet_before');
  assert.equal(reason(record => { for (let hour = 94; hour < 97; hour++) record.flow[hour] = null; }), 'flow_record_incomplete');
  assert.equal(reason(record => { for (let hour = 130; hour < 145; hour++) record.flow[hour] = null; }), 'flow_record_incomplete');
  assert.equal(reason(record => { record.rain[118] = 0.3; }), 'rain_again_before_crest');
  assert.equal(reason(record => { record.rain[117] = null; }), 'rain_record_incomplete');
  // Still climbing at the end of the 72-hour window.
  assert.equal(reason(record => { for (let hour = 106; hour < 300; hour++) record.flow[hour] = 100 + (hour - 105) * 5; }), 'no_crest_in_window');
  // The river was already higher than it would climb to: nothing to time from this rain.
  const early = quiet();
  for (let hour = 100; hour < 104; hour++) early.rain[hour] = 0.3;
  early.flow[100] = 400;
  assert.equal(storms(early.rain, early.flow, 300)[0].setAside, 'rising_before_rain');
  const edge = storm(quiet(), 20, 4, 1.2, 6, 20);
  assert.equal(storms(edge.rain, edge.flow, 300)[0].setAside, 'outside_window');
  const late = storm(quiet(), HOURS - 60, 4, 1.2, 6, 20);
  assert.equal(storms(late.rain, late.flow.slice(0, HOURS), 300)[0].setAside, 'outside_window');
});

test('percentiles interpolate between ordered values', () => {
  assert.equal(percentile([10, 20, 30, 40, 50], 0.1), 14);
  assert.equal(percentile([10, 20, 30, 40, 50], 0.9), 46);
  assert.equal(percentile([7], 0.9), 7);
});

const cal = calendar('2024-11-01T00:00:00Z', ['2024-11-01T00:00:00Z', '2025-11-01T00:00:00Z']);
const DAY = 24, at = (iso: string) => (Date.parse(iso) - Date.parse('2024-11-01T00:00:00Z')) / 3_600_000;
const hit = (iso: string, crest: number, inches = 1.2, rise = 4): Storm => ({ first: at(iso), last: at(iso) + 3, inches, rainStart: at(iso), rainCentre: at(iso) + 2,
  setAside: null, baseline: 100, crest: 400, crestAt: at(iso) + 2 + crest, riseAt: at(iso) + rise, responded: true, timeToRise: rise, timeToCrest: crest });
const miss = (iso: string, inches = 1.2): Storm => ({ ...hit(iso, 0, inches), responded: false, crestAt: null, riseAt: null, timeToRise: null, timeToCrest: null });
const good = () => [
  hit('2024-12-10T00:00:00Z', 14), hit('2025-03-10T00:00:00Z', 16), hit('2025-04-10T00:00:00Z', 18), hit('2025-05-10T00:00:00Z', 15),
  hit('2025-12-10T00:00:00Z', 17), hit('2026-03-10T00:00:00Z', 13), hit('2026-04-10T00:00:00Z', 19), hit('2026-09-10T00:00:00Z', 16),
];

test('the calendar places hours in study years and months', () => {
  assert.deepEqual([cal.year(0), cal.year(365 * DAY - 1), cal.year(365 * DAY), cal.month(0), cal.month(31 * DAY)], [0, 0, 1, 11, 12]);
});

test('a gauge that passes every rule is released with ranges rounded outward', () => {
  const result = verdict(good(), cal);
  assert.equal(result.released, true);
  assert.equal(result.reason, null);
  assert.deepEqual(result.perYear, [4, 4]);
  assert.deepEqual(result.publish, { crestHours: [13, 19], riseHours: [4, 4], storms: 8 });
});

test('each rule can fail, and the first failing reason in protocol order is the one given', () => {
  const reason = (list: Storm[]) => { const result = verdict(list, cal); assert.equal(result.released, false); assert.equal(result.publish, null); return [result.reason, result.failed]; };
  assert.equal(reason(good().slice(0, 7))[0], 'too_few_storms');
  assert.deepEqual(reason([...good().slice(0, 4), hit('2025-06-10T00:00:00Z', 15), hit('2025-07-10T00:00:00Z', 15), hit('2025-09-10T00:00:00Z', 15),
    hit('2025-10-10T00:00:00Z', 15), hit('2025-12-10T00:00:00Z', 15), hit('2026-03-10T00:00:00Z', 15)]), ['uneven_years', ['uneven_years']]);
  assert.equal(reason(['03-02', '03-12', '03-22', '04-02', '04-12', '04-22', '05-02'].flatMap((day, i) => i < 4
    ? [hit(`2025-${day}T00:00:00Z`, 15), hit(`2026-${day}T00:00:00Z`, 15)] : [hit(`2025-${day}T00:00:00Z`, 15)]).concat(hit('2026-09-10T00:00:00Z', 15)))[0], 'one_season');
  assert.equal(reason([...good(), ...['01', '02', '06', '07', '08', '09', '10', '11', '12'].map(month => miss(`2025-${month}-20T00:00:00Z`))])[0], 'seldom_responds');
  assert.equal(reason(good().map(storm => ({ ...storm, inches: 0.6 })))[0], 'seldom_responds');
  assert.equal(reason(good().map((storm, i) => i % 2 ? { ...storm, timeToCrest: 40 } : { ...storm, timeToCrest: 8 }))[0], 'too_variable');
  assert.deepEqual(reason(good().map((storm, i) => ({ ...storm, timeToCrest: i < 4 ? 10 : 16 })))[1], ['years_disagree']);
  assert.deepEqual(verdict([], cal).failed, ['too_few_storms', 'uneven_years', 'one_season', 'seldom_responds', 'too_variable', 'years_disagree']);
});

test('storms set aside are counted by reason and kept out of every rule', () => {
  const result = verdict([...good(), { ...hit('2025-06-10T00:00:00Z', 90), setAside: 'rain_again_before_crest' }, { ...miss('2025-07-10T00:00:00Z'), setAside: 'wet_before' }], cal);
  assert.equal(result.released, true);
  assert.deepEqual(result.setAside, { rain_again_before_crest: 1, wet_before: 1 });
  assert.equal(result.counted, 8);
});

test('the rise range is published only when it is steady on its own', () => {
  const result = verdict(good().map((storm, i) => ({ ...storm, timeToRise: i % 2 ? 20 : 2 })), cal);
  assert.equal(result.released, true);
  assert.equal(result.publish!.riseHours, null);
});
