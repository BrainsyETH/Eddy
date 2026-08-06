import assert from 'node:assert/strict';
import test from 'node:test';
import { fetchWindow, foldNight, parseMonth, parseMonthSites, type MonthCache } from './recgov';
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
      sourceLoop: null,
      displayName: 'Alley Spring (stale id)',
      kind: 'campground',
    } satisfies FacilityLink;
    const window = resolveWeekend(new Date('2026-08-03T17:00:00Z'));

    for (let i = 0; i < 4; i++) {
      assert.deepEqual(await fetchWindow(facility, window, limiter), {
        nights: [],
        sites: [],
        siteNights: [],
      });
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
      sourceLoop: null,
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

// ── District permits split by loop ─────────────────────────────────────────

test('a loop filter reports only that campground, not the whole district', () => {
  // Powder Mill has 8 sites inside a permit covering 52 across eight
  // campgrounds spread over twenty river miles. Reporting the district total
  // under Powder Mill would be a confident, wrong number.
  const payload = {
    campsites: Object.fromEntries([
      ...Array.from({ length: 8 }, (_, i) => [
        `pm${i}`,
        {
          campsite_id: `pm${i}`,
          loop: 'Powder Mill Campground',
          availabilities: { '2026-08-07T00:00:00Z': i < 5 ? 'Available' : 'Reserved' },
        },
      ]),
      ...Array.from({ length: 14 }, (_, i) => [
        `ly${i}`,
        {
          campsite_id: `ly${i}`,
          loop: 'Log Yard Campground',
          availabilities: { '2026-08-07T00:00:00Z': 'Available' },
        },
      ]),
    ]),
  };

  assert.deepEqual(parseMonth(payload, 'Powder Mill Campground').get('2026-08-07'), {
    sitesOpen: 5,
    sitesReservable: 8,
    status: 'open',
  });
  assert.deepEqual(parseMonth(payload, 'Log Yard Campground').get('2026-08-07'), {
    sitesOpen: 14,
    sitesReservable: 14,
    status: 'open',
  });
  // Unfiltered is still the whole district, for a genuine district-level row.
  assert.equal(parseMonth(payload).get('2026-08-07')?.sitesReservable, 22);
});

test('an unknown loop reports nothing rather than the whole district', () => {
  const payload = {
    campsites: {
      a: {
        campsite_id: 'a',
        loop: 'Powder Mill Campground',
        availabilities: { '2026-08-07T00:00:00Z': 'Available' },
      },
    },
  };
  // If a district renames a loop, the safe failure is silence. Falling back to
  // the district total would put twenty river miles of gravel bars under one
  // campground's name without anything looking wrong.
  assert.equal(parseMonth(payload, 'Renamed Campground').size, 0);
});

test('loops sharing a district cost one request, not one each', async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (async () => {
    calls++;
    return new Response(
      JSON.stringify({
        campsites: {
          a: {
            campsite_id: 'a',
            loop: 'Powder Mill Campground',
            availabilities: {
              '2026-08-07T00:00:00Z': 'Available',
              '2026-08-08T00:00:00Z': 'Available',
            },
          },
          b: {
            campsite_id: 'b',
            loop: 'Log Yard Campground',
            availabilities: {
              '2026-08-07T00:00:00Z': 'Reserved',
              '2026-08-08T00:00:00Z': 'Reserved',
            },
          },
        },
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  }) as typeof globalThis.fetch;

  try {
    const limiter = createLimiter({
      name: 'test',
      minSpacingMs: 0,
      maxRequests: 10,
      sleep: async () => undefined,
    });
    const cache: MonthCache = new Map();
    const window = resolveWeekend(new Date('2026-08-03T17:00:00Z'));
    const base = {
      id: 'x',
      source: 'recreation_gov',
      sourceFacilityId: '10344874',
      kind: 'campground',
    } as const;

    const powderMill = await fetchWindow(
      { ...base, sourceLoop: 'Powder Mill Campground', displayName: 'Powder Mill' },
      window,
      limiter,
      cache,
    );
    const logYard = await fetchWindow(
      { ...base, sourceLoop: 'Log Yard Campground', displayName: 'Log Yard' },
      window,
      limiter,
      cache,
    );

    assert.equal(calls, 1, 'the second loop must be served from the cache');
    assert.equal(limiter.stats().attempts, 1);
    assert.equal(powderMill.nights[0].status, 'open');
    assert.equal(logYard.nights[0].status, 'full');

    // The loop filter has to reach the site list too, or a district's fortnight
    // strip would agree with its campground while its site list showed all
    // eight campgrounds behind the shared id.
    assert.ok(
      powderMill.sites.every((s) => s.loop === 'Powder Mill Campground'),
      'sites must be filtered to the same loop as the counts',
    );
    assert.ok(
      logYard.sites.every((s) => s.loop === 'Log Yard Campground'),
      'sites must be filtered to the same loop as the counts',
    );
  } finally {
    globalThis.fetch = original;
  }
});

/* ── Per-site parsing ─────────────────────────────────────────────────────── */
//
// Fixture transcribed from a live Red Bluff (232391) month payload. Every field
// below was on the wire the whole time — the interface declared three of them,
// which is why Eddy needed no second API to list sites and why it spent that
// time counting picnic shelters.

const RED_BLUFF = {
  campsites: {
    '16089': {
      campsite_id: '16089',
      site: 'RTL3',
      loop: 'Ridge Top Loop',
      campsite_type: 'STANDARD ELECTRIC',
      type_of_use: 'Overnight',
      max_num_people: 8,
      availabilities: { '2026-09-05T00:00:00Z': 'Available' },
    },
    '16090': {
      campsite_id: '16090',
      site: 'RTL8',
      // The SAME loop, spelled with a trailing space, inside one response.
      loop: 'Ridge Top Loop ',
      campsite_type: 'STANDARD NONELECTRIC',
      type_of_use: 'Overnight',
      availabilities: { '2026-09-05T00:00:00Z': 'Reserved' },
    },
    '16091': {
      campsite_id: '16091',
      site: 'PAV1 Electric',
      loop: 'Pavilion 1',
      campsite_type: 'GROUP SHELTER ELECTRIC',
      type_of_use: 'Day',
      availabilities: { '2026-09-05T00:00:00Z': 'Available' },
    },
  },
};

test('day-use inventory is not a campsite', () => {
  // Red Bluff returns two group picnic shelters among its 62 entries, so the
  // count said "36 of 54 sites open" where the honest answer was 35 of 52. A
  // pavilion has a roof and no ground to pitch on. The state-park adapter has
  // excluded these since the commit that stopped counting picnic shelters; the
  // federal side could not, because type_of_use was never parsed.
  const night = parseMonth(RED_BLUFF).get('2026-09-05');
  assert.deepEqual(night, { sitesOpen: 1, sitesReservable: 2, status: 'open' });

  const { sites } = parseMonthSites(RED_BLUFF);
  assert.deepEqual(sites.map((s) => s.name), ['RTL3', 'RTL8']);
});

test('the site list and the count describe the same sites', () => {
  // The failure this guards is "8 open" printed above a list of six, which
  // reads as a bug in the app rather than in a feed. Both projections read one
  // traversal, and this is the assertion that keeps it that way.
  const night = parseMonth(RED_BLUFF).get('2026-09-05')!;
  const { siteNights } = parseMonthSites(RED_BLUFF);
  const open = siteNights.filter((n) => n.date === '2026-09-05' && n.status === 'open');
  assert.equal(open.length, night.sitesOpen);
});

test('a loop is matched trimmed, because the feed spells it both ways', () => {
  // 'Ridge Top Loop' and 'Ridge Top Loop ' arrive in one payload. Untrimmed,
  // the district filter drops half a campground and the site list renders two
  // groups of the same place.
  const { sites } = parseMonthSites(RED_BLUFF, 'Ridge Top Loop');
  assert.equal(sites.length, 2, 'both spellings must resolve to one loop');
  assert.deepEqual([...new Set(sites.map((s) => s.loop))], ['Ridge Top Loop']);
});

test('every site carries what a person needs to choose one', () => {
  const site = parseMonthSites(RED_BLUFF).sites[0];
  assert.deepEqual(site, {
    sourceSiteId: '16089',
    name: 'RTL3',
    loop: 'Ridge Top Loop',
    siteType: 'STANDARD ELECTRIC',
    maxOccupancy: 8,
  });
});

test('walk-up sites are listable even though they are not in the denominator', () => {
  // Both are true and they are not in tension: a first-come site is real
  // inventory somebody can sleep in, and counting it would make "44 of 54"
  // a promise the booking system cannot keep.
  const payload = {
    campsites: {
      '1': {
        campsite_id: '1',
        site: 'A1',
        type_of_use: 'Overnight',
        availabilities: { '2026-09-05T00:00:00Z': 'Not Reservable' },
      },
    },
  };
  assert.equal(parseMonth(payload).get('2026-09-05')!.sitesReservable, 0);
  assert.equal(parseMonthSites(payload).siteNights[0].status, 'walk_up');
});
