import assert from 'node:assert/strict';
import test from 'node:test';
import { fetchPrecipitationFromWeather, type ForecastData, type WeatherData } from './openweather';
import { buildPrompt, type GaugeContext } from '../eddy/build-update-prompt';
import { buildReportFacts } from '../eddy/report-facts';
import { getOutlookDates } from '../river-outlook';
import type { UpdateTarget } from '../../data/river-sections';

const target: UpdateTarget = {
  riverSlug: 'jacks-fork', riverName: 'Jacks Fork', sectionSlug: null,
  sectionName: null, sectionDescription: null, sectionRiverType: null,
  sectionLowWaterMeaning: null, sectionRisingWaterHazards: null,
};
const gauge: GaugeContext = {
  facts: buildReportFacts({
    gaugeName: 'Jacks Fork at Alley Spring', gaugeHeightFt: 2.41, dischargeCfs: 410,
    thresholds: { levelTooLow: null, levelLow: null, levelOptimalMin: null,
      levelOptimalMax: null, levelHigh: null, levelDangerous: null },
  }),
  readingTimestamp: null, notes: null,
};
const weather: WeatherData = {
  temp: 62, condition: 'Clear', conditionIcon: '01d', windSpeed: 4,
  windDirection: 180, humidity: 60, city: 'Eminence',
  rain1hInches: 0, rain3hInches: 0,
};
const forecast: ForecastData = {
  city: 'Eminence', days: [{
    date: getOutlookDates()[0], dayOfWeek: 'Wed', tempHigh: 62, tempLow: 41,
    condition: 'Rain', conditionIcon: '10d', precipitation: 80, windSpeed: 4, humidity: 60,
  }],
};

// Since 2026-11-18 the Read prompt carries no forecast: weather belongs in the
// app's Weather section. A forecast at or past the Watch for section's "likely"
// threshold reaches the prompt as words in an [OUTLOOK] block, and these tests
// keep what they always guarded: a forecast never turns into a measured amount.
test('an 80% rain forecast reaches the Read prompt as "likely", never as an amount', () => {
  const prompt = buildPrompt(target, gauge, weather, forecast, [], '', null,
    fetchPrecipitationFromWeather(weather));
  assert.match(prompt, /\[OUTLOOK\]\nRain is likely today\./);
  assert.doesNotMatch(prompt, /80%|chance of rain|Today's forecast rain:|0\.8 in|\[RECENT PRECIPITATION\]/);
  assert.deepEqual(fetchPrecipitationFromWeather(weather), { rain1h: 0, rain3h: 0 });
});

test('a weather outage cannot manufacture a zero or forecast rainfall amount', () => {
  const precipitation = fetchPrecipitationFromWeather(null);
  assert.equal(precipitation, null);
  const prompt = buildPrompt(target, gauge, null, forecast, [], '', null, precipitation);
  assert.match(prompt, /Rain is likely today\./);
  assert.doesNotMatch(prompt, /80%|Today's forecast rain:|\[RECENT PRECIPITATION\]/);
});

test('observed local amounts retain their windows alongside the outlook', () => {
  const observed = { ...weather, rain1hInches: 0.2, rain3hInches: 0.5 };
  const precipitation = fetchPrecipitationFromWeather(observed);
  assert.deepEqual(precipitation, { rain1h: 0.2, rain3h: 0.5 });
  const prompt = buildPrompt(target, gauge, observed, forecast, [], '', null, precipitation);
  assert.match(prompt, /Last 1h: 0\.20 in \| Last 3h: 0\.50 in/);
  assert.match(prompt, /Rain is likely today\./);
  assert.doesNotMatch(prompt, /80%|Today's forecast rain:/);
});


test('small measured amounts and traces never become zero in the Read prompt', () => {
  const observed = { ...weather, rain1hInches: 0.03, rain3hInches: 0.004 };
  const prompt = buildPrompt(target, gauge, observed, null, [], '', null,
    fetchPrecipitationFromWeather(observed));
  assert.match(prompt, /Last 1h: 0\.03 in \| Last 3h: <0\.01 in/);
  assert.doesNotMatch(prompt, /0\.0+ in/);
});

// ── zero is a measurement; missing is not ───────────────────────────

test('a measured zero says where and over what window it was measured', () => {
  const prompt = buildPrompt(target, gauge, weather, null, [], '', null,
    fetchPrecipitationFromWeather(weather));
  assert.match(prompt, /Recent rain: none reported at Eminence in the past 3 hours/);
  assert.match(prompt, /one weather point, not the watershed upstream/);
  assert.doesNotMatch(prompt, /no measurement is available/);
});

test('missing rain data is stated as missing, never as dry', () => {
  // Both this and a measured zero used to produce no block at all, so the
  // model could not tell "it has not rained" from "we do not know".
  const prompt = buildPrompt(target, gauge, null, null, [], '', null,
    fetchPrecipitationFromWeather(null));
  assert.match(prompt, /Recent rain: no measurement is available for this report/);
  assert.doesNotMatch(prompt, /none reported/);
});

test('a measured amount names its weather point', () => {
  const observed = { ...weather, rain1hInches: 0.2, rain3hInches: 0.5 };
  const prompt = buildPrompt(target, gauge, observed, null, [], '', null,
    fetchPrecipitationFromWeather(observed));
  assert.match(prompt, /\[RECENT PRECIPITATION\]\nLast 1h: 0\.20 in \| Last 3h: 0\.50 in\nMeasured at Eminence: one weather point/);
});
