// src/lib/dam-catalog-parity.test.ts
// The app ships dam identities in its binary; this is what keeps them true.
//
// eddy-ios/src/lib/damCatalog.ts exists because the Lakes & dams layer must draw
// before — and without — a network answer: /api/dams reads through to CWMS and
// SWPA live, so a cold CDN entry can outlast the phone's fifteen-second deadline
// and leave the layer empty on a fresh install at a put-in.
//
// The rows are a copy of USACE_DAMS, trimmed to the half a map pin needs. The
// app cannot import the registry — Vercel installs only missouri-float-planner/,
// so the dependency may not point that way — which is the same constraint that
// duplicates campsiteAvailabilityLine and the public-land styles, and the same
// remedy: a test that fails when the two drift.
//
// Nothing in the app's copy is derived, so drift can only look like one of four
// things: a dam added, a dam removed, a dam renamed, or a dam moved. Each is
// asserted separately below, because "deepEqual failed" on twenty-four rows
// tells you nothing about which.

import assert from 'node:assert/strict';
import test from 'node:test';
import { USACE_DAMS } from './flow-providers/usace-registry';
import { DAM_CATALOG, damPins, damSubtitle } from '../../../eddy-ios/src/lib/damCatalog';

const registry = Object.values(USACE_DAMS)
  .map((d) => ({ id: d.id, name: d.name, lakeName: d.lakeName, state: d.state, lat: d.lat, lon: d.lon }))
  .sort((a, b) => a.id.localeCompare(b.id));

const shipped = [...DAM_CATALOG].sort((a, b) => a.id.localeCompare(b.id));

test('the app ships every dam the registry carries, and no others', () => {
  // A dam added to the registry and not to the catalog is a pin that only
  // appears once the network answers — which is the failure the catalog exists
  // to remove, reintroduced for one dam.
  assert.deepEqual(
    shipped.map((d) => d.id),
    registry.map((d) => d.id),
  );
});

test('the names and lakes match, so a pin is not labelled from a stale build', () => {
  for (const expected of registry) {
    const actual = shipped.find((d) => d.id === expected.id)!;
    assert.equal(actual.name, expected.name, `${expected.id} name`);
    assert.equal(actual.lakeName, expected.lakeName, `${expected.id} lakeName`);
    assert.equal(actual.state, expected.state, `${expected.id} state`);
  }
});

test('the coordinates match to the digit', () => {
  // Exactly, not approximately. A rounded copy is how a pin ends up half a mile
  // from the dam it names, and half a mile is a different bank of the lake.
  for (const expected of registry) {
    const actual = shipped.find((d) => d.id === expected.id)!;
    assert.equal(actual.lat, expected.lat, `${expected.id} lat`);
    assert.equal(actual.lon, expected.lon, `${expected.id} lon`);
  }
});

test('the catalog is not empty, which is what the layer is for', () => {
  // Guards the guard: an empty catalog compared against an empty registry would
  // pass every assertion above and ship a layer that draws nothing.
  assert.ok(shipped.length >= 20, `expected the full registry, saw ${shipped.length}`);
});

/* ── What the map builds from it ──────────────────────────────────────────── */

test('every dam draws with no network answer at all', () => {
  // The whole point. A fresh install, a cold endpoint, one bar of LTE: the
  // layer still has every pin, and says nothing it has not been told.
  const pins = damPins(null);
  assert.equal(pins.length, DAM_CATALOG.length);

  const bullShoals = pins.find((p) => p.damId === 'swl-bull-shoals-dam')!;
  assert.equal(bullShoals.name, 'Bull Shoals Dam');
  assert.equal(bullShoals.subtitle, 'Bull Shoals Lake · AR');
  assert.equal(bullShoals.value, null);
  assert.equal(bullShoals.updatedAt, null);
  assert.ok(!('codeLabel' in bullShoals), 'no chip until something has been measured');
});

test('a live answer enriches the same pin rather than replacing the layer', () => {
  const pins = damPins([
    { id: 'swl-bull-shoals-dam', generating: true, value: '19,130 cfs', updatedAt: '5m ago', riverSlug: 'white' },
  ]);

  // Still every dam, not just the one that answered.
  assert.equal(pins.length, DAM_CATALOG.length);

  const enriched = pins.find((p) => p.damId === 'swl-bull-shoals-dam')!;
  assert.equal(enriched.codeLabel, 'Generating');
  assert.equal(enriched.value, '19,130 cfs');
  assert.equal(enriched.riverSlug, 'white');

  // And a dam the response did not mention keeps its catalog row and claims
  // nothing about its units.
  const quiet = pins.find((p) => p.damId === 'nwk-stockton-dam')!;
  assert.ok(!('codeLabel' in quiet));
});

test('an unmeasured powerhouse and an unheard-of one read the same', () => {
  // `generating: null` is a dam that publishes no turbine flow — Kansas City
  // publishes nothing to CWMS at all — and a catalog-only pin has heard nothing
  // whatsoever. Neither may render as "Units idle", which is an observation
  // nobody made.
  const [unmeasured] = damPins([{ id: 'nwk-stockton-dam', generating: null }]).filter(
    (p) => p.damId === 'nwk-stockton-dam',
  );
  assert.ok(!('codeLabel' in unmeasured));

  const idle = damPins([{ id: 'nwk-stockton-dam', generating: false }]).find(
    (p) => p.damId === 'nwk-stockton-dam',
  )!;
  assert.equal(idle.codeLabel, 'Units idle');
});

test('a dam the shipped build has never heard of still draws, given a position', () => {
  // The registry can gain a project while a build is in the field. With a
  // coordinate from the response there is somewhere to put it; without one it
  // is skipped rather than dropped at (0, 0), which is in the Gulf of Guinea.
  const at = new Map([['swl-new-dam', { lng: -92, lat: 37 }]]);
  const placed = damPins([{ id: 'swl-new-dam', name: 'New Dam' }], at);
  assert.equal(placed.length, DAM_CATALOG.length + 1);
  assert.ok(placed.some((p) => p.damId === 'swl-new-dam'));

  const unplaceable = damPins([{ id: 'swl-new-dam', name: 'New Dam' }]);
  assert.equal(unplaceable.length, DAM_CATALOG.length);
});

test('the subtitle drops what it does not have rather than printing a separator', () => {
  assert.equal(damSubtitle({ lakeName: 'Norfork Lake', state: 'AR' }), 'Norfork Lake · AR');
  assert.equal(damSubtitle({ lakeName: null, state: 'AR' }), 'AR');
  assert.equal(damSubtitle({ lakeName: null, state: null }), null);
});
