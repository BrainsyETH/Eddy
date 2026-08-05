import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { MapAccessPoint } from '@eddy/types';
import {
  accessTypeSymbol,
  placeSymbol,
  type PlaceSymbolName,
} from '../../../eddy-ios/src/components/map-sheet/placeSymbol';

// Covers eddy-ios/src/components/map-sheet/placeSymbol.ts. The Expo app has no
// runner of its own, and this is the file that decides which Eddy mark stands in
// for a place when it has no photo — so a wrong answer here is a tent-tapper
// being shown a boat ramp, or a drawing that means "road access" being borrowed
// to mean "bridge".

function point(over: Partial<MapAccessPoint> = {}): MapAccessPoint {
  return {
    id: 'ap-1',
    name: 'Akers Ferry',
    riverMile: 22.4,
    type: 'access',
    isPublic: true,
    coordinates: { lng: -91.2301, lat: 37.2789 },
    ...over,
  } as MapAccessPoint;
}

test('the layer decides, because it is the icon the finger landed on', () => {
  // The campgrounds layer and the access layer present the SAME access point.
  // Whichever one was tapped is what the reader was looking for — the rule
  // initialTabKey uses to pick the opening tab, applied to the mark.
  const campableRamp = point({ types: ['boat_ramp', 'campground'] });
  assert.equal(placeSymbol({ layer: 'campgrounds' }, campableRamp), 'campground');
  assert.equal(placeSymbol({ layer: 'access' }, campableRamp), 'campground');

  assert.equal(placeSymbol({ layer: 'gauges' }, null), 'gauge');
  // Both tiers share one mark: the tier is a vocabulary, not a different object.
  assert.equal(placeSymbol({ layer: 'allGauges' }, null), 'gauge');
  assert.equal(placeSymbol({ layer: 'dams' }, null), 'dam');
  assert.equal(placeSymbol({ layer: 'hazards' }, null), 'hazard');
  assert.equal(placeSymbol({ layer: 'outfitters' }, null), 'outfitter');
});

test('a layer that answers overrides the point that disagrees', () => {
  // A campground pin is a campground even when the underlying row is tagged only
  // as a boat ramp, and the reverse: the access layer never draws a tent for a
  // point that does not camp.
  assert.equal(placeSymbol({ layer: 'campgrounds' }, point({ types: ['boat_ramp'] })), 'campground');
  assert.equal(placeSymbol({ layer: 'access' }, point({ types: ['boat_ramp'] })), 'boatRamp');
});

test('the generic access layer falls through to the point own types', () => {
  assert.equal(placeSymbol({ layer: 'access' }, point({ type: 'boat_ramp' })), 'boatRamp');
  assert.equal(placeSymbol({ layer: 'access' }, point({ type: 'campground' })), 'campground');
  // `access` sorts first and has no art of its own, so it must be stepped over
  // rather than treated as the answer.
  assert.equal(
    placeSymbol({ layer: 'access' }, point({ types: ['access', 'boat_ramp'] })),
    'boatRamp',
  );
});

test('a type with no art gets the generic pin, never an adjacent drawing', () => {
  // eddy-road is the road-access SECTION mark on the access-point screen. It is
  // close enough to a bridge to be tempting, and borrowing it would make one
  // drawing mean two things in the same product.
  for (const type of ['gravel_bar', 'bridge', 'park']) {
    assert.equal(placeSymbol({ layer: 'access' }, point({ type })), 'accessPoint');
    assert.equal(accessTypeSymbol(type), null);
  }
  assert.equal(accessTypeSymbol('boat_ramp'), 'boatRamp');
  assert.equal(accessTypeSymbol('campground'), 'campground');
  // An unmapped value from the database is a label, not a crash.
  assert.equal(accessTypeSymbol('low_water_crossing'), null);
});

test('never null, for any pin the sheet can open', () => {
  assert.equal(placeSymbol({ layer: 'access' }, null), 'accessPoint');
  assert.equal(placeSymbol({ layer: 'access' }, point({ types: [] })), 'accessPoint');
  // A layer this file has never heard of still names the place.
  assert.equal(placeSymbol({ layer: 'publicLand' }, null), 'accessPoint');
});

test('every name it can return exists in the Eddy catalog', () => {
  // THE HALF THE TYPE SYSTEM CANNOT CHECK FROM HERE. placeSymbol is a pure .ts
  // module precisely so this suite can run it, which means it may not import
  // EddySymbol's .tsx — so the union is a plain one and a rename in the catalog
  // would otherwise only fail `make check-mobile`, at the PlaceHead call site.
  //
  // A Record rather than an array: adding a name to PlaceSymbolName fails to
  // compile here until it is listed, so the check cannot silently stop being
  // exhaustive.
  const every: Record<PlaceSymbolName, true> = {
    accessPoint: true,
    boatRamp: true,
    campground: true,
    dam: true,
    gauge: true,
    hazard: true,
    outfitter: true,
  };
  const catalog = readFileSync(
    join(process.cwd(), '../eddy-ios/src/components/EddySymbol.tsx'),
    'utf8',
  );
  for (const name of Object.keys(every)) {
    assert.match(
      catalog,
      new RegExp(`\\n\\s*${name}:\\s*require\\(`),
      `EddySymbol has no \`${name}\` entry, so placeSymbol can name a mark that does not exist`,
    );
  }
});
