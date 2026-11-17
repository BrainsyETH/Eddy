import assert from 'node:assert/strict';
import test from 'node:test';
import { closingStreak, grade, pairedDays, stations, summarize, type Archive } from './study';
import data from '@/data/condition-days/archive/07065495.json';
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
