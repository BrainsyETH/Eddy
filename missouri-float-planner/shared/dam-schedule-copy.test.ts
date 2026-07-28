import assert from 'node:assert/strict';
import test from 'node:test';
import {
  hourEndingLabel,
  windowLabel,
  idleWindowSentence,
  scheduleDayLabel,
  relativeAge,
  scheduleIsStale,
  retrievalSentence,
  SCHEDULE_STALE_AFTER_MINUTES,
  centralDayKey,
  scheduleHoursElapsed,
  hourEndingNow,
} from './dam-schedule-copy';

test('hour ending names the hour the water starts moving', () => {
  // SWPA's own convention: hour 14 is the release running 1pm-2pm. This is the
  // off-by-one that puts someone in the water an hour early, so it is pinned.
  assert.equal(hourEndingLabel(14), '1 PM');
  assert.equal(hourEndingLabel(1), '12 AM');
  assert.equal(hourEndingLabel(13), '12 PM');
  assert.equal(hourEndingLabel(24), '11 PM');
});

test('midnight is spelled, not printed as 12 AM', () => {
  assert.equal(windowLabel(1, 6), 'midnight – 6 AM');
  assert.equal(windowLabel(7, 24), '6 AM – midnight');
});

test('a full day of generation says so rather than going quiet', () => {
  // An empty window list must not render as absence — "no data" and "the units
  // never stop" are opposite facts for someone deciding whether to wade.
  assert.equal(idleWindowSentence([]), 'Generating every hour — no break in the schedule.');
  assert.equal(idleWindowSentence([{ from: 1, to: 6 }]), 'Water off: midnight – 6 AM');
  assert.equal(
    idleWindowSentence([
      { from: 1, to: 6 },
      { from: 20, to: 24 },
    ]),
    'Water off: midnight – 6 AM, 7 PM – midnight'
  );
});

test('a schedule date is not shifted by the viewer timezone', () => {
  // SWPA days are Central. Parsed as an instant and formatted locally, this
  // would render as the 26th anywhere west of Central.
  assert.equal(scheduleDayLabel('2026-07-27'), 'Mon, Jul 27');
});

test('relative age is coarse past a day', () => {
  const now = Date.parse('2026-07-28T12:00:00Z');
  const ago = (ms: number) => new Date(now - ms).toISOString();

  assert.equal(relativeAge(ago(30_000), now), 'just now');
  assert.equal(relativeAge(ago(12 * 60_000), now), '12 minutes ago');
  assert.equal(relativeAge(ago(90 * 60_000), now), 'an hour ago');
  assert.equal(relativeAge(ago(5 * 3_600_000), now), '5 hours ago');
  assert.equal(relativeAge(ago(30 * 3_600_000), now), 'yesterday');
  assert.equal(relativeAge(ago(72 * 3_600_000), now), '3 days ago');
});

test('a timestamp slightly in the future reads as current, not negative', () => {
  // Our clock and a CDN edge's need not agree to the second, and "in 30
  // seconds" would be nonsense on a freshness line.
  const now = Date.parse('2026-07-28T12:00:00Z');
  assert.equal(relativeAge(new Date(now + 20_000).toISOString(), now), 'just now');
});

test('an unknown retrieval yields nothing at all', () => {
  // The whole point of the null path: absent renders nothing, and must never
  // be substituted with the current time.
  assert.equal(relativeAge(null), null);
  assert.equal(relativeAge(undefined), null);
  assert.equal(relativeAge('not a date'), null);
  assert.equal(retrievalSentence(null), null);
  assert.equal(scheduleIsStale(null), false, 'absent is not stale');
});

test('staleness fires only past the cache windows, not inside them', () => {
  const now = Date.parse('2026-07-28T12:00:00Z');
  const ago = (min: number) => new Date(now - min * 60_000).toISOString();

  // SWPA's edge caches 600s and Eddy revalidates at 1800s; inside that the
  // system is working normally and a warning would be noise.
  assert.equal(scheduleIsStale(ago(SCHEDULE_STALE_AFTER_MINUTES - 1), now), false);
  assert.equal(scheduleIsStale(ago(SCHEDULE_STALE_AFTER_MINUTES + 1), now), true);
});

test('the retrieval line names Eddy as the subject, never SWPA', () => {
  // SWPA publishes no timestamp, so any phrasing that attributes freshness to
  // them is a claim the source never made.
  const now = Date.parse('2026-07-28T12:00:00Z');
  const fresh = retrievalSentence(new Date(now - 12 * 60_000).toISOString(), now);
  assert.equal(fresh, 'Eddy last checked 12 minutes ago.');
  assert.ok(!/updated|posted|SWPA/i.test(fresh!), 'must not imply a publication time');

  const stale = retrievalSentence(new Date(now - 5 * 3_600_000).toISOString(), now);
  assert.equal(stale, 'Eddy last checked 5 hours ago. It may have been revised since.');
});

test('the clock is read at the DAM, not on the phone', () => {
  // 03:30 UTC on the 29th is 22:30 Central on the 28th (CDT, UTC-5). A viewer
  // anywhere in the world asking "what is the water doing" means at the dam, so
  // the schedule day is the 28th and the marker sits at 22.5 hours.
  const night = Date.parse('2026-07-29T03:30:00Z');
  assert.equal(centralDayKey(night), '2026-07-28');
  assert.equal(scheduleHoursElapsed('2026-07-28', night), 22.5);
});

test('only today carries a marker', () => {
  // A three-day schedule renders three identical bar rows. A "now" line on
  // tomorrow's would be a claim about a river at a time that has not happened.
  const noon = Date.parse('2026-07-28T17:00:00Z'); // 12:00 Central
  assert.equal(scheduleHoursElapsed('2026-07-28', noon), 12);
  assert.equal(scheduleHoursElapsed('2026-07-29', noon), null, 'tomorrow gets none');
  assert.equal(scheduleHoursElapsed('2026-07-27', noon), null, 'yesterday gets none');
});

test('the hour running now is SWPA hour-ending, not the wall-clock hour', () => {
  // The off-by-one this whole module exists to pin. At 13:30 Central the water
  // moving is the release posted as hour ending 14 — and hourEndingLabel(14)
  // reads back as "1 PM", which is where the reader started.
  assert.equal(hourEndingNow(13.5), 14);
  assert.equal(hourEndingLabel(hourEndingNow(13.5)), '1 PM');

  // Both ends of the day, where an off-by-one wraps rather than merely shifts.
  assert.equal(hourEndingNow(0), 1, 'the first minute after midnight is hour 1');
  assert.equal(hourEndingNow(23.99), 24, 'the last minute of the day is hour 24');
});

test('centralDayKey survives the DST boundary', () => {
  // 06:30 UTC is 01:30 CDT (UTC-5) in July but 00:30 CST (UTC-6) in January —
  // a fixed offset would put one of them on the wrong calendar day.
  assert.equal(centralDayKey(Date.parse('2026-07-15T06:30:00Z')), '2026-07-15');
  assert.equal(centralDayKey(Date.parse('2026-01-15T06:30:00Z')), '2026-01-15');
  // 05:30 UTC in January is 23:30 CST the previous day.
  assert.equal(centralDayKey(Date.parse('2026-01-15T05:30:00Z')), '2026-01-14');
});
