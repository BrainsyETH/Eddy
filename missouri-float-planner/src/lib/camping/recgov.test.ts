import assert from 'node:assert/strict';
import test from 'node:test';
import { fetchWindow, foldNight, parseMonth } from './recgov';
import { summarizeWindow, type FacilityLink } from './types';
import { createLimiter } from './limiter';
import { resolveWeekend } from './window';

// Fixture shapes are transcribed from live responses captured while designing
// this: Red Bluff 232391 (walk-up sites), Alley Spring 234046 (seasonal
// closures), Pulltite 234357 (closes Sunday), and an Aug-2027 probe that came
// back entirely NYR.

const cell = (counts: Partial<Record<string, number>>): string[] =>
  Object.entries(counts).flatMap(([status, n]) => Array.from({ length: n ?? 0 }, () => status));

test('Available counts as open and reservable', () => {
  const out = foldNight(cell({ Available: 8, Reserved: 3 }) as never);
  assert.deepEqual(out, { sitesOpen: 8, sitesReservable: 11, status: 'open' });
});

test('walk-up sites are excluded from the denominator', () => {
  // Red Bluff lists 62 sites, 8 of them 'Not Reservable' every single day.
  // Reporting 54 as the denominator is the whole point.
  const out = foldNight(cell({ Available: 44, Reserved: 10, 'Not Reservable': 8 }) as never);
  assert.equal(out.sitesReservable, 54, 'walk-ups must not inflate the total');
  assert.equal(out.sitesOpen, 44);
});

test('a night with no free sites is full, not closed', () => {
  const out = foldNight(cell({ Reserved: 54 }) as never);
  assert.deepEqual(out, { sitesOpen: 0, sitesReservable: 54, status: 'full' });
});

test('a wholly closed night is closed, not fully booked', () => {
  // The distinction users feel: "closed for the season" tells you to go
  // elsewhere, "fully booked" tells you to keep refreshing for a cancellation.
  const out = foldNight(cell({ Closed: 56 }) as never);
  assert.equal(out.status, 'closed');
  assert.equal(out.sitesReservable, 0);
});

test('a partly closed night still reports its bookable sites', () => {
  // Pulltite on a Sunday: 49 of 56 closed, a handful still bookable.
  const out = foldNight(cell({ Closed: 49, Available: 3, Reserved: 4 }) as never);
  assert.equal(out.status, 'open');
  assert.deepEqual([out.sitesOpen, out.sitesReservable], [3, 7]);
});

test('a wholly unreleased night is not_yet_released', () => {
  const out = foldNight(cell({ NYR: 62 }) as never);
  assert.equal(out.status, 'not_yet_released');
});

test('an empty night degrades to full rather than throwing', () => {
  assert.equal(foldNight([]).status, 'full');
});

test('parseMonth groups every site by night', () => {
  const parsed = parseMonth({
    campsites: {
      a: {
        campsite_id: 'a',
        availabilities: {
          '2026-08-07T00:00:00Z': 'Available',
          '2026-08-08T00:00:00Z': 'Reserved',
        },
      },
      b: {
        campsite_id: 'b',
        availabilities: {
          '2026-08-07T00:00:00Z': 'Reserved',
          '2026-08-08T00:00:00Z': 'Reserved',
        },
      },
      walkup: {
        campsite_id: 'walkup',
        availabilities: {
          '2026-08-07T00:00:00Z': 'Not Reservable',
          '2026-08-08T00:00:00Z': 'Not Reservable',
        },
      },
    },
  });

  assert.deepEqual(parsed.get('2026-08-07'), {
    sitesOpen: 1,
    sitesReservable: 2,
    status: 'open',
  });
  assert.deepEqual(parsed.get('2026-08-08'), {
    sitesOpen: 0,
    sitesReservable: 2,
    status: 'full',
  });
});

test('parseMonth tolerates a payload with no campsites', () => {
  assert.equal(parseMonth({ campsites: {} }).size, 0);
});

// ── Window folding ─────────────────────────────────────────────────────────

test('a window reports the sites open for every night, not the best night', () => {
  // 8 sites free Friday but only 3 of them still free Saturday means you can
  // book 3 for the weekend. Averaging or taking the max would oversell it.
  const out = summarizeWindow([
    { date: '2026-08-07', sitesOpen: 8, sitesReservable: 54, status: 'open' },
    { date: '2026-08-08', sitesOpen: 3, sitesReservable: 54, status: 'open' },
  ]);
  assert.deepEqual(out, { sitesOpen: 3, sitesReservable: 54, status: 'open' });
});

test('a window closed every night is closed', () => {
  const out = summarizeWindow([
    { date: '2026-08-07', sitesOpen: 0, sitesReservable: 0, status: 'closed' },
    { date: '2026-08-08', sitesOpen: 0, sitesReservable: 0, status: 'closed' },
  ]);
  assert.equal(out?.status, 'closed');
});

test('a closed night inside an open window does not zero the window', () => {
  // The Pulltite case. A weekend where Friday has sites and Sunday is shut is
  // still a weekend you can book, and reporting 0 would be wrong.
  const out = summarizeWindow([
    { date: '2026-08-07', sitesOpen: 6, sitesReservable: 55, status: 'open' },
    { date: '2026-08-08', sitesOpen: 0, sitesReservable: 0, status: 'closed' },
  ]);
  assert.deepEqual(out, { sitesOpen: 6, sitesReservable: 55, status: 'open' });
});

test('an empty window summarizes to nothing at all', () => {
  assert.equal(summarizeWindow([]), null);
});

// ── A dead facility id is an answer, not a fault ───────────────────────────

test('a 404 yields no data without counting against the failure budget', async () => {
  // Six of the recreation.gov ids sitting in Eddy's data are dead — they 404 on
  // the public site too. If each one surfaced as a rejection, three in a row
  // would trip the breaker and silently drop every facility queued behind them,
  // turning one stale seed row into a blank availability sweep.
  const original = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response('not found', { status: 404 })) as typeof globalThis.fetch;

  try {
    const limiter = createLimiter({
      name: 'test',
      minSpacingMs: 0,
      maxRequests: 10,
      breakerThreshold: 3,
      sleep: async () => undefined,
    });
    const facility = {
      id: 'x',
      source: 'recreation_gov',
      sourceFacilityId: '10174182',
      displayName: 'Alley Spring (stale id)',
      kind: 'campground',
    } satisfies FacilityLink;
    const window = resolveWeekend(new Date('2026-08-03T17:00:00Z'));

    for (let i = 0; i < 4; i++) {
      assert.deepEqual(await fetchWindow(facility, window, limiter), []);
    }

    assert.equal(limiter.stats().failures, 0, '404 must not count as a failure');
    assert.equal(limiter.stats().open, false, 'breaker must stay closed');
  } finally {
    globalThis.fetch = original;
  }
});

test('a 500 does still count as a failure', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response('boom', { status: 500 })) as typeof globalThis.fetch;

  try {
    const limiter = createLimiter({
      name: 'test',
      minSpacingMs: 0,
      maxRequests: 10,
      maxAttempts: 1,
      breakerThreshold: 3,
      sleep: async () => undefined,
    });
    const facility = {
      id: 'x',
      source: 'recreation_gov',
      sourceFacilityId: '232391',
      displayName: 'Red Bluff',
      kind: 'campground',
    } satisfies FacilityLink;
    const window = resolveWeekend(new Date('2026-08-03T17:00:00Z'));

    await assert.rejects(fetchWindow(facility, window, limiter));
    assert.equal(limiter.stats().failures, 1);
  } finally {
    globalThis.fetch = original;
  }
});
