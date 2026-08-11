import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  accessOverlapNote,
  activeRoles,
  resolveAccessMarkers,
  type RoleStats,
} from '../../../eddy-ios/src/map/accessLayers';
import type { MapAccessPoint } from '@eddy/types';

// Covers the line the layers sheet prints under an access-family row saying
// where that row's places actually went.
//
// It exists because the counts became MEMBERSHIP (ADR 0008): "Boat ramps · 10"
// stays 10 while three of those ten wear tents, so without this sentence a
// reader counts ramp marks, finds seven, and concludes the map is broken. The
// number in the sentence and the number on the row therefore have to come from
// one pass over the data — which is what these tests pin.

function stats(over: Partial<RoleStats> = {}): RoleStats {
  return {
    totalMatches: 0,
    ownedMarkers: 0,
    representedElsewhere: 0,
    notShown: 0,
    representedBy: {},
    ...over,
  };
}

test('silent when every place wears its own mark', () => {
  // Absent, never empty — the same rule the sheet's sections follow. A row with
  // nothing to explain must not print a sentence explaining nothing.
  assert.equal(
    accessOverlapNote('boatRamp', stats({ totalMatches: 10, ownedMarkers: 10 })),
    null,
  );
  assert.equal(accessOverlapNote('access', stats()), null);
});

test('names the layer the places went to, rather than "somewhere else"', () => {
  assert.equal(
    accessOverlapNote(
      'boatRamp',
      stats({
        totalMatches: 10,
        ownedMarkers: 7,
        representedElsewhere: 3,
        representedBy: { campground: 3 },
      }),
    ),
    '7 drawn as boat ramps · 3 as campgrounds',
  );
});

test('lists every destination, in mark-priority order', () => {
  assert.equal(
    accessOverlapNote(
      'access',
      stats({
        totalMatches: 50,
        ownedMarkers: 46,
        representedElsewhere: 4,
        representedBy: { boatRamp: 1, campground: 3 },
      }),
    ),
    '46 drawn as access points · 3 as campgrounds · 1 as boat ramps',
  );
});

test('says when a filter is hiding places outright', () => {
  // The bucket P3b added. Without it the sentence would claim 2 of 4 places are
  // accounted for and stay silent about the other two.
  assert.equal(
    accessOverlapNote(
      'access',
      stats({
        totalMatches: 4,
        ownedMarkers: 0,
        representedElsewhere: 2,
        representedBy: { boatRamp: 2 },
        notShown: 2,
      }),
    ),
    '0 drawn as access points · 2 as boat ramps · 2 not shown',
  );
});

test('the note and the row count come from the same resolve', () => {
  const point = (over: Partial<MapAccessPoint>): MapAccessPoint =>
    ({
      id: 'x',
      name: 'x',
      riverMile: 1,
      type: 'access',
      isPublic: true,
      coordinates: { lng: -91, lat: 37 },
      ...over,
    }) as MapAccessPoint;

  const accessPoints = [
    { point: point({ id: 'a', types: ['access', 'boat_ramp'] }) },
    { point: point({ id: 'b', types: ['access', 'boat_ramp', 'campground'] }) },
    { point: point({ id: 'c', types: ['access'] }) },
  ];
  const resolved = resolveAccessMarkers(
    { accessPoints, services: [] },
    activeRoles(['access', 'campgrounds', 'boatRamps']),
  );
  const ramps = resolved.statsByRole.boatRamp;

  // The row prints totalMatches; the note accounts for all of it.
  assert.equal(ramps.totalMatches, 2);
  assert.equal(accessOverlapNote('boatRamp', ramps), '1 drawn as boat ramps · 1 as campgrounds');
  const drawnAsRamps = resolved.markers.filter((m) => m.owner === 'boatRamp').length;
  assert.equal(drawnAsRamps, ramps.ownedMarkers);
});

test('the sheet asks the resolver for the note rather than recomputing it', () => {
  // The failure this file exists to prevent is a second derivation beside the
  // count — the exact shape of the drift ADR 0008 records. A component that
  // built its own sentence out of `layers.includes(...)` would pass every test
  // above and still be able to disagree with the number next to it.
  const screen = readFileSync(
    join(process.cwd(), '../eddy-ios/app/(tabs)/index.tsx'),
    'utf8',
  );
  assert.ok(
    screen.includes('accessOverlapNote('),
    'the map screen should render the resolver’s note',
  );
});
