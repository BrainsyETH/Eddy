import assert from 'node:assert/strict';
import test from 'node:test';
import { buildGuidanceSummary, groupForecastByDay } from './river-outlook';

const stageThresholds = {
  levelTooLow: 1,
  levelLow: 2,
  levelOptimalMin: 3,
  levelOptimalMax: 5,
  levelHigh: 6,
  levelDangerous: 8,
  thresholdUnit: 'ft' as const,
};

test('groups official stages by Missouri day and keeps the daily maximum', () => {
  const result = groupForecastByDay([
    { dateTime: '2026-07-22T04:30:00Z', valueFt: 4.1 }, // Jul 21 in Missouri
    { dateTime: '2026-07-22T14:00:00Z', valueFt: 4.4 },
    { dateTime: '2026-07-22T22:00:00Z', valueFt: 5.2 },
  ], ['2026-07-21', '2026-07-22'], stageThresholds);

  assert.equal(result[0].valueFt, 4.1);
  assert.equal(result[1].valueFt, 5.2);
});

test('classifies official stage values with the canonical condition ladder', () => {
  const [result] = groupForecastByDay(
    [{ dateTime: '2026-07-22T18:00:00Z', valueFt: 4.5 }],
    ['2026-07-22'],
    stageThresholds,
  );
  assert.equal(result.conditionCode, 'flowing');
});

test('keeps an official stage but omits a condition without foot thresholds', () => {
  const [result] = groupForecastByDay(
    [{ dateTime: '2026-07-22T18:00:00Z', valueFt: 4.5 }],
    ['2026-07-22'],
    null,
  );
  assert.equal(result.valueFt, 4.5);
  assert.equal(result.conditionCode, null);
});

test('fallback guidance is qualified and never predicts a condition', () => {
  const dry = buildGuidanceSummary(null, [{ dayOfWeek: 'Thu', precipitation: 10 }]);
  const wet = buildGuidanceSummary(null, [{ dayOfWeek: 'Sat', precipitation: 80 }]);
  assert.match(dry, /recheck before launch/i);
  assert.match(wet, /Rain Sat could change levels/i);
  assert.doesNotMatch(`${dry} ${wet}`, /Ideal|Good|High|Flood/);
});
