import assert from 'node:assert/strict';
import test from 'node:test';
import { closingStreak, grade, offsetDay, pairedDays, seasonHistory, stations, summarize, type Archive } from './study';
import data from '@/data/condition-days/archive/07065495.json';
import stJoe from '@/data/condition-days/archive/07056000.json';
import observed from '@/data/condition-days/observations.json';

const station = stations.find(s => s.site === '07065495')!;
const thresholds = station.thresholds;
test('monthly counts conserve every measured daily flow including zero and leap days', () => {
  const result = summarize(data, thresholds, '2026-11-17');
  const valid = data.flat().filter(x => x != null).length;
  assert.equal(result.months.reduce((n, m) => n + m.total, 0), valid);
  for (const m of result.months) assert.equal(Object.values(m.levels).reduce((a, b) => a + b), m.total);
  assert.ok(Math.abs(Object.values(result.annual).reduce((a, b) => a + b) - 365) < 0.01);
  // Independently counted against the archived USGS means.
  assert.equal(result.months[5].total, 600);
  assert.equal(result.months[5].levels.good + result.months[5].levels.flowing, 457);
  assert.equal(result.years.filter(y => y.level === 'too_low').length, 8);
  assert.equal(grade(thresholds.levelOptimalMax, thresholds), 'flowing');
  assert.equal(grade(thresholds.levelDangerous, thresholds), 'dangerous');
  assert.equal(grade(0, thresholds), 'too_low');
  assert.equal(observed[station.site as keyof typeof observed].filter(v => v !== null).length, 295);
});
test('St. Joe seasonal counts include USGS days marked only as revised', () => {
  const buffalo = stations.find(s => s.site === '07056000')!;
  const { months, fullYears } = summarize(stJoe, buffalo.thresholds, '2026-11-17');
  assert.equal(fullYears, 20);
  assert.equal(months.reduce((total, month) => total + month.total, 0), 7233);
  for (const [month, floatDays, recorded] of [[4, 386, 600], [6, 446, 594], [8, 221, 616]]) {
    const { levels, total } = months[month - 1];
    assert.equal(levels.good + levels.flowing, floatDays);
    assert.equal(total, recorded);
  }
});
test('comparisons require the same measured date and enough observations in each seven-day window', () => {
  const a: Archive = [Array(365).fill(null), Array(365).fill(null)];
  const b: Archive = [Array(365).fill(null), Array(365).fill(null)];
  a[0].splice(0, 4, 20, 20, 40, 60);
  b[0].splice(0, 3, 125, null, 76);
  assert.deepEqual(pairedDays(a, b, thresholds, thresholds)[0], { low: 2, floatable: 1 });
  assert.equal(summarize(a, thresholds, '2026-01-04').years[0].cfs, 30);
  assert.equal(summarize(a, thresholds, '2026-01-05').years[0].cfs, null);
  assert.equal(summarize(a, thresholds, '2028-02-29').years[0].cfs, null);
  assert.equal(summarize(a, thresholds, '2026-01-04').fullYears, 0);
});
test('a missing day breaks a streak, including a missing final day', () => {
  const days = { '2026-11-12': 10, '2026-11-14': 20, '2026-11-15': 30 };
  assert.deepEqual(closingStreak(days, '2026-11-15', thresholds), { start: '2026-11-14', length: 2, level: 'too_low' });
  assert.equal(closingStreak(days, '2026-11-16', thresholds), null);
});

test('weekends belong to their Friday and require three consecutive observations', () => {
  const { weekends } = summarize(data, thresholds, '2026-11-17');
  assert.deepEqual(weekends[5], { starts: 67, held: 61, dipped: 0, rose: 6 });
  assert.deepEqual(weekends[8], { starts: 11, held: 5, dipped: 4, rose: 2 });
  const series: Archive = Array.from({length: 6}, (_, i) => Array(i === 2 ? 366 : 365).fill(null));
  // Dec 31, 2010 was Friday. Jan 1 dipped, then Jan 2 rose.
  series[4][364] = 130;
  series[5][0] = 90;
  series[5][1] = 1200;
  assert.deepEqual(summarize(series, thresholds, '2026-11-17').weekends[11], { starts: 1, held: 0, dipped: 1, rose: 0 });
  series[5][0] = null;
  assert.equal(summarize(series, thresholds, '2026-11-17').weekends[11].starts, 0);
});
test('season totals compare identical dates in one complete historical cohort', () => {
  const days: Record<string, number> = {};
  observed[station.site as keyof typeof observed].forEach((value, i) => {
    if (value != null) days[offsetDay('2026-01-01', i)] = value;
  });
  const season = seasonHistory(data, thresholds, { days, through: '2026-11-16', year: 2026 });
  assert.equal(season.years, 15);
  assert.equal(season.months.at(-1)?.total, 107);
  assert.equal(season.months.at(-1)?.typical, 134);
  assert.equal(season.months[4].typical, 83);
  assert.equal(season.months[7].lastFloat, '2026-08-11');
  assert.equal(season.months[8].lastFloat, null);
  const leap = seasonHistory([Array(365).fill(130), Array(365).fill(130), Array(366).fill(0)], thresholds,
    { days: { '2024-02-29': 130 }, through: '2024-02-29', year: 2024 });
  assert.equal(leap.years, 1);
  assert.equal(leap.months[0].recorded, 0);
  assert.equal(leap.months[1].typical, null);
  assert.equal(seasonHistory([], thresholds, { days: {}, through: '2025-12-31', year: 2026 }).months.length, 0);
});
