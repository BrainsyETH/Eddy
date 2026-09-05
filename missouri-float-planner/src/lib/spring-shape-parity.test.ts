import assert from 'node:assert/strict';
import test from 'node:test';
import type { MapSpring as WebSpring } from '@/types/api';
import type { MapSpring as AppSpring } from '@eddy/types';
import { toSpring, type SpringRow } from '@/lib/offline/shapes';

// ── One wire format, declared twice, pinned here ──────────────────────────
//
// `MapSpring` exists in packages/eddy-types (what the iOS app parses) and again
// in src/types/api.ts (what the bundle builds), by hand, because @eddy/types is
// not resolvable from shippable web code — Vercel installs only
// missouri-float-planner/. Every mirrored type in this repository carries the
// same risk and the same answer: a test that fails when they drift.
//
// This file is where the alias IS resolvable — the test suite runs under
// tsconfig.test.json, which is allowed to reach outside the app.

test('the two declarations of MapSpring are the same type', () => {
  // Assignable in both directions, which is what makes them one format rather
  // than two that happen to overlap. A field added to either side alone stops
  // this compiling — which is the entire point, since the failure it prevents
  // is silent: the app reads a payload missing a field and renders nothing.
  const fromApp: AppSpring = {
    id: 'poi-1',
    name: 'Blue Spring',
    riverMile: 61.8,
    coordinates: { lng: -91.15, lat: 37.19 },
    description: 'Ninth largest spring in the state.',
    positionSource: 'surveyed',
    positionBracketMiles: null,
    isPrivate: false,
  };
  const asWeb: WebSpring = fromApp;
  const backToApp: AppSpring = asWeb;
  assert.equal(backToApp.name, 'Blue Spring');
});

function row(over: Partial<SpringRow> = {}): SpringRow {
  return {
    id: 'poi-1',
    river_id: 'river-1',
    name: 'Falling Spring',
    description: 'Falling Spring, behind rock dam up short branch on right.',
    latitude: 37.8,
    longitude: -92.1,
    river_mile: 112.8,
    position_source: null,
    raw_data: null,
    ...over,
  };
}

test('the mapper produces the shape the app parses', () => {
  const spring: AppSpring | null = toSpring(row());
  assert.ok(spring);
  assert.equal(spring.name, 'Falling Spring');
  assert.deepEqual(spring.coordinates, { lng: -92.1, lat: 37.8 });
});

// A row written before the column existed cannot be 'derived' — nothing derived
// a position until the script that stamps the column shipped. Defaulting the
// other way would label 51 curated rows approximate.
test('a row with no position_source is surveyed', () => {
  assert.equal(toSpring(row())?.positionSource, 'surveyed');
  assert.equal(toSpring(row())?.positionBracketMiles, null);
});

test('a derived position carries its error bar', () => {
  const spring = toSpring(
    row({ position_source: 'derived_from_river_mile', raw_data: { bracket_miles: 7.6 } }),
  );
  assert.equal(spring?.positionSource, 'derived');
  assert.equal(spring?.positionBracketMiles, 7.6);
});

// The bracket only means something on a derived position, and a surveyed row
// that happens to carry the key must not start claiming an uncertainty.
test('a surveyed position has no error bar even if raw_data carries one', () => {
  const spring = toSpring(row({ position_source: null, raw_data: { bracket_miles: 7.6 } }));
  assert.equal(spring?.positionBracketMiles, null);
});

test('the private flag rides through from raw_data', () => {
  assert.equal(toSpring(row({ raw_data: { private: true } }))?.isPrivate, true);
  assert.equal(toSpring(row())?.isPrivate, false);
});

// A spring is a destination someone paddles to. A row with no coordinates is
// not a degraded pin, it is a pin in the Gulf of Guinea.
test('a spring with no usable position is dropped, not drawn at null island', () => {
  assert.equal(toSpring(row({ latitude: null, longitude: null })), null);
  assert.equal(toSpring(row({ latitude: 0, longitude: 0 })), null);
});

test('numeric columns arriving as strings are parsed', () => {
  const spring = toSpring(row({ latitude: '37.8', longitude: '-92.1', river_mile: '112.8' }));
  assert.equal(spring?.coordinates.lat, 37.8);
  assert.equal(spring?.riverMile, 112.8);
});

test('a spring nobody has placed on a mile still draws', () => {
  assert.equal(toSpring(row({ river_mile: null }))?.riverMile, null);
});
