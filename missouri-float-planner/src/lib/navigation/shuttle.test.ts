import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shuttleDriveLinks, shuttleLeg } from './shuttle';
import { drivingPair } from '../offline/shapes';

const putIn = { name: 'Cedargrove', coordinates: { lat: 37.4229, lng: -91.6088 } };
const takeOut = { name: 'Pulltite', coordinates: { lat: 37.3343, lng: -91.4766 } };

function params(url: string): URLSearchParams {
  return new URL(url).searchParams;
}

test('the shuttle runs take-out → put-in, as iOS and /api/shuttle do', () => {
  const { from, to } = shuttleLeg({ putIn, takeOut });
  assert.equal(from, takeOut);
  assert.equal(to, putIn);

  const { google, apple } = shuttleDriveLinks(from, to);
  assert.equal(params(google).get('origin'), '37.3343,-91.4766');
  assert.equal(params(google).get('destination'), '37.4229,-91.6088');
  assert.equal(params(google).get('travelmode'), 'driving');
  assert.equal(params(apple).get('saddr'), '37.3343,-91.4766');
  assert.equal(params(apple).get('daddr'), '37.4229,-91.6088');
  assert.equal(params(apple).get('dirflg'), 'd');
});

test('curated parking coordinates win over the waterline point', () => {
  const parked = { ...takeOut, drivingLat: 37.3401, drivingLng: -91.4702 };
  const { google, apple } = shuttleDriveLinks(parked, putIn);
  assert.equal(params(google).get('origin'), '37.3401,-91.4702');
  assert.equal(params(apple).get('saddr'), '37.3401,-91.4702');
});

test('links route to coordinates, never to a free-text place name', () => {
  const named = { ...putIn, directionsOverride: 'Cedar Grove Campground, MO' };
  const { google, apple } = shuttleDriveLinks(takeOut, named);
  assert.ok(!google.includes('Cedar'));
  assert.ok(!apple.includes('Cedar'));
});

test('the serializer carries a parking pair only when both halves are present', () => {
  assert.deepEqual(drivingPair({ driving_lat: '37.34', driving_lng: '-91.47' }), { drivingLat: 37.34, drivingLng: -91.47 });
  assert.deepEqual(drivingPair({ driving_lat: 37.34, driving_lng: null }), { drivingLat: null, drivingLng: null });
  assert.deepEqual(drivingPair({}), { drivingLat: null, drivingLng: null });
});
