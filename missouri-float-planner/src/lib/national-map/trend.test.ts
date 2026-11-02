import assert from 'node:assert/strict';
import test from 'node:test';
import { FLOOD_CODE } from './flood-status';
import { buildFrame } from './frame';
import { floodTrendPoint, hourlyPicks, trendFlooding, trendPointFromFrame } from './trend';

const T = Date.parse('2026-11-03T12:00:00Z');
const H = 3_600_000;
const row = (code: number, ageH: number) => ['LID', -90, 38, code, Math.floor((T - ageH * H) / 1000), 3, 'ft', 0, null, null, null, ''];

test('counts current NWS observations by flood category, as the map does', () => {
  const p = floodTrendPoint(T, true, [
    row(FLOOD_CODE.major, 1),
    row(FLOOD_CODE.moderate, 1),
    row(FLOOD_CODE.minor, 1),
    row(FLOOD_CODE.minor, 1),
    row(FLOOD_CODE.action, 1),
    row(FLOOD_CODE.no_flooding, 1),
    row(FLOOD_CODE.major, 7), // older than 6 h at capture: not current, not counted
    [...row(FLOOD_CODE.minor, 0).slice(0, 4), null, ...row(FLOOD_CODE.minor, 0).slice(5)], // no time: counted, as the map does
  ]);
  assert.deepEqual({ major: p.major, moderate: p.moderate, minor: p.minor, action: p.action }, { major: 1, moderate: 1, minor: 3, action: 1 });
  assert.equal(trendFlooding(p), 5);
});

test('a capture whose NOAA read failed is a gap, never zero flooding', () => {
  const p = floodTrendPoint(T, false, []);
  assert.equal(p.ok, false);
  assert.equal(floodTrendPoint(T, true, null).ok, false);
});

test('one capture per hour, the newest in each hour, ending at the newest capture', () => {
  const times = [];
  for (let m = 0; m <= 30 * 60; m += 15) times.push(T - m * 60_000);
  const picks = hourlyPicks(times, 24);
  assert.equal(picks.length, 24);
  assert.equal(picks[picks.length - 1], T, 'the newest bar is the current frame');
  for (let i = 1; i < picks.length; i++) assert.equal(picks[i] - picks[i - 1], H);
  assert.deepEqual(hourlyPicks([]), []);
  assert.equal(hourlyPicks([T, T - 10 * 60_000]).length, 1, 'two captures in one hour make one bar');
});

test('the recorder stores the count in each frame, and the trend reads it back', () => {
  const nws = (lid: string, observed: 'major' | 'minor' | 'action' | 'no_flooding', ageH: number) => ({
    lid, lng: -90, lat: 38, observed, observedAt: Math.floor((T - ageH * H) / 1000), observedValue: 3, units: 'ft',
    forecast: 'unknown' as const, forecastValidAt: null, forecastIssuedAt: null, name: lid,
  });
  const frame = buildFrame({
    capturedAt: new Date(T),
    latest: [],
    nws: [nws('A1', 'major', 1), nws('B1', 'minor', 1), nws('C1', 'action', 1), nws('D1', 'no_flooding', 1), nws('E1', 'major', 8)],
    lidToSite: new Map(),
    noaaOk: true,
  });
  assert.deepEqual(frame.fc, [1, 0, 1, 1]);
  const p = trendPointFromFrame(T, true, JSON.parse(JSON.stringify(frame)).fc);
  assert.deepEqual(p, { t: T, ok: true, major: 1, moderate: 0, minor: 1, action: 1 });

  const out = buildFrame({ capturedAt: new Date(T), latest: [], nws: [], lidToSite: new Map(), noaaOk: false });
  assert.equal(out.fc, undefined, 'no count is stored when NOAA could not be read');
  assert.equal(trendPointFromFrame(T, false, undefined)?.ok, false, 'that capture is a gap');
  assert.equal(trendPointFromFrame(T, true, undefined), null, 'a frame from before the count existed is left out, not zero');
  assert.equal(trendPointFromFrame(T, true, [1, 2, 'x', 0]), null);
});
