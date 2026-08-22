import assert from 'node:assert/strict';
import test from 'node:test';
import { buildForecastWindows, FORECAST_HORIZON_HOURS } from '@/lib/data/dam-forecast';

// The fixed "now" every case is judged against: 2026-08-15T12:30:00Z, half
// past the hour on purpose — the hour running (12:00-13:00, stamped 13:00)
// must survive the slice while the completed hour (stamped 12:00) must not.
const NOW = Date.parse('2026-08-15T12:30:00Z');
const HOUR = 3_600_000;

/** Hourly points stamped at consecutive hour-ENDS starting at `firstEnd`. */
function points(firstEndIso: string, values: number[]) {
  const firstEnd = Date.parse(firstEndIso);
  return values.map((value, i) => ({ timestamp: firstEnd + i * HOUR, value }));
}

const FLOOR = 100;

test('a point stamped t covers the hour ENDING at t', () => {
  // Period-ending, verified against Wolf Creek's instantaneous tailwater
  // stage on 2026-08-15 — see the module header. Getting this backwards
  // shifts every stop an hour early, which is the direction that puts
  // somebody in the water while the units still run.
  const [w] = buildForecastWindows(points('2026-08-15T14:00:00Z', [5_000]), FLOOR, NOW);
  assert.equal(w.startUtc, '2026-08-15T13:00:00.000Z');
  assert.equal(w.endUtc, '2026-08-15T14:00:00.000Z');
});

test('the past is sliced off; the hour currently running survives', () => {
  // Stamps 12:00 (covers 11-12, fully past) and 13:00 (covers 12-13, running).
  const windows = buildForecastWindows(
    points('2026-08-15T12:00:00Z', [5_000, 5_000]),
    FLOOR,
    NOW
  );
  assert.equal(windows.length, 1);
  assert.equal(windows[0].startUtc, '2026-08-15T12:00:00.000Z');
  assert.equal(windows[0].endUtc, '2026-08-15T13:00:00.000Z');
});

test('contiguous same-state hours merge, and the peak is the max rounded to 10', () => {
  const windows = buildForecastWindows(
    points('2026-08-15T13:00:00Z', [3_857.143, 7_714.286, 15_720.000000132788]),
    FLOOR,
    NOW
  );
  assert.equal(windows.length, 1);
  assert.equal(windows[0].generating, true);
  assert.equal(windows[0].peakCfs, 15_720);
  assert.equal(windows[0].endUtc, '2026-08-15T15:00:00.000Z');
});

test('state flips split windows, and idle windows carry no peak', () => {
  const windows = buildForecastWindows(
    points('2026-08-15T13:00:00Z', [15_000, 0, 0, 15_000]),
    FLOOR,
    NOW
  );
  assert.deepEqual(
    windows.map((w) => w.generating),
    [true, false, true]
  );
  assert.equal(windows[1].peakCfs, null, 'an idle window must not carry a peak');
  assert.equal(windows[1].startUtc, windows[0].endUtc, 'flip boundaries are shared instants');
});

test('the floor decides on/off exactly as the observed chip does', () => {
  // `> floor`, not `>=`: generationOnCfs is "at or below counts as off", and
  // the forecast must not disagree with the hero about what running means.
  // 25-50 cfs units-off noise was measured at Center Hill and Dale Hollow.
  const windows = buildForecastWindows(
    points('2026-08-15T13:00:00Z', [100, 101]),
    FLOOR,
    NOW
  );
  assert.deepEqual(
    windows.map((w) => w.generating),
    [false, true]
  );
});

test('a gap in the source is a gap in the windows', () => {
  // Two idle stretches separated by a missing hour must stay TWO windows:
  // bridging them would claim the forecast covers an hour it says nothing
  // about.
  // Stamps 13:00 and 15:00 cover [12:00,13:00) and [14:00,15:00) — the hour
  // [13:00,14:00) is unforecast and must stay open between the two windows.
  const withGap = [
    ...points('2026-08-15T13:00:00Z', [0]),
    ...points('2026-08-15T15:00:00Z', [0]),
  ];
  const windows = buildForecastWindows(withGap, FLOOR, NOW);
  assert.equal(windows.length, 2);
  assert.equal(windows[0].endUtc, '2026-08-15T13:00:00.000Z');
  assert.equal(windows[1].startUtc, '2026-08-15T14:00:00.000Z');
  assert.notEqual(windows[0].endUtc, windows[1].startUtc, 'the gap must stay open');
});

test('the horizon caps how far forward the wire carries', () => {
  const farOut = points(
    new Date(NOW + (FORECAST_HORIZON_HOURS + 3) * HOUR).toISOString(),
    [5_000]
  );
  assert.deepEqual(buildForecastWindows(farOut, FLOOR, NOW), []);
});

test('duplicate stamps and junk values cannot corrupt a window', () => {
  const messy = [
    { timestamp: Date.parse('2026-08-15T13:00:00Z'), value: 5_000 },
    { timestamp: Date.parse('2026-08-15T13:00:00Z'), value: 9_999 }, // dupe, dropped
    { timestamp: Date.parse('2026-08-15T14:00:00Z'), value: Number.NaN }, // dropped
    { timestamp: Date.parse('2026-08-15T15:00:00Z'), value: -50 }, // dropped
  ];
  const windows = buildForecastWindows(messy, FLOOR, NOW);
  assert.equal(windows.length, 1);
  assert.equal(windows[0].peakCfs, 5_000);
});

test('no points, no windows', () => {
  assert.deepEqual(buildForecastWindows([], FLOOR, NOW), []);
});
