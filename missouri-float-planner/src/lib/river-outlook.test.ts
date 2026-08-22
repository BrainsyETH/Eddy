import assert from 'node:assert/strict';
import test from 'node:test';
import { buildEddyTakeSections, buildRiverOutlookState, getRainPresentation, groupForecastByDay } from './river-outlook';

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

test('rain presentation separates no rain, noise, possible rain, and rain watch', () => {
  assert.deepEqual(getRainPresentation(0), { kind: 'none', label: 'No rain' });
  assert.deepEqual(getRainPresentation(5), { kind: 'unlikely', label: 'Rain 5%' });
  assert.deepEqual(getRainPresentation(35), { kind: 'possible', label: 'Rain 35%' });
  assert.deepEqual(getRainPresentation(70), { kind: 'significant', label: 'Rain 70%' });
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
  assert.equal(result.days[0].river.conditionCode, 'flowing');
});

test('uses qualified guidance only after the official lookup finishes', () => {
  const checking = buildRiverOutlookState({ ...baseOutlookInput, riverPending: true });
  const guidance = buildRiverOutlookState(baseOutlookInput);
  assert.equal(checking.sourceKind, 'checking');
  assert.equal(checking.sourceLabel, 'Checking river forecast');
  assert.equal(guidance.sourceKind, 'guidance');
  assert.equal(guidance.isGuidance, true);
  assert.equal(guidance.sourceLabel, 'Current river trend + weather outlook');
});

test('fails honestly when future weather and official stages are unavailable', () => {
  const result = buildRiverOutlookState({
    ...baseOutlookInput,
    weatherDays: [],
    weatherError: true,
  });
  assert.equal(result.futureUnavailable, true);
  assert.equal(result.isGuidance, false);
});

test('does not treat an empty successful weather response as a dry forecast', () => {
  const result = buildRiverOutlookState({
    ...baseOutlookInput,
    weatherDays: [],
  });
  assert.equal(result.futureUnavailable, true);
});

test('builds a decision-led Bottom line, Eddy read, and Watch from the selected-gauge outlook', () => {
  const outlook = buildRiverOutlookState({
    ...baseOutlookInput,
    trend: { direction: 'steady', delta: 0.01, windowHours: 6, qualifier: null, label: 'Holding steady' },
  });
  const sections = buildEddyTakeSections({
    outlook,
    currentCondition: 'flowing',
  });
  assert.equal(sections.bottomLine, 'Floatable today. Levels are about as good as this gauge gets.');
  assert.match(sections.eddyRead, /holding steady/i);
  assert.doesNotMatch(sections.eddyRead, /no official river forecast/i);
  // The Weather section describes the weather — the fixture's 84° high and its
  // dry forecast — and then closes on the gauge. It used to do only the last of
  // those, in a panel labelled WEATHER.
  assert.match(sections.watchFor, /dry/i);
  assert.match(sections.watchFor, /84°/);
  assert.match(sections.watchFor, /read the gauge again/i);
});

test('uses a valid generated Eddy read without changing live Bottom line or Watch guidance', () => {
  const outlook = buildRiverOutlookState(baseOutlookInput);
  const sections = buildEddyTakeSections({
    outlook,
    currentCondition: 'flowing',
    generatedEddyRead: 'Spring influence makes this reach less reactive than nearby rain-fed creeks.',
  });

  assert.equal(sections.bottomLine, 'Floatable today. Levels are about as good as this gauge gets.');
  assert.equal(sections.eddyRead, 'Spring influence makes this reach less reactive than nearby rain-fed creeks.');
  assert.match(sections.watchFor, /read the gauge again/i);
});

test('matches all requested weather dates before choosing the three-day outlook', () => {
  const previousDay = {
    ...baseOutlookInput.weatherDays[0],
    date: '2026-07-21',
    dayOfWeek: 'Tue',
  };
  const friday = {
    ...baseOutlookInput.weatherDays[0],
    date: '2026-07-23',
    dayOfWeek: 'Thu',
  };
  const saturday = {
    ...baseOutlookInput.weatherDays[0],
    date: '2026-07-24',
    dayOfWeek: 'Fri',
  };
  const outlook = buildRiverOutlookState({
    ...baseOutlookInput,
    weatherDays: [previousDay, ...baseOutlookInput.weatherDays, friday, saturday],
  });

  assert.deepEqual(outlook.days.map((day) => day.weather?.date), [
    '2026-07-22',
    '2026-07-23',
    '2026-07-24',
  ]);
});

test('three-part summary stays honest when readings and weather are unavailable', () => {
  const outlook = buildRiverOutlookState({
    ...baseOutlookInput,
    weatherDays: [],
    weatherError: true,
  });
  const sections = buildEddyTakeSections({
    outlook,
    currentCondition: 'unknown',
  });
  assert.match(sections.bottomLine, /not enough current river data/i);
  assert.match(sections.eddyRead, /condition is unavailable/i);
  assert.match(sections.watchFor, /nothing to look ahead at/i);
  // No sky described, because none came back. The composed Weather section must
  // never reach for a "dry" or a temperature it does not hold.
  assert.doesNotMatch(sections.watchFor, /dry|rain|hot|highs/i);
  assert.doesNotMatch(sections.eddyRead, /holding|no rain/i);
  assert.doesNotMatch(sections.bottomLine, /holding|no rain/i);
});

test('Watch for prioritizes forecast rain without inventing a river response', () => {
  const outlook = buildRiverOutlookState({
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
  const sections = buildEddyTakeSections({ outlook, currentCondition: 'good' });
  assert.match(sections.watchFor, /rain is likely tomorrow/i);
  assert.match(sections.watchFor, /look at the gauge again/i);
  // THE INVARIANT, and the reason the rain branch talks about when to look
  // rather than about the water: a precipitation percentage is not a promise
  // about a gauge, and this section may never turn one into the other.
  assert.doesNotMatch(sections.watchFor, /will rise|will come up|expect the river/i);
});

test('Weather names the days the way a person would, not the way the strip does', () => {
  // The strip above this is a table with seven characters of column; this is a
  // sentence. Nobody standing on a gravel bar on Wednesday says "Wed".
  const outlook = buildRiverOutlookState({
    ...baseOutlookInput,
    weatherDays: [
      { ...baseOutlookInput.weatherDays[0], precipitation: 80 },
      { ...baseOutlookInput.weatherDays[0], date: '2026-07-23', dayOfWeek: 'Thu', precipitation: 80 },
      { ...baseOutlookInput.weatherDays[0], date: '2026-07-24', dayOfWeek: 'Fri', precipitation: 80 },
    ],
  });
  const sections = buildEddyTakeSections({ outlook, currentCondition: 'good' });
  assert.match(sections.watchFor, /today, tomorrow and Friday/);
  assert.doesNotMatch(sections.watchFor, /\bWed\b|\bThu\b/);
});

test('Weather reports the heat, which is what actually ends a summer float', () => {
  // The old copy had no way to say this at all: six canned sentences, none of
  // which mentioned a temperature, on the one screen a Missouri paddler opens
  // in July.
  const outlook = buildRiverOutlookState({
    ...baseOutlookInput,
    weatherDays: [
      { ...baseOutlookInput.weatherDays[0], tempHigh: 97, precipitation: 0 },
      { ...baseOutlookInput.weatherDays[0], date: '2026-07-23', dayOfWeek: 'Thu', tempHigh: 99, precipitation: 0 },
    ],
  });
  const sections = buildEddyTakeSections({ outlook, currentCondition: 'good' });
  assert.match(sections.watchFor, /hot today and tomorrow/i);
  assert.match(sections.watchFor, /99°/);
  assert.match(sections.watchFor, /put in early/i);
  // The peak owns the numbers on a heat day; the sky sentence must not print a
  // second, overlapping range beside it.
  assert.doesNotMatch(sections.watchFor, /highs/i);
});

test('Weather still mentions rain that is possible without being likely', () => {
  // A 45% chance changes what you pack. The old ladder only counted 70%+ as a
  // signal, so this forecast came out as "no major change signal appears".
  const outlook = buildRiverOutlookState({
    ...baseOutlookInput,
    weatherDays: [
      { ...baseOutlookInput.weatherDays[0], precipitation: 10 },
      { ...baseOutlookInput.weatherDays[0], date: '2026-07-23', dayOfWeek: 'Thu', precipitation: 45 },
    ],
  });
  const sections = buildEddyTakeSections({ outlook, currentCondition: 'good' });
  assert.match(sections.watchFor, /rain is possible tomorrow/i);
  assert.doesNotMatch(sections.watchFor, /likely/i);
});

test('Watch for ignores condition jitter inside the floatable band', () => {
  // Day one's forecast value is that day's maximum stage, so it routinely
  // lands a band below the current reading. Only a safety-class change is
  // worth flagging.
  const outlook = buildRiverOutlookState({
    ...baseOutlookInput,
    riverStages: [
      { dateTime: '2026-07-22T18:00:00Z', valueFt: 2.5 }, // Good
      { dateTime: '2026-07-23T18:00:00Z', valueFt: 2.6 }, // Good
    ],
  });
  const sections = buildEddyTakeSections({ outlook, currentCondition: 'flowing' });
  assert.doesNotMatch(sections.watchFor, /when the NWS outlook reaches/i);
});

test('Watch for still flags a forecast crossing into a different safety class', () => {
  const outlook = buildRiverOutlookState({
    ...baseOutlookInput,
    riverStages: [
      { dateTime: '2026-07-22T18:00:00Z', valueFt: 4.5 }, // Flowing
      { dateTime: '2026-07-23T18:00:00Z', valueFt: 7.0 }, // High
    ],
  });
  const sections = buildEddyTakeSections({ outlook, currentCondition: 'flowing' });
  assert.match(sections.watchFor, /NWS has this gauge reaching High by tomorrow/i);
});

test('Eddy read interprets the present and never repeats the Watch for forecast', () => {
  const outlook = buildRiverOutlookState({
    ...baseOutlookInput,
    riverStages: [
      { dateTime: '2026-07-22T18:00:00Z', valueFt: 4.5 },
      { dateTime: '2026-07-23T18:00:00Z', valueFt: 7.0 },
    ],
    trend: { direction: 'rising', delta: 0.4, windowHours: 6, qualifier: null, label: 'Rising' },
  });
  const sections = buildEddyTakeSections({ outlook, currentCondition: 'flowing' });
  assert.match(sections.eddyRead, /rising over the last 6 hours/i);
  assert.doesNotMatch(sections.eddyRead, /NWS/i);
  assert.match(sections.watchFor, /NWS/i);
});

test('Bottom line states the call without restating the condition band', () => {
  const outlook = buildRiverOutlookState(baseOutlookInput);
  const high = buildEddyTakeSections({ outlook, currentCondition: 'high' });
  const flood = buildEddyTakeSections({ outlook, currentCondition: 'dangerous' });
  assert.match(high.bottomLine, /^Use caution today/);
  assert.match(flood.bottomLine, /^Stay off the river today/);
  assert.doesNotMatch(`${high.bottomLine} ${flood.bottomLine}`, /is in the .* range/i);
});
