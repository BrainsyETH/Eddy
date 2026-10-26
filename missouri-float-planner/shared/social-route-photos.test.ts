import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveRoutePhotos, routePhotoIdentity, usableRoutePhoto } from './social-route-photos';
import { arrivalFrame, intermediateRouteStops, journeyDuration, journeySchedule, journeyState, type SocialRoutePoint } from './social-route-journey';

const point = (id: string, progress: number, photoUrl?: string): SocialRoutePoint => ({
  id, progress, photoUrl, name: id, kind: 'poi', riverMile: progress * 10,
});

test('photo dimensions cover the actual crop including the 4% zoom', () => {
  assert.ok(usableRoutePhoto({ width: 840, height: 723 }));
  assert.ok(!usableRoutePhoto({ width: 690, height: 500 }));
  assert.ok(!usableRoutePhoto({ width: 2000, height: 220 }));
  assert.ok(!usableRoutePhoto({ width: NaN, height: 1000 }));
});

test('preflight preserves small thumbnails but removes failed photos and backdrop duplicates', async () => {
  const points = [point('good', 0.2, 'https://photos.test/good.jpg'),
    point('small', 0.3, 'https://photos.test/small.jpg'), point('missing', 0.4),
    point('bad', 0.5, 'https://photos.test/bad.jpg'),
    point('duplicate', 0.6, 'https://photos.test/backdrop.jpg?w=1000'),
    { ...point('start', 0, 'https://photos.test/backdrop.jpg?w=130'), kind: 'put_in' as const },
    { ...point('finish', 1, 'https://photos.test/finish.jpg'), kind: 'take_out' as const }];
  const loaded: string[] = [];
  const resolved = await resolveRoutePhotos(points, 'https://photos.test/backdrop.jpg?w=2000', async src => {
    loaded.push(src);
    if (src.includes('bad')) throw new Error('404');
    return { width: src.includes('small') ? 200 : 1200, height: 800 };
  });
  assert.deepEqual(resolved.map(p => p.photoReveal), [true, false, false, false, false, false, false]);
  assert.equal(resolved[1].photoUrl, points[1].photoUrl);
  assert.equal(resolved[3].photoUrl, undefined);
  assert.equal(resolved[4].photoUrl, undefined);
  assert.equal(resolved[5].photoUrl, undefined, 'duplicate endpoint thumbnails are omitted too');
  assert.equal(loaded.length, 3, 'endpoints and duplicate backdrop need no preflight');
  assert.equal(journeyDuration(intermediateRouteStops(resolved)) - journeyDuration(intermediateRouteStops(points)), 30);
});

test('duplicate decoding is shared and stale eligibility is never trusted', async () => {
  let calls = 0;
  const resolved = await resolveRoutePhotos([
    { ...point('one', 0.2, 'same.jpg'), photoReveal: true }, point('two', 0.7, 'same.jpg'),
  ], undefined, async () => { calls++; return { width: 100, height: 100 }; });
  assert.equal(calls, 1);
  assert.deepEqual(resolved.map(p => p.photoReveal), [false, false]);
  assert.equal(routePhotoIdentity('/_next/image?url=https%3A%2F%2Fphotos.test%2Fx.jpg&w=800&q=75'), routePhotoIdentity('https://photos.test/x.jpg'));
  assert.notEqual(routePhotoIdentity('https://photos.test/image?id=1'), routePhotoIdentity('https://photos.test/image?id=2'));
});

test('mixed and adjacent photo stops share exact arrival, fades and composition duration', () => {
  // Near-adjacent stops exercise per-leg rounding, including a one-frame leg.
  const points = [point('start', 0), { ...point('a', 0.333), photoReveal: true },
    { ...point('b', 0.334), photoReveal: true }, point('c', 0.81), point('finish', 1)];
  const stops = intermediateRouteStops(points);
  const schedule = journeySchedule(stops);
  assert.deepEqual(schedule.stops.map(s => s.departure - s.arrival), [90, 90, 60]);
  for (const [index, stop] of schedule.stops.entries()) {
    assert.equal(journeyState(stop.arrival - 1, stops).activeStop, null);
    assert.equal(journeyState(stop.arrival, stops).activeStop, index);
    assert.equal(journeyState(stop.arrival, stops).calloutProgress, 0);
    assert.equal(journeyState(stop.arrival + stop.fade, stops).calloutProgress, 1);
    assert.equal(journeyState(stop.departure - stop.fade, stops).calloutProgress, 1);
    assert.equal(journeyState(stop.departure, stops).activeStop, null);
  }
  const arrival = arrivalFrame(stops);
  assert.equal(journeyState(arrival - 1, stops).complete, false);
  assert.equal(journeyState(arrival, stops).complete, true);
  assert.equal(journeyDuration(stops), arrival + 90);
  assert.equal(journeyDuration(stops, undefined, true), arrival + 54 + 90);
  assert.equal(journeyDuration(stops) - journeyDuration(intermediateRouteStops(points.map(p => ({ ...p, photoReveal: false })))), 60);
});
