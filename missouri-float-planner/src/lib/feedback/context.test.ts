import test from 'node:test';
import assert from 'node:assert/strict';
import { contextFacts, contextLinks, PHOTO_CONTEXT_KEYS, type ContextLookups } from './context';

const riverId = '9b2f3c4d-1111-4222-8333-444455556666';
const pointId = '11111111-2222-4333-8444-555555555555';
const lookups: ContextLookups = {
  rivers: new Map([[riverId, { name: 'Current River', slug: 'current', state: 'MO' }]]),
  accessPoints: new Map([
    [pointId, { name: 'Akers Ferry', slug: 'akers-ferry', riverSlug: 'current', riverState: 'MO' }],
  ]),
};

test('context links point at the public page or the admin editor', () => {
  assert.deepEqual(contextLinks({ contextType: 'river', contextId: riverId }, lookups), [
    { label: 'Current River page', href: '/rivers/missouri/current', external: true },
  ]);
  assert.deepEqual(contextLinks({ contextType: 'access_point', contextId: pointId }, lookups), [
    { label: 'Edit Akers Ferry', href: `/admin/access-points/${pointId}`, external: false },
    { label: 'Public page', href: '/rivers/missouri/current/access/akers-ferry', external: true },
  ]);
  assert.deepEqual(contextLinks({ contextType: 'gauge', contextId: '07067000' }, lookups), [
    { label: 'Gauge 07067000', href: '/gauges/07067000', external: true },
  ]);
});

test('unknown or malformed context ids produce no link', () => {
  assert.deepEqual(contextLinks({ contextType: 'river', contextId: pointId }, lookups), []);
  assert.deepEqual(contextLinks({ contextType: 'gauge', contextId: '../admin' }, lookups), []);
  assert.deepEqual(contextLinks({ contextType: 'access_point', contextId: 'x' }, lookups), []);
  assert.deepEqual(contextLinks({ contextType: 'general', contextId: null }, lookups), []);
});

test('known context keys read as facts, in a fixed order', () => {
  const facts = contextFacts({
    conditionCode: 'good',
    gaugeHeightFt: 3.2,
    dischargeCfs: 450.4,
    readingTimestamp: '2026-07-04T19:10:00Z',
    riverName: 'Current River',
    riverMile: 12.34,
    unrelated: { nested: true },
  });
  assert.deepEqual(
    facts.map((f) => f.label),
    ['River', 'River mile', 'Reading they saw', 'Condition shown', 'Reading time'],
  );
  assert.equal(facts.find((f) => f.label === 'Reading they saw')!.value, '3.2 ft · 450 cfs');
  assert.equal(facts.find((f) => f.label === 'River mile')!.value, '12.3');
  assert.match(facts.find((f) => f.label === 'Reading time')!.value, /Jul 4, 2026, 2:10\sPM CDT/);
});

test('wrong-typed values are ignored and photo keys are left to the photo panel', () => {
  assert.deepEqual(contextFacts({ gaugeHeightFt: '3.2', riverMile: null, readingTimestamp: 'soon' }), []);
  assert.deepEqual(contextFacts({ accessPointName: 'Akers Ferry' }, PHOTO_CONTEXT_KEYS), []);
  assert.deepEqual(contextFacts(null), []);
});
