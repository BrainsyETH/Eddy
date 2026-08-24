import assert from 'node:assert/strict';
import test from 'node:test';
import { celsiusToFahrenheit, parseWaterTemperature } from './water-temperature';
import type { OgcFeature } from '../flow-providers/usgs';

function feature(overrides: Partial<NonNullable<OgcFeature['properties']>>): OgcFeature {
  return {
    properties: {
      monitoring_location_id: 'USGS-06934500',
      parameter_code: '00010',
      time: '2026-08-23T12:00:00Z',
      value: 24.5,
      unit_of_measure: 'degC',
      ...overrides,
    },
  };
}

test('a valid reading converts to °F at display precision', () => {
  assert.deepEqual(parseWaterTemperature([feature({ value: 24.5 })]), {
    valueF: 76.1,
    observedAt: '2026-08-23T12:00:00Z',
    source: 'usgs',
  });
  assert.equal(celsiusToFahrenheit(0), 32);
  assert.equal(celsiusToFahrenheit(100), 212);
});

test('sentinels and implausible values are absence, never a number', () => {
  // -999999 is USGS's missing-value marker; converting it would print
  // "-1799966.2°F" with a straight face. Boiling rivers are also declined.
  assert.equal(parseWaterTemperature([feature({ value: -999999 })]), null);
  assert.equal(parseWaterTemperature([feature({ value: 80 })]), null);
  assert.equal(parseWaterTemperature([feature({ value: 'not-a-number' })]), null);
  assert.equal(parseWaterTemperature([feature({ value: null })]), null);
});

test('a reading with no timestamp is not served', () => {
  // The display rule is "always with its measurement age" — a value that
  // cannot be aged cannot satisfy it.
  assert.equal(parseWaterTemperature([feature({ time: undefined })]), null);
});

test('other parameters in the payload are ignored', () => {
  assert.equal(parseWaterTemperature([feature({ parameter_code: '00060', value: 1200 })]), null);
});

test('an empty feature list is the ordinary case', () => {
  // Seven of eight Ozark sites checked publish no 00010 series at all.
  assert.equal(parseWaterTemperature([]), null);
});
