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
import { layerRowCount } from '../../../eddy-ios/src/map/layerRows';
import type { MapAccessPoint } from '@eddy/types';

// The three shapes of row the sheet draws, as the count rule sees them.
const PLAIN = { key: 'campgrounds' } as const;
const PARTITIONED = { key: 'gauges', tiers: ['gauges', 'allGauges'] } as const;
const REFINED = {
  key: 'access',
  tiers: ['access', 'boatRamps'],
  tiersRefine: true,
} as const;

test('a row with no tiers reports its own key', () => {
  assert.equal(layerRowCount(PLAIN, ['campgrounds'], { campgrounds: 78 }), 78);
  // Including while it is off: a count is a fact about the data, and every
  // untiered row has always printed one whatever its switch is set to.
  assert.equal(layerRowCount(PLAIN, [], { campgrounds: 78 }), 78);
  assert.equal(layerRowCount(PLAIN, ['campgrounds'], {}), undefined);
});

test('partitioning tiers are summed, and only the live ones', () => {
  const counts = { gauges: 40, allGauges: 1200 };
  assert.equal(layerRowCount(PARTITIONED, ['gauges'], counts), 40);
  assert.equal(layerRowCount(PARTITIONED, ['gauges', 'allGauges'], counts), 1240);
});

test('a tier that has not answered makes the whole row unknown', () => {
  // "1" beside a row whose second tier is still fetching is a number that will
  // change under the reader's eyes.
  assert.equal(layerRowCount(PARTITIONED, ['gauges', 'allGauges'], { gauges: 40 }), undefined);
});

test('refining tiers report the outermost live one, never the sum', () => {
  // Every ramp is already inside "all access". Summing them would put 60 beside
  // a row holding 50 places.
  const counts = { access: 50, boatRamps: 10 };
  assert.equal(layerRowCount(REFINED, ['access', 'boatRamps'], counts), 50);
  assert.equal(layerRowCount(REFINED, ['access'], counts), 50);
});

test('ramps alone report the ramps, not the whole population', () => {
  // THE DEFECT THIS RULE REPLACED. Reachable: turning a row off clears its
  // tiers, but the chips toggle independently, so "All access" can be off while
  // "Boat ramps" is on — and the row then draws ten places. It used to say 50.
  assert.equal(layerRowCount(REFINED, ['boatRamps'], { access: 50, boatRamps: 10 }), 10);
});

test('a row with nothing live describes nothing', () => {
  // Rather than falling back to the whole population, which would make the
  // figure jump UP as the reader switches the row OFF.
  assert.equal(layerRowCount(REFINED, [], { access: 50, boatRamps: 10 }), undefined);
  assert.equal(layerRowCount(REFINED, ['campgrounds'], { access: 50 }), undefined);
  assert.equal(layerRowCount(PARTITIONED, [], { gauges: 40 }), undefined);
});

test('the count a row prints is the count the resolver measured', () => {
  // The two halves joined: whatever `layerCounts` feeds the sheet for these
  // keys comes from statsByRole, and the projection picks between them.
  const at = (lat: number, types: string[]) => ({
    point: {
      id: `p${lat}`,
      name: 'x',
      riverMile: 1,
      type: 'access',
      isPublic: true,
      types,
      coordinates: { lng: -91, lat },
    } as MapAccessPoint,
  });
  const resolved = resolveAccessMarkers(
    {
      accessPoints: [at(37.1, ['access']), at(37.2, ['access', 'boat_ramp'])],
      services: [],
    },
    activeRoles(['boatRamps']),
  );
  const counts = {
    access: resolved.statsByRole.access.totalMatches,
    boatRamps: resolved.statsByRole.boatRamp.totalMatches,
  };
  assert.equal(layerRowCount(REFINED, ['boatRamps'], counts), 1);
  assert.equal(resolved.markers.length, 1, 'and one place is what actually draws');
});

// Covers what a layers-sheet ROW says: the figure beside the switch
// (map/layerRows.ts) and the line underneath saying where that row's places
// actually went (accessOverlapNote).
//
// Both exist because the access family's counts became MEMBERSHIP (ADR 0008):
// "Boat ramps · 10" stays 10 while three of those ten wear tents, so without the
// sentence a reader counts ramp marks, finds seven, and concludes the map is
// broken. The numbers therefore have to come from one pass over the data.
//
// The projection is tested apart from the resolver on purpose. The resolver's
// algebra can be perfectly right — 10 places hold the ramp role, 7 wear the mark
// — while the sheet prints the wrong one of those numbers beside the switch,
// which is exactly the defect that shipped: a row that read its own key
// unconditionally announced fifty access points in a state that draws ten.

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
