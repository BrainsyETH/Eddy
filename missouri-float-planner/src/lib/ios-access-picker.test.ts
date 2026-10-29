import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { MapAccessPoint } from '@eddy/types';
import { accessKindLabels, formatRiverMiles, timelineGapLabel } from '../../../eddy-ios/src/lib/accessPickerCopy';

const point = (id: string, riverMile: number, extra: Partial<MapAccessPoint> = {}) => ({
  id, name: id, riverMile, type: 'access', isPublic: true, coordinates: { lng: 0, lat: 0 }, ...extra,
}) as MapAccessPoint;

test('river miles never print a zero for a short stretch', () => {
  assert.equal(formatRiverMiles(0.04), '<0.1');
  assert.equal(formatRiverMiles(9.24), '9.2');
});

test('the generic access type is dropped and the rest follow shared order', () => {
  assert.deepEqual(accessKindLabels(point('a', 1)), []);
  assert.deepEqual(accessKindLabels(point('a', 1, { types: ['campground', 'access', 'boat_ramp'] })), ['Campground', 'Boat ramp']);
  assert.deepEqual(accessKindLabels(point('a', 1, { type: 'gravel_bar' })), ['Gravel bar']);
});

test('the first timeline row never repeats its distance as a gap', () => {
  const putIn = point('thomasville', 0.1);
  const caneBluff = point('cane-bluff', 9.3);
  const greer = point('greer', 16.6);
  assert.equal(timelineGapLabel(caneBluff, putIn, 0), null);
  assert.equal(timelineGapLabel(caneBluff, undefined, 0), null);
  assert.equal(timelineGapLabel(greer, caneBluff, 1), '7.3 mi from previous access');
  assert.equal(timelineGapLabel(greer, point('twin', 16.6), 2), 'Same river mile as previous access');
});

test('the sort toggle names its action and reports its state', () => {
  const picker = readFileSync(join(process.cwd(), '..', 'eddy-ios', 'src', 'components', 'PlanAccessPicker.tsx'), 'utf8');
  assert.match(picker, /accessibilityLabel="Sort by nearest to you"\s*accessibilityState=\{\{ selected: nearestFirst \}\}/);
  // The pill must not say the order the heading below it already says.
  assert.doesNotMatch(picker, /\{nearestFirst \? 'Nearest to you' : 'Downstream order'\}/);
});
