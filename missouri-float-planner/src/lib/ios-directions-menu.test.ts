import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  directionsChoices, driveBetweenUrl, installedDirectionsChoices, openDirectionsChoice,
} from '../../../eddy-ios/src/lib/directionsChoices';

const point = {
  name: 'Test access', coordinates: { lat: 37.3, lng: -91.5 },
  drivingLat: 37.31, drivingLng: -91.51,
};

test('driving and outdoor handoffs preserve the curated coordinate pair', () => {
  const choices = directionsChoices(point);
  for (const choice of choices) {
    const url = new URL(choice.deepLink);
    if (choice.group === 'Outdoor maps') {
      assert.equal(url.searchParams.get('lat'), '37.31');
      assert.equal(url.searchParams.get('lon'), '-91.51');
      assert.equal(url.searchParams.has('daddr'), false);
    } else {
      assert.equal(url.searchParams.get(choice.app === 'waze' ? 'll' : 'daddr'), '37.31,-91.51');
    }
  }
  assert.equal(new URL(choices.find((choice) => choice.app === 'google')!.deepLink).searchParams.get('directionsmode'), 'driving');
  assert.equal(new URL(choices.find((choice) => choice.app === 'waze')!.deepLink).searchParams.get('navigate'), 'yes');
});

test('an incomplete driving override never mixes parking and river coordinates', () => {
  for (const partial of [{ drivingLng: null }, { drivingLat: null }]) {
    const apple = directionsChoices({ ...point, ...partial })[0];
    assert.equal(new URL(apple.deepLink).searchParams.get('daddr'), '37.3,-91.5');
  }
});

test('only installed alternatives appear and failed probes do not remove Apple Maps', async () => {
  const probed: string[] = [];
  const choices = await installedDirectionsChoices(point, async (url) => {
    probed.push(url);
    if (url === 'onxoffroad://') throw new Error('Unavailable scheme');
    return url === 'gaiagps://' || url === 'waze://';
  });
  assert.deepEqual(choices.map((choice) => [choice.label, choice.group]), [
    ['Apple Maps', 'Driving directions'], ['Waze', 'Driving directions'], ['Gaia GPS', 'Outdoor maps'],
  ]);
  assert.deepEqual(new Set(probed), new Set(['comgooglemaps://', 'waze://', 'onxoffroad://', 'gaiagps://']));
  assert.deepEqual((await installedDirectionsChoices(point, async () => false)).map((choice) => choice.app), ['apple']);
});

test('a subsequent opening discovers an app installed since the previous opening', async () => {
  assert.equal((await installedDirectionsChoices(point, async () => false)).length, 1);
  assert.equal((await installedDirectionsChoices(point, async () => true)).length, 5);
});

test('every probed iOS scheme is declared in the native configuration', () => {
  const config = JSON.parse(readFileSync(new URL('../../../eddy-ios/app.json', import.meta.url), 'utf8'));
  for (const choice of directionsChoices(point)) {
    if (choice.scheme) assert.ok(config.expo.ios.infoPlist.LSApplicationQueriesSchemes.includes(choice.scheme), choice.scheme);
  }
});

test('a removed app falls back to its web destination; two failures remain visible to the caller', async () => {
  const choice = directionsChoices(point).find((row) => row.app === 'gaia')!;
  const opened: string[] = [];
  await openDirectionsChoice(choice, async (url) => {
    opened.push(url);
    if (url === choice.deepLink) throw new Error('App removed');
  });
  assert.deepEqual(opened, [choice.deepLink, choice.webFallback]);
  await assert.rejects(openDirectionsChoice(choice, async () => { throw new Error('Cannot open URL'); }), /Cannot open URL/);
});

test('a successful native open does not open a second URL', async () => {
  const opened: string[] = [];
  const choice = directionsChoices(point).find((row) => row.app === 'onx')!;
  await openDirectionsChoice(choice, async (url) => { opened.push(url); });
  assert.deepEqual(opened, [choice.deepLink]);
});

test('the shuttle still runs from take-out to put-in with both destinations intact', () => {
  const takeOut = { name: 'Take-out', coordinates: { lat: 37.2, lng: -91.4 } };
  const url = new URL(driveBetweenUrl(takeOut, point));
  assert.equal(url.searchParams.get('saddr'), '37.2,-91.4');
  assert.equal(url.searchParams.get('daddr'), '37.31,-91.51');
  assert.equal(url.searchParams.get('dirflg'), 'd');
});
