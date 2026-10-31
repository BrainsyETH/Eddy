import assert from 'node:assert/strict';
import test from 'node:test';
import type { CompletedFloat, StartCondition } from '@shared/float-archive';
import {
  TIME_BREAKDOWN_TIP,
  UNTRACKED_NOTE_MS,
  timeBreakdownModel,
  arrivalLine,
  floatDate,
  floatShareLink,
  floatShareTitle,
  floatStretch,
  historyCardModel,
  moodLine,
  recapConditionModel,
  recapWeatherModel,
  recapExploredModel,
  recordedDuration,
  riverShortName,
} from '../../../eddy-ios/src/lib/floatHistoryDisplay';

const START = Date.parse('2026-10-26T15:00:00Z');
const NOW = Date.parse('2026-10-30T12:00:00Z');
const HOUR = 3_600_000;

test('recap weather is the saved start observation, independently of GPS and water', () => {
  const weather = { tempF: 71.6, precipIn1h: 0, observedAt: new Date(START - 10 * 60_000).toISOString(), conditionIcon: '02d' };
  const model = recapWeatherModel(trip({ startWeather: weather, firstMile: null, lastMile: null }));
  assert.equal(model?.temperature, '72°F');
  assert.equal(model?.description, 'Partly cloudy');
  assert.equal(model?.icon, '02d');
  assert.match(model!.tip, /Observed/);
  assert.equal(recapWeatherModel(trip()), null);
  assert.equal(recapWeatherModel(trip({ startWeather: { ...weather, observedAt: new Date(START - 3 * HOUR).toISOString() } })), null);
  assert.equal(recapWeatherModel(trip({ startWeather: { ...weather, observedAt: new Date(START + 2 * HOUR).toISOString() } })), null);
  for (const conditionIcon of [undefined, '', 'unknown']) {
    const older = recapWeatherModel(trip({ startWeather: { ...weather, conditionIcon } }));
    assert.equal(older?.temperature, '72°F');
    assert.equal(older?.description, null, 'missing sky data does not mean cloudy');
    assert.equal(older?.icon, null);
  }
  assert.equal(recapWeatherModel(trip({ startWeather: { ...weather, conditionIcon: '01n' } }))?.description, 'Clear');
});

function trip(overrides: Partial<CompletedFloat> = {}): CompletedFloat {
  return {
    version: 1, id: 'a', riverSlug: 'current', riverName: 'Current River',
    putInId: 'akers', putInName: 'Akers Ferry', takeOutId: 'pulltite', takeOutName: 'Pulltite', boatType: 'kayak',
    startedAt: START, endedAt: START + 4.2 * HOUR, elapsedMs: 4.2 * HOUR,
    movingMs: 2.6 * HOUR, stoppedMs: 1.4 * HOUR, unknownMs: 0.2 * HOUR,
    distanceMiles: 9.8, movingMph: 2.3, plannerMph: 2.3, firstMile: 52.1, lastMile: 61.9,
    reachedTakeOut: true, measurementVersion: 1,
    riverSpan: span, coveredMiles: [[52.1, 61.7]],
    ...overrides,
  };
}
const span = { firstMile: 0, lastMile: 134, firstName: 'Baptist Camp', lastName: 'Big Spring', calibration: 'deadbeef' };
const flowing: StartCondition = {
  code: 'flowing', gaugeName: 'Current River at Akers', usgsSiteId: '07064533', heightFt: 2.1,
  dischargeCfs: 412, observedAt: new Date(START - 6 * 60_000).toISOString(), accuracyWarning: false,
};
const untracked = { firstMile: null, lastMile: null, distanceMiles: 0, movingMs: 0, stoppedMs: 0, unknownMs: 4.2 * HOUR, movingMph: null };

test('card: river first, the stretch it took, recorded duration, a badge only for a current reading', () => {
  const card = historyCardModel(trip({ startCondition: flowing }), NOW);
  assert.equal(card.river, 'Current River');
  assert.equal(card.route, 'Akers Ferry → Pulltite');
  assert.equal(card.date, 'Oct 26');
  assert.equal(card.stats, '9.6 river mi · 4 hr 12 min', 'river explored, never distance paddled');
  assert.equal(card.trackingNote, null);
  assert.equal(card.badge?.text, 'Flowing · 412 cfs');
  assert.equal(card.moodLine, 'Made it!');
  assert.equal(
    card.accessibilityLabel,
    'Current River. Akers Ferry to Pulltite. October 26. 9.6 river miles, 4 hours 12 minutes. Flowing, 412 cfs. Made it.',
  );
  assert.equal(historyCardModel(trip({ startCondition: { ...flowing, observedAt: new Date(START - 8 * HOUR).toISOString() } }), NOW).badge, null);
  assert.equal(historyCardModel(trip(), Date.parse('2027-02-01T00:00:00Z')).date, 'Oct 26, 2026', 'another year says which');
});

test('card: never 0.0 mi; untracked and partly tracked say so', () => {
  const none = historyCardModel(trip({ ...untracked, coveredMiles: [], putInId: null, putInName: null, startCondition: { ...flowing, code: 'high' } }), NOW);
  assert.equal(none.stats, '4 hr 12 min');
  assert.equal(none.trackingNote, 'GPS tracking unavailable');
  assert.equal(none.mood, null, 'the standard otter, even at a current High');
  assert.equal(none.moodLine, null);
  assert.equal(none.route, 'To Pulltite');
  assert.equal(none.startedOnWater, false, 'no river position was confirmed');
  assert.match(none.accessibilityLabel, /^Current River\. To Pulltite\. October 26\. 4 hours 12 minutes\. GPS tracking unavailable\. High, 412 cfs\.$/);
  const partial = historyCardModel(trip({ movingMs: HOUR, stoppedMs: 0.2 * HOUR, unknownMs: 3 * HOUR }), NOW);
  assert.equal(partial.trackingNote, 'Limited GPS tracking');
  assert.equal(partial.stats, '9.6 river mi · 4 hr 12 min');
  const onWater = historyCardModel(trip({ putInId: null, putInName: null }), NOW);
  assert.equal(onWater.route, 'To Pulltite');
  assert.equal(onWater.startedOnWater, true);
});

test('the stretch: river explored first; an older float keeps its tracked distance, named as such', () => {
  assert.deepEqual(floatStretch(trip()), { value: '9.6', unit: 'river mi', label: 'River explored', spoken: '9.6 river miles' });
  const older = floatStretch(trip({ riverSpan: undefined, coveredMiles: undefined }));
  assert.deepEqual(older, { value: '9.8', unit: 'mi', label: 'Tracked distance', spoken: '9.8 miles tracked' });
  assert.equal(historyCardModel(trip({ riverSpan: undefined, coveredMiles: undefined }), NOW).stats, '9.8 mi · 4 hr 12 min');
  assert.equal(floatStretch(trip({ coveredMiles: null }))?.label, 'Tracked distance', 'too many intervals to keep');
  assert.equal(floatStretch(trip({ riverSpan: undefined }))?.label, 'Tracked distance', 'intervals with no span to place them');
  assert.equal(floatStretch(trip({ coveredMiles: [], distanceMiles: 0 })), null, 'placed, but no river credited');
  assert.equal(historyCardModel(trip({ coveredMiles: [], distanceMiles: 0 }), NOW).stats, '4 hr 12 min', 'never 0.0 mi');
  assert.equal(floatStretch(trip(untracked)), null);
  assert.equal(floatStretch(trip({ coveredMiles: [[52.1, 52.14]] }))?.value, 'Under 0.1');
});

test('durations are the recorded time, never a band', () => {
  assert.equal(recordedDuration(30_000), '<1 min');
  assert.equal(recordedDuration(6 * 60_000), '6 min');
  assert.equal(recordedDuration(2 * HOUR), '2 hr');
  const dip = historyCardModel(trip({ elapsedMs: 6 * 60_000, endedAt: START + 6 * 60_000, movingMs: 6 * 60_000, stoppedMs: 0, unknownMs: 0, distanceMiles: 0.1, coveredMiles: [[52.1, 52.2]] }), NOW);
  assert.equal(dip.moodLine, 'Quick dip');
  assert.equal(dip.stats, '0.1 river mi · 6 min');
});

test('Flood states the condition plainly', () => {
  const flood = trip({ startCondition: { ...flowing, code: 'dangerous' } });
  assert.equal(moodLine('big-water', flood), 'Flood stage');
  assert.equal(moodLine('big-water', trip({ startCondition: { ...flowing, code: 'high' } })), 'Big water');
  assert.equal(historyCardModel(flood, NOW).moodLine, 'Flood stage');
});

test('recap conditions: one reading, its gauge and age; the station id in the tip', () => {
  const current = recapConditionModel(trip({ startCondition: flowing }));
  assert.equal(current?.title, 'Conditions at start');
  assert.equal(current?.badge?.label, 'Flowing');
  assert.equal(current?.reading, '412 cfs · 2.10 ft');
  assert.equal(current?.gaugeName, 'Current River at Akers');
  assert.equal(current?.age, 'Reading 6 min before you started');
  assert.match(current!.tip, /^USGS 07064533\. The gauge that set/);
  const stale = recapConditionModel(trip({ startCondition: { ...flowing, observedAt: new Date(START - 7 * HOUR).toISOString() } }));
  assert.equal(stale?.badge, null);
  assert.equal(stale?.age, 'Reading 7 hr before you started, too old to rate');
  const unrated = recapConditionModel(trip({
    water: { gaugeName: 'Akers', gaugeStationId: 'x', observedAt: new Date(START + 10 * 60_000).toISOString(), heightFt: 2, dischargeCfs: 400 },
  }));
  assert.equal(unrated?.title, 'Water at the start');
  assert.equal(unrated?.badge, null);
  assert.equal(unrated?.age, 'Reading 10 min after you started');
  assert.equal(recapConditionModel(trip()), null);
});

test('recap river explored: miles first, access names, a lifetime line only with earlier floats', () => {
  const today = trip({ riverSpan: span, coveredMiles: [[52.1, 61.9]] });
  const alone = recapExploredModel(today, [today]);
  assert.equal(alone?.miles, '9.8 river miles explored');
  assert.equal(alone?.share, '7% of the Current’s float miles');
  assert.equal(alone?.range, 'mi 52.1–61.9');
  assert.equal(alone?.earlier, null);
  assert.equal(alone?.lifetime, null);
  const before = trip({ id: 'b', startedAt: START - 400 * HOUR, endedAt: START - 396 * HOUR, riverSpan: span, coveredMiles: [[61.9, 71.3]] });
  const elsewhere = trip({ id: 'c', riverSlug: 'jacks-fork', riverSpan: span, coveredMiles: [[0, 50]] });
  const both = recapExploredModel(today, [today, before, elsewhere]);
  assert.equal(both?.earlier?.miles.toFixed(1), '9.4');
  assert.equal(both?.lifetime, '19.2 of the Current’s 134 float miles explored');
  assert.equal(recapExploredModel(trip({ riverSpan: undefined, coveredMiles: undefined }), []), null, 'older floats show nothing, not a guess');
});

test('arrival is what was confirmed, and short names read naturally', () => {
  assert.equal(arrivalLine(trip()), 'Reached Pulltite');
  assert.equal(arrivalLine(trip({ reachedTakeOut: false })), 'Arrival at Pulltite not confirmed');
  assert.equal(riverShortName('Current River'), 'the Current');
  assert.equal(riverShortName('Jacks Fork'), 'Jacks Fork');
});

test('the share sheet names the float, and links only to a river web page', () => {
  assert.equal(floatShareTitle(trip()), 'Current River: Akers Ferry → Pulltite');
  assert.equal(floatShareTitle(trip({ putInId: null, putInName: null })), 'Current River: To Pulltite');
  assert.equal(floatShareLink('/rivers/missouri/current'), '/rivers/missouri/current');
  for (const bad of [null, '', '/river/current', 'https://evil.example/rivers/missouri/current', '/rivers/missouri/current?x=1', '//evil.example']) {
    assert.equal(floatShareLink(bad), null, String(bad));
  }
});

test('an old recap shades only the floats before it, and counts as of that day', () => {
  const first = trip({ id: 'first', startedAt: START - 400 * HOUR, endedAt: START - 396 * HOUR, riverSpan: span, coveredMiles: [[10, 20]] });
  const middle = trip({ id: 'middle', riverSpan: span, coveredMiles: [[52.1, 61.9]] });
  const later = trip({ id: 'later', startedAt: START + 400 * HOUR, endedAt: START + 404 * HOUR, riverSpan: span, coveredMiles: [[90, 100]] });
  const model = recapExploredModel(middle, [first, middle, later]);
  assert.equal(model?.earlier?.miles, 10, 'only the float before it');
  assert.equal(model?.lifetime, '19.8 of the Current’s 134 float miles explored', 'as of this float, not today');
  const oldest = recapExploredModel(first, [first, middle, later]);
  assert.equal(oldest?.earlier, null, 'nothing came before the first float');
  assert.equal(oldest?.lifetime, null);
});

test('the card and the recap date a float the same way', () => {
  assert.equal(floatDate(START, NOW), 'Oct 26');
  assert.equal(floatDate(START, Date.parse('2027-03-01T00:00:00Z')), 'Oct 26, 2026');
  assert.equal(historyCardModel(trip(), NOW).date, floatDate(START, NOW));
});

test('a condition from a station USGS does not run keeps its badge, with no USGS line', () => {
  const usace = { ...flowing, gaugeName: 'Black River below Clearwater Dam', usgsSiteId: null };
  const model = recapConditionModel(trip({ startCondition: usace }));
  assert.equal(model?.badge?.label, 'Flowing');
  assert.equal(model?.gaugeName, 'Black River below Clearwater Dam');
  assert.ok(!model!.tip.includes('USGS'), 'no "USGS null"');
  assert.equal(historyCardModel(trip({ startCondition: usace }), NOW).badge?.text, 'Flowing · 412 cfs');
});

test('earlier floats are shaded on this strip at their own miles, and only from the same mile system', () => {
  const strip = { firstMile: 20, lastMile: 80, firstName: 'Upper', lastName: 'Lower', calibration: 'cafef00d' };
  const now = trip({ riverSpan: strip, coveredMiles: [[25, 30]] });
  // Same mile system: placed at its own miles on this strip, clamped to it.
  const before = trip({
    id: 'before', startedAt: START - 400 * HOUR, endedAt: START - 396 * HOUR,
    riverSpan: strip, coveredMiles: [[40, 60], [78, 90]],
  });
  const model = recapExploredModel(now, [before, now]);
  const shading = model!.earlier!.segments;
  assert.equal(shading.length, 2);
  // Miles 40–60 on a 20–80 strip: 20/60 to 40/60, not 40% to 60%.
  assert.ok(Math.abs(shading[0].start - 20 / 60) < 1e-9 && Math.abs(shading[0].end - 40 / 60) < 1e-9, JSON.stringify(shading));
  assert.equal(shading[1].end, 1, 'river beyond the strip is clamped to it');
  assert.equal(model?.lifetime, '27.0 of the Current’s 60 float miles explored');
  const outside = trip({
    id: 'outside', startedAt: START - 800 * HOUR, endedAt: START - 796 * HOUR,
    riverSpan: strip, coveredMiles: [[85, 95]],
  });
  assert.equal(recapExploredModel(now, [outside, now])?.earlier, null, 'river wholly beyond this strip is not shaded');
  assert.equal(recapExploredModel(now, [outside, now])?.lifetime, null);
  // Access-point miles were recalibrated between the floats: the earlier
  // float's 40–60 names a different stretch now, so it is neither shaded
  // nor summed. No figure beats a wrong one.
  const recalibrated = trip({
    id: 'recalibrated', startedAt: START - 400 * HOUR, endedAt: START - 396 * HOUR,
    riverSpan: { firstMile: 0, lastMile: 100, firstName: 'Top', lastName: 'Bottom', calibration: 'deadbeef' }, coveredMiles: [[40, 60]],
  });
  assert.equal(recapExploredModel(now, [recalibrated, now])?.earlier, null);
  assert.equal(recapExploredModel(now, [recalibrated, now])?.lifetime, null);
});

test('time breakdown: Moving and Breaks over tracked time, untracked time named only when it matters', () => {
  const model = timeBreakdownModel(trip({ movingMs: 2.6 * HOUR, stoppedMs: 1.4 * HOUR, unknownMs: 13 * 60_000, elapsedMs: 4 * HOUR + 13 * 60_000 }));
  assert.deepEqual(model.parts.map((part) => [part.label, part.text]), [['Moving', '2 hr 36 min'], ['Breaks', '1 hr 24 min']]);
  assert.equal(model.speed, '2.3 mph');
  assert.equal(model.untracked, 'Eddy couldn’t see you for 13 min, so that time isn’t counted here.');
  assert.equal(model.accessibilityLabel, 'Moving: 2 hr 36 min, Breaks: 1 hr 24 min');
  assert.ok(!JSON.stringify(model).includes('GPS gaps'), 'no third category on the paddler’s day');

  assert.equal(timeBreakdownModel(trip({ unknownMs: UNTRACKED_NOTE_MS - 1 })).untracked, null, 'ordinary start-up and wind-down go unmentioned');
  assert.ok(timeBreakdownModel(trip({ unknownMs: UNTRACKED_NOTE_MS })).untracked);
  const none = timeBreakdownModel(trip({ ...untracked, movingMph: null }));
  assert.deepEqual(none.parts, [], 'nothing tracked, no bar');
  assert.equal(none.speed, '—');
});

test('the time tip says what each figure means, briefly', () => {
  assert.ok(TIME_BREAKDOWN_TIP.length < 280, `${TIME_BREAKDOWN_TIP.length} characters`);
  for (const term of ['Moving:', 'Breaks:', 'Moving speed:', '6 minutes']) assert.ok(TIME_BREAKDOWN_TIP.includes(term), term);
  assert.ok(!/GPS gap|journal|classif|confirmed river positions/.test(TIME_BREAKDOWN_TIP), 'no mechanics');
});
