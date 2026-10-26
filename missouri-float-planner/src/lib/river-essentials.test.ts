import assert from 'node:assert/strict';
import test from 'node:test';
import { floatMapChoices, floatTapRect } from '../../../eddy-ios/src/lib/floatMapSelection';
import { createPickupContactStore, normalizePickupContact, PICKUP_CONTACT_KEY } from '../../../eddy-ios/src/lib/pickupContactCore';
import { createFloatMapFocusStore } from '../../../eddy-ios/src/lib/floatMapFocus';

test('map focus is consumed once and a stale consumer cannot clear the next request', () => {
  const store = createFloatMapFocusStore();
  const target = { sessionId: 'float-1', point: [-91, 37] as [number, number], title: 'Take-out', detail: 'Landing' };
  const first = store.request(target);
  assert.equal(store.consume(first.id), first);
  assert.equal(store.snapshot(), null, 'A remounted map must not replay the old request');
  assert.equal(store.consume(first.id), null, 'A repeated effect must not apply it again');
  const second = store.request(target);
  assert.notEqual(second.id, first.id, 'Requesting the same place again is a new command');
  assert.equal(store.consume(first.id), null);
  assert.equal(store.snapshot(), second);
  assert.equal(store.consume(second.id), second);
  assert.equal(store.snapshot(), null);
});

test('map selection queries a 56-point square and deduplicates both layers with endpoints first', () => {
  assert.deepEqual(floatTapRect(100, 200), [172, 72, 228, 128]);
  const point = (id: string, end?: string) => ({ properties: { id, title: id, sub: 'Mapped access', end }, geometry: { coordinates: [-91, 37] } });
  const choices = floatMapChoices([point('access'), point('take-out', 'take-out'), point('take-out', 'take-out'), point('start', 'start')]);
  assert.equal(choices.length, 3);
  assert.deepEqual(choices.map(c => c.endpoint), [true, true, false]);
  assert.deepEqual(floatMapChoices([{ properties: { title: 'invalid' }, geometry: { coordinates: [NaN, 37] } }]), []);
});

test('contact accepts telephone formatting but rejects URL commands and short numbers', () => {
  assert.deepEqual(normalizePickupContact({ name: ' Pat ', phone: '+1 (555) 123-4567' }), { name: 'Pat', phone: '+15551234567' });
  for (const phone of ['123', 'tel:1234567890', '1234567890&body=secret', '*1234567#']) assert.equal(normalizePickupContact({ name: '', phone }), null);
});

test('account deletion clears an in-flight contact write and rejects a stale editor', async () => {
  const data = new Map<string, string>();
  let release!: () => void;
  let writing!: () => void;
  const started = new Promise<void>(resolve => { writing = resolve; });
  const store = createPickupContactStore({
    async getItem(key) { return data.get(key) ?? null; },
    async setItem(key, value) { writing(); await new Promise<void>(resolve => { release = resolve; }); data.set(key, value); },
    async removeItem(key) { data.delete(key); },
  });
  const revision = store.revision();
  const pending = store.save({ name: 'Pat', phone: '5551234567' }, revision);
  await started;
  const clearing = store.clear();
  release();
  await Promise.all([pending, clearing]);
  assert.equal(data.has(PICKUP_CONTACT_KEY), false);
  await assert.rejects(store.save({ name: 'Pat', phone: '5551234567' }, revision));
  assert.equal(await store.read(), null);
});
