import assert from 'node:assert/strict';
import test from 'node:test';
import { buildGuidanceSummary, buildRiverOutlookState, groupForecastByDay } from './river-outlook';

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

const baseOutlookInput = {
  weatherDays: [{
    date: '2026-07-22',
    dayOfWeek: 'Wed',
    tempHigh: 84,
    tempLow: 68,
    condition: 'Clear',
    conditionIcon: '01d',
    precipitation: 10,
  }],
  weatherPending: false,
  weatherError: false,
  riverStages: [],
  riverPending: false,
  trend: null,
  stageThresholds,
  now: new Date('2026-07-22T18:00:00Z'),
};

test('builds one official outlook state for the forecast and Eddy footer', () => {
  const result = buildRiverOutlookState({
    ...baseOutlookInput,
    riverStages: [{ dateTime: '2026-07-22T18:00:00Z', valueFt: 4.5 }],
  });
  assert.equal(result.sourceKind, 'official');
  assert.equal(result.sourceLabel, 'NWS 72-hour river forecast');
  assert.match(result.summary, /stays Ideal/i);
  assert.equal(result.days[0].river.conditionCode, 'flowing');
});

test('uses qualified guidance only after the official lookup finishes', () => {
  const checking = buildRiverOutlookState({ ...baseOutlookInput, riverPending: true });
  const guidance = buildRiverOutlookState(baseOutlookInput);
  assert.equal(checking.sourceKind, 'checking');
  assert.match(checking.summary, /Checking the official river forecast/i);
  assert.equal(guidance.sourceKind, 'guidance');
  assert.equal(guidance.isGuidance, true);
  assert.match(guidance.summary, /recheck before launch/i);
});

test('fails honestly when future weather and official stages are unavailable', () => {
  const result = buildRiverOutlookState({
    ...baseOutlookInput,
    weatherDays: [],
    weatherError: true,
  });
  assert.equal(result.futureUnavailable, true);
  assert.equal(result.isGuidance, false);
  assert.match(result.summary, /Future outlook unavailable/i);
  assert.doesNotMatch(result.summary, /steady|dry|hold/i);
});

test('does not treat an empty successful weather response as a dry forecast', () => {
  const result = buildRiverOutlookState({
    ...baseOutlookInput,
    weatherDays: [],
  });
  assert.equal(result.futureUnavailable, true);
  assert.match(result.summary, /Future outlook unavailable/i);
});
