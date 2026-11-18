import assert from 'node:assert/strict';
import test from 'node:test';
import { buildEddyTakeSections, buildRiverOutlookState, getRainPresentation, groupForecastByDay } from './river-outlook';
import { measuredLag, RAIN_LAG_RELEASE, type MeasuredLag } from './rainfall/lag-release';
import { nwsRiverForecastUrl, weatherDestination } from '../../../eddy-ios/src/lib/weatherDestination';
import { weatherSymbol } from '../../../eddy-ios/src/theme/weather';

test('full weather uses the forecast location and rejects missing or invalid coordinates', () => {
  assert.deepEqual(weatherDestination({ lat: 37.42, lng: -91.26 }), {
    pathname: '/weather', params: { lat: '37.42', lng: '-91.26' },
  });
  for (const point of [undefined, null, { lat: 0, lng: 0 }, { lat: NaN, lng: -91 },
    { lat: 37, lng: Infinity }, { lat: 91, lng: 0 }, { lat: 37, lng: -181 }]) {
    assert.equal(weatherDestination(point), null);
  }
});

test('weather artwork distinguishes night, mixed skies, and precipitation', () => {
  assert.equal(weatherSymbol('01d').sun, true);
  assert.equal(weatherSymbol('01d').cloud, false);
  assert.equal(weatherSymbol('01n').sun, false);
  assert.equal(weatherSymbol('01n').moon, true);
  assert.equal(weatherSymbol('02d').cloud, true);
  assert.equal(weatherSymbol('10n').moon, true);
  assert.equal(weatherSymbol('10n').rain, true);
  assert.equal(weatherSymbol('11d').storm, true);
  assert.equal(weatherSymbol('13d').snow, true);
  assert.equal(weatherSymbol('50d').mist, true);
});

test('weather navigation keeps the selected NWS station separate from the weather point', () => {
  const point = { lat: 37.42, lng: -91.26 };
  const first = weatherDestination(point, '  VNBM7 ');
  const second = weatherDestination(point, 'AKRM7');
  assert.deepEqual(first, {
    pathname: '/weather', params: { lat: '37.42', lng: '-91.26', nwsLid: 'vnbm7' },
  });
  assert.equal(nwsRiverForecastUrl(first?.params.nwsLid), 'https://water.noaa.gov/gauges/vnbm7');
  assert.equal(nwsRiverForecastUrl(second?.params.nwsLid), 'https://water.noaa.gov/gauges/akrm7');
  assert.deepEqual(weatherDestination(point, null), weatherDestination(point));
});

test('river forecast links omit missing or malformed station IDs instead of guessing a gauge', () => {
  for (const lid of [undefined, null, '', '07067000', '../x', 'https://example.com', 'vnbm7?x', ['VNBM7']]) {
    assert.equal(nwsRiverForecastUrl(lid), null);
    if (typeof lid === 'string') {
      assert.deepEqual(weatherDestination({ lat: 37, lng: -91 }, lid), {
        pathname: '/weather', params: { lat: '37', lng: '-91' },
      });
    }
  }
});

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
    windSpeed: 5,
    humidity: 60,
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
  assert.equal(result.sourceLabel, 'NWS river forecast');
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
  // The Weather section describes the weather: the fixture's 84° high and its
  // dry forecast. With nothing expected to move the river it stops there. It
  // used to close on "read the gauge again the morning you go" every time,
  // which made the advice mean nothing on the days it mattered.
  assert.equal(sections.watchFor, 'Dry today, highs around 84°.');
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
  assert.equal(sections.watchFor, 'Dry today, highs around 84°.');
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
        windSpeed: 8,
        humidity: 85,
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

  // A tailwater follows the dam, not the sky: the same rain day must not say
  // rain upstream is what would change it.
  const tailwater = buildEddyTakeSections({ outlook, currentCondition: 'unknown', damControlled: true });
  assert.match(tailwater.watchFor, /rain is likely tomorrow/i, 'the rain itself is still reported');
  assert.doesNotMatch(tailwater.watchFor, /rain upstream/i);
  assert.match(tailwater.watchFor, /follows what the dam releases/i);
  assert.match(tailwater.watchFor, /posted schedule/i);
  assert.doesNotMatch(tailwater.watchFor, /will rise|will come up|expect the river/i);
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

// ── cold, wind, and saying nothing when nothing is expected ─────────
// Owner's wording and thresholds, 2026-11-18: a high under 50° is a cold day,
// a low at or under 32° a freezing morning, and a daily average of 15 mph is
// windy. The section had a heat rule and nothing for the other half of the
// year, though every day's low and wind were already handed to it.

const NOVEMBER = new Date('2026-11-18T18:00:00Z'); // a Wednesday
const novemberDay = (offset: number, over: Partial<(typeof baseOutlookInput.weatherDays)[number]> = {}) => {
  const date = new Date(Date.UTC(2026, 10, 18 + offset, 12));
  return {
    ...baseOutlookInput.weatherDays[0],
    date: date.toISOString().slice(0, 10),
    dayOfWeek: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][date.getUTCDay()],
    tempHigh: 56, tempLow: 40, precipitation: 0, windSpeed: 6,
    ...over,
  };
};
const watch = (
  weatherDays: ReturnType<typeof novemberDay>[],
  options: { trend?: Parameters<typeof buildRiverOutlookState>[0]['trend']; rainLag?: MeasuredLag | null; damControlled?: boolean } = {},
) =>
  buildEddyTakeSections({
    outlook: buildRiverOutlookState({ ...baseOutlookInput, now: NOVEMBER, weatherDays, trend: options.trend ?? null }),
    currentCondition: 'good',
    rainLag: options.rainLag,
    damControlled: options.damControlled,
  }).watchFor;

test('a dry, mild outlook is one sentence', () => {
  assert.equal(watch([novemberDay(0, { tempHigh: 52 }), novemberDay(1), novemberDay(2, { tempHigh: 58 })]), 'Dry through Friday, highs 52–58°.');
});

test('cold days get the advice, and own the temperatures', () => {
  const text = watch([novemberDay(0, { tempHigh: 45 }), novemberDay(1, { tempHigh: 43 }), novemberDay(2, { tempHigh: 55 })]);
  assert.equal(
    text,
    'Dry through Friday. Cold today and tomorrow, with highs only around 45°. Bring a change of clothes in a dry bag in case you get wet.',
  );
  // 49° is cold and 50° is not.
  assert.match(watch([novemberDay(0, { tempHigh: 49 })]), /^Dry today\. Cold today, with highs only around 49°\./);
  assert.doesNotMatch(watch([novemberDay(0, { tempHigh: 50 })]), /Cold/);
});

test('freezing mornings on a mild day say to wait, and leave the highs in the sky sentence', () => {
  const text = watch([novemberDay(0, { tempLow: 30 }), novemberDay(1, { tempLow: 31 }), novemberDay(2, { tempLow: 32 })]);
  assert.equal(text, 'Dry through Friday, highs around 56°. Mornings start near freezing through Friday, so give it time to warm up before you put in.');
  // 33° is not freezing.
  assert.doesNotMatch(watch([novemberDay(0, { tempLow: 33 })]), /freezing/);
});

test('cold days with freezing mornings are one line, not two', () => {
  const text = watch([novemberDay(0, { tempHigh: 41, tempLow: 28 }), novemberDay(1, { tempHigh: 47, tempLow: 30 }), novemberDay(2, { tempHigh: 44, tempLow: 35 })]);
  assert.equal(
    text,
    'Dry through Friday. Cold through Friday, with highs only around 47° and mornings near freezing. Bring a change of clothes in a dry bag in case you get wet.',
  );
  assert.doesNotMatch(text, /give it time to warm up/);
});

test('wind is named as a daily average, at two strengths', () => {
  assert.equal(
    watch([novemberDay(0), novemberDay(1, { windSpeed: 18.2 })]),
    'Dry through tomorrow, highs around 56°. Windy tomorrow, averaging around 18 mph. Paddling into it on the long pools is slow work.',
  );
  const strong = watch([novemberDay(0, { windSpeed: 16 }), novemberDay(1, { windSpeed: 27 })]);
  // The strongest tier present, and only its days.
  assert.match(strong, /Strong wind tomorrow, averaging around 27 mph\. Canoes get pushed around in that, so it may be a day to skip\./);
  assert.doesNotMatch(strong, /Windy/);
  // 14 mph is not windy, and a day the source gave no wind for is not either.
  assert.doesNotMatch(watch([novemberDay(0, { windSpeed: 14 })]), /wind/i);
  assert.doesNotMatch(watch([novemberDay(0, { windSpeed: null as unknown as number })]), /wind/i);
});

test('the gauge advice stays where there is a reason for it', () => {
  // Rain possible: still told when to look again, after the wind line.
  const rain = watch([novemberDay(0, { tempHigh: 61 }), novemberDay(1, { tempHigh: 66, precipitation: 45, windSpeed: 18 })]);
  assert.equal(
    rain,
    'Rain is possible tomorrow without being a sure thing, highs 61–66°. Windy tomorrow, averaging around 18 mph. Paddling into it on the long pools is slow work. ' +
      'Rain upstream is what would change this river, so look at the gauge again once it has moved through — and once more before you put in.',
  );
  // A rising gauge: likewise.
  const rising = watch([novemberDay(0)], { trend: { direction: 'rising', delta: 0.4, windowHours: 6, qualifier: null, label: 'Rising' } });
  assert.match(rising, /The gauge is already rising, which matters more here than anything in the sky\. Read it again right before you launch\./);
});

test('a gauge with a measured lag adds one sentence of record, and only when rain is in the outlook', () => {
  const wet = [novemberDay(0, { tempHigh: 61 }), novemberDay(1, { tempHigh: 66, precipitation: 80 })];
  const patterson = measuredLag('07037500')!;
  assert.equal(
    watch(wet, { rainLag: patterson }),
    'Rain is likely tomorrow, highs 61–66°. Rain upstream is what would change this river, so look at the gauge again once it has moved through — and once more before you put in. ' +
      "In 16 past storms that raised the St. Francis, flow near Patterson usually peaked 20–44 hours after half the storm's rain had fallen upstream.",
  );
  // The count of storms is always beside the range, and the clock is named for what the study measured from.
  for (const lag of Object.values(RAIN_LAG_RELEASE)) {
    const text = watch(wet, { rainLag: lag });
    assert.ok(text.includes(`In ${lag.storms} past storms that raised ${lag.river}, flow ${lag.place} usually peaked ${lag.crestHours[0]}–${lag.crestHours[1]} hours after half the storm's rain had fallen upstream.`));
    assert.doesNotMatch(text, /heaviest|keep checking|a day or two/);
  }
  // No rain in the outlook: nothing about timing, whatever the gauge has measured.
  assert.doesNotMatch(watch([novemberDay(0), novemberDay(1)], { rainLag: patterson }), /past storms|hours/);
  // A dam-controlled reach follows the release schedule, not the rain.
  assert.doesNotMatch(watch(wet, { rainLag: patterson, damControlled: true }), /past storms|hours after|Rain upstream/);
});

test('a rise the gauge is showing outranks rain that has not fallen', () => {
  const rising = { direction: 'rising', delta: 0.4, windowHours: 6, qualifier: null, label: 'Rising' } as const;
  const maybe = [novemberDay(0, { tempHigh: 61 }), novemberDay(1, { tempHigh: 66, precipitation: 20 })];
  const likely = [novemberDay(0, { tempHigh: 61 }), novemberDay(1, { tempHigh: 66, precipitation: 80 })];
  const says = /The gauge is already rising, which matters more here than anything in the sky\. Read it again right before you launch\./;
  // Below a dam, rising, with a chance of rain: this used to say "Rain upstream is what would change this river" and nothing about the rise.
  for (const days of [maybe, likely]) {
    for (const damControlled of [true, false]) {
      const text = watch(days, { trend: rising, damControlled, rainLag: measuredLag('07037500') });
      assert.match(text, says);
      assert.doesNotMatch(text, /Rain upstream is what would change|follows what the dam releases|past storms/);
      // The sky is still described; only the closing advice changes.
      assert.match(text, /^Rain is (possible|likely) tomorrow/);
    }
  }
  // Below a dam and not rising, rain or no rain, it is the release that matters.
  assert.match(watch(likely, { damControlled: true }), /follows what the dam releases more than the rain/);
});

test('a gauge with no measured lag never gets a time, in any outlook', () => {
  const wet = [novemberDay(0, { tempHigh: 61 }), novemberDay(1, { tempHigh: 66, precipitation: 80 })];
  for (const rainLag of [null, undefined, measuredLag('07066000'), measuredLag(null), measuredLag('no-such-gauge')]) {
    const text = watch(wet, { rainLag });
    assert.match(text, /look at the gauge again once it has moved through/);
    assert.doesNotMatch(text, /past storms|peaked|\d+ hours|\d+–\d+ hours/);
  }
  // The lookup answers only for the release list.
  assert.equal(measuredLag('07066000'), null);
  assert.deepEqual(measuredLag('07067000'), RAIN_LAG_RELEASE['07067000']);
  assert.equal(measuredLag('constructor'), null);
});
