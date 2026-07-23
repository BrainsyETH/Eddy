import assert from 'node:assert/strict';
import test from 'node:test';
import { buildDeterministicEddyReport, buildEddyTakeParts, buildEddyTakeSummary, buildGuidanceSummary, buildRiverOutlookState, groupForecastByDay } from './river-outlook';

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

test('Eddy leads with today and translates qualified weather guidance into an action', () => {
  const result = buildRiverOutlookState({
    ...baseOutlookInput,
    weatherDays: [
      ...baseOutlookInput.weatherDays,
      {
        date: '2026-07-23',
        dayOfWeek: 'Thu',
        tempHigh: 79,
        tempLow: 65,
        condition: 'Rain',
        conditionIcon: '10d',
        precipitation: 80,
      },
    ],
  });
  assert.equal(
    buildEddyTakeSummary(result, 'flowing'),
    'Ideal today. Rain Thu could move the river—check again before launch.',
  );
});

test('Eddy describes a steady official forecast without changing canonical labels', () => {
  const result = buildRiverOutlookState({
    ...baseOutlookInput,
    riverStages: [
      { dateTime: '2026-07-22T18:00:00Z', valueFt: 4.5 },
      { dateTime: '2026-07-23T18:00:00Z', valueFt: 4.7 },
    ],
  });
  assert.equal(
    buildEddyTakeSummary(result, 'flowing'),
    'Ideal today, and the NWS keeps it Ideal through Thu.',
  );
});

test('Eddy is explicit when the future outlook is unavailable', () => {
  const result = buildRiverOutlookState({
    ...baseOutlookInput,
    weatherDays: [],
    weatherError: true,
  });
  assert.equal(
    buildEddyTakeSummary(result, 'flowing'),
    'I can tell you it’s Ideal today, but not what comes next—check again before launch.',
  );
});

test('builds River, Weather, and Eddstimate from the shared selected-gauge outlook', () => {
  const outlook = buildRiverOutlookState({
    ...baseOutlookInput,
    trend: { direction: 'steady', delta: 0.01, windowHours: 6, qualifier: null, label: 'Holding steady' },
  });
  const parts = buildEddyTakeParts({
    outlook,
    currentCondition: 'flowing',
    gaugeHeightFt: 2.93,
    dischargeCfs: 1020,
    thresholdUnit: 'ft',
  });
  assert.equal(parts.river, 'Ideal at 2.93 ft. Holding steady over the last 6 hours.');
  assert.match(parts.weather, /84°\/68° today with clear/i);
  assert.match(parts.weather, /available forecast/i);
  assert.match(parts.eddstimate, /Ideal today/i);
  assert.match(buildDeterministicEddyReport(parts), /^River: .* Weather: .* Eddstimate:/);
});

test('three-part summary stays honest when readings and weather are unavailable', () => {
  const outlook = buildRiverOutlookState({
    ...baseOutlookInput,
    weatherDays: [],
    weatherError: true,
  });
  const parts = buildEddyTakeParts({
    outlook,
    currentCondition: 'unknown',
    gaugeHeightFt: null,
    dischargeCfs: null,
    thresholdUnit: 'ft',
  });
  assert.match(parts.river, /reading is unavailable/i);
  assert.match(parts.weather, /weather outlook is unavailable/i);
  assert.doesNotMatch(buildDeterministicEddyReport(parts), /holding|no rain/i);
});
