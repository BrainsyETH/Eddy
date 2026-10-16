import assert from 'node:assert/strict';
import test from 'node:test';
import type { MapAccessPoint } from '../../../packages/eddy-types';
import { mapPlanSelection } from '../../../eddy-ios/src/map/planSelection';

const access = (id: string, riverMile: number, extra: Partial<MapAccessPoint> = {}): MapAccessPoint => ({
  id, name: id, riverMile, type: 'access', isPublic: true,
  coordinates: { lng: -91.4, lat: 37.1 }, ...extra,
});
const bach = access('bachers', 12);
const rymers = access('rymers', 16, { type: 'campground', types: ['campground', 'boat_ramp'], isFloatEndpoint: true });
const upstream = access('upstream', 8);
const noLaunch = access('camp-only', 18, { type: 'campground', isFloatEndpoint: false });
const choosing = {
  active: true, riverSlug: 'jacks-fork', step: 'take-out' as const,
  putIn: bach, putInOptions: [upstream, bach, rymers], takeOutOptions: [rymers],
  pin: { id: 'access:rymers', riverSlug: 'jacks-fork' },
};

test('a downstream access represented by a campground or ramp selects the take-out', () => {
  for (const layer of ['access', 'campgrounds', 'boatRamps']) {
    const pin = { ...choosing.pin, layer };
    assert.deepEqual(mapPlanSelection({ ...choosing, pin }), { step: 'take-out', point: rymers });
  }
});

test('upstream, same-mile, non-launch, and missing points cannot be take-outs', () => {
  for (const point of [upstream, bach, access('same-mile', 12), noLaunch]) {
    assert.equal(mapPlanSelection({ ...choosing, takeOutOptions: [point],
      pin: { id: `access:${point.id}`, riverSlug: 'jacks-fork' } }), null);
  }
  assert.equal(mapPlanSelection({ ...choosing, takeOutOptions: [] }), null);
  assert.equal(mapPlanSelection({ ...choosing, putIn: null }), null);
});

test('ordinary browsing and completed plans retain normal place inspection', () => {
  assert.equal(mapPlanSelection({ ...choosing, active: false }), null);
  assert.equal(mapPlanSelection({ ...choosing, step: 'result' }), null);
  for (const id of ['spring:rymers', 'gauge:rymers', 'service:rymers', 'access:missing']) {
    assert.equal(mapPlanSelection({ ...choosing, pin: { ...choosing.pin, id } }), null);
  }
});

test('another river or an unscoped pin cannot be attached to the current plan', () => {
  for (const riverSlug of ['current', null, undefined]) {
    assert.equal(mapPlanSelection({ ...choosing, pin: { ...choosing.pin, riverSlug } }), null);
  }
  assert.equal(mapPlanSelection({ ...choosing, riverSlug: null }), null);
});

test('editing a put-in accepts an upstream launch and still excludes non-launches', () => {
  assert.deepEqual(mapPlanSelection({ ...choosing, step: 'put-in',
    pin: { id: 'access:upstream', riverSlug: 'jacks-fork' } }), { step: 'put-in', point: upstream });
  assert.equal(mapPlanSelection({ ...choosing, step: 'put-in', putInOptions: [noLaunch],
    pin: { id: 'access:camp-only', riverSlug: 'jacks-fork' } }), null);
});

test('older cached access data without an eligibility flag remains selectable', () => {
  const cached = { ...rymers, isFloatEndpoint: undefined };
  assert.deepEqual(mapPlanSelection({ ...choosing, takeOutOptions: [cached] }), { step: 'take-out', point: cached });
});
