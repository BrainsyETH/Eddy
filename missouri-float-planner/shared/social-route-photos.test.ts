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

test('preflight preserves small and failed thumbnails but removes backdrop duplicates', async () => {
  const points = [point('good', 0.2, 'https://photos.test/good.jpg'),
    point('small', 0.3, 'https://photos.test/small.jpg'), point('missing', 0.4),
    { ...point('bad', 0.5, 'https://photos.test/bad.jpg'), photoCredit: 'Photo: Park Service' },
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
  assert.equal(resolved[3].photoUrl, points[3].photoUrl);
  assert.equal(resolved[3].photoCredit, points[3].photoCredit);
  assert.equal(resolved[4].photoUrl, undefined);
  assert.equal(resolved[5].photoUrl, undefined, 'duplicate endpoint thumbnails are omitted too');
  assert.equal(loaded.length, 3, 'endpoints and duplicate backdrop need no preflight');
  assert.equal(journeyDuration(intermediateRouteStops(resolved)) - journeyDuration(intermediateRouteStops(points)), 30);
});

test('a preflight timeout preserves the thumbnail and compact timing for later stops', async () => {
  const points = [{ ...point('slow', 0.25, 'https://photos.test/slow.jpg'),
    photoCredit: 'Photo: Photographer', photoReveal: true }, point('next', 0.7)];
  const resolved = await resolveRoutePhotos(points, undefined, async () => { throw new Error('Photo decode timed out'); });
  assert.deepEqual(resolved[0], { ...points[0], photoReveal: false });
  const compact = intermediateRouteStops(points.map(p => ({ ...p, photoReveal: false })));
  assert.deepEqual(journeySchedule(intermediateRouteStops(resolved)), journeySchedule(compact));
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


test('photo eligibility follows the export width and the taller displayed crop', async () => {
  const source = { width: 840, height: 500 };
  assert.equal(usableRoutePhoto(source, 800), true);
  assert.equal(usableRoutePhoto(source, 860), false);
  assert.equal(usableRoutePhoto({ width: 1200, height: 300 }, 800), false);
  const points = [point('landing', 0.5, 'landing.jpg')];
  assert.equal((await resolveRoutePhotos(points, undefined, async () => source, 800))[0].photoReveal, true);
  const wider = await resolveRoutePhotos(points, undefined, async () => source, 960);
  assert.equal(wider[0].photoReveal, true, 'a wider export must not lose a usable place photo');
  assert.equal(wider[0].photoRenderWidth, 840 / 1.04, 'photo stays within its decoded resolution at final zoom');
  assert.equal(wider[0].photoUrl, 'landing.jpg');
});
