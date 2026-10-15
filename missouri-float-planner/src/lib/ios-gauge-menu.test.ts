import test from 'node:test';
import assert from 'node:assert/strict';
import { gaugeMenuSubtitle, gaugeMenuOptions, riverOverviewCondition } from '../../../eddy-ios/src/lib/gaugeMenu';
import { gaugesForRiver, gaugeConditionCode } from '../../../eddy-ios/src/lib/gaugeCondition';
import { favoriteGaugeReadings } from '../../../eddy-ios/src/lib/favoriteGaugeReadings';
import type { MapGauge } from '@eddy/types';
const now = Date.parse('2026-10-08T02:00:00Z');
const option = { id: 'pruitt', name: 'Pruitt', reading: '312 cfs', code: 'good' as const, timestamp: '2026-10-08T01:00:00Z' };
test('menu distinguishes current, stale, suspect, missing and future observations', () => {
  assert.match(gaugeMenuSubtitle(option, now), /312 cfs.*Good/i);
  assert.match(gaugeMenuSubtitle({ ...option, timestamp: '2026-10-07T18:00:00Z' }, now), /Reporting delayed/);
  assert.match(gaugeMenuSubtitle({ ...option, timestamp: '2026-10-06T01:00:00Z' }, now), /Historical reading/);
  assert.match(gaugeMenuSubtitle({ ...option, suspect: true }, now), /Check reading/);
  assert.match(gaugeMenuSubtitle({ ...option, timestamp: null }, now), /time unavailable/);
  assert.match(gaugeMenuSubtitle({ ...option, timestamp: '2026-10-09T00:00:00Z' }, now), /time unavailable/);
  assert.equal(gaugeMenuSubtitle({ ...option, reading: null }, now), 'Reading unavailable');
  assert.equal(gaugeMenuSubtitle({ ...option, isPrimary: true }, now), '312 cfs · Good · Rates river');
});
function gauge(id: string, mile: number | null, primary = false, riverSlug = 'buffalo') {
  return { id, name: `Buffalo River at ${id}, AR`, dischargeCfs: 300, gaugeHeightFt: 3,
    thresholds: [{ riverSlug, riverMile: mile, isPrimary: primary, thresholdUnit: 'cfs',
      levelTooLow: 100, levelLow: 200, levelOptimalMin: null, levelOptimalMax: 1000, levelHigh: 1000, levelDangerous: 2000 }] } as MapGauge;
}
test('menu count and upstream order use only this river, with a stable old-payload fallback', () => {
  const rows = [gauge('St. Joe',72.6,true),gauge('Pruitt',29.9),gauge('Ponca',6),gauge('Other',0,false,'current')];
  const options = gaugeMenuOptions(rows,'buffalo');
  assert.equal(options.length,3);
  assert.deepEqual(options.map(o => o.id),['Ponca','Pruitt','St. Joe']);
  assert.equal(options[0].reading,'300 cfs');
  assert.equal(options[0].code,'good');
  assert.deepEqual(options.map(o => o.isPrimary),[false,false,true]);
  assert.deepEqual(gaugesForRiver([gauge('Pruitt',null),gauge('St. Joe',null,true)],'buffalo').map(g => g.id),['St. Joe','Pruitt']);
});

test('default river verdict survives an unloaded catalog; alternates require fresh trusted readings', () => {
  const selected = { siteId: 'ponca', code: 'good' as const, timestamp: option.timestamp };
  assert.equal(riverOverviewCondition('flowing', 'ponca', { ...selected, timestamp: null }, now), 'flowing');
  assert.equal(riverOverviewCondition('flowing', undefined, null, now), 'flowing');
  assert.equal(riverOverviewCondition('flowing', 'st-joe', selected, now), 'good');
  assert.equal(riverOverviewCondition('flowing', 'st-joe', { ...selected, suspect: true }, now), 'unknown');
  assert.equal(riverOverviewCondition('flowing', 'st-joe', { ...selected, timestamp: null }, now), 'unknown');
});

test('suspect selections are ungraded; provider-native IDs work and missing IDs are disabled', () => {
  const station = { ...gauge('dam', 0), usgsSiteId: 'swl-clearwater-dam', provider: 'usace', readingSuspect: true };
  assert.equal(gaugeConditionCode(station, 'buffalo'), 'unknown');
  const [available] = gaugeMenuOptions([station], 'buffalo');
  assert.equal(available.disabled, false);
  const [unavailable] = gaugeMenuOptions([{ ...station, usgsSiteId: null }], 'buffalo');
  assert.equal(unavailable.disabled, true);
  assert.equal(gaugeMenuSubtitle(unavailable, now), 'Station link unavailable');
});

test('favorite river readings include every linked station upstream first, with no other river mixed in', () => {
  const input = [gauge('St. Joe', 72.6, true), gauge('Pruitt', 29.9), gauge('Ponca', 6), gauge('Other', 0, false, 'current')];
  const readings = favoriteGaugeReadings(input, 'buffalo');
  assert.deepEqual(readings.map(row => row.gauge.id), ['Ponca', 'Pruitt', 'St. Joe']);
  assert.equal(readings[0].place, 'Ponca, AR');
  assert.deepEqual(input.map(row => row.id), ['St. Joe', 'Pruitt', 'Ponca', 'Other']);
  assert.deepEqual(favoriteGaugeReadings(input, 'unlinked'), []);
  assert.deepEqual(favoriteGaugeReadings([], 'buffalo'), []);
});

test('favorite pills prefer CFS, fall back to feet, and keep zero as a valid reading', () => {
  const station = gauge('Ponca', 6);
  station.thresholds![0].thresholdUnit = 'ft';
  station.readingAgeHours = 0.25;
  assert.equal(favoriteGaugeReadings([station], 'buffalo')[0].reading, '300 cfs');
  assert.equal(favoriteGaugeReadings([{ ...station, dischargeCfs: 0 }], 'buffalo')[0].reading, '0 cfs');
  for (const dischargeCfs of [null, NaN, Infinity]) {
    const [row] = favoriteGaugeReadings([{ ...station, dischargeCfs }], 'buffalo');
    assert.equal(row.reading, '3.00 ft');
    assert.equal(row.hasReading, true);
    assert.equal(row.notice, '');
  }
  assert.equal(favoriteGaugeReadings([{ ...station, dischargeCfs: null, gaugeHeightFt: 0 }], 'buffalo')[0].reading, '0.00 ft');
  for (const gaugeHeightFt of [null, NaN, Infinity]) {
    const [row] = favoriteGaugeReadings([{ ...station, dischargeCfs: null, gaugeHeightFt }], 'buffalo');
    assert.equal(row.reading, 'Reading unavailable');
    assert.equal(row.hasReading, false);
    assert.equal(row.code, 'unknown');
    assert.equal(row.notice, '');
  }
});

test('favorite pill colours use each station and the selected river rating, independently of the display unit', () => {
  const low = { ...gauge('Ponca', 6), dischargeCfs: 150, readingAgeHours: 0.25 };
  const good = { ...gauge('Pruitt', 29.9), readingAgeHours: 0.25 };
  const high = { ...gauge('St. Joe', 72.6), dischargeCfs: 1500, readingAgeHours: 0.25 };
  assert.deepEqual(favoriteGaugeReadings([high, low, good], 'buffalo').map(row => row.code), ['low', 'good', 'high']);

  const shared = { ...good, thresholds: [
    { ...good.thresholds![0], riverSlug: 'other', isPrimary: true, levelDangerous: 250 },
    { ...good.thresholds![0], thresholdUnit: 'ft' as const, levelTooLow: 1, levelLow: 2, levelOptimalMax: 5, levelHigh: 5, levelDangerous: 8 },
  ] };
  const [row] = favoriteGaugeReadings([shared], 'buffalo');
  assert.equal(row.reading, '300 cfs');
  assert.equal(row.code, 'good');
  assert.match(row.accessibilityLabel, /300 cfs, Good/);
  assert.equal(favoriteGaugeReadings([shared], 'other')[0].code, 'dangerous');
  assert.equal(favoriteGaugeReadings([{ ...shared, dischargeCfs: null }], 'buffalo')[0].code, 'good');
});

test('feet fallback never grades feet against CFS thresholds; unrated and invalid data stays neutral', () => {
  const station = { ...gauge('Ponca', 6), readingAgeHours: 0.25 };
  for (const dischargeCfs of [null, NaN, Infinity]) {
    const [row] = favoriteGaugeReadings([{ ...station, dischargeCfs, gaugeHeightFt: 300 }], 'buffalo');
    assert.equal(row.reading, '300.00 ft');
    assert.equal(row.code, 'unknown');
  }
  const [unrated] = favoriteGaugeReadings([{ ...station, thresholds: [{ ...station.thresholds![0],
    levelTooLow: null, levelLow: null, levelOptimalMin: null, levelOptimalMax: null, levelHigh: null, levelDangerous: null,
  }] }], 'buffalo');
  assert.equal(unrated.reading, '300 cfs');
  assert.equal(unrated.code, 'unknown');
  // An official flood-stage override still applies when discharge is absent.
  const [flood] = favoriteGaugeReadings([{ ...station, dischargeCfs: null, gaugeHeightFt: 10,
    thresholds: [{ ...station.thresholds![0], floodStageFt: 8 }],
  }], 'buffalo');
  assert.equal(flood.code, 'dangerous');
});

test('favorite readings keep old, suspect, and unknown-time observations visibly qualified', () => {
  const station = { ...gauge('Ponca', 6), readingAgeHours: 0.25 };
  assert.equal(favoriteGaugeReadings([station], 'buffalo')[0].notice, '');
  assert.match(favoriteGaugeReadings([station], 'buffalo')[0].accessibilityLabel, /Updated in the last hour/);
  const [old] = favoriteGaugeReadings([{ ...station, readingAgeHours: 9, readingSuspect: true, qualifierNote: 'Ice affected' }], 'buffalo');
  assert.match(old.notice, /Check reading.*Updated 9 hours ago/);
  assert.match(old.accessibilityLabel, /Ice affected/);
  assert.equal(old.code, 'unknown');
  assert.match(favoriteGaugeReadings([{ ...station, readingAgeHours: null }], 'buffalo')[0].notice, /Reading time unavailable/);
  for (const readingAgeHours of [null, 9, -1, NaN, Infinity]) {
    assert.equal(favoriteGaugeReadings([{ ...station, readingAgeHours }], 'buffalo')[0].code, 'unknown');
  }
  const [suspect] = favoriteGaugeReadings([{ ...station, dischargeCfs: null, readingSuspect: true }], 'buffalo');
  assert.equal(suspect.reading, '3.00 ft');
  assert.equal(suspect.notice, 'Check reading');
  assert.equal(suspect.code, 'unknown');
});
