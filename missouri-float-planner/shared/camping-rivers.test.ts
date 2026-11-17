import assert from 'node:assert/strict';
import test from 'node:test';
import {
  campingMileLabel,
  campingRiverMile,
  campingRiverNow,
  campingRiverOrdered,
  orderCampingAlongRiver,
  type CampingRiverPlace,
  type CampingRiverSource,
} from './camping-rivers';
import { STALE_READING_HOURS } from './reading-staleness';

const place = (name: string, riverSlug: string | null, riverMile?: number | null): CampingRiverPlace => ({
  name,
  accessDestination: riverSlug ? { riverSlug, riverMile } : null,
});

test('a mile belongs to the river the access point is on', () => {
  const pulltite = place('Pulltite', 'current', 26.23);
  assert.equal(campingRiverMile(pulltite, 'current'), 26.23);
  assert.equal(campingRiverMile(pulltite, 'jacks-fork'), null);
  assert.equal(campingRiverMile(place('No access', null), 'current'), null);
  assert.equal(campingRiverMile(place('Older response', 'current'), 'current'), null);
  assert.equal(campingRiverMile(place('Bad mile', 'current', Number.NaN), 'current'), null);
  // Mile 0 is a real position, not a missing one.
  assert.equal(campingRiverMile(place('Montauk', 'current', 0), 'current'), 0);
});

test('campgrounds run upstream to downstream; unmeasured ones follow by name', () => {
  const rows = [
    place('Two Rivers', 'jacks-fork', 44.3),
    place('Round Spring', 'current', 35.44),
    place('Zed directory listing', null),
    place('Montauk', 'current', 0.02),
    place('Akers', 'current', 17.19),
    place('A directory listing', null),
  ];
  assert.deepEqual(
    orderCampingAlongRiver(rows, 'current', (row) => row).map((row) => row.name),
    ['Montauk', 'Akers', 'Round Spring', 'A directory listing', 'Two Rivers', 'Zed directory listing'],
  );
  // The input keeps its order.
  assert.equal(rows[0].name, 'Two Rivers');
});

test('equal miles fall back to name, and wrapped rows sort by their place', () => {
  const rows = [
    { id: 2, camp: place('Sinking Creek', 'current', 34) },
    { id: 1, camp: place('Echo Bluff', 'current', 34) },
  ];
  assert.deepEqual(orderCampingAlongRiver(rows, 'current', (row) => row.camp).map((row) => row.id), [1, 2]);
});

test('"upstream to downstream" needs at least two measured campgrounds', () => {
  assert.equal(campingRiverOrdered([place('A', 'current', 1), place('B', null)], 'current'), false);
  assert.equal(campingRiverOrdered([place('A', 'current', 1), place('B', 'current', 9)], 'current'), true);
  assert.equal(campingRiverOrdered([place('A', 'current', 1), place('B', 'current', 9)], 'meramec'), false);
});

test('mile labels round like the river page', () => {
  assert.equal(campingMileLabel(26.23), 'Mile 26');
  assert.equal(campingMileLabel(0.02), 'Mile 0');
  assert.equal(campingMileLabel(33.7), 'Mile 34');
});

const river = (currentCondition: CampingRiverSource['currentCondition']): CampingRiverSource => ({
  slug: 'current',
  name: 'Current River',
  path: '/rivers/missouri/current',
  currentCondition,
});

test('a current rating carries its code and trend words', () => {
  assert.deepEqual(
    campingRiverNow([river({ code: 'good', readingAgeHours: 1, trend: { label: 'Falling' } })], 'current'),
    {
      slug: 'current',
      name: 'Current River',
      path: '/rivers/missouri/current',
      condition: { code: 'good', trend: 'Falling' },
    },
  );
  assert.deepEqual(
    campingRiverNow([river({ code: 'high' })], 'current')?.condition,
    { code: 'high', trend: null },
  );
});

test('an old, unknown or missing reading makes no claim about now', () => {
  for (const reading of [
    null,
    { code: 'unknown', readingAgeHours: 1 },
    { code: 'good', readingAgeHours: STALE_READING_HOURS + 0.1 },
    { code: 'good', readingAgeHours: Number.NaN },
  ]) {
    const now = campingRiverNow([river(reading)], 'current');
    assert.equal(now?.condition, null);
    // The river is still known, so its links still work.
    assert.equal(now?.path, '/rivers/missouri/current');
  }
  assert.equal(
    campingRiverNow([river({ code: 'good', readingAgeHours: STALE_READING_HOURS })], 'current')?.condition?.code,
    'good',
  );
});

test('a river missing from the list, or a list that has not loaded, is null', () => {
  assert.equal(campingRiverNow([river(null)], 'meramec'), null);
  assert.equal(campingRiverNow(undefined, 'current'), null);
  assert.equal(campingRiverNow(null, 'current'), null);
});
