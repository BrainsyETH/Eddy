import assert from 'node:assert/strict';
import test from 'node:test';
import { launchDistanceLabel, launchDistanceMiles, launchMethodFilterUseful, orderLaunches } from './lake-launch-order';

const launches = [
  { name: 'Indian Point', lat: 36.6306, lon: -93.3497 },
  { name: 'Aunts Creek', lat: 36.6767, lon: -93.4622 },
  { name: 'Table Rock State Park', lat: 36.5811, lon: -93.3075 },
];

test('without a location the server order stands and no distance is claimed', () => {
  const ordered = orderLaunches(launches, null);
  assert.deepEqual(ordered.map((o) => o.launch.name), ['Indian Point', 'Aunts Creek', 'Table Rock State Park']);
  assert.ok(ordered.every((o) => o.miles === undefined));
  assert.deepEqual(orderLaunches(launches, { lat: Number.NaN, lon: -93 }).map((o) => o.launch.name), ['Indian Point', 'Aunts Creek', 'Table Rock State Park'], 'a bad fix must not shuffle the list');
});

test('with a location the list is nearest first, by straight-line miles', () => {
  const branson = { lat: 36.6437, lon: -93.2185 };
  const ordered = orderLaunches(launches, branson);
  assert.deepEqual(ordered.map((o) => o.launch.name), ['Table Rock State Park', 'Indian Point', 'Aunts Creek']);
  assert.ok(ordered[0].miles! < ordered[1].miles! && ordered[1].miles! < ordered[2].miles!);
  // Branson to the state park marina is about 6.5 miles as the crow flies.
  assert.ok(Math.abs(ordered[0].miles! - 6.6) < 0.5, `got ${ordered[0].miles}`);
  assert.equal(launchDistanceMiles(branson, branson), 0);
});

test('the distance label always says straight line', () => {
  assert.equal(launchDistanceLabel(0.4), 'Under 1 mi, straight line');
  assert.equal(launchDistanceLabel(6.54), '6.5 mi, straight line');
  assert.equal(launchDistanceLabel(41.7), '42 mi, straight line');
  assert.equal(launchDistanceLabel(1204.2), '1,204 mi, straight line');
});

test('the method filter shows only when it has two kinds of launch to separate', () => {
  assert.equal(launchMethodFilterUseful([{ launchMethods: ['trailer'] }, { launchMethods: ['trailer'] }]), false);
  assert.equal(launchMethodFilterUseful([{ launchMethods: ['hand'] }]), false);
  assert.equal(launchMethodFilterUseful([{ launchMethods: ['trailer'] }, { launchMethods: ['hand'] }]), true);
  assert.equal(launchMethodFilterUseful([{ launchMethods: ['trailer', 'hand'] }]), true);
  assert.equal(launchMethodFilterUseful([]), false);
});
