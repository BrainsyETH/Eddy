import assert from 'node:assert/strict';
import test from 'node:test';
import { HORIZON_NIGHTS, monthsSpanned, resolveHorizon, resolveWeekend, weekdayOf } from './window';

// August 2026 is the reference month throughout: Aug 7 is a Friday, so Aug 2 is
// a Sunday and Jul 31 is the Friday before. Every instant below is expressed in
// UTC and asserted against the Chicago day it lands on, because the whole point
// of the resolver is that it answers in the user's timezone, not the server's.

/** Noon Chicago on a given date, which is unambiguous under both CST and CDT. */
function chicagoNoon(date: string): Date {
  return new Date(`${date}T17:00:00Z`);
}

test('Monday through Thursday look ahead to the coming Friday', () => {
  for (const day of ['2026-08-03', '2026-08-04', '2026-08-05', '2026-08-06']) {
    const w = resolveWeekend(chicagoNoon(day));
    assert.equal(w.startDate, '2026-08-07', `from ${day}`);
    assert.equal(w.endDate, '2026-08-09', `from ${day}`);
    assert.deepEqual(w.nights, ['2026-08-07', '2026-08-08']);
    assert.equal(w.label, 'Fri–Sun, Aug 7–9');
  }
});

test('Friday shows the weekend starting today', () => {
  const w = resolveWeekend(chicagoNoon('2026-08-07'));
  assert.equal(w.startDate, '2026-08-07');
  assert.equal(w.endDate, '2026-08-09');
  assert.deepEqual(w.nights, ['2026-08-07', '2026-08-08']);
});

test('Saturday shows only the night that is left', () => {
  // Someone checking Saturday morning is still deciding where to sleep, but
  // Friday night is gone and offering it would be nonsense.
  const w = resolveWeekend(chicagoNoon('2026-08-08'));
  assert.equal(w.startDate, '2026-08-08');
  assert.equal(w.endDate, '2026-08-09');
  assert.deepEqual(w.nights, ['2026-08-08']);
  assert.equal(w.label, 'Sat–Sun, Aug 8–9');
});

test('Sunday rolls forward to next weekend rather than offering tonight', () => {
  const w = resolveWeekend(chicagoNoon('2026-08-09'));
  assert.equal(w.startDate, '2026-08-14');
  assert.equal(w.endDate, '2026-08-16');
  assert.equal(weekdayOf(w.startDate), 5, 'must land on a Friday');
});

test('Sunday evening in Chicago is still Sunday, not Monday', () => {
  // 2026-08-10T02:00Z is 21:00 CDT on Sunday the 9th. A resolver that read the
  // UTC date would call it Monday and quietly show a different weekend for the
  // five hours either side of midnight UTC every single night.
  const w = resolveWeekend(new Date('2026-08-10T02:00:00Z'));
  assert.equal(w.startDate, '2026-08-14', 'still Sunday in Chicago');
});

test('Saturday night in Chicago has not become Sunday yet', () => {
  // 2026-08-09T02:00Z is 21:00 CDT on Saturday the 8th: one night left.
  const w = resolveWeekend(new Date('2026-08-09T02:00:00Z'));
  assert.deepEqual(w.nights, ['2026-08-08']);
});

test('early Friday morning UTC is still Thursday in Chicago', () => {
  // 2026-08-07T04:00Z is 23:00 CDT Thursday. Both answers happen to be the
  // Aug 7 weekend, but via different branches, so the nights must still be two.
  const w = resolveWeekend(new Date('2026-08-07T04:00:00Z'));
  assert.equal(w.startDate, '2026-08-07');
  assert.deepEqual(w.nights, ['2026-08-07', '2026-08-08']);
});

test('a weekend crossing month-end is labelled with both months', () => {
  const w = resolveWeekend(chicagoNoon('2026-07-31'));
  assert.equal(w.startDate, '2026-07-31');
  assert.equal(w.endDate, '2026-08-02');
  assert.equal(w.label, 'Fri–Sun, Jul 31–Aug 2');
});

test('monthsSpanned costs one federal request normally and two at month-end', () => {
  assert.deepEqual(monthsSpanned(resolveWeekend(chicagoNoon('2026-08-03'))), ['2026-08-01']);
  assert.deepEqual(monthsSpanned(resolveWeekend(chicagoNoon('2026-07-31'))), [
    '2026-07-01',
    '2026-08-01',
  ]);
});

test('the window is always a valid, forward-moving range', () => {
  // Sweep a full year of Chicago noons: no ordering inversions, no empty
  // windows, never more than two nights, arrival always Fri or Sat.
  const start = Date.UTC(2026, 0, 1, 17);
  for (let i = 0; i < 365; i++) {
    const w = resolveWeekend(new Date(start + i * 86_400_000));
    assert.ok(w.startDate < w.endDate, `${w.startDate} !< ${w.endDate}`);
    assert.ok(w.nights.length >= 1 && w.nights.length <= 2, `${w.nights.length} nights`);
    assert.ok([5, 6].includes(weekdayOf(w.startDate)), `arrival on ${w.startDate}`);
    assert.equal(weekdayOf(w.endDate), 0, `departure on ${w.endDate} is not a Sunday`);
  }
});

test('the resolver survives a DST transition', () => {
  // US DST ends Nov 1 2026, a Sunday — inside a weekend window.
  const w = resolveWeekend(chicagoNoon('2026-10-30'));
  assert.equal(w.startDate, '2026-10-30');
  assert.equal(w.endDate, '2026-11-01');
  assert.deepEqual(w.nights, ['2026-10-30', '2026-10-31']);
});

/* ── The horizon ──────────────────────────────────────────────────────────── */
//
// The stored window, as distinct from the described one. resolveWeekend names a
// stay and needs a stay's label; a horizon is a run of nights starting tonight.

test('the horizon starts tonight and runs the full fortnight', () => {
  const horizon = resolveHorizon(new Date('2026-08-06T17:00:00Z'));
  assert.equal(horizon.startDate, '2026-08-06');
  assert.equal(horizon.nights.length, HORIZON_NIGHTS);
  assert.equal(horizon.nights[0], '2026-08-06');
  assert.equal(horizon.nights.at(-1), '2026-08-19');
  assert.equal(horizon.endDate, '2026-08-20');
});

test('the horizon always contains the weekend a card describes', () => {
  // The one relationship the whole feature rests on: ONE fetch serves both the
  // strip and the sentence. The furthest resolveWeekend ever reaches is a
  // Sunday looking to the following Friday, five days out.
  for (let day = 0; day < 365; day++) {
    const now = new Date(Date.UTC(2026, 0, 1, 17, 0) + day * 86_400_000);
    const horizon = new Set(resolveHorizon(now).nights);
    for (const night of resolveWeekend(now).nights) {
      assert.ok(horizon.has(night), `${night} fell outside the horizon on day ${day}`);
    }
  }
});

test('a fortnight never costs three month payloads', () => {
  // Reaching a third month would take a window longer than the shortest month.
  // The budget in sync.ts is sized on this holding.
  const seen = new Set<number>();
  for (let day = 0; day < 365; day++) {
    const now = new Date(Date.UTC(2026, 0, 1, 17, 0) + day * 86_400_000);
    seen.add(monthsSpanned(resolveHorizon(now)).length);
  }
  assert.deepEqual([...seen].sort(), [1, 2]);
});

test('the horizon label does not pretend to be a stay', () => {
  // `Thu–Thu, Aug 6–20` would read as a nineteen-night booking.
  const horizon = resolveHorizon(new Date('2026-08-06T17:00:00Z'));
  assert.equal(horizon.label, 'Aug 6–20');
  assert.ok(!horizon.label.includes('–Thu'));
});

test('the horizon survives a DST transition', () => {
  // Nov 1 2026 is the fall-back Sunday. A horizon crossing it must still be
  // fourteen distinct, consecutive, ascending dates.
  const horizon = resolveHorizon(new Date('2026-10-28T17:00:00Z'));
  assert.equal(new Set(horizon.nights).size, HORIZON_NIGHTS);
  assert.deepEqual(horizon.nights, [...horizon.nights].sort());
  assert.ok(horizon.nights.includes('2026-11-01'));
});
