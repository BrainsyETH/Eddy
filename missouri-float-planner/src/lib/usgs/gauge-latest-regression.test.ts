import assert from 'node:assert/strict';
import test from 'node:test';
import { foldOgcFeatures, type OgcFeature } from '../flow-providers/usgs';
import { parseWaterTemperature } from './water-temperature';
import { parseDissolvedOxygen } from './dissolved-oxygen';
const feature = (parameter: string, value: number, time: string, qualifier?: string): OgcFeature => ({ properties: { monitoring_location_id: 'USGS-07018500', parameter_code: parameter, value, time, qualifier } });
const recent = '2026-09-23T12:00:00Z';
const old = '2013-10-01T00:00:00Z';
test('latest-per-time-series selects newest valid parameter regardless of response order', () => {
  const rows = [feature('00060',500,recent), feature('00060',999,old,'Ice'), feature('00065',3,recent), feature('00065',-999999,'2026-09-23T12:15:00Z')];
  for (const input of [rows, [...rows].reverse()]) {
    const result = foldOgcFeatures(input).get('07018500')!;
    assert.equal(result.dischargeCfs,500); assert.equal(result.gaugeHeightFt,3);
    assert.equal(result.readingTimestamp,recent); assert.deepEqual(result.qualifiers,[]);
  }
});
test('retired sensor does not hide an active station or borrow its timestamp', () => {
  const result = foldOgcFeatures([feature('00060',500,recent),feature('00065',5,old)]).get('07018500')!;
  assert.equal(result.gaugeHeightFt,null); assert.equal(result.dischargeCfs,500); assert.equal(result.readingTimestamp,recent);
  assert.equal(foldOgcFeatures([feature('00065',5,old)]).get('07018500')!.readingTimestamp,old);
});
test('nearby observations conservatively retain older timestamp and reject invalid dates', () => {
  const earlier = '2026-09-23T11:45:00Z';
  const result = foldOgcFeatures([feature('00060',500,earlier),feature('00065',3,recent),feature('00060',999,'bad-date')]).get('07018500')!;
  assert.equal(result.readingTimestamp,earlier);
});
test('water-quality selects newest valid sensor, preserving its measurement date', () => {
  const temp = [feature('00010',22,old),feature('00010',99,'invalid'),feature('00010',20,recent)];
  assert.equal(parseWaterTemperature(temp)?.valueF,68);
  assert.equal(parseWaterTemperature(temp)?.observedAt,recent);
  assert.equal(parseWaterTemperature([...temp].reverse())?.valueF,68);
  const oxygen = [feature('00300',5,old),feature('00300',1,'invalid'),feature('00300',8,recent)];
  assert.equal(parseDissolvedOxygen(oxygen)?.valueMgL,8); assert.equal(parseDissolvedOxygen(oxygen)?.observedAt,recent);
});
