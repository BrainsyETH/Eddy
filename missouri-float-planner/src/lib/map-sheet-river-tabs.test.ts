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

function gauge(siteId: string, isPrimary = false): RiverSheetData['gauges'][number] {
  return { siteId, name: `Gauge ${siteId}`, code: 'good', reading: '385 cfs', isPrimary };
}

function river(over: Partial<RiverSheetData> = {}): RiverSheetData {
  return {
    slug: 'current',
    name: 'Current River',
    region: 'Ozarks',
    code: 'good',
    gauges: [],
    accesses: [],
    hazards: [],
    ...over,
  };
}

const keys = (r: RiverSheetData) => riverTabs(r).map((t) => t.key);

test('a river Eddy knows nothing about has no tabs at all', () => {
  // NEWLY REACHABLE, and not a bug. Conditions used to be unconditional, so the
  // set could never be empty; it is gated on more than one gauge now because the
  // glance carries the verdict and the primary station's reading.
  //
  // RiverSheetPanel renders a glance-only sheet for this — MapSheet reads absent
  // children as glanceOnly — which is the honest outcome: everything such a
  // river has to say already fits above the fold.
  assert.deepEqual(keys(river()), []);
});

test('one gauge needs no Conditions tab', () => {
  // The mirror of gaugeTabs' "ONE river needs no list". The glance shows this
  // station's reading, so a page holding the same single row is a wasted swipe.
  assert.ok(!keys(river({ gauges: [gauge('07064533', true)] })).includes('conditions'));
});

test('two gauges earn Conditions, because they can disagree', () => {
  // The thing one row cannot show, and the only reason the tab still exists: a
  // long river can be Good at one station and High at another.
  const r = river({ gauges: [gauge('07064533', true), gauge('07067000')] });
  assert.ok(keys(r).includes('conditions'));
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
    gauges: [gauge('07064533', true), gauge('07067000')],
    accesses: [access('a', 0), access('b', 8)],
    hazards: [hazard('h1')],
  });
  assert.deepEqual(keys(r), ['conditions', 'floats', 'accesses', 'hazards']);
});

test('a single-gauge river with places to go still has tabs', () => {
  // The empty case is specifically "one gauge AND nothing else". Losing
  // Conditions must not cost a river its Floats or its Hazards.
  const r = river({
    gauges: [gauge('07064533', true)],
    accesses: [access('a', 0), access('b', 8)],
    hazards: [hazard('h1')],
  });
  assert.deepEqual(keys(r), ['floats', 'accesses', 'hazards']);
});
