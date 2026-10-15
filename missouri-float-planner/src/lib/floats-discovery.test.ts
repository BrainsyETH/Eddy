import assert from 'node:assert/strict';
import test from 'node:test';
import { floatPlanDestination } from '../../../eddy-ios/src/lib/planRequest';
import { createNavigationGate } from '../../../eddy-ios/src/lib/navigationGate';
import { floatRiverChoices, visibleFloats } from '../../../eddy-ios/src/lib/floatCollection';
import { selectSearchLocation, selectSearchRiver } from '../../../eddy-ios/src/lib/floatSearchSelection';
import type { FloatSearchInput } from '../../shared/float-search';

test('a fresh build cannot inherit a featured route, and finder keeps its exact vessel and endpoints', () => {
  const pick = { focusRiver: 'current', planPutIn: 'a', planTakeOut: 'b', planVesselTypeId: 'kayak-id' };
  const featured = floatPlanDestination(pick);
  const fresh = floatPlanDestination();
  assert.equal(featured.pathname, '/plan-route');
  assert.equal(fresh.pathname, '/plan-route');
  for (const [key, value] of Object.entries(pick))
    assert.equal(featured.params[key as keyof typeof featured.params], value);
  assert.notEqual(featured.params.planRequest, fresh.params.planRequest);
  assert.deepEqual(Object.keys(fresh.params).sort(), ['openPlan', 'planRequest']);
});

test('rapid taps across actions navigate once; returning or a failed push allows another try', () => {
  const gate = createNavigationGate();
  const visits: string[] = [];
  gate.run(() => visits.push('featured'));
  gate.run(() => visits.push('build'));
  assert.deepEqual(visits, ['featured']);
  gate.reset();
  assert.throws(() =>
    gate.run(() => {
      throw new Error('unavailable');
    }),
  );
  gate.run(() => visits.push('build'));
  assert.deepEqual(visits, ['featured', 'build']);
});

test('switching between a town, river, and current location removes the old geographic constraint', () => {
  const input: FloatSearchInput = {
    near: { lat: 38.6, lng: -90.2 },
    radiusMiles: 100,
    targetHours: 5,
    vesselType: 'kayak',
    publicOnly: true,
  };
  const river = { ...input, ...selectSearchRiver('current') };
  assert.equal(river.river, 'current');
  assert.equal(river.near, undefined);
  const nearby = { ...river, ...selectSearchLocation({ lat: 37.2, lng: -91.3 }) };
  assert.equal(nearby.river, undefined);
  assert.deepEqual(nearby.near, { lat: 37.2, lng: -91.3 });
  assert.equal(nearby.vesselType, 'kayak');
  assert.equal(nearby.targetHours, 5);
});

test('river filters and alphabetical sorting preserve recent or editorial order within a river', () => {
  const rows = [
    { riverSlug: 'jacks-fork', riverName: 'Jacks Fork', id: 'new-jacks' },
    { riverSlug: 'current', riverName: 'Current River', id: 'new-current' },
    { riverSlug: 'jacks-fork', riverName: 'Jacks Fork', id: 'old-jacks' },
  ];
  assert.deepEqual(
    floatRiverChoices(rows).map((r) => r.riverSlug),
    ['current', 'jacks-fork'],
  );
  assert.deepEqual(
    visibleFloats(rows, 'jacks-fork', 'default').map((r) => r.id),
    ['new-jacks', 'old-jacks'],
  );
  assert.deepEqual(
    visibleFloats(rows, '', 'river').map((r) => r.id),
    ['new-current', 'new-jacks', 'old-jacks'],
  );
  assert.deepEqual(visibleFloats(rows, '', 'default'), rows);
  assert.equal(rows[0].id, 'new-jacks');
});
