// missouri-float-planner/src/lib/float-hazard-data.test.ts
//
// Covers eddy-ios/src/lib/floatHazardData.ts: a float tells "no hazard data"
// apart from "no mapped hazards", and the start's hazard refresh is bounded
// and keeps what the phone had on any failure.

import assert from 'node:assert/strict';
import test from 'node:test';
import type { LngLat } from '@eddy/geo';
import type { Hazard } from '@eddy/types';
import { routeFromRiver } from '../../../eddy-ios/src/lib/floatSession';
import {
  hazardAheadNote, hazardDataState, refreshRouteHazards, withKnownHazards,
} from '../../../eddy-ios/src/lib/floatHazardData';

function at(meters: number): LngLat { return [-91 + meters / (111_320 * Math.cos(37 * Math.PI / 180)), 37]; }
function prepared() {
  const access = [0, 10_000].map((x, i) => ({ id: String(i), name: i ? 'Take-out' : 'Put-in', type: 'access', isPublic: true, riverMile: x / 1609.344, coordinates: { lng: at(x)[0], lat: 37 } }));
  const result = routeFromRiver({ slug: 'river', name: 'Current River', geometry: { type: 'LineString', coordinates: Array.from({ length: 101 }, (_, i) => at(i * 100)) } }, access as never, null);
  assert.ok(result.ok);
  return result;
}
function hazard(id: string, meters: number, offLine = false): Hazard {
  const [lng, lat] = at(meters);
  return { id, name: `Hazard ${id}`, type: 'strainer', severity: 'warning', coordinates: { lng, lat: offLine ? lat + 0.05 : lat } } as Hazard;
}

test('a route never given a hazard list is unavailable, not clear', () => {
  const { route, index } = prepared();
  assert.equal(hazardDataState(route), 'unavailable');
  assert.equal(withKnownHazards(route, index, null), route);
  assert.equal(withKnownHazards(route, index, undefined), route);
  assert.match(hazardAheadNote(route, 0)!, /isn’t available/);
});

test('a loaded list with nothing on the line is "none", distinct from unavailable', () => {
  const { route, index } = prepared();
  const empty = withKnownHazards(route, index, []);
  assert.deepEqual(empty.hazards, []);
  assert.equal(hazardDataState(empty), 'none');
  // Off the line is not on this stretch, but the data was still loaded.
  assert.equal(hazardDataState(withKnownHazards(route, index, [hazard('far', 5_000, true)])), 'none');
  assert.match(hazardAheadNote(empty, 0)!, /No mapped hazards on this stretch/);
});

test('mapped hazards say nothing while one is ahead, and say so once all are passed', () => {
  const { route, index } = prepared();
  const mapped = withKnownHazards(route, index, [hazard('a', 5_000)]);
  assert.equal(hazardDataState(mapped), 'mapped');
  assert.equal(hazardAheadNote(mapped, 1), null);
  assert.equal(hazardAheadNote(mapped, 0), 'No mapped hazards ahead.');
});

test('a fresh answer replaces the cached hazards, including with none', async () => {
  const { route, index } = prepared();
  const cached = withKnownHazards(route, index, [hazard('old', 3_000)]);
  const fresh = await refreshRouteHazards(cached, index, { fetchHazards: async (slug) => { assert.equal(slug, 'river'); return [hazard('new', 6_000)]; } });
  assert.deepEqual(fresh.hazards?.map(h => h.id), ['new']);
  const cleared = await refreshRouteHazards(cached, index, { fetchHazards: async () => [] });
  assert.equal(hazardDataState(cleared), 'none');
});

test('a failed, slow, or offline refresh keeps the cached hazards', async () => {
  const { route, index } = prepared();
  const cached = withKnownHazards(route, index, [hazard('old', 3_000)]);
  assert.equal(await refreshRouteHazards(cached, index, { fetchHazards: async () => { throw new Error('500'); } }), cached);
  let aborted = false;
  const started = Date.now();
  const slow = await refreshRouteHazards(cached, index, {
    fetchHazards: (_slug, signal) => new Promise((resolve) => {
      signal.addEventListener('abort', () => { aborted = true; });
      setTimeout(() => resolve([]), 1_000);
    }),
  }, 30);
  assert.equal(slow, cached);
  assert.ok(Date.now() - started < 500, 'the start is not held past the budget');
  assert.ok(aborted, 'the late request is cancelled');
  let asked = false;
  assert.equal(await refreshRouteHazards(cached, index, { fetchHazards: async () => { asked = true; return []; }, offline: async () => true }), cached);
  assert.equal(asked, false);
  // An offline hint that fails is unknown, not offline.
  const tried = await refreshRouteHazards(route, index, { fetchHazards: async () => [], offline: async () => { throw new Error('no module'); } });
  assert.equal(hazardDataState(tried), 'none');
});

test('with nothing cached, a failed refresh leaves the float honestly without hazard data', async () => {
  const { route, index } = prepared();
  const after = await refreshRouteHazards(route, index, { fetchHazards: async () => { throw new Error('offline'); } });
  assert.equal(hazardDataState(after), 'unavailable');
});
