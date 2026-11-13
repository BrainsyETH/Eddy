import assert from 'node:assert/strict';
import test from 'node:test';

import { comparison, publicResults, type PublicResult, type StoredOutcome, type StoredPrediction } from './public-results';

const at = (day: number, hour: number, minute = 0) => new Date(Date.UTC(2026, 10, day, hour, minute)).toISOString();
let serial = 0;
const issued = (day: number, hour: number, estimateHours = 13): StoredPrediction => {
  const estimate = Date.UTC(2026, 10, day, hour, 30) + estimateHours * 3_600_000;
  return {
    id: `p${++serial}`,
    onset_hour: at(day, hour),
    decision: 'issued',
    reason: null,
    predicted_arrival_at: new Date(estimate).toISOString(),
    range_early_at: new Date(estimate - 90 * 60_000).toISOString(),
    range_late_at: new Date(estimate + 75 * 60_000).toISOString(),
    peak_cfs: 13_000,
  };
};
const withheld = (day: number, hour: number, reason: string): StoredPrediction => ({
  id: `p${++serial}`, onset_hour: at(day, hour), decision: 'withheld', reason,
  predicted_arrival_at: null, range_early_at: null, range_late_at: null, peak_cfs: 9_000,
});
const rose = (prediction: StoredPrediction, minutesFromEstimate: number): StoredOutcome => ({
  prediction_id: prediction.id,
  status: 'matched',
  matched_rise_at: new Date(Date.parse(prediction.predicted_arrival_at!) + minutesFromEstimate * 60_000).toISOString(),
});

test('an estimate is never published before the river has answered', () => {
  const travelling = issued(14, 20);
  const { results, tally } = publicResults([travelling], []);
  assert.deepEqual(results, [{ id: travelling.id, kind: 'waiting', releasedAt: at(14, 20, 30) }]);
  // Nothing in the published row can be turned back into the estimate.
  const text = JSON.stringify(results);
  for (const secret of [travelling.predicted_arrival_at!, travelling.range_early_at!, travelling.range_late_at!, '13000']) {
    assert.ok(!text.includes(secret), secret);
  }
  assert.equal(tally.waiting, 1);
  assert.equal(tally.compared, 0);
});

test('a matched outcome is published with its window, and placed against it', () => {
  const inside = issued(10, 20);
  const early = issued(11, 20);
  const late = issued(12, 20);
  const { results, tally } = publicResults(
    [inside, early, late],
    [rose(inside, 16), rose(early, -130), rose(late, 200)],
  );
  const compared = results.filter((r): r is Extract<PublicResult, { kind: 'compared' }> => r.kind === 'compared');
  assert.deepEqual(compared.map((r) => r.id), [late.id, early.id, inside.id], 'newest first');
  assert.deepEqual(compared.map((r) => comparison(r)), [
    { position: 'after', outsideMinutes: 125, fromEstimateMinutes: 200 },
    { position: 'before', outsideMinutes: 40, fromEstimateMinutes: -130 },
    { position: 'inside', outsideMinutes: 0, fromEstimateMinutes: 16 },
  ]);
  assert.equal(compared[2].releasedAt, at(10, 20, 30));
  assert.deepEqual([tally.compared, tally.insideWindow, tally.within2Hours], [3, 1, 1]);
});

test('the window edges count as inside', () => {
  const a = issued(10, 20);
  const b = issued(11, 20);
  const { results } = publicResults([a, b], [rose(a, -90), rose(b, 75)]);
  for (const r of results) assert.equal(r.kind === 'compared' && comparison(r).position, 'inside');
});

test('an outcome that could not be matched is reported without a window', () => {
  const twice = issued(10, 20);
  const none = issued(11, 20);
  const gap = issued(12, 20);
  const { results, tally } = publicResults([twice, none, gap], [
    { prediction_id: twice.id, status: 'ambiguous', matched_rise_at: null },
    { prediction_id: none.id, status: 'no rise found', matched_rise_at: null },
    { prediction_id: gap.id, status: 'gauge gap', matched_rise_at: null },
  ]);
  assert.deepEqual(results.map((r) => [r.kind, r.kind === 'not-compared' && r.why]), [
    ['not-compared', 'The gauge record had a gap'],
    ['not-compared', 'The gauge did not record a rise'],
    ['not-compared', 'More than one rise or release overlapped'],
  ]);
  assert.ok(!JSON.stringify(results).includes(twice.predicted_arrival_at!));
  assert.equal(tally.notCompared, 3);
});

test('withheld releases are counted by reason, and small increases are not releases', () => {
  const { results, tally } = publicResults(
    [
      withheld(10, 1, 'river high'),
      withheld(10, 5, 'river high'),
      withheld(11, 1, 'release already raised'),
      withheld(11, 5, 'tributaries moving'),
      withheld(11, 9, 'tributaries moved before issue'),
      withheld(12, 1, 'collection was down'),
      withheld(12, 5, 'release data arrived too late'),
      withheld(12, 9, 'increase under 2,000 cfs'),
      withheld(13, 1, 'a reason added later'),
    ],
    [],
  );
  assert.equal(results.length, 8, 'the increase under 2,000 cfs is left out');
  assert.ok(results.every((r) => r.kind === 'no-estimate'));
  assert.deepEqual(tally.noEstimate, [
    { why: 'The readings did not arrive in time', count: 3 },
    { why: 'Side streams were rising', count: 2 },
    { why: 'The river was already high', count: 2 },
    { why: 'The dam was already releasing', count: 1 },
  ]);
});
