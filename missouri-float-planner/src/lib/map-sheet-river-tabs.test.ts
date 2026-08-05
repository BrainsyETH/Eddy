import assert from 'node:assert/strict';
import test from 'node:test';
import type { Hazard, MapAccessPoint } from '@eddy/types';
import {
  riverTabs,
  type RiverSheetData,
} from '../../../eddy-ios/src/components/map-sheet/riverTabs';

// Covers the river sheet's tab rules. Tapping a river produced no UI at all
// before this, so every one of these is new behaviour rather than a regression
// guard — and the empty-river cases are the ones most likely to be met in the
// wild, because the statewide network carries rivers Eddy has not mapped
// access points for yet.

function access(id: string, riverMile: number, over: Partial<MapAccessPoint> = {}): MapAccessPoint {
  return {
    id,
    name: `Access ${id}`,
    riverMile,
    type: 'access',
    isPublic: true,
    coordinates: { lng: -91, lat: 37 },
    ...over,
  } as MapAccessPoint;
}

function hazard(id: string): Hazard {
  return {
    id,
    riverId: 'r1',
    name: 'Low-water bridge',
    type: 'low_water_dam',
    riverMile: 10,
    description: null,
    severity: 'warning',
    portageRequired: true,
    portageSide: 'left',
    seasonalNotes: null,
    coordinates: { lng: -91, lat: 37 },
  } as Hazard;
}

function river(over: Partial<RiverSheetData> = {}): RiverSheetData {
  return {
    slug: 'current',
    name: 'Current River',
    region: 'Ozarks',
    gauges: [],
    accesses: [],
    hazards: [],
    ...over,
  };
}

const keys = (r: RiverSheetData) => riverTabs(r).map((t) => t.key);

test('a river Eddy knows nothing about is Conditions alone', () => {
  // One tab is not a tab bar — the panel drops the bar entirely at this point.
  assert.deepEqual(keys(river()), ['conditions']);
});

test('one access point is a place to stand, not a float', () => {
  const r = river({ accesses: [access('a', 0)] });
  assert.ok(keys(r).includes('accesses'));
  assert.ok(!keys(r).includes('floats'));
});

test('two access points make a float', () => {
  const r = river({ accesses: [access('a', 0), access('b', 8)] });
  assert.ok(keys(r).includes('floats'));
});

test('hazards earn their tab only when there are some', () => {
  assert.ok(!keys(river()).includes('hazards'));
  assert.ok(keys(river({ hazards: [hazard('h1')] })).includes('hazards'));
});

test('order is fixed', () => {
  const r = river({
    accesses: [access('a', 0), access('b', 8)],
    hazards: [hazard('h1')],
  });
  assert.deepEqual(keys(r), ['conditions', 'floats', 'accesses', 'hazards']);
});

test('Conditions is always present, even with no gauge', () => {
  // A river with no gauge still has something to say — that nothing grades it —
  // and it is the tab the sheet opens on.
  assert.equal(keys(river())[0], 'conditions');
});
