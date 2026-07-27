import { strict as assert } from 'node:assert';
import test from 'node:test';

import {
  buildZones,
  findZoneIndex,
  formatZoneRange,
  zoneMarkerPercent,
  type ThresholdValues,
} from './threshold-zones';

/** A full six-band ladder in cfs, shaped like the Current River's. */
const FULL: ThresholdValues = {
  levelTooLow: 130,
  levelLow: 250,
  levelOptimalMin: 300,
  levelOptimalMax: 900,
  levelHigh: 5000,
  levelDangerous: 5000,
};

test('buildZones produces the six bands in ladder order', () => {
  const zones = buildZones(FULL);
  assert.deepEqual(
    zones.map((z) => z.key),
    ['too_low', 'low', 'good', 'flowing', 'high', 'dangerous'],
  );
});

test('bands are contiguous, so no reading can fall into a gap', () => {
  const zones = buildZones(FULL);
  for (let i = 1; i < zones.length; i++) {
    assert.equal(zones[i].min, zones[i - 1].max, `gap before ${zones[i].key}`);
  }
});

test('a partial ladder drops the bands it cannot define', () => {
  const zones = buildZones({
    levelTooLow: null,
    levelLow: 2,
    levelOptimalMin: 3,
    levelOptimalMax: 6,
    levelHigh: null,
    levelDangerous: null,
  });
  // No too-low floor and no high/flood ceiling — the ladder is only the three
  // bands the data can actually support.
  assert.deepEqual(zones.map((z) => z.key), ['low', 'good', 'flowing']);
});

test('a high ceiling without a flood level still yields a High band', () => {
  const zones = buildZones({
    levelTooLow: null,
    levelLow: 2,
    levelOptimalMin: 3,
    levelOptimalMax: 6,
    levelHigh: 9,
    levelDangerous: null,
  });
  assert.deepEqual(zones.map((z) => z.key), ['low', 'good', 'flowing', 'high']);
});

test('marker lands inside the band the reading actually belongs to', () => {
  const zones = buildZones(FULL);
  // 339 cfs is 39 into the 300-900 Flowing band, which is band 4 of 6 and so
  // occupies 50%-66.7% of the track. Anything below 50% would put the marker
  // in Good while the card's pill says Flowing.
  const percent = zoneMarkerPercent(zones, 339)!;
  const flowingStart = (3 / 6) * 100;
  const flowingEnd = (4 / 6) * 100;
  assert.ok(percent > flowingStart && percent < flowingEnd, `expected Flowing band, got ${percent}`);
  assert.equal(findZoneIndex(zones, 'flowing'), 3);
});

test('marker sits at a band boundary when the reading is at the threshold', () => {
  const zones = buildZones(FULL);
  assert.equal(zoneMarkerPercent(zones, 300), 50);
});

test('readings below the ladder clamp to the start, above it to the end', () => {
  const zones = buildZones(FULL);
  assert.equal(zoneMarkerPercent(zones, -5), 0);
  assert.equal(zoneMarkerPercent(zones, 999_999), 100);
});

test('no reading means no marker', () => {
  const zones = buildZones(FULL);
  assert.equal(zoneMarkerPercent(zones, null), null);
  assert.equal(zoneMarkerPercent(zones, undefined), null);
  assert.equal(zoneMarkerPercent(zones, Number.NaN), null);
  assert.equal(zoneMarkerPercent([], 339), null);
});

test('a zero-width band centres the marker instead of dividing by zero', () => {
  const zones = buildZones({
    levelTooLow: 100,
    levelLow: 100,
    levelOptimalMin: 300,
    levelOptimalMax: 900,
    levelHigh: null,
    levelDangerous: null,
  });
  const lowIndex = findZoneIndex(zones, 'low');
  const percent = zoneMarkerPercent(zones, 100)!;
  const bandWidth = 100 / zones.length;
  assert.ok(Number.isFinite(percent));
  assert.ok(percent >= lowIndex * bandWidth && percent <= (lowIndex + 1) * bandWidth);
});

test('the flood band prints as open-ended, never with its synthetic maximum', () => {
  const zones = buildZones(FULL);
  const flood = zones.find((z) => z.key === 'dangerous')!;
  assert.equal(formatZoneRange(flood, 'cfs'), '5,000+ cfs');
  const flowing = zones.find((z) => z.key === 'flowing')!;
  assert.equal(formatZoneRange(flowing, 'cfs'), '300 – 900 cfs');
});

test('feet render to two decimals, cfs as whole grouped numbers', () => {
  const zones = buildZones({
    levelTooLow: null,
    levelLow: null,
    levelOptimalMin: 1.5,
    levelOptimalMax: 3.25,
    levelHigh: null,
    levelDangerous: null,
  });
  const flowing = zones.find((z) => z.key === 'flowing')!;
  assert.equal(formatZoneRange(flowing, 'ft'), '1.50 – 3.25 ft');
});

test('per-gauge descriptions override the defaults', () => {
  const zones = buildZones(FULL, { flowing: 'Feet up. Crystal water.' });
  const flowing = zones.find((z) => z.key === 'flowing')!;
  assert.equal(flowing.description, 'Feet up. Crystal water.');
  const low = zones.find((z) => z.key === 'low')!;
  assert.ok(low.description.length > 0, 'unspecified bands keep their default copy');
});

test('findZoneIndex returns -1 for an unknown or missing condition', () => {
  const zones = buildZones(FULL);
  assert.equal(findZoneIndex(zones, 'unknown'), -1);
  assert.equal(findZoneIndex(zones, null), -1);
});
