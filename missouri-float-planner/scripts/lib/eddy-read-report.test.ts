import assert from 'node:assert/strict';
import test from 'node:test';
import { alreadyLogged, readReport, weekOf, type ScoredRead } from './eddy-read-report';
import { checkRead } from '../../src/lib/eddy/read-checks';

const read = (day: string, kind: 'river' | 'gauge', label: string, eddyRead: string, prompt: string | null = null): ScoredRead => ({
  day, kind, label, readLength: eddyRead.length,
  results: checkRead({ summary: 'Floats fine.', eddyRead, full: 'Floats fine today.' }, { prompt }),
});

test('a week is named for its Monday', () => {
  assert.equal(weekOf('2026-11-17'), '2026-11-16'); // a Tuesday
  assert.equal(weekOf('2026-11-16'), '2026-11-16');
  assert.equal(weekOf('2026-11-22'), '2026-11-16'); // the Sunday that ends it
  assert.equal(weekOf('2026-11-23'), '2026-11-23');
});

test('the report gives a pass rate per rule per day and a total', () => {
  const rows = [
    read('2026-11-16', 'river', 'current', 'A steady stretch.', 'Reading: 2.5 ft'),
    read('2026-11-17', 'river', 'current', 'At 46 cfs it is thin.', 'Reading: 46 cfs'),
    read('2026-11-17', 'river', 'huzzah', 'A small creek.', 'Reading: 80 cfs'),
  ];
  const report = readReport(rows, { by: 'day', examples: 1 });
  const line = (start: string) => report.split('\n').find((l) => l.trim().startsWith(start))!.trim().split(/\s{2,}/);

  // day, reads, sum<=120, read<=240, no-nums, no-fcst, no-wx, no-will, in-inputs, not-file, med.len
  assert.deepEqual(line('2026-11-16'), ['2026-11-16', '1', '100%', '100%', '100%', '100%', '100%', '100%', '100%', '100%', '17']);
  assert.deepEqual(line('2026-11-17'), ['2026-11-17', '2', '100%', '100%', '50%', '100%', '100%', '100%', '100%', '100%', '18']);
  assert.deepEqual(line('ALL').slice(0, 5), ['ALL', '3', '100%', '100%', '67%']);
  // The failing Read is quoted under its rule.
  assert.match(report, /no-nums: 2 of 3 passed\n\s+2026-11-17 current: 46 cfs/);
});

test('a rule that could not be checked shows "-", not 100%', () => {
  const report = readReport([read('2026-11-17', 'gauge', 'meramec @ 07019000', 'Wide water here.')], { by: 'day', examples: 0 });
  const row = report.split('\n').find((l) => l.trim().startsWith('2026-11-17'))!.trim().split(/\s{2,}/);
  assert.deepEqual(row.slice(8, 10), ['-', '-']);
  assert.match(report, /in-inputs: not checked \(inputs were not kept for these Reads\)/);
  assert.match(report, /RIVER READS[^\n]*\n {2}none in this window/);
});

test('by week folds days into the week that holds them', () => {
  const rows = [
    read('2026-11-10', 'gauge', 'a', 'One.'),
    read('2026-11-12', 'gauge', 'b', 'Two.'),
    read('2026-11-17', 'gauge', 'c', 'Three.'),
  ];
  const report = readReport(rows, { by: 'week', examples: 0 });
  const starts = report.split('\n').map((l) => l.trim().split(/\s{2,}/)).filter((c) => /^\d{4}-\d\d-\d\d$/.test(c[0])).map((c) => `${c[0]}:${c[1]}`);
  assert.deepEqual(starts, ['2026-11-09:2', '2026-11-16:1']);
});

test('a published gauge Read is matched to its log row by station and minute, not by day', () => {
  const logged = new Map([['07064533', [Date.parse('2026-11-18T17:02:10Z')]]]);
  // The same Read: logged, then published seconds later.
  assert.equal(alreadyLogged('07064533', '2026-11-18T17:02:40Z', logged), true);
  // Earlier the same day, before logging shipped: a different Read, and it counts.
  assert.equal(alreadyLogged('07064533', '2026-11-18T11:15:00Z', logged), false);
  // Another station at the same minute.
  assert.equal(alreadyLogged('07066510', '2026-11-18T17:02:40Z', logged), false);
});
