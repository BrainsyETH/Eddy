import test from 'node:test';
import assert from 'node:assert/strict';
import { gaugeMenuSubtitle, gaugeMenuOptions, riverOverviewCondition } from '../../../eddy-ios/src/lib/gaugeMenu';
import { gaugesForRiver, gaugeConditionCode } from '../../../eddy-ios/src/lib/gaugeCondition';
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
